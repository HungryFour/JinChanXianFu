import { invoke } from '@tauri-apps/api/core';
import { toolRegistry } from './tool-registry';
import { useChatStore } from '../../stores/chatStore';
import { useBrowserStore } from '../../stores/browserStore';
import { setSecret, deleteSecret, listSecretKeys } from './secret-store';
import {
  registerAdapter,
  unregisterAdapter,
  getRegisteredAdapters,
  type AdapterConfig,
} from './adapter-loader';
import { invalidateSkillsCache } from './context-builder';
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

  // ── 自升级：API 适配器管理 (skill: self-upgrade) ──

  toolRegistry.register(
    'manage_api_secret',
    def('manage_api_secret', '管理 API 密钥（设置/删除/列出）。设置密钥后适配器可引用。list 操作只返回 key 名称，不泄露值', {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['set', 'delete', 'list'], description: '操作类型' },
        key: { type: 'string', description: 'set/delete 时的密钥名称，如 tushare_token' },
        value: { type: 'string', description: 'set 时的密钥值' },
      },
      required: ['action'],
    }),
    async (args) => {
      const action = args.action as string;

      if (action === 'list') {
        const keys = await listSecretKeys();
        return JSON.stringify({ keys });
      }

      if (action === 'set') {
        if (!args.key || !args.value) {
          return JSON.stringify({ error: 'set 操作需要 key 和 value 参数' });
        }
        await setSecret(args.key as string, args.value as string);
        return JSON.stringify({ success: true, action: 'set', key: args.key });
      }

      if (action === 'delete') {
        if (!args.key) {
          return JSON.stringify({ error: 'delete 操作需要 key 参数' });
        }
        await deleteSecret(args.key as string);
        return JSON.stringify({ success: true, action: 'delete', key: args.key });
      }

      return JSON.stringify({ error: `未知操作: ${action}` });
    },
    ['self-upgrade'],
  );

  toolRegistry.register(
    'create_api_adapter',
    def('create_api_adapter', '创建 API 适配器：写入声明式 JSON 配置 + 自动生成关联技能文件 + 立即注册工具。适用于对接第三方数据源 API', {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: '完整的适配器配置 JSON，包含 adapter（id/name/version/base_url）和 tools 数组（每个 tool 含 name/description/skill/parameters/request/response/secrets_needed）',
        },
      },
      required: ['config'],
    }),
    async (args) => {
      try {
        const config = args.config as AdapterConfig;

        // 1. 验证基本格式
        if (!config.adapter?.id || !config.adapter?.name || !config.tools?.length) {
          return JSON.stringify({ error: '适配器配置缺少必要字段: adapter.id, adapter.name, tools' });
        }

        const adapterId = config.adapter.id;

        // 2. 写入适配器 JSON
        await invoke('cmd_workspace_write', {
          relativePath: `adapters/${adapterId}.json`,
          content: JSON.stringify(config, null, 2),
        });

        // 3. 自动生成关联的 skill 文件
        const toolNames = config.tools.map((t) => t.name);
        const allKeywords = new Set<string>();
        for (const tool of config.tools) {
          // 从工具描述中提取关键词
          allKeywords.add(adapterId);
          allKeywords.add(config.adapter.name);
          if (tool.skill) allKeywords.add(tool.skill);
        }

        const skillContent = `---
name: ${adapterId}
description: ${config.adapter.name}
keywords: [${Array.from(allKeywords).join(', ')}]
tools: [${toolNames.join(', ')}]
---
当用户提及${config.adapter.name}相关的查询时，使用以下工具获取数据：
${config.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}
`;

        await invoke('cmd_workspace_write', {
          relativePath: `skills/on-demand/${adapterId}.md`,
          content: skillContent,
        });

        // 4. 立即注册工具
        await registerAdapter(adapterId);

        // 5. 清除 skills 缓存使新技能生效
        invalidateSkillsCache();

        return JSON.stringify({
          success: true,
          adapter_id: adapterId,
          adapter_name: config.adapter.name,
          tools_registered: toolNames,
          skill_created: `skills/on-demand/${adapterId}.md`,
        });
      } catch (err) {
        return JSON.stringify({ error: `创建适配器失败: ${String(err)}` });
      }
    },
    ['self-upgrade'],
  );

  toolRegistry.register(
    'delete_api_adapter',
    def('delete_api_adapter', '删除已安装的 API 适配器（移除配置文件 + 反注册工具 + 删除关联技能）', {
      type: 'object',
      properties: {
        adapter_id: { type: 'string', description: '要删除的适配器 ID' },
      },
      required: ['adapter_id'],
    }),
    async (args) => {
      const adapterId = args.adapter_id as string;

      try {
        // 1. 反注册工具
        unregisterAdapter(adapterId);

        // 2. 删除适配器 JSON（写空内容 → 用覆盖方式清理）
        await invoke('cmd_workspace_write', {
          relativePath: `adapters/${adapterId}.json`,
          content: '',
        });

        // 3. 删除关联的 skill 文件
        await invoke('cmd_workspace_write', {
          relativePath: `skills/on-demand/${adapterId}.md`,
          content: '',
        });

        // 4. 清除 skills 缓存
        invalidateSkillsCache();

        return JSON.stringify({ success: true, adapter_id: adapterId, status: 'deleted' });
      } catch (err) {
        return JSON.stringify({ error: `删除适配器失败: ${String(err)}` });
      }
    },
    ['self-upgrade'],
  );

  toolRegistry.register(
    'list_api_adapters',
    def('list_api_adapters', '列出所有已安装的 API 适配器及其注册的工具', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const registered = getRegisteredAdapters();

      // 同时读取磁盘上的适配器文件列表
      let diskAdapters: string[] = [];
      try {
        const files = await invoke<string[]>('cmd_workspace_list', {
          relativePath: 'adapters',
        });
        diskAdapters = files
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace('.json', ''));
      } catch {
        // adapters 目录不存在
      }

      return JSON.stringify({
        registered_adapters: registered,
        disk_adapters: diskAdapters,
        total: diskAdapters.length,
      });
    },
    ['self-upgrade'],
  );

  toolRegistry.register(
    'test_api_adapter',
    def('test_api_adapter', '测试适配器中的某个工具是否能正常调用。传入工具名和测试参数，返回 API 调用结果', {
      type: 'object',
      properties: {
        tool_name: { type: 'string', description: '要测试的工具名，如 tushare_daily_kline' },
        test_args: { type: 'object', description: '测试用的参数对象' },
      },
      required: ['tool_name'],
    }),
    async (args) => {
      const toolName = args.tool_name as string;
      const testArgs = (args.test_args as Record<string, unknown>) || {};

      // 直接通过 toolRegistry 执行
      const toolCall = {
        id: `test_${Date.now()}`,
        type: 'function' as const,
        function: {
          name: toolName,
          arguments: JSON.stringify(testArgs),
        },
      };

      const result = await toolRegistry.executeTool(toolCall);

      try {
        const parsed = JSON.parse(result);
        if (parsed.error) {
          return JSON.stringify({ success: false, tool: toolName, error: parsed.error });
        }
        // 截断大响应用于展示
        const preview = result.length > 2000 ? result.slice(0, 2000) + '...(已截断)' : result;
        return JSON.stringify({ success: true, tool: toolName, preview });
      } catch {
        return JSON.stringify({ success: true, tool: toolName, raw: result.slice(0, 2000) });
      }
    },
    ['self-upgrade'],
  );

  // ── TDX 指标监控 (skill: tdx-indicator) ──

  toolRegistry.register(
    'validate_tdx_formula',
    def('validate_tdx_formula', '验证通达信（TDX）公式语法是否正确，返回输出变量、DRAWTEXT 数量和错误信息', {
      type: 'object',
      properties: {
        source: { type: 'string', description: '通达信公式源代码' },
      },
      required: ['source'],
    }),
    async (args) => {
      const result = await invoke('cmd_validate_tdx_formula', { source: args.source as string });
      return JSON.stringify(result);
    },
    ['tdx-indicator'],
  );

  toolRegistry.register(
    'add_tdx_indicator',
    def('add_tdx_indicator', '添加 TDX 指标监控：指定公式和股票代码，当 DRAWTEXT 信号在最新 K 线上触发时自动提醒', {
      type: 'object',
      properties: {
        name: { type: 'string', description: '指标名称，如 "BBI金叉"' },
        formula_source: { type: 'string', description: '通达信公式源代码（必须包含 DRAWTEXT）' },
        stock_symbols: { type: 'array', items: { type: 'string' }, description: '监控的股票代码列表' },
        check_interval_secs: { type: 'number', description: '检查间隔秒数，默认 60' },
        market_hours_only: { type: 'boolean', description: '是否仅交易时间检查，默认 true' },
      },
      required: ['name', 'formula_source', 'stock_symbols'],
    }),
    async (args) => {
      const taskId = useChatStore.getState().activeTaskId;
      const indicator = await invoke('cmd_create_indicator', {
        request: {
          name: args.name as string,
          formula_source: args.formula_source as string,
          stock_symbols: args.stock_symbols as string[],
          task_id: taskId || null,
          check_interval_secs: (args.check_interval_secs as number) || 60,
          market_hours_only: args.market_hours_only !== false,
        },
      });
      return JSON.stringify(indicator);
    },
    ['tdx-indicator'],
  );

  toolRegistry.register(
    'list_tdx_indicators',
    def('list_tdx_indicators', '列出所有 TDX 指标监控', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const list = await invoke('cmd_list_indicators');
      return JSON.stringify(list);
    },
    ['tdx-indicator'],
  );

  toolRegistry.register(
    'update_tdx_indicator',
    def('update_tdx_indicator', '更新 TDX 指标监控的配置（名称、公式、股票、启停等）', {
      type: 'object',
      properties: {
        id: { type: 'string', description: '指标 ID' },
        name: { type: 'string', description: '新名称' },
        formula_source: { type: 'string', description: '新公式' },
        stock_symbols: { type: 'array', items: { type: 'string' }, description: '新股票列表' },
        is_active: { type: 'boolean', description: '是否启用' },
        check_interval_secs: { type: 'number', description: '检查间隔秒数' },
        market_hours_only: { type: 'boolean', description: '是否仅交易时间检查' },
      },
      required: ['id'],
    }),
    async (args) => {
      const { id, ...rest } = args as Record<string, unknown>;
      const result = await invoke('cmd_update_indicator', { id: id as string, request: rest });
      return JSON.stringify(result);
    },
    ['tdx-indicator'],
  );

  toolRegistry.register(
    'delete_tdx_indicator',
    def('delete_tdx_indicator', '删除一个 TDX 指标监控', {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要删除的指标 ID' },
      },
      required: ['id'],
    }),
    async (args) => {
      const result = await invoke('cmd_delete_indicator', { id: args.id as string });
      return JSON.stringify(result);
    },
    ['tdx-indicator'],
  );

  toolRegistry.register(
    'evaluate_tdx_indicator',
    def('evaluate_tdx_indicator', '立即计算一次 TDX 指标，返回最新值和信号状态（用于调试和验证）', {
      type: 'object',
      properties: {
        id: { type: 'string', description: '指标 ID' },
      },
      required: ['id'],
    }),
    async (args) => {
      const result = await invoke('cmd_evaluate_indicator', { id: args.id as string });
      return JSON.stringify(result);
    },
    ['tdx-indicator'],
  );

  // ── 内嵌浏览器 (skill: web-browser) ──

  toolRegistry.register(
    'browser_open',
    def('browser_open', '打开内嵌浏览器并导航到指定 URL。浏览器打开后，用 browser_screenshot 查看页面内容', {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要打开的网页 URL，如 https://www.baidu.com' },
      },
      required: ['url'],
    }),
    async (args) => {
      let url = args.url as string;
      if (!url.startsWith('http')) url = 'https://' + url;
      const store = useBrowserStore.getState();
      await store.openBrowser(url, 0, 0, 100, 100);
      return JSON.stringify({ success: true, url });
    },
    ['web-browser'],
  );

  toolRegistry.register(
    'browser_navigate',
    def('browser_navigate', '在已打开的浏览器中导航到新 URL', {
      type: 'object',
      properties: {
        url: { type: 'string', description: '目标 URL' },
      },
      required: ['url'],
    }),
    async (args) => {
      let url = args.url as string;
      if (!url.startsWith('http')) url = 'https://' + url;
      await useBrowserStore.getState().navigate(url);
      return JSON.stringify({ success: true, url });
    },
    ['web-browser'],
  );

  toolRegistry.register(
    'browser_screenshot',
    def('browser_screenshot', '截取当前浏览器页面的截图。返回图片用于查看页面内容、确认操作结果', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const image = await useBrowserStore.getState().screenshot();
      return JSON.stringify({ success: true, image });
    },
    ['web-browser'],
  );

  toolRegistry.register(
    'browser_click',
    def('browser_click', '点击页面上指定坐标位置的元素。坐标来自截图中观察到的元素位置', {
      type: 'object',
      properties: {
        x: { type: 'number', description: '点击位置的 x 坐标（像素）' },
        y: { type: 'number', description: '点击位置的 y 坐标（像素）' },
      },
      required: ['x', 'y'],
    }),
    async (args) => {
      const x = args.x as number;
      const y = args.y as number;
      // 等待 __JC__ 初始化
      await useBrowserStore.getState().execJs(
        `(function(){ if(window.__JC__){ window.__JC__.clickAt(${x}, ${y}); } else { setTimeout(function(){ if(window.__JC__) window.__JC__.clickAt(${x}, ${y}); }, 100); } })()`
      );
      return JSON.stringify({ success: true, x, y });
    },
    ['web-browser'],
  );

  toolRegistry.register(
    'browser_type',
    def('browser_type', '在页面指定坐标位置的输入框中输入文本。先点击聚焦，再逐字输入', {
      type: 'object',
      properties: {
        x: { type: 'number', description: '输入框的 x 坐标（像素）' },
        y: { type: 'number', description: '输入框的 y 坐标（像素）' },
        text: { type: 'string', description: '要输入的文本内容' },
      },
      required: ['x', 'y', 'text'],
    }),
    async (args) => {
      const x = args.x as number;
      const y = args.y as number;
      const text = args.text as string;
      // 等待 __JC__ 初始化
      const safeText = JSON.stringify(text).replace(/'/g, "\\'");
      await useBrowserStore.getState().execJs(
        `(function(){ if(window.__JC__){ window.__JC__.typeAt(${x}, ${y}, ${safeText}); } else { setTimeout(function(){ if(window.__JC__) window.__JC__.typeAt(${x}, ${y}, ${safeText}); }, 100); } })()`
      );
      return JSON.stringify({ success: true, x, y, text });
    },
    ['web-browser'],
  );

  toolRegistry.register(
    'browser_scroll',
    def('browser_scroll', '滚动页面。方向支持 up/down/left/right', {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' },
        amount: { type: 'number', description: '滚动量（单位约 100px），默认 3' },
      },
      required: ['direction'],
    }),
    async (args) => {
      const direction = args.direction as string;
      const amount = (args.amount as number) || 3;
      await useBrowserStore.getState().execJs(
        `window.__JC__.scrollPage(${JSON.stringify(direction)}, ${amount})`,
      );
      return JSON.stringify({ success: true, direction, amount });
    },
    ['web-browser'],
  );

  toolRegistry.register(
    'browser_get_info',
    def('browser_get_info', '获取当前浏览器状态（是否打开、当前 URL）', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const info = await invoke('cmd_browser_get_info');
      return JSON.stringify(info);
    },
    ['web-browser'],
  );

  toolRegistry.register(
    'browser_close',
    def('browser_close', '关闭内嵌浏览器面板', {
      type: 'object',
      properties: {},
    }),
    async () => {
      await useBrowserStore.getState().closeBrowser();
      return JSON.stringify({ success: true });
    },
    ['web-browser'],
  );

  // ── 大厅管理工具 (skill: lobby-manager) ──

  toolRegistry.register(
    'lobby_create_task',
    def('lobby_create_task', '创建一个新任务并自动切换到该任务', {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题' },
        task_type: { type: 'string', enum: ['manual', 'monitor', 'agent'], description: '任务类型，默认 manual' },
      },
      required: ['title'],
    }),
    async (args) => {
      const title = args.title as string;
      const taskType = (args.task_type as string) || 'manual';
      const task = await useChatStore.getState().createTask(title, taskType);
      return `__switch_task__:${task.id}`;
    },
    ['lobby-manager'],
  );

  toolRegistry.register(
    'lobby_list_tasks',
    def('lobby_list_tasks', '列出所有任务及其状态', {
      type: 'object',
      properties: {},
    }),
    async () => {
      const allTasks = await invoke<Array<{ id: string; title: string; task_type: string; status: string; created_at: string }>>('list_tasks');
      const tasks = allTasks.filter((t) => t.task_type !== 'lobby');
      return JSON.stringify(tasks.map((t) => ({
        id: t.id,
        title: t.title,
        type: t.task_type,
        status: t.status,
        created_at: t.created_at,
      })));
    },
    ['lobby-manager'],
  );

  toolRegistry.register(
    'lobby_switch_task',
    def('lobby_switch_task', '切换到指定的任务', {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '要切换到的任务 ID' },
      },
      required: ['task_id'],
    }),
    async (args) => {
      const taskId = args.task_id as string;
      const tasks = useChatStore.getState().tasks;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return JSON.stringify({ error: `任务 ${taskId} 不存在` });
      return `__switch_task__:${taskId}`;
    },
    ['lobby-manager'],
  );

  toolRegistry.register(
    'lobby_update_task',
    def('lobby_update_task', '更新任务标题', {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '要更新的任务 ID' },
        title: { type: 'string', description: '新标题' },
      },
      required: ['task_id', 'title'],
    }),
    async (args) => {
      await invoke('update_task', {
        id: args.task_id as string,
        request: { title: args.title as string },
      });
      await useChatStore.getState().loadTasks();
      return JSON.stringify({ success: true, task_id: args.task_id, title: args.title });
    },
    ['lobby-manager'],
  );

  toolRegistry.register(
    'lobby_delete_task',
    def('lobby_delete_task', '删除一个任务', {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '要删除的任务 ID' },
      },
      required: ['task_id'],
    }),
    async (args) => {
      await invoke('delete_task', { id: args.task_id as string });
      await useChatStore.getState().loadTasks();
      return JSON.stringify({ success: true, task_id: args.task_id, action: 'deleted' });
    },
    ['lobby-manager'],
  );

  toolRegistry.register(
    'lobby_back_to_lobby',
    def('lobby_back_to_lobby', '从当前任务返回仙府', {
      type: 'object',
      properties: {},
    }),
    async () => {
      return '__switch_task__:lobby';
    },
    ['lobby-manager'],
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
