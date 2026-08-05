// SahelFlow Tauri entry point.
// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // All migration, replacement-restore, protected-root and survivability
    // coordination is owned by the library's packaged startup thread. Keeping
    // the binary as a single entry avoids a competing path or duplicated root.
    sahelflow_lib::run();
}
