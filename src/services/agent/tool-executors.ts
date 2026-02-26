import { invoke } from '@tauri-apps/api/core';
import { toolRegistry } from './tool-registry';
import { useChatStore } from '../../stores/chatStore';
import type { ToolDefinition } from '../../types/ai';
import type { AgentPlan } from '../../types/chat';

function def(name: string, description: string, parameters: Record<string, unknown>): ToolDefinition {
  return { type: 'function', function: { name, description, parameters } };
}

export function registerAllTools() {
  // ── 行情查询 (skill: market-query) ──

  toolRegistry.register(
    'fetch_stock_quote',
    def('fetch_stock_quote', '获取单只股票的实时行情数据，包括价格、涨跌幅、成交量等', {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '股票代码，如 600519、000001、300750' },
      },
      required: ['symbol'],
    }),
    async (args) => {
      const quote = await invoke('cmd_fetch_stock_quote', { symbol: args.symbol as string });
      return JSON.stringify(quote);
    },
    ['market-query'],
  );

  toolRegistry.register(
    'search_stocks',
    def('search_stocks', '根据关键词搜索股票，支持名称或代码模糊搜索，返回匹配的A股列表', {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词，如"茅台"、"宁德"、"600"' },
      },
      required: ['keyword'],
    }),
    async (args) => {
      const results = await invoke('cmd_search_stocks', { keyword: args.keyword as string });
      return JSON.stringify(results);
    },
    ['market-query'],
  );

  toolRegistry.register(
    'fetch_batch_quotes',
    def('fetch_batch_quotes', '批量获取多只股票的实时行情数据', {
      type: 'object',
      properties: {
        symbols: { type: 'array', items: { type: 'string' }, description: '股票代码数组，如 ["600519", "000001"]' },
      },
      required: ['symbols'],
    }),
    async (args) => {
      const quotes = await invoke('cmd_fetch_batch_quotes', { symbols: args.symbols as string[] });
      return JSON.stringify(quotes);
    },
    ['market-query'],
  );

  // ── 自选股管理 (skill: watchlist) ──

  toolRegistry.register(
    'add_to_watchlist',
    def('add_to_watchlist', '将股票加入自选股列表', {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '股票代码' },
        name: { type: 'string', description: '股票名称' },
      },
      required: ['symbol', 'name'],
    }),
    async (args) => {
      const item = await invoke('cmd_add_to_watchlist', {
        symbol: args.symbol as string,
        name: (args.name as string) || null,
      });
      return JSON.stringify(item);
    },
    ['watchlist'],
  );

  toolRegistry.register(
    'remove_from_watchlist',
    def('remove_from_watchlist', '将股票从自选股列表移除', {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '股票代码' },
      },
      required: ['symbol'],
    }),
    async (args) => {
      await invoke('cmd_remove_from_watchlist', { symbol: args.symbol as string });
      return JSON.stringify({ success: true, symbol: args.symbol });
    },
    ['watchlist'],
  );

  toolRegistry.register(
    'get_watchlist',
    def('get_watchlist', '获取当前自选股列表', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const list = await invoke('cmd_get_watchlist');
      return JSON.stringify(list);
    },
    ['watchlist'],
  );

  // ── 提醒管理 (skill: alert-manager) ──

  toolRegistry.register(
    'create_alert',
    def('create_alert', '创建价格提醒规则，当股票价格达到指定条件时触发通知', {
      type: 'object',
      properties: {
        stock_symbol: { type: 'string', description: '股票代码' },
        alert_type: {
          type: 'string',
          enum: ['price_above', 'price_below', 'change_above', 'change_below', 'volume_ratio'],
          description: '提醒类型：price_above=价格高于, price_below=价格低于, change_above=涨幅超过, change_below=跌幅超过, volume_ratio=量比异常',
        },
        threshold: { type: 'number', description: '触发阈值' },
        message: { type: 'string', description: '提醒消息内容' },
      },
      required: ['stock_symbol', 'alert_type', 'threshold'],
    }),
    async (args) => {
      const taskId = useChatStore.getState().activeTaskId;
      const conditionJson = JSON.stringify({
        type: args.alert_type,
        threshold: args.threshold,
        message: args.message || '',
      });
      const alert = await invoke('create_alert_rule', {
        taskId,
        stockSymbol: args.stock_symbol as string,
        alertType: args.alert_type as string,
        conditionJson,
      });
      return JSON.stringify(alert);
    },
    ['alert-manager'],
  );

  toolRegistry.register(
    'list_alerts',
    def('list_alerts', '列出所有活跃的提醒规则', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const alerts = await invoke('list_active_alerts');
      return JSON.stringify(alerts);
    },
    ['alert-manager'],
  );

  toolRegistry.register(
    'cancel_alert',
    def('cancel_alert', '取消/停用一个提醒规则', {
      type: 'object',
      properties: {
        alert_id: { type: 'string', description: '要取消的提醒规则ID' },
      },
      required: ['alert_id'],
    }),
    async (args) => {
      await invoke('deactivate_alert', { id: args.alert_id as string });
      return JSON.stringify({ success: true, alert_id: args.alert_id });
    },
    ['alert-manager'],
  );

  // ── 定时任务 (skill: scheduled-task) ──

  toolRegistry.register(
    'create_scheduled_task',
    def('create_scheduled_task', '创建定时分析任务，在指定时间自动执行AI分析', {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题' },
        stock_symbols: { type: 'array', items: { type: 'string' }, description: '关注的股票代码列表' },
        schedule_type: { type: 'string', enum: ['once', 'daily', 'weekly'], description: '调度类型' },
        trigger_time: { type: 'string', description: '触发时间，格式 HH:MM' },
        duration_days: { type: 'number', description: '持续天数（daily/weekly 有效）' },
        analysis_prompt: { type: 'string', description: '分析提示词' },
      },
      required: ['title', 'stock_symbols', 'schedule_type', 'trigger_time', 'analysis_prompt'],
    }),
    async (args) => {
      const scheduleConfig = JSON.stringify({
        schedule_type: args.schedule_type,
        trigger_time: args.trigger_time,
        duration_days: args.duration_days,
        analysis_prompt: args.analysis_prompt,
      });

      const task = await invoke('create_task', {
        request: {
          title: args.title as string,
          task_type: 'scheduled',
          stock_symbols: args.stock_symbols as string[],
        },
      });

      await invoke('update_task', {
        id: (task as { id: string }).id,
        request: { schedule_config: scheduleConfig },
      });

      return JSON.stringify({
        task_id: (task as { id: string }).id,
        title: args.title,
        schedule_type: args.schedule_type,
        trigger_time: args.trigger_time,
        status: 'created',
      });
    },
    ['scheduled-task'],
  );

  toolRegistry.register(
    'list_scheduled_tasks',
    def('list_scheduled_tasks', '列出所有定时分析任务', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const tasks = await invoke('list_tasks');
      const scheduled = (tasks as Array<{ task_type: string }>).filter((t) => t.task_type === 'scheduled');
      return JSON.stringify(scheduled);
    },
    ['scheduled-task'],
  );

  toolRegistry.register(
    'cancel_scheduled_task',
    def('cancel_scheduled_task', '取消/暂停一个定时任务', {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '要取消的任务ID' },
      },
      required: ['task_id'],
    }),
    async (args) => {
      await invoke('update_task', {
        id: args.task_id as string,
        request: { status: 'paused' },
      });
      return JSON.stringify({ success: true, task_id: args.task_id });
    },
    ['scheduled-task'],
  );

  // ── 涨跌停 (skill: limit-stocks) ──

  toolRegistry.register(
    'fetch_limit_up_stocks',
    def('fetch_limit_up_stocks', '获取今日A股涨停股票列表', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const stocks = await invoke('cmd_fetch_limit_stocks', { limitType: 'up' });
      return JSON.stringify(stocks);
    },
    ['limit-stocks'],
  );

  toolRegistry.register(
    'fetch_limit_down_stocks',
    def('fetch_limit_down_stocks', '获取今日A股跌停股票列表', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const stocks = await invoke('cmd_fetch_limit_stocks', { limitType: 'down' });
      return JSON.stringify(stocks);
    },
    ['limit-stocks'],
  );

  // ── 记忆工具 (skill: memory) ──

  toolRegistry.register(
    'save_memory',
    def('save_memory', '保存一条交易记忆或重要信息到记忆库', {
      type: 'object',
      properties: {
        content: { type: 'string', description: '要保存的记忆内容' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签，如 ["交易", "茅台"]' },
      },
      required: ['content'],
    }),
    async (args) => {
      const tags = (args.tags as string[]) || [];
      const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
      const line = `- ${new Date().toISOString().slice(0, 10)} ${args.content}${tagStr}\n`;
      await invoke('cmd_workspace_append', { relativePath: 'MEMORY.md', content: line });
      return JSON.stringify({ success: true, saved: args.content });
    },
    ['memory'],
  );

  toolRegistry.register(
    'search_memory',
    def('search_memory', '搜索交易记忆库中的相关记录', {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
      },
      required: ['query'],
    }),
    async (args) => {
      const results = await invoke('cmd_workspace_search', {
        relativePath: 'MEMORY.md',
        query: args.query as string,
      });
      return JSON.stringify(results);
    },
    ['memory'],
  );

  toolRegistry.register(
    'update_user_profile',
    def('update_user_profile', '更新用户交易画像信息（偏好、风格、关注领域等）', {
      type: 'object',
      properties: {
        section: { type: 'string', description: '画像区域：investment_style / preferences / focus_sectors / risk_tolerance' },
        content: { type: 'string', description: '更新内容' },
      },
      required: ['section', 'content'],
    }),
    async (args) => {
      const current = await invoke<string>('cmd_workspace_read', { relativePath: 'USER.md' });
      const section = args.section as string;
      const content = args.content as string;
      const sectionHeader = `## ${section}`;

      let updated: string;
      if (current.includes(sectionHeader)) {
        const regex = new RegExp(`(## ${section}\\n)([\\s\\S]*?)(?=\\n## |$)`);
        updated = current.replace(regex, `$1${content}\n`);
      } else {
        updated = current.trimEnd() + `\n\n${sectionHeader}\n${content}\n`;
      }

      await invoke('cmd_workspace_write', { relativePath: 'USER.md', content: updated });
      return JSON.stringify({ success: true, section, content });
    },
    ['memory'],
  );

  // ── 窗口截图 (skill: agent-plan) ──

  toolRegistry.register(
    'list_available_windows',
    def('list_available_windows', '列出当前桌面上所有可见窗口的标题和应用名称，用于确认截图目标窗口', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const windows = await invoke('list_windows');
      return JSON.stringify(windows);
    },
    ['agent-plan'],
  );

  // ── Agent Plan 工具 (skill: agent-plan) ──

  toolRegistry.register(
    'set_agent_plan',
    def('set_agent_plan', '为当前任务创建或替换执行计划（Agent Plan），将任务变为自主代理实例。适用于需要持续监控、定时获取数据、条件触发通知/分析的场景。', {
      type: 'object',
      properties: {
        description: { type: 'string', description: '计划描述，如"持续监控招商银行，每5分钟获取数据，价格大于40提醒我"' },
        stock_symbols: { type: 'array', items: { type: 'string' }, description: '关注的股票代码列表' },
        steps: {
          type: 'array',
          description: '执行步骤数组。数据型管道: fetch_data → condition_check(可选) → action；视觉型管道: capture_screen → vision_analyze → action',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '步骤ID，如 s1, s2, s3' },
              type: { type: 'string', enum: ['fetch_data', 'condition_check', 'action', 'capture_screen', 'vision_analyze'], description: '步骤类型' },
              config: { type: 'object', description: '步骤配置' },
            },
            required: ['id', 'type', 'config'],
          },
        },
        schedule: {
          type: 'object',
          description: '调度配置',
          properties: {
            type: { type: 'string', enum: ['interval', 'daily', 'once'], description: '调度类型' },
            interval_minutes: { type: 'number', description: 'interval 类型的间隔分钟数' },
            trigger_time: { type: 'string', description: 'daily 类型的触发时间 HH:MM' },
            market_hours_only: { type: 'boolean', description: '是否仅交易时间执行，默认 true' },
          },
          required: ['type'],
        },
      },
      required: ['description', 'stock_symbols', 'steps', 'schedule'],
    }),
    async (args) => {
      const taskId = useChatStore.getState().activeTaskId;
      if (!taskId) return JSON.stringify({ error: '没有活跃的任务' });

      const plan: AgentPlan = {
        version: 1,
        description: args.description as string,
        stock_symbols: args.stock_symbols as string[],
        enabled: true,
        steps: args.steps as AgentPlan['steps'],
        schedule: args.schedule as AgentPlan['schedule'],
        execution_state: {
          last_executed_at: null,
          total_executions: 0,
          total_triggers: 0,
          consecutive_failures: 0,
        },
      };

      const planJson = JSON.stringify(plan);

      // 更新 task 的 agent_plan 和 type
      await invoke('update_task', {
        id: taskId,
        request: {
          agent_plan: planJson,
          stock_symbols: args.stock_symbols as string[],
        },
      });

      // 刷新 store
      await useChatStore.getState().loadTasks();

      return JSON.stringify({
        success: true,
        task_id: taskId,
        plan_description: plan.description,
        schedule: plan.schedule,
        steps_count: plan.steps.length,
      });
    },
    ['agent-plan'],
  );

  toolRegistry.register(
    'update_agent_plan',
    def('update_agent_plan', '修改当前任务的 Agent Plan 部分配置（如频率、阈值、消息等），无需重新创建整个计划', {
      type: 'object',
      properties: {
        updates: {
          type: 'object',
          description: '要更新的字段，支持: schedule.interval_minutes, schedule.market_hours_only, steps[].config 中的条件值/消息等。使用点号路径或直接覆盖子对象。',
          properties: {
            description: { type: 'string' },
            enabled: { type: 'boolean' },
            schedule: { type: 'object' },
            steps: { type: 'array' },
          },
        },
      },
      required: ['updates'],
    }),
    async (args) => {
      const taskId = useChatStore.getState().activeTaskId;
      if (!taskId) return JSON.stringify({ error: '没有活跃的任务' });

      const tasks = useChatStore.getState().tasks;
      const task = tasks.find((t) => t.id === taskId);
      if (!task?.agent_plan) return JSON.stringify({ error: '当前任务没有 Agent Plan' });

      const plan: AgentPlan = JSON.parse(task.agent_plan);
      const updates = args.updates as Record<string, unknown>;

      applyPlanUpdates(plan, updates);

      const planJson = JSON.stringify(plan);
      await invoke('update_task', {
        id: taskId,
        request: {
          agent_plan: planJson,
          stock_symbols: plan.stock_symbols,
        },
      });

      await useChatStore.getState().loadTasks();

      return JSON.stringify({
        success: true,
        task_id: taskId,
        updated_fields: Object.keys(updates),
        current_plan_summary: {
          description: plan.description,
          enabled: plan.enabled,
          schedule: plan.schedule,
        },
      });
    },
    ['agent-plan'],
  );

  toolRegistry.register(
    'get_agent_plan',
    def('get_agent_plan', '查询当前任务的 Agent Plan 状态和最近执行记录', {
      type: 'object',
      properties: {
        include_logs: { type: 'boolean', description: '是否包含最近执行记录，默认 true' },
        log_limit: { type: 'number', description: '返回的日志条数，默认 5' },
      },
    }),
    async (args) => {
      const taskId = useChatStore.getState().activeTaskId;
      if (!taskId) return JSON.stringify({ error: '没有活跃的任务' });

      const tasks = useChatStore.getState().tasks;
      const task = tasks.find((t) => t.id === taskId);
      if (!task?.agent_plan) return JSON.stringify({ error: '当前任务没有 Agent Plan' });

      const plan: AgentPlan = JSON.parse(task.agent_plan);
      const includeLogs = args.include_logs !== false;
      const result: Record<string, unknown> = { plan };

      if (includeLogs) {
        const logLimit = (args.log_limit as number) || 5;
        const logs = await invoke('get_plan_logs', { taskId, limit: logLimit });
        result.recent_logs = logs;
      }

      return JSON.stringify(result);
    },
    ['agent-plan'],
  );

  toolRegistry.register(
    'stop_agent_plan',
    def('stop_agent_plan', '停用当前任务的 Agent Plan（暂停执行），可通过 update_agent_plan 重新启用', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const taskId = useChatStore.getState().activeTaskId;
      if (!taskId) return JSON.stringify({ error: '没有活跃的任务' });

      const tasks = useChatStore.getState().tasks;
      const task = tasks.find((t) => t.id === taskId);
      if (!task?.agent_plan) return JSON.stringify({ error: '当前任务没有 Agent Plan' });

      const plan: AgentPlan = JSON.parse(task.agent_plan);
      plan.enabled = false;

      await invoke('update_task', {
        id: taskId,
        request: { agent_plan: JSON.stringify(plan) },
      });

      await useChatStore.getState().loadTasks();

      return JSON.stringify({ success: true, task_id: taskId, status: 'stopped' });
    },
    ['agent-plan'],
  );
}

// ── Agent Plan 辅助函数 ──

function applyPlanUpdates(plan: AgentPlan, updates: Record<string, unknown>) {
  if (updates.description !== undefined) {
    plan.description = updates.description as string;
  }
  if (updates.enabled !== undefined) {
    plan.enabled = updates.enabled as boolean;
  }
  if (updates.stock_symbols !== undefined) {
    plan.stock_symbols = updates.stock_symbols as string[];
  }
  if (updates.schedule) {
    Object.assign(plan.schedule, updates.schedule);
  }
  if (updates.steps) {
    plan.steps = updates.steps as AgentPlan['steps'];
  }
}
