use crate::db::models::{CreateIndicatorRequest, Indicator, UpdateIndicatorRequest};
use crate::db::Database;
use crate::services::{kline, tdx};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn cmd_validate_tdx_formula(source: String) -> Result<serde_json::Value, String> {
    let result = tdx::validate_formula(&source);
    serde_json::to_value(&result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cmd_create_indicator(
    db: State<'_, Arc<Database>>,
    request: CreateIndicatorRequest,
) -> Result<Indicator, String> {
    // 先验证公式
    let validation = tdx::validate_formula(&request.formula_source);
    if !validation.valid {
        return Err(format!("公式验证失败: {}", validation.errors.join("; ")));
    }

    if request.stock_symbols.is_empty() {
        return Err("至少需要一个股票代码".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let symbols_json = serde_json::to_string(&request.stock_symbols).unwrap_or_default();
    let check_interval = request.check_interval_secs.unwrap_or(60);
    let market_hours = request.market_hours_only.unwrap_or(true);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO indicator (id, name, formula_source, stock_symbols, task_id, is_active, check_interval_secs, market_hours_only, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, request.name, request.formula_source, symbols_json, request.task_id, check_interval, market_hours as i64, now, now],
    ).map_err(|e| format!("创建指标失败: {}", e))?;

    Ok(Indicator {
        id,
        name: request.name,
        formula_source: request.formula_source,
        stock_symbols: request.stock_symbols,
        task_id: request.task_id,
        is_active: true,
        check_interval_secs: check_interval,
        market_hours_only: market_hours,
        last_checked: None,
        last_signal: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn cmd_list_indicators(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<Indicator>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, formula_source, stock_symbols, task_id, is_active, check_interval_secs, market_hours_only, last_checked, last_signal, created_at, updated_at FROM indicator ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([], |row| {
            let symbols_json: String = row.get(3)?;
            let symbols: Vec<String> =
                serde_json::from_str(&symbols_json).unwrap_or_default();
            Ok(Indicator {
                id: row.get(0)?,
                name: row.get(1)?,
                formula_source: row.get(2)?,
                stock_symbols: symbols,
                task_id: row.get(4)?,
                is_active: row.get::<_, i64>(5)? != 0,
                check_interval_secs: row.get(6)?,
                market_hours_only: row.get::<_, i64>(7)? != 0,
                last_checked: row.get(8)?,
                last_signal: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(results)
}

#[tauri::command]
pub async fn cmd_update_indicator(
    db: State<'_, Arc<Database>>,
    id: String,
    request: UpdateIndicatorRequest,
) -> Result<serde_json::Value, String> {
    // 如果更新公式，先验证
    if let Some(ref source) = request.formula_source {
        let validation = tdx::validate_formula(source);
        if !validation.valid {
            return Err(format!("公式验证失败: {}", validation.errors.join("; ")));
        }
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let mut sets = vec!["updated_at = ?1".to_string()];
    let mut param_idx = 2u32;
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];

    if let Some(name) = &request.name {
        sets.push(format!("name = ?{}", param_idx));
        params.push(Box::new(name.clone()));
        param_idx += 1;
    }
    if let Some(formula) = &request.formula_source {
        sets.push(format!("formula_source = ?{}", param_idx));
        params.push(Box::new(formula.clone()));
        param_idx += 1;
    }
    if let Some(symbols) = &request.stock_symbols {
        let json = serde_json::to_string(symbols).unwrap_or_default();
        sets.push(format!("stock_symbols = ?{}", param_idx));
        params.push(Box::new(json));
        param_idx += 1;
    }
    if let Some(active) = request.is_active {
        sets.push(format!("is_active = ?{}", param_idx));
        params.push(Box::new(active as i64));
        param_idx += 1;
    }
    if let Some(interval) = request.check_interval_secs {
        sets.push(format!("check_interval_secs = ?{}", param_idx));
        params.push(Box::new(interval));
        param_idx += 1;
    }
    if let Some(mho) = request.market_hours_only {
        sets.push(format!("market_hours_only = ?{}", param_idx));
        params.push(Box::new(mho as i64));
        param_idx += 1;
    }

    // id 参数
    sets.push(format!("id = id")); // no-op to end SET clause cleanly
    let sql = format!(
        "UPDATE indicator SET {} WHERE id = ?{}",
        sets.join(", "),
        param_idx
    );
    params.push(Box::new(id.clone()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("更新指标失败: {}", e))?;

    Ok(serde_json::json!({ "success": true, "id": id }))
}

#[tauri::command]
pub async fn cmd_delete_indicator(
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<serde_json::Value, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM indicator WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("删除指标失败: {}", e))?;
    Ok(serde_json::json!({ "success": true, "id": id }))
}

#[tauri::command]
pub async fn cmd_evaluate_indicator(
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<serde_json::Value, String> {
    let (formula_source, symbols_json) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT formula_source, stock_symbols FROM indicator WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| format!("指标不存在: {}", e))?
    };

    let symbols: Vec<String> = serde_json::from_str(&symbols_json).unwrap_or_default();
    let mut results = serde_json::Map::new();

    for symbol in &symbols {
        let bars = kline::fetch_daily_klines(symbol, 300).await?;
        match tdx::evaluate_formula(&formula_source, &bars) {
            Ok(eval_result) => {
                results.insert(
                    symbol.clone(),
                    serde_json::to_value(&eval_result).unwrap_or_default(),
                );
            }
            Err(e) => {
                results.insert(
                    symbol.clone(),
                    serde_json::json!({ "error": e }),
                );
            }
        }
    }

    Ok(serde_json::json!({
        "indicator_id": id,
        "results": results,
    }))
}
