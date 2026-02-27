import { useCallback, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { runAgentLoop } from '../services/agent/agent-loop';
import { buildContext, getActiveSkillNames } from '../services/agent/context-builder';
import { toolRegistry } from '../services/agent/tool-registry';
import { registerAllTools } from '../services/agent/tool-executors';
import { loadAndRegisterAllAdapters } from '../services/agent/adapter-loader';
import type { ChatMessage } from '../types/ai';

let toolsInitialized = false;

export function useAgent() {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!toolsInitialized) {
      registerAllTools();
      loadAndRegisterAllAdapters();
      toolsInitialized = true;
    }
  }, []);

  const sendMessage = useCallback(async (userInput: string) => {
    const chatStore = useChatStore.getState();
    const { modelConfig } = useSettingsStore.getState();

    if (!modelConfig.apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    // 大厅模式：使用 lobbyTaskId（不自动创建任务）
    let taskId = chatStore.activeTaskId;
    if (!taskId) {
      taskId = chatStore.lobbyTaskId;
      if (!taskId) throw new Error('大厅未初始化');
    }

    await chatStore.addMessage(taskId, 'user', userInput);

    const messages: ChatMessage[] = chatStore.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    messages.push({ role: 'user', content: userInput });

    chatStore.setStreaming(true);
    chatStore.setStreamingContent('');
    chatStore.clearToolExecutions();

    const abortController = new AbortController();
    abortRef.current = abortController;

    let finalContent = '';

    try {
      const systemPrompt = await buildContext(userInput);
      const activeSkills = getActiveSkillNames(userInput);
      const tools = activeSkills.length > 0
        ? toolRegistry.getDefinitionsForSkills(activeSkills)
        : toolRegistry.getAllDefinitions();

      const result = await runAgentLoop(
        { messages, systemPrompt, tools },
        {
          onStreamChunk: (content) => {
            chatStore.appendStreamingContent(content);
          },
          onToolStart: (toolCall, args) => {
            chatStore.addToolExecution({
              id: toolCall.id,
              name: toolCall.function.name,
              status: 'running',
              args,
            });
          },
          onToolEnd: (toolCallId, result) => {
            chatStore.updateToolExecution(toolCallId, {
              status: 'completed',
              result,
            });
          },
        },
        abortController.signal,
      );

      finalContent = result.content;

      if (finalContent) {
        await chatStore.addMessage(taskId, 'assistant', finalContent, modelConfig.model);
      }

      // 处理任务切换
      if (result.switchTo) {
        if (result.switchTo === 'lobby') {
          await chatStore.setActiveTask(null);
        } else {
          await chatStore.loadTasks();
          await chatStore.setActiveTask(result.switchTo);
        }
      }
    } finally {
      abortRef.current = null;
      chatStore.setStreaming(false);
      chatStore.setStreamingContent('');
    }

    return finalContent;
  }, []);

  const stopStreaming = useCallback(async () => {
    const chatStore = useChatStore.getState();
    const partialContent = chatStore.streamingContent;

    abortRef.current?.abort();
    abortRef.current = null;

    // 保存已有内容 + 取消标注
    let taskId = chatStore.activeTaskId || chatStore.lobbyTaskId;
    if (taskId && partialContent) {
      const cancelledContent = partialContent + '\n\n---\n*[修行者主动取消问道]*';
      await chatStore.addMessage(taskId, 'assistant', cancelledContent);
    } else if (taskId) {
      await chatStore.addMessage(taskId, 'assistant', '*[修行者主动取消问道]*');
    }

    chatStore.setStreaming(false);
    chatStore.setStreamingContent('');
    chatStore.clearToolExecutions();
  }, []);

  return { sendMessage, stopStreaming };
}
