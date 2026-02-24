mod commands;
mod db;

use db::Database;
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

            let database = Database::new(app_data_dir).expect("Failed to initialize database");
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::database::create_task,
            commands::database::list_tasks,
            commands::database::update_task,
            commands::database::delete_task,
            commands::database::create_message,
            commands::database::get_messages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
