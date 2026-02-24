use rusqlite::Connection;

pub fn run(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS task (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'manual',
            status TEXT NOT NULL DEFAULT 'active',
            stock_symbols TEXT,
            tags TEXT,
            schedule_config TEXT,
            monitor_config TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS message (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            image_paths TEXT,
            model_used TEXT,
            trigger_source TEXT DEFAULT 'manual',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_message_task
            ON message(task_id, created_at);

        CREATE TABLE IF NOT EXISTS knowledge (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            stock_symbols TEXT,
            source_task_id TEXT,
            confidence REAL DEFAULT 1.0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_profile (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            symbol TEXT PRIMARY KEY,
            name TEXT,
            exchange TEXT,
            added_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS alert_rule (
            id TEXT PRIMARY KEY,
            task_id TEXT REFERENCES task(id) ON DELETE CASCADE,
            stock_symbol TEXT,
            alert_type TEXT NOT NULL,
            condition_json TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            last_triggered TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS capture_session (
            id TEXT PRIMARY KEY,
            task_id TEXT REFERENCES task(id) ON DELETE CASCADE,
            window_title TEXT NOT NULL,
            window_app TEXT,
            interval_sec REAL DEFAULT 5.0,
            started_at TEXT NOT NULL,
            ended_at TEXT
        );

        CREATE TABLE IF NOT EXISTS schedule_log (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
            executed_at TEXT NOT NULL,
            result_summary TEXT,
            status TEXT NOT NULL DEFAULT 'success'
        );
        ",
    )?;

    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, content, content=knowledge, content_rowid=rowid);"
    ).ok();

    Ok(())
}
