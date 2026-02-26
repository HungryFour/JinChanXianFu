---
name: market-query
description: 股票行情查询，支持单只、批量查询和股票搜索
keywords: []
tools: [fetch_stock_quote, search_stocks, fetch_batch_quotes]
---

## 行情查询技能

当用户询问任何股票相关问题时：
1. 先用 search_stocks 确认股票代码
2. 用 fetch_stock_quote 获取实时行情
3. 如果涉及多只股票，用 fetch_batch_quotes 批量查询
4. 基于数据给出专业分析
