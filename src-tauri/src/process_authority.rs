use std::io::Error as IoError;

#[cfg(windows)]
use std::io::ErrorKind;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::sync::mpsc::{self, Receiver, Sender};
#[cfg(windows)]
use std::thread::JoinHandle;

#[cfg(windows)]
use windows_sys::Win32::Foundation::{
    CloseHandle, WAIT_ABANDONED, WAIT_FAILED, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject};

#[cfg(windows)]
const PROCESS_AUTHORITY_MUTEX: &str = "Local\\SahelFlow.NativeProcessAuthority.v1";

/// Process-lifetime exclusion between the ordinary packaged desktop and the
/// protected installation-root rotation command.
///
/// A Windows mutex is owned by a thread, not by a process. Keep ownership on a
/// dedicated thread so moving this guard into Tauri state cannot accidentally
/// release the mutex from a different thread. Process termination still lets
/// Windows abandon and recover the mutex if destructors cannot run.
pub(crate) struct ProcessAuthorityGuard {
    #[cfg(windows)]
    release: Option<Sender<()>>,
    #[cfg(windows)]
    owner: Option<JoinHandle<()>>,
}

pub(crate) fn acquire() -> Result<ProcessAuthorityGuard, IoError> {
    #[cfg(windows)]
    {
        return acquire_named(PROCESS_AUTHORITY_MUTEX);
    }

    #[cfg(not(windows))]
    {
        Ok(ProcessAuthorityGuard {})
    }
}

#[cfg(windows)]
fn acquire_named(name: &str) -> Result<ProcessAuthorityGuard, IoError> {
    let wide_name = std::ffi::OsStr::new(name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let (ready_sender, ready_receiver) = mpsc::channel::<Result<(), IoError>>();
    let (release_sender, release_receiver) = mpsc::channel::<()>();
    let owner = std::thread::Builder::new()
        .name("sahelflow-process-authority".to_owned())
        .spawn(move || mutex_owner(wide_name, ready_sender, release_receiver))?;

    match ready_receiver.recv() {
        Ok(Ok(())) => Ok(ProcessAuthorityGuard {
            release: Some(release_sender),
            owner: Some(owner),
        }),
        Ok(Err(error)) => {
            let _ = owner.join();
            Err(error)
        }
        Err(_) => {
            let _ = owner.join();
            Err(IoError::other(
                "native process authority owner stopped before reporting readiness",
            ))
        }
    }
}

#[cfg(windows)]
fn mutex_owner(wide_name: Vec<u16>, ready: Sender<Result<(), IoError>>, release: Receiver<()>) {
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, wide_name.as_ptr()) };
    if handle.is_null() {
        let _ = ready.send(Err(IoError::last_os_error()));
        return;
    }

    let wait = unsafe { WaitForSingleObject(handle, 0) };
    match wait {
        WAIT_OBJECT_0 | WAIT_ABANDONED => {
            if ready.send(Ok(())).is_ok() {
                let _ = release.recv();
            }
            if unsafe { ReleaseMutex(handle) } == 0 {
                eprintln!(
                    "[sahelflow] could not release native process authority: {}",
                    IoError::last_os_error()
                );
            }
        }
        WAIT_TIMEOUT => {
            let _ = ready.send(Err(IoError::new(
                ErrorKind::WouldBlock,
                "another SahelFlow desktop or installation-root rotation process is active",
            )));
        }
        WAIT_FAILED => {
            let error = IoError::last_os_error();
            let _ = ready.send(Err(error));
        }
        unexpected => {
            let _ = ready.send(Err(IoError::other(format!(
                "native process authority returned unexpected wait status {unexpected}",
            ))));
        }
    }

    unsafe {
        CloseHandle(handle);
    }
}

#[cfg(windows)]
impl Drop for ProcessAuthorityGuard {
    fn drop(&mut self) {
        if let Some(release) = self.release.take() {
            let _ = release.send(());
        }
        if let Some(owner) = self.owner.take() {
            let _ = owner.join();
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_MUTEX_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    fn test_mutex_name(label: &str) -> String {
        format!(
            "Local\\SahelFlow.NativeProcessAuthority.Test.{}.{}.{}",
            std::process::id(),
            label,
            TEST_MUTEX_SEQUENCE.fetch_add(1, Ordering::Relaxed),
        )
    }

    #[test]
    fn concurrent_process_authority_is_rejected() {
        let name = test_mutex_name("concurrent");
        let first = acquire_named(&name).expect("first authority");
        let error = match acquire_named(&name) {
            Ok(_) => panic!("second authority unexpectedly acquired"),
            Err(error) => error,
        };
        assert_eq!(error.kind(), ErrorKind::WouldBlock);
        drop(first);
    }

    #[test]
    fn released_process_authority_can_be_reacquired() {
        let name = test_mutex_name("released");
        let first = acquire_named(&name).expect("first authority");
        drop(first);
        let replacement = acquire_named(&name).expect("replacement authority");
        drop(replacement);
    }
}
