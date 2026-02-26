use crate::db::models::*;
use crate::db::Database;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn cmd_add_to_watchlist(
    db: State<Arc<Database>>,
    symbol: String,
    name: Option<String>,
) -> Result<WatchlistItem, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO watchlist (symbol, name, added_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![symbol, name, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(WatchlistItem {
        symbol,
        name,
        exchange: None,
        added_at: now,
    })
}

#[tauri::command]
pub fn cmd_remove_from_watchlist(db: State<Arc<Database>>, symbol: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM watchlist WHERE symbol = ?1", rusqlite::params![symbol])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cmd_get_watchlist(db: State<Arc<Database>>) -> Result<Vec<WatchlistItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT symbol, name, exchange, added_at FROM watchlist ORDER BY added_at DESC")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(WatchlistItem {
                symbol: row.get(0)?,
                name: row.get(1)?,
                exchange: row.get(2)?,
                added_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}
