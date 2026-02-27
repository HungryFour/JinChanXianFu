use crate::db::Database;
use crate::services::{kline, market, tdx};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub struct Scheduler {
    db: Arc<Database>,
    app_handle: AppHandle,
    app_data_dir: PathBuf,
}

/// 判断当前是否为 A 股交易时间（北京时间 9:30-11:30, 13:00-15:00, 周一到周五）
fn is_market_hours() -> bool {
    use chrono::{Datelike, Timelike, Utc};
    let now = Utc::now() + chrono::Duration::hours(8);
    let weekday = now.weekday().num_days_from_monday();
    if weekday >= 5 {
        return false;
    }
    let hour = now.hour();
    let minute = now.minute();
    let time_mins = hour * 60 + minute;

    (570..=690).contains(&time_mins) || (780..=900).contains(&time_mins)
}

#[derive(serde::Serialize, Clone)]
struct ScheduledTaskPayload {
    task_id: String,
    prompt: String,
    stock_symbols: Vec<String>,
}

// ── Agent Plan Rust 结构体 ──

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AgentPlan {
    version: u32,
    description: String,
    stock_symbols: Vec<String>,
    enabled: bool,
    steps: Vec<PlanStep>,
    schedule: PlanSchedule,
    execution_state: ExecutionState,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PlanStep {
    id: String,
    #[serde(rename = "type")]
    step_type: String,
    config: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PlanSchedule {
    #[serde(rename = "type")]
    schedule_type: String,
    interval_minutes: Option<f64>,
    trigger_time: Option<String>,
    market_hours_only: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ExecutionState {
    last_executed_at: Option<String>,
    total_executions: u64,
    total_triggers: u64,
    consecutive_failures: u64,
}

#[derive(Debug, Serialize, Clone)]
struct AgentPlanTriggerPayload {
    task_id: String,
    plan_description: String,
    step_results: serde_json::Value,
    action_config: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
struct AgentPlanVisionPayload {
    task_id: String,
    plan_description: String,
    image_path: String,
    vision_config: serde_json::Value,
    action_config: serde_json::Value,
}

impl Scheduler {
    pub fn new(db: Arc<Database>, app_handle: AppHandle, app_data_dir: PathBuf) -> Self {
        Self { db, app_handle, app_data_dir }
    }

    pub async fn run(&self) {
        loop {
            let market_open = is_market_hours();

            if market_open {
                if let Err(e) = self.check_alerts().await {
                    eprintln!("检查提醒失败: {}", e);
                }

                if let Err(e) = self.check_indicators().await {
                    eprintln!("检查指标失败: {}", e);
                }
            }

            if let Err(e) = self.check_scheduled_tasks() {
                eprintln!("检查定时任务失败: {}", e);
            }

            if let Err(e) = self.check_agent_plans(market_open).await {
                eprintln!("检查 Agent Plan 失败: {}", e);
            }

            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        }
    }

    // ── Agent Plan 检查 ──

    async fn check_agent_plans(&self, market_open: bool) -> Result<(), String> {
        let plans = {
            let conn = self.db.conn.lock().map_err(|e| e.to_string())?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, agent_plan FROM task WHERE status = 'active' AND agent_plan IS NOT NULL",
                )
                .map_err(|e| e.to_string())?;

            let results = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            results
        };

        for (task_id, plan_json) in plans {
            let mut plan: AgentPlan = match serde_json::from_str(&plan_json) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("解析 agent_plan 失败 (task {}): {}", task_id, e);
                    continue;
                }
            };

            if !plan.enabled {
                continue;
            }

            // 如果要求仅交易时间执行
            if plan.schedule.market_hours_only.unwrap_or(true) && !market_open {
                continue;
            }

            if !self.should_execute(&plan) {
                continue;
            }

            // 执行 plan 步骤
            match self.execute_plan_steps(&task_id, &mut plan).await {
                Ok(()) => {
                    plan.execution_state.consecutive_failures = 0;
                }
                Err(e) => {
                    eprintln!("执行 plan 步骤失败 (task {}): {}", task_id, e);
                    plan.execution_state.consecutive_failures += 1;
                }
            }

            // 更新 execution_state
            plan.execution_state.total_executions += 1;
            plan.execution_state.last_executed_at = Some(chrono::Utc::now().to_rfc3339());

            // 保存更新后的 plan
            self.save_plan(&task_id, &plan)?;
        }

        Ok(())
    }

    fn should_execute(&self, plan: &AgentPlan) -> bool {
        let now = chrono::Utc::now();

        match plan.schedule.schedule_type.as_str() {
            "interval" => {
                let interval_mins = plan.schedule.interval_minutes.unwrap_or(5.0);
                let interval_secs = (interval_mins * 60.0) as i64;
                match &plan.execution_state.last_executed_at {
                    Some(last) => {
                        if let Ok(last_time) = chrono::DateTime::parse_from_rfc3339(last) {
                            let elapsed = now.signed_duration_since(last_time);
                            elapsed.num_seconds() >= interval_secs
                        } else {
                            true
                        }
                    }
                    None => true,
                }
            }
            "daily" => {
                let trigger_time = plan.schedule.trigger_time.as_deref().unwrap_or("09:30");
                let beijing_now = now + chrono::Duration::hours(8);
                let current_time = beijing_now.format("%H:%M").to_string();

                if current_time != trigger_time {
                    return false;
                }

                // 检查今天是否已经执行过
                match &plan.execution_state.last_executed_at {
                    Some(last) => {
                        if let Ok(last_time) = chrono::DateTime::parse_from_rfc3339(last) {
                            let last_beijing = last_time + chrono::Duration::hours(8);
                            last_beijing.format("%Y-%m-%d").to_string()
                                != beijing_now.format("%Y-%m-%d").to_string()
                        } else {
                            true
                        }
                    }
                    None => true,
                }
            }
            "once" => {
                // once 类型：从未执行过且从未触发过
                plan.execution_state.total_triggers == 0
            }
            _ => false,
        }
    }

    async fn execute_plan_steps(&self, task_id: &str, plan: &mut AgentPlan) -> Result<(), String> {
        let mut step_results = serde_json::json!({});
        let mut condition_met = true;

        for step in &plan.steps {
            match step.step_type.as_str() {
                "fetch_data" => {
                    let symbols: Vec<String> = step.config["symbols"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_else(|| plan.stock_symbols.clone());

                    let quotes = market::fetch_batch_quotes(&symbols).await?;
                    step_results[&step.id] = serde_json::to_value(&quotes).unwrap_or_default();
                }
                "condition_check" => {
                    condition_met = self.evaluate_conditions(&step.config, &step_results);
                    step_results[&step.id] = serde_json::json!({ "condition_met": condition_met });

                    if !condition_met {
                        // 条件不满足，跳过后续 action 步骤
                        break;
                    }
                }
                "capture_screen" => {
                    let window_title = step.config["window_title"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    if window_title.is_empty() {
                        return Err("capture_screen 缺少 window_title 配置".to_string());
                    }

                    // 使用 xcap 截图
                    match self.capture_window_screenshot(&window_title) {
                        Ok(path) => {
                            step_results[&step.id] =
                                serde_json::json!({ "image_path": path });
                        }
                        Err(e) => {
                            eprintln!("截图失败 ({}): {}", window_title, e);
                            plan.execution_state.consecutive_failures += 1;
                            // 截图失败跳过后续步骤
                            break;
                        }
                    }
                }
                "vision_analyze" => {
                    // Rust 端无法调用 AI，emit 事件委托给前端
                    // 从前面的 capture_screen 步骤获取 image_path
                    let image_path = step_results
                        .as_object()
                        .and_then(|m| {
                            m.values().find_map(|v| v["image_path"].as_str().map(|s| s.to_string()))
                        })
                        .unwrap_or_default();

                    if image_path.is_empty() {
                        return Err("vision_analyze 找不到截图路径".to_string());
                    }

                    // 查找后续的 action 步骤配置
                    let action_config = plan.steps.iter()
                        .find(|s| s.step_type == "action")
                        .map(|s| s.config.clone())
                        .unwrap_or_else(|| serde_json::json!({
                            "action_type": "notify_and_analyze",
                            "message": plan.description.clone()
                        }));

                    plan.execution_state.total_triggers += 1;

                    let _ = self.app_handle.emit(
                        "agent-plan-vision",
                        AgentPlanVisionPayload {
                            task_id: task_id.to_string(),
                            plan_description: plan.description.clone(),
                            image_path,
                            vision_config: step.config.clone(),
                            action_config,
                        },
                    );

                    // once 类型触发后自动停用
                    if plan.schedule.schedule_type == "once" {
                        plan.enabled = false;
                    }

                    // break 跳出循环，后续由前端处理
                    break;
                }
                "action" => {
                    if condition_met {
                        plan.execution_state.total_triggers += 1;

                        let _ = self.app_handle.emit(
                            "agent-plan-trigger",
                            AgentPlanTriggerPayload {
                                task_id: task_id.to_string(),
                                plan_description: plan.description.clone(),
                                step_results: step_results.clone(),
                                action_config: step.config.clone(),
                            },
                        );

                        // once 类型触发后自动停用
                        if plan.schedule.schedule_type == "once" {
                            plan.enabled = false;
                        }
                    }
                }
                _ => {}
            }
        }

        // 写入 schedule_log
        self.write_plan_log(task_id, if condition_met { "executed" } else { "checked" }, &step_results)?;

        Ok(())
    }

    fn evaluate_conditions(
        &self,
        config: &serde_json::Value,
        step_results: &serde_json::Value,
    ) -> bool {
        let conditions = match config["conditions"].as_array() {
            Some(arr) => arr,
            None => return true,
        };
        let logic = config["logic"].as_str().unwrap_or("any");

        // 从 step_results 中提取行情数据（来自前面的 fetch_data 步骤）
        let mut quotes_map: std::collections::HashMap<String, &serde_json::Value> =
            std::collections::HashMap::new();

        for (_step_id, result) in step_results.as_object().into_iter().flat_map(|m| m.iter()) {
            if let Some(arr) = result.as_array() {
                for quote in arr {
                    if let Some(symbol) = quote["symbol"].as_str() {
                        quotes_map.insert(symbol.to_string(), quote);
                    }
                }
            }
        }

        let results: Vec<bool> = conditions
            .iter()
            .map(|cond| {
                let symbol = cond["symbol"].as_str().unwrap_or("");
                let field = cond["field"].as_str().unwrap_or("price");
                let operator = cond["operator"].as_str().unwrap_or("gt");
                let threshold = cond["value"].as_f64().unwrap_or(0.0);

                let quote = match quotes_map.get(symbol) {
                    Some(q) => q,
                    None => return false,
                };

                let actual = quote[field].as_f64().unwrap_or(0.0);

                match operator {
                    "gt" => actual > threshold,
                    "lt" => actual < threshold,
                    "gte" => actual >= threshold,
                    "lte" => actual <= threshold,
                    "eq" => (actual - threshold).abs() < f64::EPSILON,
                    _ => false,
                }
            })
            .collect();

        match logic {
            "all" => results.iter().all(|&r| r),
            _ => results.iter().any(|&r| r),
        }
    }

    fn save_plan(&self, task_id: &str, plan: &AgentPlan) -> Result<(), String> {
        let conn = self.db.conn.lock().map_err(|e| e.to_string())?;
        let plan_json = serde_json::to_string(plan).map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE task SET agent_plan = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![plan_json, now, task_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn write_plan_log(
        &self,
        task_id: &str,
        status: &str,
        step_results: &serde_json::Value,
    ) -> Result<(), String> {
        let conn = self.db.conn.lock().map_err(|e| e.to_string())?;
        let log_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let results_json = serde_json::to_string(step_results).unwrap_or_default();
        conn.execute(
            "INSERT INTO schedule_log (id, task_id, executed_at, status, step_results) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![log_id, task_id, now, status, results_json],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── 截图辅助 ──

    fn capture_window_screenshot(&self, window_title: &str) -> Result<String, String> {
        let windows = xcap::Window::all().map_err(|e| format!("枚举窗口失败: {}", e))?;

        let target = windows
            .into_iter()
            .find(|w| {
                let title = w.title().unwrap_or_default();
                title.contains(window_title) || window_title.contains(&title)
            })
            .ok_or_else(|| format!("未找到包含 \"{}\" 的窗口", window_title))?;

        let image = target
            .capture_image()
            .map_err(|e| format!("截图失败: {}", e))?;

        let captures_dir = self.app_data_dir.join("captures");
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

    // ── TDX 指标检查 ──

    async fn check_indicators(&self) -> Result<(), String> {
        let indicators = {
            let conn = self.db.conn.lock().map_err(|e| e.to_string())?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, formula_source, stock_symbols, task_id, check_interval_secs, last_checked, last_signal
                     FROM indicator WHERE is_active = 1 AND market_hours_only = 1",
                )
                .map_err(|e| e.to_string())?;

            let results = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,   // id
                        row.get::<_, String>(1)?,   // name
                        row.get::<_, String>(2)?,   // formula_source
                        row.get::<_, String>(3)?,   // stock_symbols JSON
                        row.get::<_, Option<String>>(4)?, // task_id
                        row.get::<_, i64>(5)?,      // check_interval_secs
                        row.get::<_, Option<String>>(6)?, // last_checked
                        row.get::<_, Option<String>>(7)?, // last_signal
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            results
        };

        // 同时查非交易时段限制的指标
        let indicators_no_mho = {
            let conn = self.db.conn.lock().map_err(|e| e.to_string())?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, formula_source, stock_symbols, task_id, check_interval_secs, last_checked, last_signal
                     FROM indicator WHERE is_active = 1 AND market_hours_only = 0",
                )
                .map_err(|e| e.to_string())?;

            let results = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

            results
        };

        let all_indicators: Vec<_> = indicators.into_iter().chain(indicators_no_mho).collect();

        let now = chrono::Utc::now();

        for (id, name, formula_source, symbols_json, task_id, interval_secs, last_checked, last_signal) in &all_indicators {
            // 检查间隔
            if let Some(last) = last_checked {
                if let Ok(last_time) = chrono::DateTime::parse_from_rfc3339(last) {
                    if now.signed_duration_since(last_time).num_seconds() < *interval_secs {
                        continue;
                    }
                }
            }

            let symbols: Vec<String> = serde_json::from_str(symbols_json).unwrap_or_default();

            for symbol in &symbols {
                let bars = match kline::fetch_daily_klines(symbol, 300).await {
                    Ok(b) => b,
                    Err(e) => {
                        eprintln!("获取 {} K线失败: {}", symbol, e);
                        continue;
                    }
                };

                let eval_result = match tdx::evaluate_formula(&formula_source, &bars) {
                    Ok(r) => r,
                    Err(e) => {
                        eprintln!("计算指标 {} 公式失败: {}", name, e);
                        continue;
                    }
                };

                // 检查信号
                for signal in &eval_result.signals {
                    if !signal.triggered {
                        continue;
                    }

                    // 去重: 与 last_signal 比较
                    let today = (now + chrono::Duration::hours(8))
                        .format("%Y-%m-%d")
                        .to_string();
                    let signal_key = format!("{}:{}:{}", symbol, signal.text, today);

                    if let Some(ls) = last_signal {
                        if ls == &signal_key {
                            continue; // 同日同信号不重复
                        }
                    }

                    // 触发信号
                    let _ = self.app_handle.emit(
                        "indicator-signal-triggered",
                        serde_json::json!({
                            "indicator_id": id,
                            "indicator_name": name,
                            "symbol": symbol,
                            "signal_text": signal.text,
                            "signal_value": signal.value,
                            "task_id": task_id,
                            "date": today,
                        }),
                    );

                    // 更新 last_signal
                    if let Ok(conn) = self.db.conn.lock() {
                        let _ = conn.execute(
                            "UPDATE indicator SET last_signal = ?1, last_checked = ?2, updated_at = ?2 WHERE id = ?3",
                            rusqlite::params![signal_key, now.to_rfc3339(), id],
                        );
                    }
                }
            }

            // 更新 last_checked（即使无信号）
            if let Ok(conn) = self.db.conn.lock() {
                let _ = conn.execute(
                    "UPDATE indicator SET last_checked = ?1, updated_at = ?1 WHERE id = ?2",
                    rusqlite::params![now.to_rfc3339(), id],
                );
            }
        }

        Ok(())
    }

    // ── 原有 Alert 检查 ──

    async fn check_alerts(&self) -> Result<(), String> {
        let alerts = {
            let conn = self.db.conn.lock().map_err(|e| e.to_string())?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, task_id, stock_symbol, alert_type, condition_json, last_triggered
                     FROM alert_rule WHERE is_active = 1",
                )
                .map_err(|e| e.to_string())?;

            let results = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            results
        };

        if alerts.is_empty() {
            return Ok(());
        }

        // 按股票代码分组
        let mut symbols_set = std::collections::HashSet::new();
        for (_, _, symbol, _, _, _) in &alerts {
            symbols_set.insert(symbol.clone());
        }
        let symbols: Vec<String> = symbols_set.into_iter().collect();

        // 批量获取行情
        let quotes = market::fetch_batch_quotes(&symbols).await?;
        let quote_map: std::collections::HashMap<String, &market::StockQuote> =
            quotes.iter().map(|q| (q.symbol.clone(), q)).collect();

        // 逐条评估
        for (id, _task_id, symbol, _alert_type, condition_json, _last_triggered) in &alerts {
            let quote = match quote_map.get(symbol) {
                Some(q) => q,
                None => continue,
            };

            let condition: serde_json::Value =
                serde_json::from_str(condition_json).unwrap_or_default();
            let alert_type = condition["type"].as_str().unwrap_or("");
            let threshold = condition["threshold"].as_f64().unwrap_or(0.0);
            let message = condition["message"].as_str().unwrap_or("价格提醒触发");

            let triggered = match alert_type {
                "price_above" => quote.price >= threshold,
                "price_below" => quote.price <= threshold,
                "change_above" => quote.change_percent >= threshold,
                "change_below" => quote.change_percent <= -threshold.abs(),
                "volume_ratio" => quote.volume_ratio >= threshold,
                _ => false,
            };

            if triggered {
                let title = format!("{} {}", quote.name, quote.symbol);
                let body = format!(
                    "{}\n当前价格: {:.2} 涨跌幅: {:.2}%",
                    message, quote.price, quote.change_percent
                );

                let _ = self.app_handle.emit(
                    "alert-triggered",
                    serde_json::json!({
                        "alert_id": id,
                        "symbol": symbol,
                        "name": quote.name,
                        "price": quote.price,
                        "change_percent": quote.change_percent,
                        "title": title,
                        "body": body,
                    }),
                );

                // 更新 last_triggered 并停用
                let conn = self.db.conn.lock().map_err(|e| e.to_string())?;
                let now = chrono::Utc::now().to_rfc3339();
                conn.execute(
                    "UPDATE alert_rule SET last_triggered = ?1, is_active = 0 WHERE id = ?2",
                    rusqlite::params![now, id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }

    fn check_scheduled_tasks(&self) -> Result<(), String> {
        let conn = self.db.conn.lock().map_err(|e| e.to_string())?;

        let tasks = {
            let mut stmt = conn
                .prepare(
                    "SELECT id, stock_symbols, schedule_config
                     FROM task WHERE type = 'scheduled' AND status = 'active' AND schedule_config IS NOT NULL",
                )
                .map_err(|e| e.to_string())?;

            let results = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            results
        };

        let now = chrono::Utc::now() + chrono::Duration::hours(8);
        let current_time = now.format("%H:%M").to_string();

        for (task_id, stock_symbols_json, schedule_config_json) in &tasks {
            let config: serde_json::Value =
                serde_json::from_str(schedule_config_json).unwrap_or_default();
            let trigger_time = config["trigger_time"].as_str().unwrap_or("");
            let analysis_prompt = config["analysis_prompt"]
                .as_str()
                .unwrap_or("分析这些股票的当日表现")
                .to_string();

            if trigger_time == current_time {
                let already_run: bool = conn
                    .query_row(
                        "SELECT COUNT(*) > 0 FROM schedule_log WHERE task_id = ?1 AND date(executed_at) = date('now')",
                        rusqlite::params![task_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);

                if already_run {
                    continue;
                }

                let symbols: Vec<String> = stock_symbols_json
                    .as_ref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();

                let _ = self.app_handle.emit(
                    "scheduled-task-trigger",
                    ScheduledTaskPayload {
                        task_id: task_id.clone(),
                        prompt: analysis_prompt,
                        stock_symbols: symbols,
                    },
                );

                let log_id = uuid::Uuid::new_v4().to_string();
                let log_now = chrono::Utc::now().to_rfc3339();
                let _ = conn.execute(
                    "INSERT INTO schedule_log (id, task_id, executed_at, status) VALUES (?1, ?2, ?3, 'triggered')",
                    rusqlite::params![log_id, task_id, log_now],
                );
            }
        }

        Ok(())
    }
}
