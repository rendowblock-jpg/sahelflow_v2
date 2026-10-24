//! Keeps the previous launch's startup trace.
//!
//! Every launch rewrites `startup-trace.json` from scratch, so a launch that
//! went wrong (for example the first launch after an update that sat in
//! "preparing data" for minutes) was gone as soon as the next launch started,
//! before anyone could read it. Just before a launch resets the file, the old
//! one is copied to `startup-trace.prev.json`: one file, replaced each time,
//! never a growing list.
//!
//! This is a diagnostic aid, so it is best effort: no error here may stop or
//! slow a start. Nothing in this file touches Tauri or Windows APIs, so the
//! unit tests below run on any machine.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

const TRACE_FILE: &str = "startup-trace.json";
const PREVIOUS_FILE: &str = "startup-trace.prev.json";
const PREVIOUS_TEMPORARY_FILE: &str = "startup-trace.prev.json.tmp";
/// A real trace is a few kilobytes (at most 32 short events). Anything bigger
/// is not ours, and one start must never read an unbounded file.
const MAX_TRACE_BYTES: u64 = 1024 * 1024;

/// Copy `<dir>/startup-trace.json` to `<dir>/startup-trace.prev.json`.
/// Call it once per launch, before the new launch writes its first trace.
pub(crate) fn keep_previous_trace(app_data_dir: &Path) {
    // Losing this copy costs only a diagnostic file, so the error is dropped.
    let _ = copy_trace(app_data_dir);
}

fn copy_trace(app_data_dir: &Path) -> std::io::Result<()> {
    let source = app_data_dir.join(TRACE_FILE);
    // `symlink_metadata`: a link is not a regular file and is never followed.
    let metadata = fs::symlink_metadata(&source)?;
    // An empty file has nothing to keep and must not replace a good copy.
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_TRACE_BYTES {
        return Ok(());
    }
    // The file can grow between the check and the read: read one byte more
    // than allowed and give up if it was used.
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(&source)?
        .take(MAX_TRACE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_TRACE_BYTES {
        return Ok(());
    }
    // Write beside the target, then rename over it: a crash or a full disk
    // leaves the old copy or the new one, never half of one.
    let temporary = app_data_dir.join(PREVIOUS_TEMPORARY_FILE);
    let result = write_synced(&temporary, &bytes)
        .and_then(|()| fs::rename(&temporary, app_data_dir.join(PREVIOUS_FILE)));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn write_synced(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    const TRACE: &str = "startup-trace.json";
    const PREVIOUS: &str = "startup-trace.prev.json";
    const MAX: usize = 1024 * 1024;

    /// A folder of its own under the system temp folder, removed when dropped.
    /// Tests run in parallel inside one process, so the name has a counter.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            static NEXT: AtomicU32 = AtomicU32::new(0);
            let path = std::env::temp_dir().join(format!(
                "sf-trace-history-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("create test folder");
            TempDir(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn file_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .expect("list test folder")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        names
    }

    #[test]
    fn no_trace_means_nothing_is_written() {
        let dir = TempDir::new();
        keep_previous_trace(dir.path());
        assert!(file_names(dir.path()).is_empty());
    }

    #[test]
    fn the_trace_is_copied_and_the_original_is_left_alone() {
        let dir = TempDir::new();
        fs::write(dir.path().join(TRACE), b"{\"launch\":1}\n").unwrap();
        keep_previous_trace(dir.path());
        assert_eq!(
            fs::read(dir.path().join(PREVIOUS)).unwrap(),
            b"{\"launch\":1}\n"
        );
        assert_eq!(
            fs::read(dir.path().join(TRACE)).unwrap(),
            b"{\"launch\":1}\n"
        );
        // No temporary file is left behind.
        assert_eq!(file_names(dir.path()), vec![TRACE, PREVIOUS]);
    }

    #[test]
    fn a_second_rotation_replaces_the_previous_copy() {
        let dir = TempDir::new();
        fs::write(dir.path().join(TRACE), b"first launch").unwrap();
        keep_previous_trace(dir.path());
        fs::write(
            dir.path().join(TRACE),
            b"second launch, longer than the first",
        )
        .unwrap();
        keep_previous_trace(dir.path());
        assert_eq!(
            fs::read(dir.path().join(PREVIOUS)).unwrap(),
            b"second launch, longer than the first"
        );
        // Still one previous file and one current file, never a list.
        assert_eq!(file_names(dir.path()), vec![TRACE, PREVIOUS]);
    }

    #[test]
    fn a_trace_over_one_mebibyte_is_not_copied() {
        let dir = TempDir::new();
        fs::write(dir.path().join(TRACE), vec![b'x'; MAX + 1]).unwrap();
        keep_previous_trace(dir.path());
        assert_eq!(file_names(dir.path()), vec![TRACE]);
    }

    #[test]
    fn a_trace_of_exactly_one_mebibyte_is_copied() {
        let dir = TempDir::new();
        fs::write(dir.path().join(TRACE), vec![b'x'; MAX]).unwrap();
        keep_previous_trace(dir.path());
        assert_eq!(fs::read(dir.path().join(PREVIOUS)).unwrap().len(), MAX);
    }

    #[test]
    fn an_empty_trace_does_not_replace_a_good_previous_copy() {
        let dir = TempDir::new();
        fs::write(dir.path().join(PREVIOUS), b"the slow launch").unwrap();
        fs::write(dir.path().join(TRACE), b"").unwrap();
        keep_previous_trace(dir.path());
        assert_eq!(
            fs::read(dir.path().join(PREVIOUS)).unwrap(),
            b"the slow launch"
        );
    }

    #[test]
    fn a_folder_called_like_the_trace_is_ignored() {
        let dir = TempDir::new();
        fs::create_dir(dir.path().join(TRACE)).unwrap();
        keep_previous_trace(dir.path());
        assert_eq!(file_names(dir.path()), vec![TRACE]);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_called_like_the_trace_is_not_followed() {
        let dir = TempDir::new();
        let target = dir.path().join("elsewhere.txt");
        fs::write(&target, b"not a trace").unwrap();
        std::os::unix::fs::symlink(&target, dir.path().join(TRACE)).unwrap();
        keep_previous_trace(dir.path());
        assert!(!dir.path().join(PREVIOUS).exists());
    }

    #[test]
    fn a_folder_in_the_way_of_the_copy_does_not_panic_or_leave_a_temporary_file() {
        let dir = TempDir::new();
        fs::write(dir.path().join(TRACE), b"launch").unwrap();
        fs::create_dir(dir.path().join(PREVIOUS)).unwrap();
        keep_previous_trace(dir.path());
        assert_eq!(fs::read(dir.path().join(TRACE)).unwrap(), b"launch");
        assert_eq!(file_names(dir.path()), vec![TRACE, PREVIOUS]);
    }

    #[test]
    fn a_missing_folder_does_not_panic() {
        let dir = TempDir::new();
        let missing = dir.path().join("not-created-yet");
        keep_previous_trace(&missing);
        assert!(!missing.exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_folder_that_cannot_be_written_does_not_panic() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new();
        fs::write(dir.path().join(TRACE), b"launch").unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o555)).unwrap();
        keep_previous_trace(dir.path());
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();
        // The original is untouched whether or not this user is allowed to write.
        assert_eq!(fs::read(dir.path().join(TRACE)).unwrap(), b"launch");
    }
}
