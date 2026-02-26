# 金蟾 (JinChan) - 项目开发进度

> 最后更新：2026-02-26

---

## 总体进度

| Phase | 名称 | 进度 | 状态 |
|-------|------|------|------|
| 架构重构 | Nanobot 重构 | 100% | ✅ 完成 |
| Agent Plan | Task 升级为自主代理实例 | 100% | ✅ 完成 |
| Phase 1 | 基础框架 + AI 对话 | 95% | 完成 |
| Phase 2 | 窗口截图监控 | 0% | 搁置（改用 Skills 扩展） |
| Phase 3 | 行情数据 + 定时任务 | 85% | 后端完成 + 配置可视化 + Agent Plan |
| Phase 4 | 监控提醒 | 80% | 完整 CRUD + 可视化面板 + Agent Plan 自主监控 |
| Phase 5 | 知识库 + 用户画像 | 50% | Memory + User Profile 通过 Workspace 实现 |
| Phase 6 | 策略学习 + 打磨 | 0% | 未开始 |

---

## 架构重构：Nanobot (100%)

核心理念：**AI 是配置的主入口，UI 是查看和微调的窗口**

### 新架构

```
UI Layer → useAgent() Hook → Agent Layer → Rust Backend
                              ├── AgentLoop (统一引擎)
                              ├── ContextBuilder (SOUL+USER+Memory+Skills+AgentPlan)
                              ├── SkillsLoader (md 解析，关键词匹配)
                              ├── ToolRegistry (按 skill 动态过滤)
                              └── Heartbeat (Tauri 事件监听)
```

### Workspace 结构 (`$APP_DATA_DIR/workspace/`)

```
workspace/
├── SOUL.md          # 金蟾核心身份
├── USER.md          # 用户交易画像（AI 自动更新）
├── MEMORY.md        # 交易记忆（append-only）
└── skills/
    ├── _always/     # 每次对话都加载
    │   ├── market-query.md
    │   └── watchlist.md
    └── on-demand/   # 按关键词激活
        ├── agent-plan.md
        ├── alert-manager.md
        ├── scheduled-task.md
        ├── kline-analysis.md
        ├── sector-rotation.md
        ├── limit-stocks.md
        └── trade-journal.md
```

### 已完成

#### Step 1: Agent 核心引擎
- [x] `src/types/agent.ts` — 类型定义
- [x] `src/services/agent/agent-loop.ts` — 统一 Agent Loop（纯函数式 + 回调解耦）
- [x] `src/services/agent/tool-registry.ts` — class-based ToolRegistry（支持按 skill 过滤）
- [x] `src/hooks/useAgent.ts` — 统一 React Hook
- [x] 删除 useAI.ts / useScheduledAgent.ts

#### Step 2: Workspace + ContextBuilder
- [x] `src-tauri/src/commands/workspace.rs` — 5 个 Tauri 命令（read/write/append/list/search）
- [x] `resources/workspace/` — SOUL.md + USER.md + MEMORY.md 模板
- [x] `src/services/agent/context-builder.ts` — 组装 systemPrompt

#### Step 3: Skills 系统
- [x] `src/services/agent/skills-loader.ts` — 解析 skill markdown
- [x] 9 个技能文件（2 always + 7 on-demand）
- [x] ContextBuilder + ToolRegistry 集成

#### Step 4: Memory 系统
- [x] 3 个工具：save_memory, search_memory, update_user_profile
- [x] ContextBuilder 注入相关记忆

#### Step 5: Heartbeat + 管理工具
- [x] `src/services/agent/heartbeat.ts` — 监听 Tauri 事件（3 种事件）
- [x] 4 个管理工具：list_alerts, cancel_alert, list_scheduled_tasks, cancel_scheduled_task

#### Step 6: 配置可视化 UI
- [x] WatchlistPanel — 自选股面板
- [x] AlertsList — 提醒规则列表
- [x] ScheduleDisplay — 定时任务展示
- [x] TaskConfigPanel — 配置总览
- [x] Sidebar 集成

#### Step 7: 清理
- [x] 删除废弃空目录
- [x] TypeScript + Rust 编译验证通过

---

## Agent Plan：Task 升级为自主代理实例 (100%)

核心理念：**Task 内嵌 Agent Plan，变成"活的代理实例"**

### 使用场景

```
用户："帮我持续监控招商银行，每5分钟获取数据，价格大于40提醒我"

Task 自动变成：
├── agent_plan: { fetch 600036 every 5min → check price > 40 → notify + analyze }
├── Scheduler 每5分钟自动执行 plan
├── 条件满足时推送分析到对话
└── 用户可以对话修改："把价格改成38"、"改成每10分钟"
```

### 已完成

#### Step 1: 数据层变更
- [x] `migrations.rs` — ALTER TABLE task ADD agent_plan TEXT; ALTER TABLE schedule_log ADD step_results TEXT
- [x] `models.rs` — Task/UpdateTaskRequest 增加 agent_plan 字段
- [x] `database.rs` — create_task/list_tasks/update_task 处理 agent_plan；新增 get_plan_logs 命令
- [x] `lib.rs` — 注册 get_plan_logs
- [x] `chat.ts` — TaskType 增加 'agent'；新增 AgentPlan/PlanStep/PlanSchedule/ExecutionState/PlanLogEntry 类型

#### Step 2: Scheduler 改造（核心）
- [x] `scheduler.rs` — 轮询间隔 30s → 10s
- [x] AgentPlan/PlanStep/PlanSchedule/ExecutionState Rust 结构体
- [x] `check_agent_plans()` — 查询 active + agent_plan IS NOT NULL 的任务
- [x] `should_execute()` — 支持 interval/daily/once 三种调度
- [x] `execute_plan_steps()` — fetch_data → condition_check → action 管道
- [x] `evaluate_conditions()` — 支持 price/change_percent/volume_ratio + gt/lt/gte/lte/eq
- [x] 条件满足时 emit `agent-plan-trigger` event
- [x] 更新 execution_state + 写入 schedule_log
- [x] once 类型触发后自动 enabled=false

#### Step 3: AI 工具层
- [x] `set_agent_plan` — 创建/替换 agent_plan
- [x] `update_agent_plan` — 修改 plan 部分配置（频率、阈值、消息等）
- [x] `get_agent_plan` — 查询 plan 状态 + 最近执行记录
- [x] `stop_agent_plan` — 停用 plan（enabled=false）
- [x] `context-builder.ts` — 注入 plan JSON 到系统提示 + 3 条工具指引
- [x] `agent-plan.md` — 技能文件，keywords 匹配监控/持续/定时获取等

#### Step 4: 前端 Heartbeat + UI
- [x] `heartbeat.ts` — agent-plan-trigger 事件监听，支持 notify/analyze/notify_and_analyze
- [x] `chatStore.ts` — activeTaskPlan 状态，setActiveTask 时自动加载 plan
- [x] `AgentPlanPanel.tsx` — 展示 plan 描述、调度、步骤、统计、最近执行记录
- [x] `TaskConfigPanel.tsx` — 引入 AgentPlanPanel 作为第一个面板
- [x] `Sidebar.tsx` — agent 类型任务使用 Bot 图标
- [x] `ChatPanel.tsx` — TOOL_DISPLAY_NAMES 增加 4 个 plan 工具

#### Step 5: 编译验证
- [x] TypeScript 编译通过
- [x] Rust 编译通过

---

## 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 应用框架 | Tauri | v2 |
| 前端 | React + TypeScript | 19.1 + 5.8 |
| 后端 | Rust | 2021 edition |
| 状态管理 | Zustand | 5.0 |
| 样式 | Tailwind CSS | 4.2 |
| 数据库 | SQLite (rusqlite) | 0.31 |
| 异步运行时 | Tokio | 1.0 |
| HTTP 客户端 | reqwest | 0.12 |

---

## 代码统计

| 指标 | 数值 |
|------|------|
| Tauri 命令 | 21 个 |
| AI 工具 | 21 个 |
| Skills | 9 个（2 always + 7 on-demand） |
| React 组件 | 10 个 |
| Zustand Store | 2 个 |
| Workspace 文件 | 12 个 |

---

## 关键架构决策

1. **Nanobot 架构** — AI 驱动配置 + 可视化编辑，Skills 系统可扩展
2. **统一 AgentLoop** — 消除 useAI/useScheduledAgent 重复，纯函数式引擎
3. **Workspace 系统** — SOUL.md + USER.md + MEMORY.md，文件即配置
4. **Skills 动态加载** — Markdown 定义技能，关键词匹配按需激活
5. **工具动态过滤** — 按激活 skill 过滤工具，减少 token 消耗
6. **Rust 端 Scheduler** — 定时任务在后端运行，不依赖前端状态
7. **Agent Plan** — task.agent_plan 列存储 JSON，Rust 端 fetch + check，前端 AI 分析按需触发
8. **execution_state in plan** — 执行状态存在 plan JSON 内部，Scheduler 原地更新
9. **兼容性** — 保留 alert_rule 旧逻辑，简单提醒用 create_alert，复杂监控用 set_agent_plan
