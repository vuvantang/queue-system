use serde::Serialize;
use tauri::{Manager, Emitter};
use std::io::Cursor;
use std::sync::OnceLock;
use std::path::PathBuf;
use log::{info, warn, error, debug};
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy, RotationStrategy};

#[derive(Serialize)]
struct MonitorInfo {
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[tauri::command]
fn list_monitors(app: tauri::AppHandle) -> Vec<MonitorInfo> {
    let mut monitors = Vec::new();

    if let Some(windows) = app.webview_windows().values().next() {
        if let Ok(available) = windows.available_monitors() {
            let primary = windows.primary_monitor().ok().flatten();
            let primary_pos = primary.as_ref().map(|p| p.position().clone());

            for monitor in available {
                let pos = monitor.position();
                let size = monitor.size();
                let is_primary = primary_pos
                    .as_ref()
                    .map(|pp| pp.x == pos.x && pp.y == pos.y)
                    .unwrap_or(false);

                monitors.push(MonitorInfo {
                    name: monitor.name().cloned().unwrap_or_default(),
                    x: pos.x,
                    y: pos.y,
                    width: size.width,
                    height: size.height,
                    is_primary,
                });
            }
        }
    }

    info!("list_monitors: found {} monitors", monitors.len());
    monitors
}

// ─── Printer listing (cross-platform) ───

#[derive(Serialize)]
struct PrinterList {
    printers: Vec<String>,
    default_printer: Option<String>,
}

#[cfg(unix)]
fn list_printers_sync() -> Result<PrinterList, String> {
    let output = std::process::Command::new("lpstat")
        .args(["-p", "-d"])
        .output()
        .map_err(|e| format!("Failed to run lpstat: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    let mut default_printer = None;

    for line in stdout.lines() {
        if line.starts_with("printer ") {
            if let Some(name) = line.strip_prefix("printer ") {
                if let Some(name) = name.split_whitespace().next() {
                    printers.push(name.to_string());
                }
            }
        }
        if line.starts_with("system default destination:") {
            default_printer = line.split(':').nth(1).map(|s| s.trim().to_string());
        }
    }

    info!("list_printers: found {} printers, default={:?}", printers.len(), default_printer);
    Ok(PrinterList { printers, default_printer })
}

#[cfg(windows)]
fn list_printers_sync() -> Result<PrinterList, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "Get-Printer | Select-Object -Property Name,Default | ConvertTo-Json"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run Get-Printer: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    let mut default_printer = None;

    // Parse JSON - can be a single object or array
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
        let items = match &val {
            serde_json::Value::Array(arr) => arr.clone(),
            obj @ serde_json::Value::Object(_) => vec![obj.clone()],
            _ => vec![],
        };
        for item in &items {
            if let Some(name) = item.get("Name").and_then(|n| n.as_str()) {
                printers.push(name.to_string());
                if item.get("Default").and_then(|d| d.as_bool()).unwrap_or(false) {
                    default_printer = Some(name.to_string());
                }
            }
        }
    }

    info!("list_printers: found {} printers, default={:?}", printers.len(), default_printer);
    Ok(PrinterList { printers, default_printer })
}

#[tauri::command]
async fn list_printers() -> Result<PrinterList, String> {
    tokio::task::spawn_blocking(list_printers_sync)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ─── TV Window management ───

#[tauri::command]
async fn open_tv_window(app: tauri::AppHandle, url: String, monitor_index: Option<usize>) -> Result<(), String> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    info!("open_tv_window: url={}, monitor_index={:?}", url, monitor_index);

    // Đóng TV window cũ nếu có
    if let Some(existing) = app.get_webview_window("tv-display") {
        let _ = existing.destroy();
        // Đợi window cũ đóng hoàn toàn
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let parsed_url: url::Url = url.parse().map_err(|e| format!("URL không hợp lệ: {}", e))?;

    // Thu thập thông tin monitor trước (trên main thread)
    let monitor_info = if let Some(idx) = monitor_index {
        if let Some(main_win) = app.webview_windows().values().next() {
            if let Ok(monitors) = main_win.available_monitors() {
                monitors.get(idx).map(|monitor| {
                    let pos = monitor.position();
                    let size = monitor.size();
                    let scale = monitor.scale_factor();
                    (pos.x, pos.y, size.width, size.height, scale)
                })
            } else { None }
        } else { None }
    } else { None };

    // Build window
    let mut builder = WebviewWindowBuilder::new(&app, "tv-display", WebviewUrl::External(parsed_url))
        .title("TV Display")
        .decorations(false);

    if let Some((x, y, w, h, scale)) = monitor_info {
        let logical_w = w as f64 / scale;
        let logical_h = h as f64 / scale;
        info!(
            "open_tv_window: monitor at ({},{}) physical {}x{} scale={} logical {}x{}",
            x, y, w, h, scale, logical_w, logical_h
        );
        builder = builder
            .position(x as f64 / scale, y as f64 / scale)
            .inner_size(logical_w, logical_h);
    } else {
        builder = builder.fullscreen(true);
    }

    let tv_window = builder.build().map_err(|e| {
        error!("open_tv_window failed: {}", e);
        format!("Không thể mở cửa sổ TV: {}", e)
    })?;

    // Set fullscreen sau delay ngắn để window ổn định trên monitor phụ
    if monitor_info.is_some() {
        let win = tv_window.clone();
        tokio::task::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            info!("open_tv_window: setting fullscreen on tv-display");
            let _ = win.set_fullscreen(true);
            let _ = win.set_always_on_top(true);
        });
    }

    Ok(())
}

#[tauri::command]
fn close_tv_window(app: tauri::AppHandle) -> Result<(), String> {
    info!("close_tv_window");
    if let Some(existing) = app.get_webview_window("tv-display") {
        existing.destroy().map_err(|e| format!("Không thể đóng TV: {}", e))?;
    }
    Ok(())
}

// ─── Print ticket ───

#[tauri::command]
fn print_ticket(
    ticket_number: String,
    org_name: String,
    waiting_count: u32,
    datetime: String,
    printer_name: Option<String>,
) -> Result<String, String> {
    let printer = printer_name.unwrap_or_else(|| "default".to_string());
    info!(
        "print_ticket: printer={}, ticket={}, org={}, waiting={}, datetime={}",
        printer, ticket_number, org_name, waiting_count, datetime
    );

    // Tạo nội dung plain text cho máy in nhiệt (32 ký tự/dòng cho 80mm)
    let w = 32usize;
    let separator: String = "-".repeat(w);
    let center = |s: &str| -> String {
        if s.len() >= w { return s.to_string(); }
        let pad = (w - s.len()) / 2;
        format!("{:>width$}", s, width = pad + s.len())
    };

    let text = format!(
        "{sep}\n{org}\n{sep}\n\n{label}\n\n   {ticket}   \n\n{dt}\n{waiting}\n{sep}\n{hint}\n{sep}\n\n\n",
        sep = separator,
        org = center(&org_name),
        label = center("SO THU TU"),
        ticket = center(&ticket_number),
        dt = center(&datetime),
        waiting = center(&format!("Dang cho: {} nguoi", waiting_count)),
        hint = center("Vui long cho goi so"),
    );

    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join("bamso_ticket.txt");
    std::fs::write(&file_path, &text).map_err(|e| format!("Không thể tạo file tạm: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let file_path_str = file_path.to_string_lossy().to_string();
        let ps_script = if printer == "default" {
            format!(r#"Get-Content -Path "{}" | Out-Printer"#, file_path_str)
        } else {
            format!(r#"Get-Content -Path "{}" | Out-Printer -Name "{}""#, file_path_str, printer)
        };

        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| {
                error!("print_ticket: Windows print command failed: {}", e);
                format!("Không thể gọi lệnh in: {}", e)
            })?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = std::process::Command::new("lp");
        if printer != "default" {
            cmd.args(["-d", &printer]);
        }
        cmd.arg(&file_path);
        cmd.spawn().map_err(|e| {
            error!("print_ticket: Unix print command failed: {}", e);
            format!("Không thể gọi lệnh in: {}", e)
        })?;
    }

    Ok("Printed".to_string())
}

// Cache ding.mp3 bytes after first download
static DING_CACHE: OnceLock<Vec<u8>> = OnceLock::new();

#[tauri::command]
async fn play_ding(server_url: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let bytes = DING_CACHE.get_or_init(|| {
            let url = format!("{}/sounds/ding.mp3", server_url);
            reqwest::blocking::get(&url)
                .and_then(|r| r.bytes())
                .map(|b| b.to_vec())
                .unwrap_or_default()
        });

        if bytes.is_empty() {
            error!("play_ding: failed to load ding.mp3");
            return Err("Failed to load ding.mp3".to_string());
        }
        debug!("play_ding: loaded {} bytes", bytes.len());

        let (_stream, stream_handle) = rodio::OutputStream::try_default()
            .map_err(|e| format!("Audio output error: {}", e))?;
        let sink = rodio::Sink::try_new(&stream_handle)
            .map_err(|e| format!("Sink error: {}", e))?;

        let cursor = Cursor::new(bytes.clone());
        let source = rodio::Decoder::new(cursor)
            .map_err(|e| format!("Decode error: {}", e))?;

        sink.set_volume(0.8);
        sink.append(source);
        sink.sleep_until_end();

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ─── Google TTS with file cache ───

/// Get the TTS cache directory: custom path or <app_data_dir>/tts_cache/
fn get_tts_cache_dir(app: &tauri::AppHandle, custom_dir: Option<&str>) -> Result<PathBuf, String> {
    let cache_dir = match custom_dir {
        Some(dir) if !dir.trim().is_empty() => PathBuf::from(dir.trim()),
        _ => {
            let data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            data_dir.join("tts_cache")
        }
    };
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create dir {}: {}", cache_dir.display(), e))?;
    Ok(cache_dir)
}

/// Sanitize text to a safe filename: lowercase, replace spaces/special chars with _
fn text_to_filename(text: &str) -> String {
    let name: String = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect();
    // Trim trailing underscores and limit length
    let name = name.trim_matches('_');
    let name = if name.len() > 60 { &name[..60] } else { name };
    format!("{}.mp3", name)
}

/// Download TTS MP3 from Google Translate for a single word/phrase
fn download_tts(text: &str, dest: &PathBuf) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let url = format!(
        "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q={}",
        urlencoding::encode(text)
    );

    let resp = client.get(&url).send()
        .map_err(|e| {
            error!("download_tts: request error for \"{}\": {}", text, e);
            format!("Google TTS request error: {}", e)
        })?;

    if !resp.status().is_success() {
        error!("download_tts: HTTP {} for \"{}\"", resp.status(), text);
        return Err(format!("Google TTS HTTP {}", resp.status()));
    }

    let bytes = resp.bytes()
        .map_err(|e| format!("Google TTS read error: {}", e))?;

    std::fs::write(dest, &bytes)
        .map_err(|e| format!("Failed to save TTS file: {}", e))?;

    Ok(())
}

/// Ensure a phrase has a cached MP3 file, download if missing
fn ensure_cached(cache_dir: &PathBuf, text: &str) -> Result<PathBuf, String> {
    let filename = text_to_filename(text);
    let file_path = cache_dir.join(&filename);

    if !file_path.exists() {
        info!("TTS download: \"{}\" -> {}", text, filename);
        download_tts(text, &file_path)?;
    } else {
        debug!("TTS cached: \"{}\" -> {}", text, filename);
    }

    Ok(file_path)
}

/// Speak by receiving parts (e.g. ["Mời số", "0 0 1", "đến", "Quầy 1"])
/// Each part gets its own cached MP3, then all are concatenated and played as one stream
#[tauri::command]
async fn speak_vietnamese(app: tauri::AppHandle, parts: Vec<String>, custom_dir: Option<String>) -> Result<(), String> {
    info!("speak_vietnamese: {} parts, custom_dir={:?}", parts.len(), custom_dir);
    let cache_dir = get_tts_cache_dir(&app, custom_dir.as_deref())?;

    tokio::task::spawn_blocking(move || {
        // Ensure all parts are cached, collect bytes
        let mut combined: Vec<u8> = Vec::new();
        for part in &parts {
            let part = part.trim();
            if part.is_empty() { continue; }

            let file_path = ensure_cached(&cache_dir, part)?;
            let bytes = std::fs::read(&file_path)
                .map_err(|e| format!("Failed to read: {}", e))?;
            combined.extend_from_slice(&bytes);
        }

        if combined.is_empty() {
            return Ok(());
        }

        let (_stream, stream_handle) = rodio::OutputStream::try_default()
            .map_err(|e| format!("Audio output error: {}", e))?;
        let sink = rodio::Sink::try_new(&stream_handle)
            .map_err(|e| format!("Sink error: {}", e))?;

        let cursor = Cursor::new(combined);
        let source = rodio::Decoder::new(cursor)
            .map_err(|e| format!("Decode error: {}", e))?;

        sink.set_volume(0.8);
        sink.append(source);
        sink.sleep_until_end();

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Pre-download all common TTS audio files for offline use
/// Emits "preload-tts-progress" events: { current, total, downloaded }
#[tauri::command]
async fn preload_tts(app: tauri::AppHandle, phrases: Vec<String>, custom_dir: Option<String>) -> Result<u32, String> {
    let cache_dir = get_tts_cache_dir(&app, custom_dir.as_deref())?;

    tokio::task::spawn_blocking(move || {
        let total = phrases.len() as u32;
        let mut downloaded: u32 = 0;
        let mut current: u32 = 0;

        for phrase in &phrases {
            let phrase = phrase.trim();
            if phrase.is_empty() {
                current += 1;
                continue;
            }

            let filename = text_to_filename(phrase);
            let file_path = cache_dir.join(&filename);

            if !file_path.exists() {
                info!("TTS preload: \"{}\" -> {}", phrase, filename);
                download_tts(phrase, &file_path)?;
                downloaded += 1;
                // Small delay to avoid rate limiting
                std::thread::sleep(std::time::Duration::from_millis(300));
            }

            current += 1;
            let _ = app.emit("preload-tts-progress", serde_json::json!({
                "current": current,
                "total": total,
                "downloaded": downloaded,
            }));
        }

        Ok(downloaded)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[derive(Serialize)]
struct MachineInfo {
    hostname: String,
    ip: String,
}

#[tauri::command]
fn get_machine_info() -> MachineInfo {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    let ip = local_ip_address::local_ip()
        .map(|addr| addr.to_string())
        .unwrap_or_default();

    info!("get_machine_info: hostname={}, ip={}", hostname, ip);
    MachineInfo { hostname, ip }
}

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

/// Get the TTS cache directory path (for display in UI)
#[tauri::command]
fn get_tts_cache_path(app: tauri::AppHandle, custom_dir: Option<String>) -> Result<String, String> {
    let dir = get_tts_cache_dir(&app, custom_dir.as_deref())?;
    Ok(dir.to_string_lossy().to_string())
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            list_printers,
            print_ticket,
            open_tv_window,
            close_tv_window,
            play_ding,
            speak_vietnamese,
            preload_tts,
            get_tts_cache_path,
            get_machine_info,
            open_log_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
