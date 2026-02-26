---
name: agent-plan
description: 自主代理执行计划，支持持续监控、定时获取、条件触发、窗口截图视觉分析等自动化场景
keywords: [监控, 持续, 定时获取, 每隔, 自动, plan, 执行计划, 代理, agent, 截图, 屏幕, 窗口, K线, 图形, 形态, 看图]
tools: [set_agent_plan, update_agent_plan, get_agent_plan, stop_agent_plan, list_available_windows]
---

## 执行计划（Agent Plan）技能

将任务变为自主代理实例，按计划自动执行数据获取、条件检查和动作触发。支持两种管道：

1. **数据型管道**: `fetch_data` → `condition_check`（可选） → `action`
2. **视觉型管道**: `capture_screen` → `vision_analyze` → `action`

### 使用场景
- "帮我持续监控招商银行，每5分钟获取数据，价格大于40提醒我" → set_agent_plan（数据型）
- "帮我监控同花顺的K线，每30秒截图，发现放量突破提醒我" → list_available_windows + set_agent_plan（视觉型）
- "把价格改成38" / "改成每10分钟" → update_agent_plan
- "查看执行计划状态" → get_agent_plan
- "停止监控" → stop_agent_plan
- "桌面上有哪些窗口" → list_available_windows

### 数据型管道步骤

**fetch_data**: 获取股票数据
```json
{ "id": "s1", "type": "fetch_data", "config": { "symbols": ["600036"] } }
```

**condition_check**: 条件检查（可选，不需要条件判断时可省略）
```json
{ "id": "s2", "type": "condition_check", "config": {
    "conditions": [{ "field": "price", "operator": "gt", "value": 40, "symbol": "600036" }],
    "logic": "any"
}}
```
- field: price / change_percent / volume_ratio
- operator: gt / lt / gte / lte / eq

### 视觉型管道步骤

**capture_screen**: 截取指定窗口的屏幕截图
```json
{ "id": "s1", "type": "capture_screen", "config": { "window_title": "同花顺" } }
```
- window_title: 窗口标题（模糊匹配），先用 list_available_windows 确认

**vision_analyze**: AI 视觉分析截图（需要模型支持 Vision）
```json
{ "id": "s2", "type": "vision_analyze", "config": {
    "prompt": "分析这张K线截图，判断是否出现放量突破形态",
    "trigger_condition": "出现放量突破或其他值得关注的技术形态"
}}
```
- prompt: 发送给 AI Vision 的分析提示词
- trigger_condition: 触发条件的自然语言描述

### 通用步骤

**action**: 触发动作（两种管道通用）
```json
{ "id": "s3", "type": "action", "config": {
    "action_type": "notify_and_analyze",
    "message": "招商银行突破40元",
    "analysis_prompt": "分析走势和策略建议"
}}
```
- action_type: notify / analyze / notify_and_analyze / save_memory

### 调度类型
- interval: 每N分钟执行一次（interval_minutes，支持小数如 0.5 = 30秒）
- daily: 每天固定时间执行一次（trigger_time: "HH:MM"）
- once: 条件满足后执行一次即停止

### 视觉型管道完整示例

用户说"帮我监控同花顺K线，每30秒看一次，发现突破就提醒我"：

1. 先调用 `list_available_windows` 确认桌面有"同花顺"窗口
2. 再调用 `set_agent_plan`:
```json
{
  "description": "监控同花顺K线，发现放量突破时提醒",
  "stock_symbols": [],
  "steps": [
    { "id": "s1", "type": "capture_screen", "config": { "window_title": "同花顺" } },
    { "id": "s2", "type": "vision_analyze", "config": {
      "prompt": "分析这张K线截图，判断是否出现放量突破形态（成交量明显放大+价格突破前期高点或重要均线）",
      "trigger_condition": "出现放量突破或其他值得关注的技术形态"
    }},
    { "id": "s3", "type": "action", "config": {
      "action_type": "notify_and_analyze",
      "message": "K线出现异常形态",
      "analysis_prompt": "详细分析当前K线形态，给出操作建议"
    }}
  ],
  "schedule": { "type": "interval", "interval_minutes": 0.5, "market_hours_only": true }
}
```
