export type TaskType = 'manual' | 'scheduled' | 'monitor';
export type TaskStatus = 'active' | 'paused' | 'completed';

export interface Task {
  id: string;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  stock_symbols: string | null;
  tags: string | null;
  schedule_config: string | null;
  monitor_config: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Message {
  id: string;
  task_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  image_paths: string | null;
  model_used: string | null;
  trigger_source: string | null;
  created_at: string;
}
