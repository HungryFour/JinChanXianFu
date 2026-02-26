import { invoke } from '@tauri-apps/api/core';
import { loadSkills, matchSkills } from './skills-loader';
import type { Skill } from '../../types/agent';
import { useChatStore } from '../../stores/chatStore';

const FALLBACK_SOUL = `你是 金蟾，一个专业的 AI 炒股助手和智能代理。你不仅能回答问题，还能主动调用工具获取实时数据、执行操作。

## 核心能力
- 调用工具获取实时股票行情数据
- 搜索股票（支持名称和代码）
- 批量查询多只股票行情
- 创建价格提醒和定时分析任务
- 管理自选股列表
- 查看涨停/跌停股票
- 记住用户偏好和交易知识
- 管理提醒规则和定时任务

## 工具使用原则
1. 当用户询问股票价格、行情时，先用 search_stocks 搜索确认股票代码，再用 fetch_stock_quote 获取行情
2. 用户说"帮我关注/加自选"时，使用 add_to_watchlist
3. 用户说"提醒我/通知我/当...时"时，使用 create_alert
4. 用户要求定期分析或几天后出报告时，使用 create_scheduled_task
5. 查看涨停/跌停时直接调用对应工具
6. 可以在一次回复中调用多个工具完成复杂任务
7. 用户分享重要信息时，用 save_memory 记录
8. 需要回顾历史信息时，用 search_memory 搜索
9. 了解到用户投资偏好时，用 update_user_profile 更新画像
10. 用户说"列出提醒/取消提醒"时，使用 list_alerts / cancel_alert
11. 用户说"列出定时任务/取消任务"时，使用 list_scheduled_tasks / cancel_scheduled_task
12. 用户说"持续监控/定时获取/每隔N分钟/自动执行"等涉及自主代理的需求时，使用 set_agent_plan 创建执行计划
13. 用户要求修改已有执行计划的参数（频率、价格阈值、消息等）时，使用 update_agent_plan
14. 用户要求停止/暂停执行计划时，使用 stop_agent_plan
15. 用户说"监控我屏幕上的XX软件/截图分析/看图分析K线"时，先用 list_available_windows 确认窗口，再用 set_agent_plan 创建含 capture_screen + vision_analyze 的计划

## 回复规范
- 始终使用中文回复
- 获取到行情数据后，给出专业的分析和解读
- 创建提醒或任务后，确认已创建并说明触发条件
- 对于具体的买卖建议，提醒用户"投资有风险，入市需谨慎"
- 分析时引用具体数据和技术指标`;

let cachedSkills: Skill[] | null = null;

export async function buildContext(userInput: string): Promise<string> {
  const parts: string[] = [];

  // 1. 读取 SOUL.md
  try {
    const soul = await invoke<string>('cmd_workspace_read', { relativePath: 'SOUL.md' });
    parts.push(soul && soul.trim() ? soul.trim() : FALLBACK_SOUL);
  } catch {
    parts.push(FALLBACK_SOUL);
  }

  // 2. 读取 USER.md
  try {
    const user = await invoke<string>('cmd_workspace_read', { relativePath: 'USER.md' });
    if (user && user.trim() && user.trim() !== '# 用户画像') {
      parts.push(`\n## 用户画像\n${user.trim()}`);
    }
  } catch { /* skip */ }

  // 3. 搜索相关记忆
  try {
    const memories = await invoke<string[]>('cmd_workspace_search', {
      relativePath: 'MEMORY.md',
      query: userInput,
    });
    if (memories && memories.length > 0) {
      parts.push(`\n## 相关记忆\n${memories.slice(0, 10).join('\n')}`);
    }
  } catch { /* skip */ }

  // 4. 注入当前 task 的 Agent Plan（如果有）
  try {
    const { activeTaskId, tasks } = useChatStore.getState();
    if (activeTaskId) {
      const task = tasks.find((t) => t.id === activeTaskId);
      if (task?.agent_plan) {
        const plan = JSON.parse(task.agent_plan);
        parts.push(`\n## 当前任务的执行计划 (Agent Plan)\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\n用户可能会要求修改此计划的参数，请使用 update_agent_plan 工具。要停止计划请使用 stop_agent_plan。`);
      }
    }
  } catch { /* skip */ }

  // 5. 加载并匹配技能
  try {
    if (!cachedSkills) {
      cachedSkills = await loadSkills();
    }
    const matched = matchSkills(cachedSkills, userInput);
    const skillPrompts = matched
      .filter((s) => s.prompt)
      .map((s) => s.prompt);

    if (skillPrompts.length > 0) {
      parts.push(`\n## 激活技能\n${skillPrompts.join('\n\n')}`);
    }
  } catch { /* skip */ }

  return parts.join('\n\n');
}

export function getActiveSkillNames(userInput: string): string[] {
  if (!cachedSkills) return [];
  return matchSkills(cachedSkills, userInput).map((s) => s.name);
}

export function invalidateSkillsCache() {
  cachedSkills = null;
}
