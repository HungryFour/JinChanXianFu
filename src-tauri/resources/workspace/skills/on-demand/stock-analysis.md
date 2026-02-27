---
name: stock-analysis
description: 综合股票分析 — 行情数据 + 网络搜索 + AI 研判
keywords: [分析, 研报, 新闻, 资讯, 研究, 基本面, 技术面, 深度, 全面, 诊断, 评估, 前景, 走势, 趋势, 怎么样, 能买吗, 能不能买, 值得买吗, 看好, 看空, 利好, 利空]
tools: [search_stocks, fetch_stock_quote, fetch_batch_quotes, browser_open, browser_navigate, browser_screenshot, browser_click, browser_type, browser_scroll, browser_close]
---

## 综合股票分析技能

当用户要求分析某只股票时，按以下流程进行全面分析：

### 第一步：行情数据

1. 用 `search_stocks` 搜索股票代码
2. 用 `fetch_stock_quote` 获取实时行情（现价、涨跌幅、成交量、市盈率等）

### 第二步：网络搜索最新资讯

1. 用 `browser_open` 打开百度搜索：`https://www.baidu.com/s?wd={股票名称}+最新消息`
2. 用 `browser_screenshot` 截图查看搜索结果
3. 浏览重要新闻标题，必要时点击进入查看详情
4. 可追加搜索：`{股票名称}+研报` 或 `{股票名称}+公告` 获取更多信息
5. 完成后 `browser_close` 关闭浏览器

### 第三步：综合分析报告

结合行情数据和网络资讯，输出结构化分析报告：

- **基本信息**：股票名称、代码、现价、涨跌幅
- **行情概览**：成交量、换手率、市盈率、市值等关键指标
- **近期动态**：根据搜索到的新闻/公告，总结近期重要事件
- **分析观点**：综合数据和资讯给出分析（注意声明仅供参考，不构成投资建议）
