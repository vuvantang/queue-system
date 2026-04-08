use log::info;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy, RotationStrategy};

/// Open the app log directory in file explorer
#[tauri::command]
fn open_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app.path().app_log_dir()
        .map_err(|e| format!("Failed to get log dir: {}", e))?;
    info!("open_log_dir: {}", log_dir.display());

    // Create the dir if it doesn't exist yet
    let _ = std::fs::create_dir_all(&log_dir);

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| format!("Failed to open: {}", e))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| format!("Failed to open: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| format!("Failed to open: {}", e))?;

    Ok(log_dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .rotation_strategy(RotationStrategy::KeepAll)
                .max_file_size(5_000_000)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![open_log_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
