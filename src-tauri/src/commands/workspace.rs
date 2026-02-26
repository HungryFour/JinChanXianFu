use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspace");
    Ok(dir)
}

#[tauri::command]
pub fn cmd_workspace_read(app: AppHandle, relative_path: String) -> Result<String, String> {
    let path = workspace_dir(&app)?.join(&relative_path);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))
}

#[tauri::command]
pub fn cmd_workspace_write(app: AppHandle, relative_path: String, content: String) -> Result<(), String> {
    let path = workspace_dir(&app)?.join(&relative_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("写入失败: {}", e))
}

#[tauri::command]
pub fn cmd_workspace_append(app: AppHandle, relative_path: String, content: String) -> Result<(), String> {
    let path = workspace_dir(&app)?.join(&relative_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("打开文件失败: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("追加写入失败: {}", e))
}

#[tauri::command]
pub fn cmd_workspace_list(app: AppHandle, relative_path: Option<String>) -> Result<Vec<String>, String> {
    let base = workspace_dir(&app)?;
    let dir = match &relative_path {
        Some(p) => base.join(p),
        None => base,
    };

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    collect_files(&dir, &dir, &mut entries)?;
    Ok(entries)
}

fn collect_files(base: &PathBuf, dir: &PathBuf, entries: &mut Vec<String>) -> Result<(), String> {
    let read_dir = std::fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(base, &path, entries)?;
        } else {
            let relative = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            entries.push(relative);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_workspace_search(app: AppHandle, relative_path: String, query: String) -> Result<Vec<String>, String> {
    let path = workspace_dir(&app)?.join(&relative_path);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))?;
    let query_lower = query.to_lowercase();
    let keywords: Vec<&str> = query_lower.split_whitespace().collect();

    let results: Vec<String> = content
        .lines()
        .filter(|line| {
            let line_lower = line.to_lowercase();
            keywords.iter().any(|kw| line_lower.contains(kw))
        })
        .map(|s| s.to_string())
        .collect();

    Ok(results)
}

/// 初始化 workspace 目录：从 bundled resources 复制默认文件
pub fn init_workspace(app: &AppHandle) -> Result<(), String> {
    let ws_dir = workspace_dir(app)?;

    if ws_dir.exists() {
        return Ok(());
    }

    std::fs::create_dir_all(&ws_dir).map_err(|e| format!("创建 workspace 目录失败: {}", e))?;

    // 从 resources 复制默认文件
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("resources")
        .join("workspace");

    if resource_dir.exists() {
        copy_dir_recursive(&resource_dir, &ws_dir)?;
    } else {
        // 如果 resources 不存在，创建默认文件
        create_default_workspace(&ws_dir)?;
    }

    Ok(())
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;
    let read_dir = std::fs::read_dir(src).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    Ok(())
}

fn create_default_workspace(ws_dir: &PathBuf) -> Result<(), String> {
    let soul_content = include_str!("../../resources/workspace/SOUL.md");
    std::fs::write(ws_dir.join("SOUL.md"), soul_content)
        .map_err(|e| format!("写入 SOUL.md 失败: {}", e))?;

    std::fs::write(ws_dir.join("USER.md"), "# 用户画像\n")
        .map_err(|e| format!("写入 USER.md 失败: {}", e))?;

    std::fs::write(ws_dir.join("MEMORY.md"), "# 交易记忆\n")
        .map_err(|e| format!("写入 MEMORY.md 失败: {}", e))?;

    // 创建 skills 目录结构
    let always_dir = ws_dir.join("skills").join("_always");
    let ondemand_dir = ws_dir.join("skills").join("on-demand");
    std::fs::create_dir_all(&always_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&ondemand_dir).map_err(|e| e.to_string())?;

    Ok(())
}
