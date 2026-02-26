use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct WindowInfo {
    pub title: String,
    pub app_name: String,
}

#[tauri::command]
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let mut results = Vec::new();

    let windows = xcap::Window::all().map_err(|e| format!("枚举窗口失败: {}", e))?;
    for w in windows {
        let title = w.title().map_err(|e| format!("获取窗口标题失败: {}", e))?;
        let app_name = w.app_name().map_err(|e| format!("获取应用名失败: {}", e))?;
        // 跳过无标题窗口
        if title.is_empty() {
            continue;
        }
        // 跳过最小化窗口
        if w.is_minimized().unwrap_or(false) {
            continue;
        }
        // 排除一些系统窗口
        if title == "Dock" || title == "Wallpaper" || title == "Window Server" {
            continue;
        }
        results.push(WindowInfo { title, app_name });
    }

    Ok(results)
}

#[tauri::command]
pub fn capture_window(app_handle: AppHandle, window_title: String) -> Result<String, String> {
    let windows = xcap::Window::all().map_err(|e| format!("枚举窗口失败: {}", e))?;

    // 模糊匹配窗口标题
    let target = windows
        .into_iter()
        .find(|w| {
            let title = w.title().unwrap_or_default();
            title.contains(&window_title) || window_title.contains(&title)
        })
        .ok_or_else(|| format!("未找到包含 \"{}\" 的窗口", window_title))?;

    let image = target
        .capture_image()
        .map_err(|e| format!("截图失败: {}", e))?;

    // 保存到 $APP_DATA_DIR/captures/{timestamp}.png
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {}", e))?;
    let captures_dir = app_data_dir.join("captures");
    std::fs::create_dir_all(&captures_dir)
        .map_err(|e| format!("创建 captures 目录失败: {}", e))?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("{}.png", timestamp);
    let file_path = captures_dir.join(&filename);

    image
        .save(&file_path)
        .map_err(|e| format!("保存截图失败: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_capture_base64(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    let bytes = std::fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    // 根据扩展名判断 MIME 类型
    let mime = match file_path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "image/png",
    };

    Ok(format!("data:{};base64,{}", mime, b64))
}
