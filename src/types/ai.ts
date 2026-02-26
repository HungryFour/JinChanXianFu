export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface StreamChunk {
  type: 'text' | 'error' | 'done' | 'tool_call_delta' | 'tool_call_complete';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  supportsVision: boolean;
}

// ── Tool Calling 类型 ──

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

export interface ToolExecution {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
}
