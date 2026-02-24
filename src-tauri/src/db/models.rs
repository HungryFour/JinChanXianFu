use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub task_type: String,
    pub status: String,
    pub stock_symbols: Option<String>,
    pub tags: Option<String>,
    pub schedule_config: Option<String>,
    pub monitor_config: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub task_id: String,
    pub role: String,
    pub content: String,
    pub image_paths: Option<String>,
    pub model_used: Option<String>,
    pub trigger_source: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateTaskRequest {
    pub title: String,
    pub task_type: Option<String>,
    pub stock_symbols: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub status: Option<String>,
    pub stock_symbols: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub schedule_config: Option<String>,
    pub monitor_config: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateMessageRequest {
    pub task_id: String,
    pub role: String,
    pub content: String,
    pub image_paths: Option<Vec<String>>,
    pub model_used: Option<String>,
    pub trigger_source: Option<String>,
}
