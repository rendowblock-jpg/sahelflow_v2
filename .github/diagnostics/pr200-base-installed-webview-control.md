# PR #200 base installed WebView control

Disposable diagnostic matrix for exact historical source `991c61ac882497fdda01af3ac04f06978146bbda` and the Desktop handoff source `b0fec61d574f6ef8eb2a0231da54762bfd99b3c5`.

Purpose: determine the first missing installed-WebView transition and whether authenticated hydration still passed immediately before PR #200 changed `src-tauri/src/startup_recovery.rs` and added the native lifecycle host. The workflow observes the installed browser through a redacted CDP trace after the exact MSI has been built, and retains the unsigned MSI briefly for direct Desktop reproduction. This branch is not a product candidate and must not be merged.
