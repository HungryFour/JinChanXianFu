export type TaskType = 'manual' | 'scheduled' | 'monitor' | 'agent' | 'lobby';
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
  agent_plan: string | null;
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

// ── Agent Plan Types ──

export interface PlanCondition {
  field: 'price' | 'change_percent' | 'volume_ratio';
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  symbol: string;
}

export interface PlanStepFetchData {
  id: string;
  type: 'fetch_data';
  config: { symbols: string[] };
}

export interface PlanStepConditionCheck {
  id: string;
  type: 'condition_check';
  config: {
    conditions: PlanCondition[];
    logic: 'any' | 'all';
  };
}

export interface PlanStepAction {
  id: string;
  type: 'action';
  config: {
    action_type: 'notify' | 'analyze' | 'notify_and_analyze' | 'save_memory';
    message?: string;
    analysis_prompt?: string;
  };
}

export interface PlanStepCaptureScreen {
  id: string;
  type: 'capture_screen';
  config: { window_title: string };
}

export interface PlanStepVisionAnalyze {
  id: string;
  type: 'vision_analyze';
  config: {
    prompt: string;
    trigger_condition?: string;
  };
}

export type PlanStep =
  | PlanStepFetchData
  | PlanStepConditionCheck
  | PlanStepAction
  | PlanStepCaptureScreen
  | PlanStepVisionAnalyze;

export interface PlanSchedule {
  type: 'interval' | 'daily' | 'once';
  interval_minutes?: number;
  trigger_time?: string;
  market_hours_only?: boolean;
}

export interface ExecutionState {
  last_executed_at: string | null;
  total_executions: number;
  total_triggers: number;
  consecutive_failures: number;
}

export interface AgentPlan {
  version: number;
  description: string;
  stock_symbols: string[];
  enabled: boolean;
  steps: PlanStep[];
  schedule: PlanSchedule;
  execution_state: ExecutionState;
}

export interface PlanLogEntry {
  id: string;
  task_id: string;
  executed_at: string;
  status: string;
  step_results: string | null;
}
