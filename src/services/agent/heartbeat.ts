import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { runAgentLoop } from './agent-loop';
import { buildContext } from './context-builder';
import { toolRegistry } from './tool-registry';
import type { ChatMessage } from '../../types/ai';

interface ScheduledTaskPayload {
  task_id: string;
  prompt: string;
  stock_symbols: string[];
}

interface AlertTriggeredPayload {
  alert_id: string;
  stock_symbol: string;
  alert_type: string;
  message: string;
}

interface IndicatorSignalPayload {
  indicator_id: string;
  indicator_name: string;
  symbol: string;
  signal_text: string;
  signal_value: number;
  task_id: string | null;
  date: string;
}

interface AgentPlanTriggerPayload {
  task_id: string;
  plan_description: string;
  step_results: Record<string, unknown>;
  action_config: {
    action_type: string;
    message?: string;
    analysis_prompt?: string;
  };
}

interface AgentPlanVisionPayload {
  task_id: string;
  plan_description: string;
  image_path: string;
  vision_config: {
    prompt?: string;
    trigger_condition?: string;
  };
  action_config: {
    action_type: string;
    message?: string;
    analysis_prompt?: string;
  };
}

async function handleScheduledTask(payload: ScheduledTaskPayload) {
  const { modelConfig } = useSettingsStore.getState();
  if (!modelConfig.apiKey) return;

  const chatStore = useChatStore.getState();
  const { task_id, prompt, stock_symbols } = payload;

  const userContent = stock_symbols.length > 0
    ? `${prompt}\n\n关注的股票代码: ${stock_symbols.join(', ')}`
    : prompt;

  await chatStore.addMessage(task_id, 'user', userContent, undefined, 'scheduled');

  const messages: ChatMessage[] = [{ role: 'user', content: userContent }];

  try {
    const systemPrompt = await buildContext(userContent);
    const tools = toolRegistry.getAllDefinitions();

    const result = await runAgentLoop(
      { messages, systemPrompt, tools },
    );

    if (result.content) {
      await chatStore.addMessage(task_id, 'assistant', result.content, modelConfig.model, 'scheduled');
    }
  } catch (error) {
    console.error('定时任务执行失败:', error);
  }
}

async function handleAlertTriggered(payload: AlertTriggeredPayload) {
  const { modelConfig } = useSettingsStore.getState();
  if (!modelConfig.apiKey) return;

  const chatStore = useChatStore.getState();

  const userContent = `提醒触发：${payload.stock_symbol} ${payload.alert_type} - ${payload.message}。请获取该股票最新行情并给出分析。`;

  const task = await chatStore.createTask(`提醒: ${payload.stock_symbol}`, 'monitor');

  const messages: ChatMessage[] = [{ role: 'user', content: userContent }];

  try {
    const systemPrompt = await buildContext(userContent);
    const tools = toolRegistry.getAllDefinitions();

    const result = await runAgentLoop(
      { messages, systemPrompt, tools },
    );

    if (result.content) {
      await chatStore.addMessage(task.id, 'assistant', result.content, modelConfig.model, 'alert');
    }
  } catch (error) {
    console.error('提醒处理失败:', error);
  }
}

async function handleAgentPlanTrigger(payload: AgentPlanTriggerPayload) {
  const { modelConfig } = useSettingsStore.getState();
  if (!modelConfig.apiKey) return;

  const chatStore = useChatStore.getState();
  const { task_id, plan_description, step_results, action_config } = payload;

  const actionType = action_config.action_type;
  const notifyMessage = action_config.message || plan_description;

  // 如果仅通知，写入消息即可
  if (actionType === 'notify') {
    // 从 step_results 中提取行情摘要
    const summary = formatStepResultsSummary(step_results);
    const content = `📊 **执行计划触发**\n\n${notifyMessage}\n\n${summary}`;
    await chatStore.addMessage(task_id, 'assistant', content, undefined, 'agent-plan');
    return;
  }

  // 需要 AI 分析（analyze / notify_and_analyze）
  const analysisPrompt = action_config.analysis_prompt || `${notifyMessage}，请分析走势和策略建议`;
  const summary = formatStepResultsSummary(step_results);

  const userContent = `[执行计划自动触发] ${analysisPrompt}\n\n最新行情数据:\n${summary}`;
  await chatStore.addMessage(task_id, 'user', userContent, undefined, 'agent-plan');

  const messages: ChatMessage[] = [{ role: 'user', content: userContent }];

  try {
    const systemPrompt = await buildContext(userContent);
    const tools = toolRegistry.getAllDefinitions();

    const result = await runAgentLoop(
      { messages, systemPrompt, tools },
    );

    if (result.content) {
      await chatStore.addMessage(task_id, 'assistant', result.content, modelConfig.model, 'agent-plan');
    }
  } catch (error) {
    console.error('Agent Plan AI 分析失败:', error);
    await chatStore.addMessage(
      task_id,
      'assistant',
      `⚠️ 执行计划触发但 AI 分析失败: ${String(error)}`,
      undefined,
      'agent-plan',
    );
  }
}

async function handleAgentPlanVision(payload: AgentPlanVisionPayload) {
  const { modelConfig } = useSettingsStore.getState();
  if (!modelConfig.apiKey || !modelConfig.supportsVision) {
    console.warn('Vision 分析跳过: API Key 未配置或模型不支持 Vision');
    return;
  }

  const chatStore = useChatStore.getState();
  const { task_id, plan_description, image_path, vision_config, action_config } = payload;

  try {
    // 1. 读取截图为 base64
    const base64DataUri = await invoke<string>('read_capture_base64', { path: image_path });

    // 2. 构建视觉分析提示
    const visionPrompt = vision_config.prompt || `分析这张截图，判断是否有值得关注的信息`;
    const triggerCondition = vision_config.trigger_condition || '出现值得关注的情况';

    const analysisRequest = `${visionPrompt}\n\n请以 JSON 格式回答: { "triggered": true/false, "reason": "触发/未触发的原因", "analysis": "详细分析内容" }\n\n触发条件: ${triggerCondition}`;

    // 3. 构建多模态消息
    const messages: ChatMessage[] = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: base64DataUri } },
        { type: 'text', text: analysisRequest },
      ],
    }];

    // 4. 调用 AI 分析
    const systemPrompt = `你是一个专业的图表视觉分析助手。你需要分析截图内容，判断是否满足用户设定的触发条件。\n\n当前监控计划: ${plan_description}`;
    const tools = toolRegistry.getAllDefinitions();

    const result = await runAgentLoop({ messages, systemPrompt, tools });

    if (!result.content) return;

    // 5. 解析 AI 返回的 JSON
    let triggered = false;
    let reason = '';
    let analysis = result.content;

    try {
      // 尝试从返回内容中提取 JSON
      const jsonMatch = result.content.match(/\{[\s\S]*"triggered"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        triggered = parsed.triggered === true;
        reason = parsed.reason || '';
        analysis = parsed.analysis || result.content;
      }
    } catch {
      // JSON 解析失败，按未触发处理
      console.warn('Vision 分析结果 JSON 解析失败，原始内容:', result.content);
    }

    if (triggered) {
      // 6. 触发：写截图 + 分析到对话
      const notifyMessage = action_config.message || plan_description;
      const content = `📷 **视觉监控触发**\n\n${notifyMessage}\n\n**触发原因:** ${reason}\n\n**详细分析:**\n${analysis}`;

      await chatStore.addMessage(
        task_id,
        'assistant',
        content,
        modelConfig.model,
        'agent-plan-vision',
        [image_path],
      );

      // 如果 action 要求进一步 AI 分析
      if (action_config.action_type === 'analyze' || action_config.action_type === 'notify_and_analyze') {
        const followUpPrompt = action_config.analysis_prompt || `基于视觉分析结果，给出详细的操作建议`;
        const followUpMessages: ChatMessage[] = [{
          role: 'user',
          content: `[视觉监控自动触发] ${followUpPrompt}\n\n视觉分析结果: ${analysis}`,
        }];

        const followUpResult = await runAgentLoop({
          messages: followUpMessages,
          systemPrompt: await buildContext(followUpPrompt),
          tools,
        });

        if (followUpResult.content) {
          await chatStore.addMessage(task_id, 'assistant', followUpResult.content, modelConfig.model, 'agent-plan-vision');
        }
      }
    } else {
      // 7. 未触发：仅记录 log，不打扰用户
      console.log(`[Vision] 未触发 (${plan_description}): ${reason}`);
    }
  } catch (error) {
    console.error('Vision 分析失败:', error);
    await chatStore.addMessage(
      task_id,
      'assistant',
      `⚠️ 视觉监控截图分析失败: ${String(error)}`,
      undefined,
      'agent-plan-vision',
    );
  }
}

async function handleIndicatorSignal(payload: IndicatorSignalPayload) {
  const chatStore = useChatStore.getState();
  const { indicator_name, symbol, signal_text, signal_value, task_id, date } = payload;

  const content = `📊 **指标信号触发**\n\n指标: ${indicator_name}\n股票: ${symbol}\n信号: ${signal_text}\n价位: ${signal_value.toFixed(2)}\n日期: ${date}`;

  if (task_id) {
    await chatStore.addMessage(task_id, 'assistant', content, undefined, 'indicator-signal');
  } else {
    // 无绑定 task，创建新 task
    const task = await chatStore.createTask(`指标信号: ${indicator_name} - ${symbol}`, 'monitor');
    await chatStore.addMessage(task.id, 'assistant', content, undefined, 'indicator-signal');
  }

  // 如有 API Key，调用 AI 分析
  const { modelConfig } = useSettingsStore.getState();
  if (!modelConfig.apiKey) return;

  const targetTaskId = task_id || chatStore.tasks[chatStore.tasks.length - 1]?.id;
  if (!targetTaskId) return;

  const userContent = `[指标信号自动触发] 指标 "${indicator_name}" 在股票 ${symbol} 上触发了 "${signal_text}" 信号（价位 ${signal_value.toFixed(2)}）。请获取该股票最新行情并给出分析建议。`;
  await chatStore.addMessage(targetTaskId, 'user', userContent, undefined, 'indicator-signal');

  const messages: ChatMessage[] = [{ role: 'user', content: userContent }];

  try {
    const systemPrompt = await buildContext(userContent);
    const tools = toolRegistry.getAllDefinitions();
    const result = await runAgentLoop({ messages, systemPrompt, tools });

    if (result.content) {
      await chatStore.addMessage(targetTaskId, 'assistant', result.content, modelConfig.model, 'indicator-signal');
    }
  } catch (error) {
    console.error('指标信号 AI 分析失败:', error);
  }
}

function formatStepResultsSummary(stepResults: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [, result] of Object.entries(stepResults)) {
    if (Array.isArray(result)) {
      for (const quote of result) {
        if (quote && typeof quote === 'object' && 'symbol' in quote) {
          const q = quote as Record<string, unknown>;
          lines.push(
            `${q.name || q.symbol} (${q.symbol}): ¥${q.price} ${Number(q.change_percent) >= 0 ? '+' : ''}${q.change_percent}%`,
          );
        }
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : '（无行情数据）';
}

let unlisteners: UnlistenFn[] = [];

export async function startHeartbeat() {
  const unsub1 = await listen<ScheduledTaskPayload>('scheduled-task-trigger', (event) => {
    handleScheduledTask(event.payload);
  });

  const unsub2 = await listen<AlertTriggeredPayload>('alert-triggered', (event) => {
    handleAlertTriggered(event.payload);
  });

  const unsub3 = await listen<AgentPlanTriggerPayload>('agent-plan-trigger', (event) => {
    handleAgentPlanTrigger(event.payload);
  });

  const unsub4 = await listen<AgentPlanVisionPayload>('agent-plan-vision', (event) => {
    handleAgentPlanVision(event.payload);
  });

  const unsub5 = await listen<IndicatorSignalPayload>('indicator-signal-triggered', (event) => {
    handleIndicatorSignal(event.payload);
  });

  unlisteners = [unsub1, unsub2, unsub3, unsub4, unsub5];
}

export function stopHeartbeat() {
  for (const fn of unlisteners) {
    fn();
  }
  unlisteners = [];
}
