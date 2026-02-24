export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContent[];
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface StreamChunk {
  type: 'text' | 'error' | 'done';
  content: string;
}

export interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  supportsVision: boolean;
}
