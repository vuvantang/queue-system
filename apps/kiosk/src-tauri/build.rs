fn main() {
    // Declare every app command so tauri-build generates `allow-<command>`
    // permissions. With an app manifest, app commands are denied unless a
    // capability grants them (see capabilities/main.json — main window only).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "list_monitors",
            "list_printers",
            "print_ticket",
            "open_tv_window",
            "close_tv_window",
            "play_ding",
            "speak_vietnamese",
            "preload_tts",
            "get_tts_cache_path",
            "get_machine_info",
            "open_log_dir",
        ])),
    )
    .expect("failed to run tauri-build");
}
