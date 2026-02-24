-- StockSage Database Schema
-- SQLite with WAL mode

-- 对话
CREATE TABLE conversation (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    summary TEXT
);

-- 消息
CREATE TABLE message (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    role TEXT NOT NULL,        -- user / assistant / system
    content TEXT NOT NULL,
    image_paths TEXT,          -- JSON array
    model_used TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_message_conversation ON message(conversation_id, created_at);

-- 知识库
CREATE TABLE knowledge (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,    -- strategy / opinion / preference / lesson
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    stock_symbols TEXT,        -- JSON array
    source_conversation_id TEXT,
    confidence REAL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 知识全文搜索
CREATE VIRTUAL TABLE knowledge_fts USING fts5(title, content);

-- 用户画像
CREATE TABLE user_profile (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 自选股
CREATE TABLE watchlist (
    symbol TEXT PRIMARY KEY,
    name TEXT,
    exchange TEXT,
    added_at TEXT NOT NULL
);

-- 提醒规则
CREATE TABLE alert_rule (
    id TEXT PRIMARY KEY,
    stock_symbol TEXT,
    alert_type TEXT NOT NULL,
    condition_json TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_triggered TEXT,
    created_at TEXT NOT NULL
);

-- 截图会话
CREATE TABLE capture_session (
    id TEXT PRIMARY KEY,
    window_title TEXT NOT NULL,
    window_app TEXT,
    interval_sec REAL DEFAULT 5.0,
    started_at TEXT NOT NULL,
    ended_at TEXT
);
