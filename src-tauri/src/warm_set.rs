//! Which files the packaged app warms before the Node server asks for them.
//!
//! `boot-set.json` (made by scripts/boot-set.ts from a trace of the real first
//! page) lists files of the standalone tree in the order the server opens them.
//! Everything here is pure: the caller does the reading. Any doubt returns None
//! and the caller keeps its old full-tree walk.

use std::path::{Path, PathBuf};

/// Sits next to server.js in the standalone tree.
pub const BOOT_SET_FILE: &str = "boot-set.json";
const FORMAT_VERSION: u64 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootEntry {
    /// Relative POSIX path inside the standalone tree.
    pub path: String,
    /// A compiled library or program: it differs per platform, so it may be absent here.
    pub native: bool,
}

#[derive(serde::Deserialize)]
struct RawManifest {
    #[serde(rename = "formatVersion")]
    format_version: u64,
    entries: Vec<RawEntry>,
}

#[derive(serde::Deserialize)]
struct RawEntry {
    path: String,
    #[serde(default)]
    native: bool,
}

/// Relative POSIX path with no `..`, `.`, empty part, drive letter, stream name or backslash.
pub fn is_safe_relative_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['\\', ':', '\0'])
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

/// None for anything that is not a version 1 list of unique, safe, relative paths.
pub fn parse_boot_set(json: &str) -> Option<Vec<BootEntry>> {
    let raw: RawManifest = serde_json::from_str(json).ok()?;
    if raw.format_version != FORMAT_VERSION || raw.entries.is_empty() {
        return None;
    }
    let mut seen = std::collections::HashSet::new();
    let mut entries = Vec::with_capacity(raw.entries.len());
    for entry in raw.entries {
        if !is_safe_relative_path(&entry.path) || !seen.insert(entry.path.clone()) {
            return None;
        }
        entries.push(BootEntry {
            path: entry.path,
            native: entry.native,
        });
    }
    Some(entries)
}

/// Files to read, in manifest order. None = the manifest is stale (a listed
/// non-native file is gone), unsafe, or leaves nothing to read: walk the tree.
/// A missing native entry is skipped: it belongs to another platform.
pub fn warm_plan(
    root: &Path,
    entries: &[BootEntry],
    exists: impl Fn(&Path) -> bool,
) -> Option<Vec<PathBuf>> {
    let mut plan = Vec::with_capacity(entries.len());
    for entry in entries {
        if !is_safe_relative_path(&entry.path) {
            return None;
        }
        let mut full = root.to_path_buf();
        for part in entry.path.split('/') {
            full.push(part);
        }
        if exists(&full) {
            plan.push(full);
        } else if !entry.native {
            return None;
        }
    }
    if plan.is_empty() {
        None
    } else {
        Some(plan)
    }
}

/// When the background read of the standalone tree is told to stop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WarmStop {
    /// The old full-tree walk: it cost 67 s and 540 s on two machines, so it ends with the migration.
    MigrationEnd,
    /// A bounded boot-set read: it runs until the server answers, because the server opens those files next.
    RuntimeReady,
}

/// Most files a plan may hold and still run until the server answers
/// (mirrors BOOT_SET_MAX_FILES in scripts/boot-set-nft.ts).
pub const MAX_BOUNDED_PLAN_FILES: usize = 1500;

pub fn plan_is_bounded(files: usize) -> bool {
    files > 0 && files <= MAX_BOUNDED_PLAN_FILES
}

pub fn warm_stop_point(plan_in_use: bool) -> WarmStop {
    if plan_in_use {
        WarmStop::RuntimeReady
    } else {
        WarmStop::MigrationEnd
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn manifest(version: &str, entries: &str) -> String {
        format!(
            r#"{{"formatVersion":{version},"fileCount":0,"totalBytes":0,"entries":[{entries}]}}"#
        )
    }
    fn entry(path: &str, native: bool) -> BootEntry {
        BootEntry {
            path: path.to_string(),
            native,
        }
    }
    fn paths(entries: &[BootEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.path.as_str()).collect()
    }

    #[test]
    fn parse_keeps_order_and_the_native_flag() {
        let json = manifest(
            "1",
            r#"{"path":"server.js","size":5},{"path":"node_modules/a/b.js","size":1},{"path":"node_modules/x/e.node","size":9,"native":true}"#,
        );
        let entries = parse_boot_set(&json).expect("valid manifest");
        assert_eq!(
            paths(&entries),
            ["server.js", "node_modules/a/b.js", "node_modules/x/e.node"]
        );
        assert_eq!(
            entries.iter().map(|e| e.native).collect::<Vec<_>>(),
            [false, false, true]
        );
    }

    #[test]
    fn parse_refuses_wrong_version_or_shape() {
        let one = r#"{"path":"server.js","size":5}"#;
        assert!(parse_boot_set(&manifest("2", one)).is_none());
        assert!(parse_boot_set(&manifest("0", one)).is_none());
        assert!(parse_boot_set(&manifest(r#""1""#, one)).is_none());
        assert!(parse_boot_set(&manifest("1", "")).is_none(), "empty list");
        assert!(parse_boot_set("").is_none());
        assert!(parse_boot_set("not json").is_none());
        assert!(
            parse_boot_set(r#"{"entries":[{"path":"server.js"}]}"#).is_none(),
            "no version"
        );
        assert!(
            parse_boot_set(r#"{"formatVersion":1}"#).is_none(),
            "no entries"
        );
        assert!(
            parse_boot_set(&manifest("1", r#"{"size":5}"#)).is_none(),
            "entry without path"
        );
    }

    #[test]
    fn parse_refuses_unsafe_paths() {
        for bad in [
            "../server.js",
            "a/../b.js",
            "/etc/passwd",
            "C:\\x\\y.js",
            "C:/x/y.js",
            "c:y.js",
            "a\\b.js",
            "a//b.js",
            "./a.js",
            "a/./b.js",
            "a/b.js/",
            "",
            "a/b.js:stream",
            "a\u{0}b",
        ] {
            let json = manifest(
                "1",
                &format!(r#"{{"path":{}}}"#, serde_json::to_string(bad).unwrap()),
            );
            assert!(parse_boot_set(&json).is_none(), "accepted {bad:?}");
        }
    }

    #[test]
    fn one_bad_entry_poisons_the_whole_manifest() {
        let json = manifest("1", r#"{"path":"server.js"},{"path":"../x.js"}"#);
        assert!(parse_boot_set(&json).is_none());
    }

    #[test]
    fn parse_refuses_duplicates() {
        let json = manifest("1", r#"{"path":"server.js"},{"path":"server.js"}"#);
        assert!(parse_boot_set(&json).is_none());
    }

    #[test]
    fn plan_keeps_manifest_order_and_joins_each_part_under_the_root() {
        let root = Path::new("standalone");
        let entries = [
            entry("server.js", false),
            entry(".next/server/app/page.js", false),
            entry("a/b/c.js", false),
        ];
        let plan = warm_plan(root, &entries, |_| true).expect("plan");
        assert_eq!(
            plan,
            [
                root.join("server.js"),
                root.join(".next")
                    .join("server")
                    .join("app")
                    .join("page.js"),
                root.join("a").join("b").join("c.js"),
            ]
        );
    }

    #[test]
    fn plan_is_none_when_a_normal_file_is_missing() {
        let root = Path::new("standalone");
        let entries = [
            entry("server.js", false),
            entry("gone.js", false),
            entry("c.js", false),
        ];
        let present = [root.join("server.js"), root.join("c.js")];
        assert!(warm_plan(root, &entries, |p| present.iter().any(|q| q == p)).is_none());
    }

    #[test]
    fn plan_skips_a_missing_native_file_of_another_platform() {
        let root = Path::new("standalone");
        let entries = [
            entry("server.js", false),
            entry("lib/engine.so.node", true),
            entry("c.js", false),
        ];
        let present = [root.join("server.js"), root.join("c.js")];
        let plan = warm_plan(root, &entries, |p| present.iter().any(|q| q == p)).expect("plan");
        assert_eq!(plan, [root.join("server.js"), root.join("c.js")]);
    }

    #[test]
    fn plan_reads_a_native_file_that_exists() {
        let root = Path::new("standalone");
        let entries = [entry("server.js", false), entry("lib/engine.node", true)];
        let plan = warm_plan(root, &entries, |_| true).expect("plan");
        assert_eq!(plan.len(), 2);
    }

    #[test]
    fn plan_is_none_when_nothing_is_left_to_read() {
        let root = Path::new("standalone");
        assert!(warm_plan(root, &[entry("lib/engine.node", true)], |_| false).is_none());
        assert!(warm_plan(root, &[], |_| true).is_none());
    }

    #[test]
    fn plan_re_checks_paths_a_caller_built_by_hand() {
        let root = Path::new("standalone");
        assert!(warm_plan(root, &[entry("../outside.js", false)], |_| true).is_none());
        assert!(warm_plan(root, &[entry("C:\\x.js", true)], |_| true).is_none());
    }

    #[test]
    fn plan_asks_about_exactly_the_listed_files_and_stops_at_the_first_stale_one() {
        let root = Path::new("standalone");
        let asked = RefCell::new(Vec::new());
        let entries = [
            entry("a.js", false),
            entry("b.js", false),
            entry("c.js", false),
        ];
        let plan = warm_plan(root, &entries, |p| {
            asked.borrow_mut().push(p.to_path_buf());
            p != root.join("b.js")
        });
        assert!(plan.is_none());
        assert_eq!(*asked.borrow(), [root.join("a.js"), root.join("b.js")]);
    }

    #[test]
    fn full_walk_stops_when_the_migration_ends() {
        assert_eq!(warm_stop_point(false), WarmStop::MigrationEnd);
    }

    #[test]
    fn bounded_plan_runs_until_the_server_answers() {
        assert_eq!(warm_stop_point(true), WarmStop::RuntimeReady);
    }

    #[test]
    fn plan_bound_table() {
        assert!(!plan_is_bounded(0));
        assert!(plan_is_bounded(1));
        assert!(plan_is_bounded(MAX_BOUNDED_PLAN_FILES));
        assert!(!plan_is_bounded(MAX_BOUNDED_PLAN_FILES + 1));
    }
}
