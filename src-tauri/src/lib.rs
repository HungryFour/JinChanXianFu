mod commands;
mod db;
mod services;

use commands::browser::BrowserState;
use db::Database;
use services::scheduler::Scheduler;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            let database = Arc::new(Database::new(app_data_dir.clone()).expect("Failed to initialize database"));

            // Scheduler 共享 Database
            let scheduler = Scheduler::new(Arc::clone(&database), app.handle().clone(), app_data_dir);
            tauri::async_runtime::spawn(async move {
                scheduler.run().await;
            });

            app.manage(database);
            app.manage(BrowserState::default());

            // 初始化 workspace 目录
            if let Err(e) = commands::workspace::init_workspace(app.handle()) {
                eprintln!("Warning: workspace init failed: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 数据库 CRUD
            commands::database::create_task,
            commands::database::list_tasks,
            commands::database::update_task,
            commands::database::delete_task,
            commands::database::create_message,
            commands::database::get_messages,
            commands::database::get_plan_logs,
            commands::database::clear_messages,
            // 行情数据
            commands::market_data::cmd_fetch_stock_quote,
            commands::market_data::cmd_search_stocks,
            commands::market_data::cmd_fetch_batch_quotes,
            commands::market_data::cmd_fetch_limit_stocks,
            // 提醒规则
            commands::alert::create_alert_rule,
            commands::alert::list_active_alerts,
            commands::alert::deactivate_alert,
            // 自选股
            commands::watchlist::cmd_add_to_watchlist,
            commands::watchlist::cmd_remove_from_watchlist,
            commands::watchlist::cmd_get_watchlist,
            // Workspace
            commands::workspace::cmd_workspace_read,
            commands::workspace::cmd_workspace_write,
            commands::workspace::cmd_workspace_append,
            commands::workspace::cmd_workspace_list,
            commands::workspace::cmd_workspace_search,
            // 截图
            commands::capture::list_windows,
            commands::capture::capture_window,
            commands::capture::read_capture_base64,
            // 通用 HTTP 代理
            commands::http_proxy::cmd_http_request,
            // 内嵌浏览器
            commands::browser::cmd_browser_open,
            commands::browser::cmd_browser_navigate,
            commands::browser::cmd_browser_exec_js,
            commands::browser::cmd_browser_screenshot,
            commands::browser::cmd_browser_close,
            commands::browser::cmd_browser_resize,
            commands::browser::cmd_browser_get_info,
            // TDX 指标
            commands::indicator::cmd_validate_tdx_formula,
            commands::indicator::cmd_create_indicator,
            commands::indicator::cmd_list_indicators,
            commands::indicator::cmd_update_indicator,
            commands::indicator::cmd_delete_indicator,
            commands::indicator::cmd_evaluate_indicator,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
