// SahelFlow Tauri library entry.
// The desktop shell wraps the Next.js webview and manages:
//   - Baileys WhatsApp sidecar (Phase 0 item #1)
//   - OS keychain access for secrets
//   - Auto-updater (signed GitHub Releases)
//   - License validation on launch (Phase 0 item #4)
//   - SQLite file management (multi-shop)

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Tauri commands registered here as features are built
            // e.g., get_machine_id, validate_license, open_shop_file, etc.
        ])
        .run(tauri::generate_context!())
        .expect("error while running SahelFlow application");
}
