# 金蟾 (JinChan) - 跨平台 AI 炒股助手 设计文档

## 1. 产品概述

金蟾是一个桌面 AI 炒股助手，面向活跃的 A 股交易者。核心能力：

- **任务驱动**：每个分析场景是一个「任务」，支持长期跟踪、定时执行、主动提醒
- **窗口监控**：截图识别券商软件的 K 线/行情画面
- **结构化数据**：通过 API 获取实时行情，注入 AI 上下文
- **知识积累**：AI 逐渐学习用户的交易风格，越用越懂你

**关键约束**：跨平台（macOS + Windows）、纯桌面应用无需后端、安装即用。

---

## 2. 核心概念：任务 (Task)

### 2.1 为什么是任务而不是对话

传统 AI 聊天是「一次性对话」——聊完就结束。但炒股分析天然是**持续性**的：

- 跟踪一只股票不是聊一次就够的，需要每天看、每周复盘
- 交易策略需要反复验证，记录买卖点，事后回顾
- 异动监控需要定时运行，不是用户手动触发

所以金蟾的基本单元是**任务**，而非对话。

### 2.2 任务模型

```
任务 (Task)
├── 基本信息
│   ├── 名称（如："跟踪贵州茅台走势"）
│   ├── 类型：manual / scheduled / monitor
│   ├── 状态：active / paused / completed
│   ├── 创建时间 / 更新时间
│   └── 标签（可选，如：短线、白酒板块）
│
├── 对话历史
│   └── 该任务下的所有消息记录（用户 + AI）
│
├── 关联股票
│   └── 该任务关注的股票代码列表
│
├── 定时配置（可选）
│   ├── 执行频率（如：每天 9:30、每小时、每 5 分钟）
│   ├── 触发动作（如：获取最新行情 → 发给 AI 分析）
│   └── 是否启用
│
├── 监控规则（可选）
│   ├── 价格阈值提醒
│   ├── 涨跌幅提醒
│   ├── 成交量异动
│   └── 窗口截图变化检测
│
└── 知识沉淀
    └── 从该任务对话中自动提取的交易知识
```

### 2.3 任务类型

| 类型 | 说明 | 示例 |
|------|------|------|
| **手动任务** (manual) | 用户主动发起对话分析 | "帮我分析一下中芯国际" |
| **定时任务** (scheduled) | 按设定频率自动执行 | 每天收盘后自动分析持仓股表现 |
| **监控任务** (monitor) | 持续监控，满足条件时触发 | 股价突破压力位时通知 |

### 2.4 任务生命周期

```
创建 → 活跃（对话 / 定时执行 / 监控中）
  ↓
暂停（用户手动暂停定时/监控）
  ↓
恢复 → 活跃
  ↓
完成（用户标记完成，保留历史记录）
```

---

## 3. 技术架构

### 3.1 技术选型：Tauri v2 + React + TypeScript

| 对比项 | Tauri v2 | Electron | Wails (Go) |
|--------|----------|----------|------------|
| 包体积 | ~10MB | ~150MB+ | ~15MB |
| 性能 | Rust 后端，极快 | Node 后端，较慢 | Go 后端，快 |
| 截图 | tauri-plugin-screenshots | node 模块 | 需自己实现 |
| 跨平台 | macOS/Win/Linux | macOS/Win/Linux | macOS/Win/Linux |

### 3.2 项目结构

```
JinChan/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
│
├── src-tauri/                          # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/
│       ├── lib.rs                      # Tauri 入口，插件注册
│       ├── main.rs
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── database.rs             # 任务/消息 CRUD
│       │   ├── capture.rs              # 窗口枚举、截图调度
│       │   └── market_data.rs          # 行情数据获取
│       ├── services/
│       │   ├── mod.rs
│       │   ├── scheduler.rs            # 定时任务调度器
│       │   ├── capture_scheduler.rs    # 定时截图 + 差异检测
│       │   └── alert_engine.rs         # 监控规则引擎
│       └── db/
│           ├── mod.rs                  # SQLite 初始化
│           ├── migrations.rs           # 数据库迁移
│           └── models.rs              # 数据模型
│
├── src/                                # React 前端
│   ├── main.tsx
│   ├── App.tsx                         # 主布局
│   ├── App.css                         # Tailwind 入口
│   │
│   ├── components/
│   │   ├── Sidebar.tsx                 # 侧边栏：任务列表
│   │   ├── task/
│   │   │   ├── TaskPanel.tsx           # 任务主面板（对话 + 配置）
│   │   │   ├── TaskHeader.tsx          # 任务头部（名称、状态、配置入口）
│   │   │   ├── TaskConfig.tsx          # 任务配置（定时、监控规则）
│   │   │   └── NewTaskDialog.tsx       # 新建任务对话框
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx           # 对话面板
│   │   │   ├── MessageBubble.tsx       # 消息气泡
│   │   │   ├── StreamingText.tsx       # 流式输出
│   │   │   └── ImagePreview.tsx        # 截图预览
│   │   ├── capture/
│   │   │   ├── WindowPicker.tsx        # 窗口选择器
│   │   │   ├── CapturePreview.tsx      # 实时截图预览
│   │   │   └── CaptureControl.tsx      # 监控控制
│   │   ├── market/
│   │   │   ├── Watchlist.tsx           # 自选股列表
│   │   │   ├── StockCard.tsx           # 个股卡片
│   │   │   └── AlertConfig.tsx         # 提醒规则配置
│   │   ├── knowledge/
│   │   │   ├── KnowledgePanel.tsx      # 知识库浏览
│   │   │   ├── StrategyNotes.tsx       # 交易策略笔记
│   │   │   └── ProfileView.tsx         # 用户画像
│   │   └── settings/
│   │       └── SettingsPanel.tsx        # 设置面板（模型配置）
│   │
│   ├── services/
│   │   ├── ai/
│   │   │   ├── provider.ts             # Provider 工厂
│   │   │   ├── openai-compatible.ts    # 统一 OpenAI 兼容实现
│   │   │   └── streaming.ts            # SSE 流式解析
│   │   ├── market/
│   │   │   ├── provider.ts             # 行情数据统一接口
│   │   │   ├── eastmoney.ts            # 东方财富 API
│   │   │   └── sina.ts                 # 新浪财经 API
│   │   ├── knowledge/
│   │   │   ├── knowledgeManager.ts     # 知识库管理
│   │   │   ├── extractor.ts            # 知识提取
│   │   │   └── profileBuilder.ts       # 用户画像构建
│   │   ├── capture/
│   │   │   ├── captureManager.ts       # 截图管理
│   │   │   └── diffDetector.ts         # 图片差异检测
│   │   └── settingsStorage.ts          # 设置持久化
│   │
│   ├── stores/
│   │   ├── taskStore.ts                # 任务状态 (Zustand)
│   │   ├── chatStore.ts                # 对话状态
│   │   ├── captureStore.ts             # 截图状态
│   │   ├── marketStore.ts              # 行情状态
│   │   └── settingsStore.ts            # 设置状态
│   │
│   ├── hooks/
│   │   ├── useAI.ts                    # AI 对话 hook
│   │   ├── useCapture.ts              # 截图 hook
│   │   └── useMarketData.ts           # 行情数据 hook
│   │
│   └── types/
│       ├── ai.ts                       # AI / 模型配置类型
│       ├── task.ts                     # 任务类型
│       ├── market.ts                   # 行情数据类型
│       ├── knowledge.ts               # 知识库类型
│       └── capture.ts                 # 截图类型
│
├── resources/
│   └── prompts/
│       ├── base.md                     # 基础角色提示词
│       ├── chart_analysis.md           # K 线分析提示词
│       ├── knowledge_extract.md        # 知识提取提示词
│       └── alert_analysis.md           # 异动分析提示词
│
├── database/
│   └── schema.sql                      # 数据库 Schema 参考
│
└── docs/
    └── design.md                       # 本文档
```

---

## 4. 数据库设计

### 4.1 Schema

```sql
-- 任务（取代原来的 conversation）
CREATE TABLE task (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'manual',   -- manual / scheduled / monitor
    status TEXT NOT NULL DEFAULT 'active', -- active / paused / completed
    stock_symbols TEXT,                    -- JSON 数组，关联股票
    tags TEXT,                             -- JSON 数组，标签
    schedule_config TEXT,                  -- JSON，定时配置
    monitor_config TEXT,                   -- JSON，监控规则配置
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

-- 消息（属于某个任务）
CREATE TABLE message (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                    -- user / assistant / system
    content TEXT NOT NULL,
    image_paths TEXT,                      -- JSON 数组
    model_used TEXT,
    trigger_source TEXT,                   -- manual / scheduled / monitor
    created_at TEXT NOT NULL
);

CREATE INDEX idx_message_task ON message(task_id, created_at);

-- 知识库
CREATE TABLE knowledge (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,               -- strategy / opinion / preference / lesson
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    stock_symbols TEXT,                   -- JSON 数组
    source_task_id TEXT,
    confidence REAL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE knowledge_fts USING fts5(title, content);

-- 用户画像
CREATE TABLE user_profile (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 自选股
CREATE TABLE watchlist (
    symbol TEXT PRIMARY KEY,
    name TEXT,
    exchange TEXT,
    added_at TEXT NOT NULL
);

-- 提醒规则（绑定到任务）
CREATE TABLE alert_rule (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES task(id) ON DELETE CASCADE,
    stock_symbol TEXT,
    alert_type TEXT NOT NULL,
    condition_json TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_triggered TEXT,
    created_at TEXT NOT NULL
);

-- 截图会话（绑定到任务）
CREATE TABLE capture_session (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES task(id) ON DELETE CASCADE,
    window_title TEXT NOT NULL,
    window_app TEXT,
    interval_sec REAL DEFAULT 5.0,
    started_at TEXT NOT NULL,
    ended_at TEXT
);

-- 定时执行记录
CREATE TABLE schedule_log (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    executed_at TEXT NOT NULL,
    result_summary TEXT,
    status TEXT NOT NULL DEFAULT 'success'  -- success / error
);
```

### 4.2 定时配置 JSON 结构

```json
{
  "enabled": true,
  "cron": "30 9 * * 1-5",
  "action": {
    "type": "fetch_and_analyze",
    "prompt": "分析今天的走势，对比昨日，给出操作建议"
  },
  "lastRun": "2026-02-24T09:30:00Z",
  "nextRun": "2026-02-25T09:30:00Z"
}
```

### 4.3 监控规则 JSON 结构

```json
{
  "rules": [
    {
      "type": "price_above",
      "symbol": "600519",
      "value": 1800,
      "message": "茅台突破 1800"
    },
    {
      "type": "change_percent",
      "symbol": "600519",
      "operator": "gt",
      "value": 5,
      "message": "茅台涨幅超 5%"
    },
    {
      "type": "volume_surge",
      "symbol": "600519",
      "multiplier": 2.0,
      "message": "茅台成交量放大 2 倍"
    }
  ]
}
```

---

## 5. 核心模块设计

### 5.1 AI 引擎

**统一 OpenAI 兼容格式**，一套代码适配所有供应商：

- OpenAI (gpt-4o)
- DeepSeek (deepseek-chat)
- 智谱 GLM (glm-4v-flash)
- 任何 OpenAI 兼容 API（Kimi、通义千问等）

配置项：API Key、Base URL、模型名、多模态开关。

**Context 管理**：
- 保留任务内最近 N 条消息 + 历史摘要
- 注入用户交易画像
- 注入相关知识条目（FTS5 全文搜索）
- 注入当前市场数据快照
- 注入任务关联股票的实时行情

### 5.2 任务调度器

Rust 后端的定时调度器，负责：

```
启动时 → 加载所有 active + scheduled 任务
  ↓
每秒检查 → 是否有到期需要执行的定时任务
  ↓
触发执行 → 获取行情数据 → 构造 prompt → 调用 AI → 存储结果
  ↓
通知前端 → 插入消息到对应任务 → 系统通知（如有配置）
```

### 5.3 窗口截图监控

使用 `tauri-plugin-screenshots`（基于 xcap 库，跨平台）：

```
用户在任务中选择窗口 → 定时截图（默认 5 秒）→ 差异检测（pHash）
  → 有变化 → 存储图片 + 触发 AI 分析（如果任务配置了自动分析）
  → 无变化 → 跳过
```

### 5.4 行情数据

免费数据源优先：

| 数据源 | 类型 | 覆盖 | 用途 |
|--------|------|------|------|
| 东方财富 API | REST | A 股/港股 | 实时行情、K 线 |
| 新浪财经 API | REST | A 股/美股 | 实时报价 |

结构化数据注入 AI 对话上下文，弥补截图识别的精度不足。

### 5.5 知识库 + 用户画像

**知识提取流程**：
```
每轮对话完成后 → 发送提取 prompt 到 AI →
解析结构化输出 → 存入知识库 → 更新用户画像
```

**知识类型**：
- 交易偏好（风险偏好、持仓周期、仓位习惯）
- 个股观点（看多/看空某股的理由）
- 策略模式（什么条件下买/卖）
- 经验教训（哪些操作对了/错了）

### 5.6 提醒系统

```
行情数据流 → AlertEngine 规则匹配（绑定到具体任务）
  ├── 价格阈值提醒
  ├── 涨跌幅提醒
  ├── 成交量异动
  └── AI 图形分析提醒
       ↓
  触发 → 系统通知 + 在对应任务中插入提醒消息
```

---

## 6. 关键依赖

### Rust (src-tauri/Cargo.toml)
- `tauri` v2 — 应用框架
- `tauri-plugin-screenshots` — 窗口截图
- `tauri-plugin-notification` — 系统通知
- `tauri-plugin-store` — 本地配置存储
- `rusqlite` — SQLite 数据库
- `serde` / `serde_json` — 序列化
- `tokio` — 异步运行时（定时调度）
- `uuid` / `chrono` — ID 生成、时间处理

### JavaScript (package.json)
- `react` + `react-dom` — UI 框架
- `typescript` — 类型安全
- `@tauri-apps/api` — Tauri 前端 API
- `@tauri-apps/plugin-store` — 设置持久化
- `zustand` — 状态管理
- `react-markdown` + `remark-gfm` — Markdown 渲染
- `tailwindcss` — 样式
- `lucide-react` — 图标

---

## 7. 分阶段开发计划

### Phase 1：基础框架 + AI 对话 (90%)

- [x] Tauri v2 + React + TypeScript 项目搭建
- [x] 主界面布局（侧边栏 + 主区域）
- [x] AI Provider 统一接口（OpenAI 兼容格式）
- [x] 本地 SQLite 数据库（8 表 + FTS5）
- [x] 设置面板（模型配置）
- [x] 将 conversation 重构为 task 模型（manual/scheduled/monitor）
- [x] 任务列表侧边栏（状态标识、类型图标）
- [x] Agent Loop + Tool Calling（10 个 AI 工具）
- [x] SSE 流式传输 + Markdown 渲染
- [ ] 新建任务对话框（选择类型、关联股票）

**交付**：能创建任务、与 AI 对话讨论股票的桌面应用

### Phase 2：窗口截图监控

- [ ] 集成 tauri-plugin-screenshots
- [ ] 窗口选择器 UI（缩略图网格）
- [ ] 定时截图 + 差异检测
- [ ] 截图绑定到任务，发送到 AI 分析
- [ ] 截图历史管理

**交付**：在任务中选择券商窗口，AI 自动识别分析 K 线

### Phase 3：行情数据 + 定时任务 (50%)

- [x] 接入东方财富免费行情 API（实时行情、搜索、批量、涨跌停）
- [x] Rust 端定时任务调度器（Scheduler 框架 + A股交易时间判断）
- [x] 前端 AI 工具（5 个行情相关工具）
- [x] useScheduledAgent Hook
- [ ] 自选股列表 UI + 实时报价卡片
- [ ] 行情数据注入 AI 上下文
- [ ] 定时任务配置 UI
- [ ] 定时执行记录

**交付**：创建定时任务，每天自动分析持仓股走势

### Phase 4：监控提醒 (30%)

- [x] 监控规则数据库表 + 数据模型
- [x] 提醒规则 CRUD 命令（3 个 Tauri 命令）
- [x] Scheduler 中 check_alerts() 框架
- [x] AI 工具：create_alert
- [ ] 监控规则配置 UI
- [ ] 规则匹配逻辑完善
- [ ] 系统通知推送
- [ ] AI 图形形态变化提醒
- [ ] 提醒历史记录

**交付**：设置监控任务，异动时自动通知

### Phase 5：知识库 + 用户画像 (5%)

- [x] 数据库表设计（knowledge + FTS5 + user_profile）
- [x] 类型定义（types/knowledge.ts）
- [ ] 知识提取引擎（对话后自动提取）
- [ ] 知识库浏览/编辑界面
- [ ] 用户交易画像构建
- [ ] 知识注入 AI 对话上下文（RAG）

**交付**：AI 记住你的交易风格，越用越懂你

### Phase 6：策略学习 + 打磨

- [ ] 交易决策记录与回顾
- [ ] 个性化建议
- [ ] UI/UX 打磨，快捷键
- [ ] Windows 平台测试与适配

**交付**：完整的 AI 交易助手

---

## 8. UI 设计要点

### 8.1 侧边栏任务列表

```
┌─────────────────────┐
│  🐸 金蟾              │
│  [+ 新建任务]         │
├─────────────────────┤
│  ● 跟踪贵州茅台       │  ← active, manual
│  ⏱ 每日持仓分析       │  ← active, scheduled
│  👁 白酒板块监控       │  ← active, monitor
│  ○ 中芯国际分析       │  ← completed
│                     │
├─────────────────────┤
│  ⚙ 设置              │
└─────────────────────┘
```

- `●` 绿点 = 活跃手动任务
- `⏱` 时钟 = 定时任务
- `👁` 眼睛 = 监控任务
- `○` 灰点 = 已完成

### 8.2 任务主面板

```
┌──────────────────────────────────────┐
│  跟踪贵州茅台  [active]  [⚙ 配置]    │  ← TaskHeader
├──────────────────────────────────────┤
│                                      │
│  [消息气泡...]                        │  ← ChatPanel
│  [消息气泡...]                        │
│  [AI 分析结果...]                     │
│                                      │
├──────────────────────────────────────┤
│  [输入框]                    [发送]   │
└──────────────────────────────────────┘
```

点击「配置」展开任务设置：
- 关联股票
- 定时配置（频率、触发 prompt）
- 监控规则
- 窗口截图绑定

---

## 9. 验证方式

1. **Phase 1**：创建任务 → 与 AI 对话 → 关闭重开后任务和消息仍在
2. **Phase 2**：任务中绑定窗口 → 看到实时截图 → AI 分析截图中的 K 线
3. **Phase 3**：创建定时任务 → 设定每天 15:00 执行 → 到时自动产生分析消息
4. **Phase 4**：创建监控任务 → 设置价格提醒 → 触发时收到系统通知
5. **Phase 5**：多轮对话后 → 查看知识库有自动提取的偏好 → 新任务中 AI 已知道你的风格
6. **Phase 6**：记录买卖决策 → AI 分析你的决策模式
