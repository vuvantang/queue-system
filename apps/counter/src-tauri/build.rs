fn main() {
    // Declare app commands so tauri-build generates `allow-<command>` permissions;
    // app commands are then denied unless a capability grants them.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["open_log_dir"])),
    )
    .expect("failed to run tauri-build");
}
