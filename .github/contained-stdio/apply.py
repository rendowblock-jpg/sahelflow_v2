from pathlib import Path

path = Path("src-tauri/src/child_containment.rs")
text = path.read_text(encoding="utf-8")

if "contained_bun_runs_with_explicit_stdio_handles" in text:
    print("contained stdio repair already applied")
    raise SystemExit(0)

text = text.replace(
'''    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ACCESS_DENIED, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };''',
'''    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ACCESS_DENIED, GENERIC_READ, GENERIC_WRITE, HANDLE,
        INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };''')

text = text.replace(
'''    use windows_sys::Win32::System::JobObjects::{
        CreateJobObjectW, JobObjectBasicAccountingInformation, JobObjectExtendedLimitInformation,
        QueryInformationJobObject, SetInformationJobObject, TerminateJobObject,
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };''',
'''    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
        JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
        TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };''')

text = text.replace(
'''    use windows_sys::Win32::System::Threading::{
        CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
        InitializeProcThreadAttributeList, ResumeThread, TerminateProcess,
        UpdateProcThreadAttribute, WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED,
        CREATE_UNICODE_ENVIRONMENT, EXTENDED_STARTUPINFO_PRESENT, INFINITE,
        LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_JOB_LIST,
        STARTUPINFOEXW,
    };''',
'''    use windows_sys::Win32::System::Threading::{
        CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
        InitializeProcThreadAttributeList, ResumeThread, TerminateProcess,
        UpdateProcThreadAttribute, WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED,
        CREATE_UNICODE_ENVIRONMENT, EXTENDED_STARTUPINFO_PRESENT, INFINITE,
        LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
        STARTF_USESTDHANDLES, STARTUPINFOEXW,
    };''')

start = text.index("    struct ProcessAttributeList {")
end = text.index("    impl Drop for ProcessHandles {", start)
replacement = '''    struct OwnedHandle(HANDLE);

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

'''
text = text[:start] + replacement + text[end:]

old_spawn = '''            let job = create_kill_on_close_job().map_err(SpawnError::before_process)?;
            let attributes = match ProcessAttributeList::with_job(job) {
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
            startup.lpAttributeList = attributes.list;
            let mut process: PROCESS_INFORMATION = unsafe { zeroed() };'''
new_spawn = '''            let stdio = ChildStdio::open().map_err(SpawnError::before_process)?;
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
            let mut process: PROCESS_INFORMATION = unsafe { zeroed() };'''
if old_spawn not in text:
    raise SystemExit("spawn setup block did not match")
text = text.replace(old_spawn, new_spawn)

text = text.replace(
'''                    0,
                    CREATE_SUSPENDED''',
'''                    1,
                    CREATE_SUSPENDED''',
1,
)

resume_marker = '''            let resumed = unsafe { ResumeThread(process.hThread) };'''
assignment = '''            if unsafe { AssignProcessToJobObject(job, process.hProcess) } == 0 {
                let error = IoError::last_os_error();
                return Err(failed_before_job_assignment(job, &process, error));
            }

            let resumed = unsafe { ResumeThread(process.hThread) };'''
if resume_marker not in text:
    raise SystemExit("resume marker did not match")
text = text.replace(resume_marker, assignment, 1)

helper_marker = '''    fn failed_after_process_creation(
        job: HANDLE,'''
helpers = '''    fn open_nul(access: u32) -> Result<HANDLE, IoError> {
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
        job: HANDLE,'''
if helper_marker not in text:
    raise SystemExit("helper insertion marker did not match")
text = text.replace(helper_marker, helpers, 1)

command_test_marker = '''        #[test]
        fn command_line_quoting_preserves_spaces_quotes_and_trailing_slashes() {'''
bun_test = r'''        #[test]
        fn contained_bun_runs_with_explicit_stdio_handles() {
            use std::io::{Read, Write};
            use std::net::{TcpListener, TcpStream};
            use std::path::PathBuf;

            let Some(bun_path) = std::env::var_os("SF_CONTAINED_BUN_PATH").map(PathBuf::from) else {
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
                .filter_map(|key| {
                    std::env::var_os(key).map(|value| (OsString::from(key), value))
                })
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
                            .write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
                            .expect("write readiness request");
                        stream.read_to_string(&mut response).expect("read readiness response");
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
        fn command_line_quoting_preserves_spaces_quotes_and_trailing_slashes() {'''
if command_test_marker not in text:
    raise SystemExit("test insertion marker did not match")
text = text.replace(command_test_marker, bun_test, 1)

path.write_text(text, encoding="utf-8")
print("applied contained child stdio and suspended job assignment repair")
