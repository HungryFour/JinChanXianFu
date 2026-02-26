use crate::db::models::*;
use crate::db::Database;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn create_alert_rule(
    db: State<Arc<Database>>,
    task_id: Option<String>,
    stock_symbol: String,
    alert_type: String,
    condition_json: String,
) -> Result<AlertRule, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO alert_rule (id, task_id, stock_symbol, alert_type, condition_json, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
        rusqlite::params![id, task_id, stock_symbol, alert_type, condition_json, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(AlertRule {
        id,
        task_id,
        stock_symbol,
        alert_type,
        condition_json,
        is_active: true,
        last_triggered: None,
        created_at: now,
    })
}

#[tauri::command]
pub fn list_active_alerts(db: State<Arc<Database>>) -> Result<Vec<AlertRule>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, stock_symbol, alert_type, condition_json, is_active, last_triggered, created_at
             FROM alert_rule WHERE is_active = 1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let alerts = stmt
        .query_map([], |row| {
            Ok(AlertRule {
                id: row.get(0)?,
                task_id: row.get(1)?,
                stock_symbol: row.get(2)?,
                alert_type: row.get(3)?,
                condition_json: row.get(4)?,
                is_active: row.get::<_, i32>(5)? == 1,
                last_triggered: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(alerts)
}

#[tauri::command]
pub fn deactivate_alert(db: State<Arc<Database>>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE alert_rule SET is_active = 0 WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
