import { createProvider } from '../ai/provider';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ToolCall } from '../../types/ai';
import type { AgentInput, AgentCallbacks, AgentOutput, AgentLoopConfig } from '../../types/agent';
import { toolRegistry } from './tool-registry';

const DEFAULT_CONFIG: AgentLoopConfig = {
  maxToolRounds: 10,
  temperature: 0.7,
};

export async function runAgentLoop(
  input: AgentInput,
  callbacks?: AgentCallbacks,
): Promise<AgentOutput> {
  const { modelConfig } = useSettingsStore.getState();

  if (!modelConfig.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  const config = { ...DEFAULT_CONFIG, ...input.config };
  const provider = createProvider(modelConfig);
  const messages = [...input.messages];

  let finalContent = '';

  for (let round = 0; round < config.maxToolRounds; round++) {
    let roundContent = '';
    let pendingToolCalls: ToolCall[] | null = null;

    const stream = provider.chat({
      messages,
      systemPrompt: input.systemPrompt,
      temperature: config.temperature,
      tools: input.tools,
      tool_choice: 'auto',
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        roundContent += chunk.content;
        callbacks?.onStreamChunk?.(chunk.content);
      } else if (chunk.type === 'tool_call_complete' && chunk.toolCalls) {
        pendingToolCalls = chunk.toolCalls;
      } else if (chunk.type === 'error') {
        callbacks?.onError?.(chunk.content);
        throw new Error(chunk.content);
      }
    }

    if (pendingToolCalls && pendingToolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: roundContent || null,
        tool_calls: pendingToolCalls,
      });

      for (const toolCall of pendingToolCalls) {
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch { /* ignore */ }

        callbacks?.onToolStart?.(toolCall, toolArgs);

        const result = await toolRegistry.executeTool(toolCall);

        callbacks?.onToolEnd?.(toolCall.id, result);

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });
      }

      continue;
    }

    finalContent = roundContent;
    break;
  }

  return { content: finalContent, messages };
}
