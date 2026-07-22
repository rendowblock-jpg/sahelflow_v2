from pathlib import Path

root = Path(__file__).resolve().parents[2]
rust_path = root / "src-tauri" / "src" / "child_containment.rs"
rust = rust_path.read_text(encoding="utf-8")
start_marker = """        #[test]
        fn contained_spawn_assigns_before_resume_and_waits_for_an_empty_job() {
"""
end_marker = """        #[test]
        fn contained_bun_runs_with_explicit_stdio_handles() {
"""
start = rust.find(start_marker)
end = rust.find(end_marker, start)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("failed to locate the legacy containment-tree test boundaries")
replacement = '''        const DESCENDANT_HELPER_TEST: &str =
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
                other => panic!("unexpected containment helper mode: {other}"),
            }
        }

        #[test]
        fn contained_spawn_assigns_before_resume_and_waits_for_an_empty_job() {
            let executable =
                std::env::current_exe().expect("resolve current Rust test executable");
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

'''
rust_path.write_text(rust[:start] + replacement + rust[end:], encoding="utf-8")
