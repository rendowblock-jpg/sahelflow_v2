from pathlib import Path

root = Path(__file__).resolve().parents[2]

rust_path = root / "src-tauri" / "src" / "child_containment.rs"
rust = rust_path.read_text(encoding="utf-8")
old_test = '''        #[test]
        fn contained_spawn_assigns_before_resume_and_waits_for_an_empty_job() {
            let command = std::env::var_os("ComSpec")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| std::path::PathBuf::from("cmd.exe"));
            let child = ContainedChild::spawn(
                &command,
                &[
                    OsString::from("/D"),
                    OsString::from("/S"),
                    OsString::from("/C"),
                    OsString::from("\"%SystemRoot%\\System32\\ping.exe\" -n 30 127.0.0.1 >NUL"),
                ],
                &command_environment(),
            )
            .expect("spawn process tree in a job");

            let deadline = Instant::now() + Duration::from_secs(15);
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
'''
new_test = '''        const DESCENDANT_HELPER_TEST: &str =
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
if rust.count(old_test) != 1:
    raise SystemExit("expected exactly one legacy containment-tree test block")
rust_path.write_text(rust.replace(old_test, new_test), encoding="utf-8")

ci_path = root / ".github" / "workflows" / "ci.yml"
ci = ci_path.read_text(encoding="utf-8")
old_ci = '''      - name: Verify bundled Bun through actual contained launcher
        shell: pwsh
        env:
          SF_CONTAINED_BUN_PATH: ${{ github.workspace }}\\src-tauri\\resources\\runtime\\bun.exe
        run: |
          & cargo test --manifest-path src-tauri/Cargo.toml contained_bun_runs_with_explicit_stdio_handles --locked -- --nocapture 2>&1 |
            Tee-Object -FilePath .sf-contained-bun.log
          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

      - name: Upload contained Bun launcher diagnostics
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: windows-contained-bun-diagnostics-${{ github.run_id }}
          path: .sf-contained-bun.log
          if-no-files-found: ignore
          retention-days: 2
'''
new_ci = '''      - name: Verify full Windows Rust runtime suite and contained Bun launcher
        shell: pwsh
        env:
          SF_CONTAINED_BUN_PATH: ${{ github.workspace }}\\src-tauri\\resources\\runtime\\bun.exe
        run: |
          & cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --nocapture --test-threads=1 2>&1 |
            Tee-Object -FilePath .sf-contained-bun.log
          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

          $treeTest = 'child_containment::platform::tests::contained_spawn_assigns_before_resume_and_waits_for_an_empty_job'
          for ($attempt = 1; $attempt -le 5; $attempt++) {
            Write-Host "Containment-tree stress attempt $attempt/5"
            & cargo test --manifest-path src-tauri/Cargo.toml --lib --locked $treeTest -- --exact --nocapture --test-threads=1 2>&1 |
              Tee-Object -FilePath .sf-contained-tree-stress.log -Append
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
          }

      - name: Upload contained launcher diagnostics
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: windows-contained-launcher-diagnostics-${{ github.run_id }}
          path: |
            .sf-contained-bun.log
            .sf-contained-tree-stress.log
          if-no-files-found: ignore
          retention-days: 2
'''
if ci.count(old_ci) != 1:
    raise SystemExit("expected exactly one Windows contained-Bun CI block")
ci_path.write_text(ci.replace(old_ci, new_ci), encoding="utf-8")

release_path = root / ".github" / "workflows" / "release.yml"
release = release_path.read_text(encoding="utf-8")
old_release = "& cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --nocapture 2>&1 |"
new_release = "& cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --nocapture --test-threads=1 2>&1 |"
if release.count(old_release) != 1:
    raise SystemExit("expected exactly one release Rust-suite command")
release_path.write_text(release.replace(old_release, new_release), encoding="utf-8")
