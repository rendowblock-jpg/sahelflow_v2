use std::ffi::{OsStr, OsString};
use std::fmt;
use std::io::{Error as IoError, Read};
use std::path::Path;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

const MAX_CAPTURED_STDERR_BYTES: usize = 16 * 1024;

#[derive(Default)]
struct StderrCapture {
    bytes: Vec<u8>,
    finished: bool,
}

type SharedStderr = Arc<(Mutex<StderrCapture>, Condvar)>;

fn completed_stderr_capture() -> SharedStderr {
    Arc::new((
        Mutex::new(StderrCapture {
            bytes: Vec::new(),
            finished: true,
        }),
        Condvar::new(),
    ))
}

fn start_stderr_reader<R>(mut reader: R) -> SharedStderr
where
    R: Read + Send + 'static,
{
    let capture = Arc::new((Mutex::new(StderrCapture::default()), Condvar::new()));
    let thread_capture = capture.clone();
    std::thread::spawn(move || {
        let mut chunk = [0_u8; 2_048];
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    if let Ok(mut state) = thread_capture.0.lock() {
                        let remaining = MAX_CAPTURED_STDERR_BYTES.saturating_sub(state.bytes.len());
                        state.bytes.extend_from_slice(&chunk[..read.min(remaining)]);
                    }
                }
            }
        }
        if let Ok(mut state) = thread_capture.0.lock() {
            state.finished = true;
            thread_capture.1.notify_all();
        }
    });
    capture
}

fn stderr_snapshot(capture: &SharedStderr, timeout: Duration) -> Result<String, IoError> {
    let state = capture
        .0
        .lock()
        .map_err(|_| IoError::other("contained stderr capture is poisoned"))?;
    let (state, _) = capture
        .1
        .wait_timeout_while(state, timeout, |state| !state.finished)
        .map_err(|_| IoError::other("contained stderr capture is poisoned"))?;
    Ok(String::from_utf8_lossy(&state.bytes).into_owned())
}

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
    use super::{
        completed_stderr_capture, start_stderr_reader, stderr_snapshot, Duration, IoError, OsStr,
        OsString, Path, ProcessExit, SharedStderr, SpawnError,
    };
    use std::collections::BTreeMap;
    use std::fs::File;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::os::windows::io::FromRawHandle;
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
    use windows_sys::Win32::System::Pipes::CreatePipe;
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
        stderr: SharedStderr,
    }

    // Windows process and job handles are kernel objects that support
    // concurrent wait/termination operations.
    unsafe impl Send for ProcessHandles {}
    unsafe impl Sync for ProcessHandles {}

    struct OwnedHandle(HANDLE);

    impl OwnedHandle {
        fn into_raw(mut self) -> HANDLE {
            let handle = self.0;
            self.0 = std::ptr::null_mut();
            handle
        }
    }

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
        stderr_reader: Option<OwnedHandle>,
    }

    impl ChildStdio {
        fn open(capture_stderr: bool) -> Result<Self, IoError> {
            let (stderr, stderr_reader) = if capture_stderr {
                let (writer, reader) = open_stderr_pipe()?;
                (writer, Some(reader))
            } else {
                (OwnedHandle(open_nul(GENERIC_WRITE)?), None)
            };
            Ok(Self {
                stdin: OwnedHandle(open_nul(GENERIC_READ)?),
                stdout: OwnedHandle(open_nul(GENERIC_WRITE)?),
                stderr,
                stderr_reader,
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
            Self::spawn_in_internal(program, args, environment, current_directory, false)
        }

        pub fn spawn_in_capturing_stderr(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
            current_directory: Option<&Path>,
        ) -> Result<Self, SpawnError> {
            Self::spawn_in_internal(program, args, environment, current_directory, true)
        }

        fn spawn_in_internal(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
            current_directory: Option<&Path>,
            capture_stderr: bool,
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
            let stdio = ChildStdio::open(capture_stderr).map_err(SpawnError::before_process)?;
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

            let ChildStdio {
                stdin,
                stdout,
                stderr,
                stderr_reader,
            } = stdio;
            drop((stdin, stdout, stderr));
            let stderr = match stderr_reader {
                Some(reader) => {
                    let reader = unsafe { File::from_raw_handle(reader.into_raw()) };
                    start_stderr_reader(reader)
                }
                None => completed_stderr_capture(),
            };

            Ok(Self {
                inner: Arc::new(ProcessHandles {
                    job,
                    process: process.hProcess,
                    pid: process.dwProcessId,
                    stderr,
                }),
            })
        }

        pub fn pid(&self) -> u32 {
            self.inner.pid
        }

        pub fn try_wait(&self) -> Result<Option<ProcessExit>, IoError> {
            match unsafe { WaitForSingleObject(self.inner.process, 0) } {
                WAIT_OBJECT_0 => {
                    let mut code = 0_u32;
                    if unsafe { GetExitCodeProcess(self.inner.process, &mut code) } == 0 {
                        return Err(IoError::last_os_error());
                    }
                    Ok(Some(ProcessExit { code }))
                }
                WAIT_TIMEOUT => Ok(None),
                _ => Err(IoError::last_os_error()),
            }
        }

        pub fn stderr_snapshot(&self, timeout: Duration) -> Result<String, IoError> {
            stderr_snapshot(&self.inner.stderr, timeout)
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

    fn open_stderr_pipe() -> Result<(OwnedHandle, OwnedHandle), IoError> {
        let security = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: std::ptr::null_mut(),
            bInheritHandle: 1,
        };
        let mut reader = std::ptr::null_mut();
        let mut writer = std::ptr::null_mut();
        if unsafe { CreatePipe(&mut reader, &mut writer, &security, 0) } == 0 {
            return Err(IoError::last_os_error());
        }
        Ok((OwnedHandle(writer), OwnedHandle(reader)))
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

        const DESCENDANT_HELPER_TEST: &str =
            "child_containment::platform::tests::contained_descendant_helper";

        fn helper_environment(mode: &str) -> Vec<(OsString, OsString)> {
            let mut environment = command_environment();
            environment.push((
                OsString::from("SF_CONTAINMENT_HELPER_MODE"),
                OsString::from(mode),
            ));
            environment
        }

        #[test]
        fn contained_descendant_helper() {
            let Some(mode) = std::env::var_os("SF_CONTAINMENT_HELPER_MODE") else {
                return;
            };

            match mode.to_string_lossy().as_ref() {
                "child" => {
                    let current =
                        std::env::current_exe().expect("resolve containment helper executable");
                    let mut grandchild = std::process::Command::new(current)
                        .args(["--exact", DESCENDANT_HELPER_TEST, "--nocapture"])
                        .env("SF_CONTAINMENT_HELPER_MODE", "grandchild")
                        .spawn()
                        .expect("spawn containment grandchild");
                    std::thread::sleep(Duration::from_secs(60));
                    let _ = grandchild.kill();
                    let _ = grandchild.wait();
                }
                "grandchild" => std::thread::sleep(Duration::from_secs(60)),
                "exit" => {}
                other => panic!("unexpected containment helper mode: {other}"),
            }
        }

        #[test]
        fn contained_child_exit_is_observable_without_waiting_for_a_deadline() {
            let executable = std::env::current_exe().expect("resolve current Rust test executable");
            let child = ContainedChild::spawn(
                &executable,
                &[
                    OsString::from("--exact"),
                    OsString::from(DESCENDANT_HELPER_TEST),
                    OsString::from("--nocapture"),
                ],
                &helper_environment("exit"),
            )
            .expect("spawn deterministic exiting child");

            let deadline = Instant::now() + Duration::from_secs(5);
            let exit = loop {
                if let Some(exit) = child.try_wait().expect("observe child status") {
                    break exit;
                }
                assert!(Instant::now() < deadline, "child exit was not observed");
                std::thread::sleep(Duration::from_millis(10));
            };
            assert_eq!(exit.code, 0);
            child
                .terminate_tree_and_wait(Duration::from_secs(5))
                .expect("prove exiting child tree is empty");
        }

        #[test]
        fn contained_spawn_assigns_before_resume_and_waits_for_an_empty_job() {
            let executable = std::env::current_exe().expect("resolve current Rust test executable");
            let child = ContainedChild::spawn(
                &executable,
                &[
                    OsString::from("--exact"),
                    OsString::from(DESCENDANT_HELPER_TEST),
                    OsString::from("--nocapture"),
                ],
                &helper_environment("child"),
            )
            .expect("spawn deterministic process tree in a job");

            let deadline = Instant::now() + Duration::from_secs(20);
            while child.active_process_count().expect("query job") < 2 {
                assert!(
                    Instant::now() < deadline,
                    "deterministic helper did not create a contained grandchild"
                );
                std::thread::sleep(Duration::from_millis(25));
            }

            child
                .terminate_tree_and_wait(Duration::from_secs(5))
                .expect("terminate complete process tree");
            assert_eq!(child.active_process_count().expect("query empty job"), 0);
        }

        #[test]
        fn contained_node_runs_with_explicit_stdio_handles() {
            use std::io::{Read, Write};
            use std::net::{TcpListener, TcpStream};
            use std::path::PathBuf;

            let Some(node_path) = std::env::var_os("SF_CONTAINED_NODE_PATH").map(PathBuf::from)
            else {
                return;
            };
            assert!(node_path.is_file(), "bundled Node.js test path is missing");

            let listener = TcpListener::bind(("127.0.0.1", 0)).expect("reserve loopback port");
            let port = listener.local_addr().expect("loopback address").port();
            drop(listener);

            let test_root = std::env::temp_dir().join(format!(
                "SahelFlow contained Node {}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("system time")
                    .as_nanos()
            ));
            std::fs::create_dir(&test_root).expect("create contained Node.js test directory");
            let script = test_root.join("server.js");
            std::fs::write(
                &script,
                r#"const http = require('node:http');
console.log('contained stdout ready');
console.error('contained stderr ready');
http.createServer((_request, response) => {
  response.end('contained-ready');
}).listen(Number(process.env.PORT), '127.0.0.1');
"#,
            )
            .expect("write contained Node.js test server");

            // `canonicalize` returns the same Win32 verbatim disk-path shape
            // that Tauri can supply for installed resources. Exercise the
            // production normalization, fixed bootstrap, custom environment
            // block, spaced path and contained launcher together.
            let installed_script =
                std::fs::canonicalize(&script).expect("resolve contained Node.js test entrypoint");
            assert!(
                installed_script.to_string_lossy().starts_with(r"\\?\"),
                "Windows canonicalization did not produce the installed verbatim path shape"
            );
            let node_entrypoint = crate::node_entrypoint_environment_value(&installed_script)
                .expect("normalize contained Node.js entrypoint");
            assert!(!node_entrypoint.contains('\\'));
            assert!(!node_entrypoint.starts_with("//?/"));

            let mut environment = ["SystemRoot", "WINDIR", "TEMP", "TMP"]
                .into_iter()
                .filter_map(|key| std::env::var_os(key).map(|value| (OsString::from(key), value)))
                .collect::<Vec<_>>();
            environment.push((OsString::from("PORT"), OsString::from(port.to_string())));
            environment.push((
                OsString::from(crate::NODE_ENTRYPOINT_ENV),
                OsString::from(node_entrypoint),
            ));

            let child = ContainedChild::spawn_in_capturing_stderr(
                &node_path,
                &[
                    OsString::from("--eval"),
                    OsString::from(crate::NODE_ENTRYPOINT_BOOTSTRAP),
                ],
                &environment,
                Some(&test_root),
            )
            .expect("spawn bundled Node.js through the real contained launcher");

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
                "contained Node.js did not become ready: {response}"
            );
            child
                .terminate_tree_and_wait(Duration::from_secs(5))
                .expect("terminate contained Node.js tree");
            let stderr = child
                .stderr_snapshot(Duration::from_secs(2))
                .expect("read bounded contained stderr");
            assert!(stderr.contains("contained stderr ready"));
            std::fs::remove_dir_all(test_root).expect("remove contained Node.js test directory");
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
    use super::{
        completed_stderr_capture, start_stderr_reader, stderr_snapshot, Duration, IoError,
        OsString, Path, ProcessExit, SharedStderr, SpawnError,
    };
    use std::process::{Child, Command, Stdio};
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    struct ProcessState {
        child: Mutex<Child>,
        pid: u32,
        stderr: SharedStderr,
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
            Self::spawn_in_internal(program, args, environment, current_directory, false)
        }

        pub fn spawn_in_capturing_stderr(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
            current_directory: Option<&Path>,
        ) -> Result<Self, SpawnError> {
            Self::spawn_in_internal(program, args, environment, current_directory, true)
        }

        fn spawn_in_internal(
            program: &Path,
            args: &[OsString],
            environment: &[(OsString, OsString)],
            current_directory: Option<&Path>,
            capture_stderr: bool,
        ) -> Result<Self, SpawnError> {
            let mut command = Command::new(program);
            command
                .args(args)
                .env_clear()
                .envs(environment.iter().cloned());
            if let Some(directory) = current_directory {
                command.current_dir(directory);
            }
            if capture_stderr {
                command.stderr(Stdio::piped());
            }
            let mut child = command.spawn().map_err(SpawnError::before_process)?;
            let pid = child.id();
            let stderr = child
                .stderr
                .take()
                .map(start_stderr_reader)
                .unwrap_or_else(completed_stderr_capture);
            Ok(Self {
                inner: Arc::new(ProcessState {
                    child: Mutex::new(child),
                    pid,
                    stderr,
                }),
            })
        }

        pub fn pid(&self) -> u32 {
            self.inner.pid
        }

        pub fn try_wait(&self) -> Result<Option<ProcessExit>, IoError> {
            let status = self
                .inner
                .child
                .lock()
                .map_err(|_| IoError::other("contained process state is poisoned"))?
                .try_wait()?;
            Ok(status.map(|status| ProcessExit {
                code: status.code().unwrap_or(1) as u32,
            }))
        }

        pub fn stderr_snapshot(&self, timeout: Duration) -> Result<String, IoError> {
            stderr_snapshot(&self.inner.stderr, timeout)
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
