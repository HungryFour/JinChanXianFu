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
  signal?: AbortSignal,
): Promise<AgentOutput> {
  const { modelConfig } = useSettingsStore.getState();

  if (!modelConfig.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  const config = { ...DEFAULT_CONFIG, ...input.config };
  const provider = createProvider(modelConfig);
  const messages = [...input.messages];

  let finalContent = '';
  let switchTo: string | undefined;

  for (let round = 0; round < config.maxToolRounds; round++) {
    if (signal?.aborted) break;

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
      if (signal?.aborted) break;
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

      let shouldBreak = false;

      for (const toolCall of pendingToolCalls) {
        if (signal?.aborted) { shouldBreak = true; break; }

        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch { /* ignore */ }

        callbacks?.onToolStart?.(toolCall, toolArgs);

        const result = await toolRegistry.executeTool(toolCall);

        callbacks?.onToolEnd?.(toolCall.id, result);

        // 检测 __switch_task__ 标记
        if (result.startsWith('__switch_task__:')) {
          const target = result.slice('__switch_task__:'.length);
          switchTo = target;
          shouldBreak = true;

          messages.push({
            role: 'tool',
            content: JSON.stringify({ success: true, action: 'switch_task', target }),
            tool_call_id: toolCall.id,
          });
          continue;
        }

        // 截图结果：提取图片，tool result 中去掉 base64 避免重复发送
        let toolResultContent = result;
        let screenshotUrl: string | null = null;
        try {
          const parsed = JSON.parse(result);
          if (parsed.image && typeof parsed.image === 'string' && parsed.image.startsWith('data:image/')) {
            screenshotUrl = parsed.image;
            toolResultContent = JSON.stringify({ success: true });
          }
        } catch { /* not JSON — keep as-is */ }

        messages.push({
          role: 'tool',
          content: toolResultContent,
          tool_call_id: toolCall.id,
        });

        // 注入 user message 携带图片（API 兼容性最好）
        if (screenshotUrl) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: '[系统] 浏览器页面截图：' },
              { type: 'image_url', image_url: { url: screenshotUrl } },
            ],
          });
        }
      }

      // 如果有任务切换，提前退出循环
      if (shouldBreak) {
        finalContent = roundContent;
        break;
      }

      continue;
    }

    finalContent = roundContent;
    break;
  }

  return { content: finalContent, messages, switchTo };
}
