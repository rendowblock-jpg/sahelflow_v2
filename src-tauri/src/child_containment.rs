use std::ffi::{OsStr, OsString};
use std::fmt;
use std::io::Error as IoError;
use std::path::Path;
use std::time::Duration;

#[derive(Clone, Copy, Debug)]
pub struct ProcessExit {
    pub code: u32,
}

#[derive(Debug)]
pub struct SpawnError {
    source: IoError,
    containment_uncertain: bool,
}

impl SpawnError {
    fn before_process(source: IoError) -> Self {
        Self {
            source,
            containment_uncertain: false,
        }
    }

    fn after_unproven_cleanup(source: IoError) -> Self {
        Self {
            source,
            containment_uncertain: true,
        }
    }

    pub fn containment_uncertain(&self) -> bool {
        self.containment_uncertain
    }
}

impl fmt::Display for SpawnError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.source.fmt(formatter)
    }
}

impl std::error::Error for SpawnError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

#[cfg(windows)]
mod platform {
    use super::{Duration, IoError, OsStr, OsString, Path, ProcessExit, SpawnError};
    use std::collections::BTreeMap;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::sync::Arc;
    use std::time::Instant;
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ACCESS_DENIED, GENERIC_READ, GENERIC_WRITE, HANDLE,
        INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
        JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
        TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
        InitializeProcThreadAttributeList, ResumeThread, TerminateProcess,
        UpdateProcThreadAttribute, WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED,
        CREATE_UNICODE_ENVIRONMENT, EXTENDED_STARTUPINFO_PRESENT, INFINITE,
        LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
        STARTF_USESTDHANDLES, STARTUPINFOEXW,
    };

    struct ProcessHandles {
        job: HANDLE,
        process: HANDLE,
        pid: u32,
    }

    // Windows process and job handles are kernel objects that support
    // concurrent wait/termination operations.
    unsafe impl Send for ProcessHandles {}
    unsafe impl Sync for ProcessHandles {}

    struct OwnedHandle(HANDLE);

    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
    }

    struct ChildStdio {
        stdin: OwnedHandle,
        stdout: OwnedHandle,
        stderr: OwnedHandle,
    }

    impl ChildStdio {
        fn open() -> Result<Self, IoError> {
            Ok(Self {
                stdin: OwnedHandle(open_nul(GENERIC_READ)?),
                stdout: OwnedHandle(open_nul(GENERIC_WRITE)?),
                stderr: OwnedHandle(open_nul(GENERIC_WRITE)?),
            })
        }

        fn handles(&self) -> [HANDLE; 3] {
            [self.stdin.0, self.stdout.0, self.stderr.0]
        }
    }

    struct ProcessAttributeList {
        _storage: Vec<usize>,
        _handle_values: Box<[HANDLE; 3]>,
        list: LPPROC_THREAD_ATTRIBUTE_LIST,
    }

    impl ProcessAttributeList {
        fn with_handles(handles: &[HANDLE; 3]) -> Result<Self, IoError> {
            let mut bytes = 0_usize;
            unsafe {
                InitializeProcThreadAttributeList(std::ptr::null_mut(), 1, 0, &mut bytes);
            }
            if bytes == 0 {
                return Err(IoError::last_os_error());
            }

            let words = bytes.div_ceil(size_of::<usize>());
            let mut storage = vec![0_usize; words];
            let list = storage.as_mut_ptr().cast();
            if unsafe { InitializeProcThreadAttributeList(list, 1, 0, &mut bytes) } == 0 {
                return Err(IoError::last_os_error());
            }
            let mut handle_values = Box::new(*handles);
            if unsafe {
                UpdateProcThreadAttribute(
                    list,
                    0,
                    PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
                    handle_values.as_mut_ptr().cast(),
                    size_of::<HANDLE>() * handle_values.len(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                )
            } == 0
            {
                let error = IoError::last_os_error();
                unsafe {
                    DeleteProcThreadAttributeList(list);
                }
                return Err(error);
            }
            Ok(Self {
                _storage: storage,
                _handle_values: handle_values,
                list,
            })
        }
    }

    impl Drop for ProcessAttributeList {
        fn drop(&mut self) {
            unsafe {
                DeleteProcThreadAttributeList(self.list);
            }
        }
    }

    impl Drop for ProcessHandles {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.process);
                CloseHandle(self.job);
            }
        }
    }

    #[derive(Clone)]
    pub struct ContainedChild {
        inner: Arc<ProcessHandles>,
    }

    impl ContainedChild {
        pub fn spawn(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
        ) -> Result<Self, SpawnError> {
            Self::spawn_in(program, args, environment, None)
        }

        pub fn spawn_in(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
            current_directory: Option<&Path>,
        ) -> Result<Self, SpawnError> {
            let application = wide_null(program.as_os_str()).map_err(SpawnError::before_process)?;
            let mut command_line =
                command_line(program.as_os_str(), args).map_err(SpawnError::before_process)?;
            let mut environment_block =
                environment_block(environment).map_err(SpawnError::before_process)?;
            let current_directory = current_directory
                .map(|path| wide_null(path.as_os_str()))
                .transpose()
                .map_err(SpawnError::before_process)?;
            let stdio = ChildStdio::open().map_err(SpawnError::before_process)?;
            let job = create_kill_on_close_job().map_err(SpawnError::before_process)?;
            let handles = stdio.handles();
            let attributes = match ProcessAttributeList::with_handles(&handles) {
                Ok(attributes) => attributes,
                Err(error) => {
                    unsafe {
                        CloseHandle(job);
                    }
                    return Err(SpawnError::before_process(error));
                }
            };
            let mut startup: STARTUPINFOEXW = unsafe { zeroed() };
            startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
            startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
            startup.StartupInfo.hStdInput = handles[0];
            startup.StartupInfo.hStdOutput = handles[1];
            startup.StartupInfo.hStdError = handles[2];
            startup.lpAttributeList = attributes.list;
            let mut process: PROCESS_INFORMATION = unsafe { zeroed() };

            let created = unsafe {
                CreateProcessW(
                    application.as_ptr(),
                    command_line.as_mut_ptr(),
                    std::ptr::null(),
                    std::ptr::null(),
                    1,
                    CREATE_SUSPENDED
                        | CREATE_NO_WINDOW
                        | CREATE_UNICODE_ENVIRONMENT
                        | EXTENDED_STARTUPINFO_PRESENT,
                    environment_block.as_mut_ptr().cast(),
                    current_directory
                        .as_ref()
                        .map_or(std::ptr::null(), |path| path.as_ptr()),
                    &startup.StartupInfo,
                    &mut process,
                )
            };
            if created == 0 {
                let error = IoError::last_os_error();
                unsafe {
                    CloseHandle(job);
                }
                return Err(SpawnError::before_process(error));
            }

            if unsafe { AssignProcessToJobObject(job, process.hProcess) } == 0 {
                let error = IoError::last_os_error();
                return Err(failed_before_job_assignment(job, &process, error));
            }

            let resumed = unsafe { ResumeThread(process.hThread) };
            if resumed == u32::MAX {
                let error = IoError::last_os_error();
                return Err(failed_after_process_creation(job, &process, error));
            }
            unsafe {
                CloseHandle(process.hThread);
            }

            Ok(Self {
                inner: Arc::new(ProcessHandles {
                    job,
                    process: process.hProcess,
                    pid: process.dwProcessId,
                }),
            })
        }

        pub fn pid(&self) -> u32 {
            self.inner.pid
        }

        pub fn terminate_tree_and_wait(&self, timeout: Duration) -> Result<(), IoError> {
            let terminated = unsafe { TerminateJobObject(self.inner.job, 1) };
            if terminated == 0 {
                let code = unsafe { GetLastError() };
                if code != ERROR_ACCESS_DENIED || active_process_count(self.inner.job)? != 0 {
                    return Err(IoError::from_raw_os_error(code as i32));
                }
            }
            wait_for_process(self.inner.process, timeout)?;
            wait_for_empty_job(self.inner.job, timeout)
        }

        pub fn wait_for_exit_and_close_tree(
            &self,
            tree_timeout: Duration,
        ) -> Result<ProcessExit, IoError> {
            let waited = unsafe { WaitForSingleObject(self.inner.process, INFINITE) };
            if waited != WAIT_OBJECT_0 {
                return Err(IoError::last_os_error());
            }
            let mut code = 0_u32;
            if unsafe { GetExitCodeProcess(self.inner.process, &mut code) } == 0 {
                return Err(IoError::last_os_error());
            }

            // The direct child can exit while descendants remain. Terminating
            // its dedicated job makes the termination event tree-complete.
            let terminated = unsafe { TerminateJobObject(self.inner.job, code) };
            if terminated == 0 {
                let error = IoError::last_os_error();
                if active_process_count(self.inner.job)? != 0 {
                    return Err(error);
                }
            }
            wait_for_empty_job(self.inner.job, tree_timeout)?;
            Ok(ProcessExit { code })
        }

        #[cfg(test)]
        fn active_process_count(&self) -> Result<u32, IoError> {
            active_process_count(self.inner.job)
        }
    }

    fn create_kill_on_close_job() -> Result<HANDLE, IoError> {
        let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if job.is_null() {
            return Err(IoError::last_os_error());
        }

        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            let error = IoError::last_os_error();
            unsafe {
                CloseHandle(job);
            }
            return Err(error);
        }
        Ok(job)
    }

    fn open_nul(access: u32) -> Result<HANDLE, IoError> {
        let path = wide_null(OsStr::new("NUL"))?;
        let security = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: std::ptr::null_mut(),
            bInheritHandle: 1,
        };
        let handle = unsafe {
            CreateFileW(
                path.as_ptr(),
                access,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                &security,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                std::ptr::null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            Err(IoError::last_os_error())
        } else {
            Ok(handle)
        }
    }

    fn failed_before_job_assignment(
        job: HANDLE,
        process: &PROCESS_INFORMATION,
        source: IoError,
    ) -> SpawnError {
        let cleanup = if unsafe { TerminateProcess(process.hProcess, 1) } == 0 {
            Err(IoError::last_os_error())
        } else {
            wait_for_process(process.hProcess, Duration::from_secs(10))
        };
        unsafe {
            CloseHandle(process.hThread);
            CloseHandle(process.hProcess);
            CloseHandle(job);
        }
        match cleanup {
            Ok(()) => SpawnError::before_process(source),
            Err(cleanup) => SpawnError::after_unproven_cleanup(IoError::other(format!(
                "job assignment failed ({source}) and the suspended process could not be proven terminated ({cleanup})"
            ))),
        }
    }

    fn failed_after_process_creation(
        job: HANDLE,
        process: &PROCESS_INFORMATION,
        source: IoError,
    ) -> SpawnError {
        let cleanup = terminate_suspended_process(job, process);
        unsafe {
            CloseHandle(process.hThread);
            CloseHandle(process.hProcess);
            CloseHandle(job);
        }
        match cleanup {
            Ok(()) => SpawnError::before_process(source),
            Err(cleanup) => SpawnError::after_unproven_cleanup(IoError::other(format!(
                "process creation failed ({source}) and its contained process could not be proven terminated ({cleanup})"
            ))),
        }
    }

    fn terminate_suspended_process(
        job: HANDLE,
        process: &PROCESS_INFORMATION,
    ) -> Result<(), IoError> {
        if unsafe { TerminateJobObject(job, 1) } == 0
            && active_process_count(job)? != 0
            && unsafe { TerminateProcess(process.hProcess, 1) } == 0
        {
            return Err(IoError::last_os_error());
        }
        wait_for_process(process.hProcess, Duration::from_secs(10))?;
        wait_for_empty_job(job, Duration::from_secs(10))
    }

    fn wait_for_process(process: HANDLE, timeout: Duration) -> Result<(), IoError> {
        let timeout_ms = timeout.as_millis().min(u32::MAX as u128) as u32;
        match unsafe { WaitForSingleObject(process, timeout_ms) } {
            WAIT_OBJECT_0 => Ok(()),
            WAIT_TIMEOUT => Err(IoError::new(
                std::io::ErrorKind::TimedOut,
                "contained process did not terminate before the deadline",
            )),
            _ => Err(IoError::last_os_error()),
        }
    }

    fn wait_for_empty_job(job: HANDLE, timeout: Duration) -> Result<(), IoError> {
        let deadline = Instant::now() + timeout;
        loop {
            if active_process_count(job)? == 0 {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(IoError::new(
                    std::io::ErrorKind::TimedOut,
                    "contained process tree did not terminate before the deadline",
                ));
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn active_process_count(job: HANDLE) -> Result<u32, IoError> {
        let mut accounting: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { zeroed() };
        let queried = unsafe {
            QueryInformationJobObject(
                job,
                JobObjectBasicAccountingInformation,
                &mut accounting as *mut _ as *mut _,
                size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                std::ptr::null_mut(),
            )
        };
        if queried == 0 {
            return Err(IoError::last_os_error());
        }
        Ok(accounting.ActiveProcesses)
    }

    fn wide_null(value: &OsStr) -> Result<Vec<u16>, IoError> {
        let mut wide = value.encode_wide().collect::<Vec<_>>();
        if wide.contains(&0) {
            return Err(IoError::new(
                std::io::ErrorKind::InvalidInput,
                "process argument contains a null character",
            ));
        }
        wide.push(0);
        Ok(wide)
    }

    fn command_line(program: &OsStr, args: &[OsString]) -> Result<Vec<u16>, IoError> {
        let mut output = Vec::new();
        append_quoted_argument(&mut output, program)?;
        for argument in args {
            output.push(b' ' as u16);
            append_quoted_argument(&mut output, argument)?;
        }
        output.push(0);
        if output.len() > 32_767 {
            return Err(IoError::new(
                std::io::ErrorKind::InvalidInput,
                "Windows process command line exceeds 32767 UTF-16 code units",
            ));
        }
        Ok(output)
    }

    fn append_quoted_argument(output: &mut Vec<u16>, argument: &OsStr) -> Result<(), IoError> {
        let units = argument.encode_wide().collect::<Vec<_>>();
        if units.contains(&0) {
            return Err(IoError::new(
                std::io::ErrorKind::InvalidInput,
                "process argument contains a null character",
            ));
        }
        output.push(b'"' as u16);
        let mut backslashes = 0_usize;
        for unit in units {
            if unit == b'\\' as u16 {
                backslashes += 1;
            } else if unit == b'"' as u16 {
                output.extend(std::iter::repeat(b'\\' as u16).take(backslashes * 2 + 1));
                output.push(unit);
                backslashes = 0;
            } else {
                output.extend(std::iter::repeat(b'\\' as u16).take(backslashes));
                output.push(unit);
                backslashes = 0;
            }
        }
        output.extend(std::iter::repeat(b'\\' as u16).take(backslashes * 2));
        output.push(b'"' as u16);
        Ok(())
    }

    fn environment_block(values: &[(OsString, OsString)]) -> Result<Vec<u16>, IoError> {
        let mut sorted = BTreeMap::<String, (&OsString, &OsString)>::new();
        for (key, value) in values {
            let normalized = key.to_string_lossy().to_ascii_uppercase();
            if normalized.is_empty() || normalized.contains('=') {
                return Err(IoError::new(
                    std::io::ErrorKind::InvalidInput,
                    "process environment contains an invalid key",
                ));
            }
            sorted.insert(normalized, (key, value));
        }

        let mut block = Vec::new();
        for (_, (key, value)) in sorted {
            let entry = OsString::from_wide(
                &key.encode_wide()
                    .chain(std::iter::once(b'=' as u16))
                    .chain(value.encode_wide())
                    .collect::<Vec<_>>(),
            );
            let units = entry.encode_wide().collect::<Vec<_>>();
            if units.contains(&0) {
                return Err(IoError::new(
                    std::io::ErrorKind::InvalidInput,
                    "process environment contains a null character",
                ));
            }
            block.extend(units);
            block.push(0);
        }
        block.push(0);
        if block.len() == 1 {
            block.push(0);
        }
        Ok(block)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn command_environment() -> Vec<(OsString, OsString)> {
            ["SystemRoot", "WINDIR", "TEMP", "TMP", "ComSpec"]
                .into_iter()
                .filter_map(|key| std::env::var_os(key).map(|value| (OsString::from(key), value)))
                .collect()
        }

        #[test]
        fn contained_spawn_assigns_before_resume_and_waits_for_an_empty_job() {
            let command = std::env::var_os("ComSpec")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| std::path::PathBuf::from("cmd.exe"));
            let child = ContainedChild::spawn(
                &command,
                &[
                    OsString::from("/C"),
                    OsString::from(
                        "start \"\" /B ping -n 30 127.0.0.1 ^>NUL ^& ping -n 30 127.0.0.1 ^>NUL",
                    ),
                ],
                &command_environment(),
            )
            .expect("spawn process tree in a job");

            let deadline = Instant::now() + Duration::from_secs(5);
            while child.active_process_count().expect("query job") < 2 {
                assert!(
                    Instant::now() < deadline,
                    "child did not create a descendant"
                );
                std::thread::sleep(Duration::from_millis(25));
            }

            child
                .terminate_tree_and_wait(Duration::from_secs(5))
                .expect("terminate complete process tree");
            assert_eq!(child.active_process_count().expect("query empty job"), 0);
        }

        #[test]
        fn contained_bun_runs_with_explicit_stdio_handles() {
            use std::io::{Read, Write};
            use std::net::{TcpListener, TcpStream};
            use std::path::PathBuf;

            let Some(bun_path) = std::env::var_os("SF_CONTAINED_BUN_PATH").map(PathBuf::from)
            else {
                return;
            };
            assert!(bun_path.is_file(), "bundled Bun test path is missing");

            let listener = TcpListener::bind(("127.0.0.1", 0)).expect("reserve loopback port");
            let port = listener.local_addr().expect("loopback address").port();
            drop(listener);

            let test_root = std::env::temp_dir().join(format!(
                "sahelflow-contained-bun-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("system time")
                    .as_nanos()
            ));
            std::fs::create_dir(&test_root).expect("create contained Bun test directory");
            let script = test_root.join("server.js");
            std::fs::write(
                &script,
                r#"console.log('contained stdout ready');
console.error('contained stderr ready');
Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT),
  fetch() { return new Response('contained-ready'); }
});
"#,
            )
            .expect("write contained Bun test server");

            let mut environment = ["SystemRoot", "WINDIR", "TEMP", "TMP"]
                .into_iter()
                .filter_map(|key| std::env::var_os(key).map(|value| (OsString::from(key), value)))
                .collect::<Vec<_>>();
            environment.push((OsString::from("PORT"), OsString::from(port.to_string())));

            let child = ContainedChild::spawn_in(
                &bun_path,
                &[script.as_os_str().to_os_string()],
                &environment,
                Some(&test_root),
            )
            .expect("spawn bundled Bun through the real contained launcher");

            let deadline = Instant::now() + Duration::from_secs(15);
            let mut response = String::new();
            while Instant::now() < deadline {
                match TcpStream::connect(("127.0.0.1", port)) {
                    Ok(mut stream) => {
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .expect("set read timeout");
                        stream
                            .write_all(
                                b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
                            )
                            .expect("write readiness request");
                        stream
                            .read_to_string(&mut response)
                            .expect("read readiness response");
                        if response.contains("contained-ready") {
                            break;
                        }
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(100)),
                }
            }
            assert!(
                response.contains("contained-ready"),
                "contained Bun did not become ready: {response}"
            );
            child
                .terminate_tree_and_wait(Duration::from_secs(5))
                .expect("terminate contained Bun tree");
            std::fs::remove_dir_all(test_root).expect("remove contained Bun test directory");
        }

        #[test]
        fn command_line_quoting_preserves_spaces_quotes_and_trailing_slashes() {
            let line = command_line(
                OsStr::new(r"C:\Program Files\runtime.exe"),
                &[
                    OsString::from(r"C:\seller data\server.js"),
                    OsString::from("quoted\"value"),
                    OsString::from(r"trailing\\"),
                ],
            )
            .expect("encode command line");
            let line = OsString::from_wide(&line[..line.len() - 1])
                .to_string_lossy()
                .into_owned();
            assert!(line.contains(r#""C:\Program Files\runtime.exe""#));
            assert!(line.contains(r#""C:\seller data\server.js""#));
            assert!(line.contains(r#"quoted\"value"#));
            assert!(line.ends_with(r#"trailing\\\\""#));
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{Duration, IoError, OsString, Path, ProcessExit, SpawnError};
    use std::process::{Child, Command};
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    struct ProcessState {
        child: Mutex<Child>,
        pid: u32,
    }

    #[derive(Clone)]
    pub struct ContainedChild {
        inner: Arc<ProcessState>,
    }

    impl ContainedChild {
        pub fn spawn(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
        ) -> Result<Self, SpawnError> {
            Self::spawn_in(program, args, environment, None)
        }

        pub fn spawn_in(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
            current_directory: Option<&Path>,
        ) -> Result<Self, SpawnError> {
            let mut command = Command::new(program);
            command
                .args(args)
                .env_clear()
                .envs(environment.iter().cloned());
            if let Some(directory) = current_directory {
                command.current_dir(directory);
            }
            let child = command.spawn().map_err(SpawnError::before_process)?;
            let pid = child.id();
            Ok(Self {
                inner: Arc::new(ProcessState {
                    child: Mutex::new(child),
                    pid,
                }),
            })
        }

        pub fn pid(&self) -> u32 {
            self.inner.pid
        }

        pub fn terminate_tree_and_wait(&self, timeout: Duration) -> Result<(), IoError> {
            let mut child = self
                .inner
                .child
                .lock()
                .map_err(|_| IoError::other("contained process state is poisoned"))?;
            match child.kill() {
                Ok(()) => {}
                Err(error) if child.try_wait()?.is_some() => return Ok(()),
                Err(error) => return Err(error),
            }
            drop(child);
            wait_for_exit(&self.inner, timeout).map(|_| ())
        }

        pub fn wait_for_exit_and_close_tree(
            &self,
            _tree_timeout: Duration,
        ) -> Result<ProcessExit, IoError> {
            wait_for_exit(&self.inner, Duration::MAX)
        }
    }

    fn wait_for_exit(state: &ProcessState, timeout: Duration) -> Result<ProcessExit, IoError> {
        let started = Instant::now();
        loop {
            let status = state
                .child
                .lock()
                .map_err(|_| IoError::other("contained process state is poisoned"))?
                .try_wait()?;
            if let Some(status) = status {
                return Ok(ProcessExit {
                    code: status.code().unwrap_or(1) as u32,
                });
            }
            if started.elapsed() >= timeout {
                return Err(IoError::new(
                    std::io::ErrorKind::TimedOut,
                    "contained process did not terminate before the deadline",
                ));
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

pub use platform::ContainedChild;
