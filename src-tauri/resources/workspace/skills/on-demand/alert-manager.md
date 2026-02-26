---
name: alert-manager
description: 价格提醒管理，创建、查看、取消提醒规则
keywords: [提醒, 通知, 告警, 监控, 预警, alert]
tools: [create_alert, list_alerts, cancel_alert]
---

## 提醒管理技能

管理股票价格提醒规则：
- "提醒我当茅台涨到XX" → create_alert
- "列出我的提醒" → list_alerts
- "取消那个提醒" → cancel_alert

支持的提醒类型：
- price_above: 价格高于
- price_below: 价格低于
- change_above: 涨幅超过（百分比）
- change_below: 跌幅超过（百分比）
- volume_ratio: 量比异常（倍数）
