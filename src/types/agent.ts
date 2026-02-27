import type { ChatMessage, ToolDefinition, ToolCall } from './ai';

export interface AgentLoopConfig {
  maxToolRounds: number;
  temperature: number;
}

export interface AgentInput {
  messages: ChatMessage[];
  systemPrompt: string;
  tools: ToolDefinition[];
  config?: Partial<AgentLoopConfig>;
}

export interface AgentCallbacks {
  onStreamChunk?: (content: string) => void;
  onToolStart?: (toolCall: ToolCall, args: Record<string, unknown>) => void;
  onToolEnd?: (toolCallId: string, result: string) => void;
  onError?: (error: string) => void;
}

export interface AgentOutput {
  content: string;
  messages: ChatMessage[];
  switchTo?: string | 'lobby';
}

export interface Skill {
  name: string;
  description: string;
  keywords: string[];
  tools: string[];
  prompt: string;
  always: boolean;
}
