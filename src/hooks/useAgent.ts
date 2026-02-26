import { useCallback, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { runAgentLoop } from '../services/agent/agent-loop';
import { buildContext, getActiveSkillNames } from '../services/agent/context-builder';
import { toolRegistry } from '../services/agent/tool-registry';
import { registerAllTools } from '../services/agent/tool-executors';
import type { ChatMessage } from '../types/ai';

let toolsInitialized = false;

export function useAgent() {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!toolsInitialized) {
      registerAllTools();
      toolsInitialized = true;
    }
  }, []);

  const sendMessage = useCallback(async (userInput: string) => {
    const chatStore = useChatStore.getState();
    const { modelConfig } = useSettingsStore.getState();

    if (!modelConfig.apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    let taskId = chatStore.activeTaskId;

    if (!taskId) {
      const title = userInput.length > 20 ? userInput.slice(0, 20) + '...' : userInput;
      const task = await chatStore.createTask(title);
      taskId = task.id;
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
      );

      finalContent = result.content;

      if (finalContent) {
        await chatStore.addMessage(taskId, 'assistant', finalContent, modelConfig.model);
      }
    } finally {
      chatStore.setStreaming(false);
      chatStore.setStreamingContent('');
    }

    return finalContent;
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    useChatStore.getState().setStreaming(false);
  }, []);

  return { sendMessage, stopStreaming };
}
