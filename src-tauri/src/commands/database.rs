use crate::db::models::*;
use crate::db::Database;
use tauri::State;

// ── Task CRUD ──

#[tauri::command]
pub fn create_task(db: State<Database>, request: CreateTaskRequest) -> Result<Task, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let task_type = request.task_type.unwrap_or_else(|| "manual".into());
    let stock_symbols_json = request
        .stock_symbols
        .as_ref()
        .map(|s| serde_json::to_string(s).unwrap_or_default());
    let tags_json = request
        .tags
        .as_ref()
        .map(|t| serde_json::to_string(t).unwrap_or_default());

    conn.execute(
        "INSERT INTO task (id, title, type, status, stock_symbols, tags, created_at, updated_at) VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7)",
        rusqlite::params![id, request.title, task_type, stock_symbols_json, tags_json, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Task {
        id,
        title: request.title,
        task_type,
        status: "active".into(),
        stock_symbols: stock_symbols_json,
        tags: tags_json,
        schedule_config: None,
        monitor_config: None,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
    })
}

#[tauri::command]
pub fn list_tasks(db: State<Database>) -> Result<Vec<Task>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, type, status, stock_symbols, tags, schedule_config, monitor_config, created_at, updated_at, completed_at
             FROM task ORDER BY
                CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let tasks = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                task_type: row.get(2)?,
                status: row.get(3)?,
                stock_symbols: row.get(4)?,
                tags: row.get(5)?,
                schedule_config: row.get(6)?,
                monitor_config: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                completed_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(tasks)
}

#[tauri::command]
pub fn update_task(
    db: State<Database>,
    id: String,
    request: UpdateTaskRequest,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(title) = &request.title {
        conn.execute(
            "UPDATE task SET title = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![title, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(status) = &request.status {
        let completed_at = if status == "completed" {
            Some(now.clone())
        } else {
            None
        };
        conn.execute(
            "UPDATE task SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
            rusqlite::params![status, completed_at, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(symbols) = &request.stock_symbols {
        let json = serde_json::to_string(symbols).unwrap_or_default();
        conn.execute(
            "UPDATE task SET stock_symbols = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![json, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(tags) = &request.tags {
        let json = serde_json::to_string(tags).unwrap_or_default();
        conn.execute(
            "UPDATE task SET tags = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![json, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(config) = &request.schedule_config {
        conn.execute(
            "UPDATE task SET schedule_config = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![config, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(config) = &request.monitor_config {
        conn.execute(
            "UPDATE task SET monitor_config = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![config, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_task(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM message WHERE task_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM task WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Message CRUD ──

#[tauri::command]
pub fn create_message(db: State<Database>, request: CreateMessageRequest) -> Result<Message, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let image_paths_json = request
        .image_paths
        .as_ref()
        .map(|paths| serde_json::to_string(paths).unwrap_or_default());

    conn.execute(
        "INSERT INTO message (id, task_id, role, content, image_paths, model_used, trigger_source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            id,
            request.task_id,
            request.role,
            request.content,
            image_paths_json,
            request.model_used,
            request.trigger_source,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE task SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, request.task_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(Message {
        id,
        task_id: request.task_id,
        role: request.role,
        content: request.content,
        image_paths: image_paths_json,
        model_used: request.model_used,
        trigger_source: request.trigger_source,
        created_at: now,
    })
}

#[tauri::command]
pub fn get_messages(db: State<Database>, task_id: String) -> Result<Vec<Message>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, role, content, image_paths, model_used, trigger_source, created_at
             FROM message WHERE task_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let messages = stmt
        .query_map([&task_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                task_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                image_paths: row.get(4)?,
                model_used: row.get(5)?,
                trigger_source: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(messages)
}
