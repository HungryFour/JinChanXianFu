import { useCallback, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { createProvider } from '../services/ai/provider';
import type { ChatMessage } from '../types/ai';

const SYSTEM_PROMPT = `你是 金蟾，一个专业的 AI 炒股助手。你擅长：
- 分析 K 线图和技术指标
- 解读市场行情和个股走势
- 提供交易策略建议（但提醒用户自行决策）
- 理解用户的交易风格并给出个性化建议

注意：
- 始终使用中文回复
- 对于具体的买卖建议，提醒用户"投资有风险，入市需谨慎"
- 分析时引用具体数据和技术指标
- 如果用户发送截图，仔细分析图中的 K 线形态、成交量、MACD 等指标`;

export function useAI() {
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (userInput: string) => {
    const chatStore = useChatStore.getState();
    const { modelConfig } = useSettingsStore.getState();

    if (!modelConfig.apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    let taskId = chatStore.activeTaskId;

    if (!taskId) {
      const title =
        userInput.length > 20 ? userInput.slice(0, 20) + '...' : userInput;
      const task = await chatStore.createTask(title);
      taskId = task.id;
    }

    await chatStore.addMessage(taskId, 'user', userInput);

    const messages: ChatMessage[] = chatStore.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    messages.push({ role: 'user', content: userInput });

    const provider = createProvider(modelConfig);

    chatStore.setStreaming(true);
    chatStore.setStreamingContent('');

    let fullContent = '';

    try {
      const stream = provider.chat({
        messages,
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.7,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
          chatStore.appendStreamingContent(chunk.content);
        } else if (chunk.type === 'error') {
          throw new Error(chunk.content);
        }
      }

      if (fullContent) {
        await chatStore.addMessage(
          taskId,
          'assistant',
          fullContent,
          modelConfig.model,
        );
      }
    } finally {
      chatStore.setStreaming(false);
      chatStore.setStreamingContent('');
    }

    return fullContent;
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    useChatStore.getState().setStreaming(false);
  }, []);

  return { sendMessage, stopStreaming };
}
