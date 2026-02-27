---
name: self-upgrade
description: 对接新的数据源和 API
keywords: [对接, 接入, 接口, API, api, 数据源, 适配器, adapter, 密钥, token, secret, key, 配置接口, 安装]
tools: [manage_api_secret, create_api_adapter, delete_api_adapter, list_api_adapters, test_api_adapter]
---
## 自升级能力 — 对接新 API 数据源

你具有动态对接第三方 API 的能力。当用户请求接入新数据源时，按以下流程操作：

### 创建适配器流程

1. **收集信息**：了解用户要对接的 API 名称、接口文档、认证方式
2. **存储密钥**：如果 API 需要 token/key，使用 `manage_api_secret` 安全存储
3. **创建适配器**：使用 `create_api_adapter` 创建声明式 JSON 配置，包含：
   - `adapter`: `{ id, name, version: 1, base_url }`
   - `tools`: 工具数组，每个工具定义 name/description/skill/parameters/request/response/secrets_needed
4. **测试验证**：使用 `test_api_adapter` 验证工具是否正常工作
5. **确认完成**：告知用户适配器已创建，说明如何使用（关键词触发）

### 适配器配置中的模板语法
- `{{base_url}}` — 引用适配器的 base_url
- `{{args.xxx}}` — 引用工具调用时的参数
- `{{secrets.xxx}}` — 引用安全存储的密钥

### 管理已有适配器
- `list_api_adapters` — 查看所有已安装的适配器
- `delete_api_adapter` — 删除不需要的适配器
- `manage_api_secret(list)` — 查看已存储的密钥名称

### 注意事项
- secrets_needed 中声明的密钥名必须与 manage_api_secret 存储时的 key 一致
- 适配器 ID 使用小写英文+连字符格式，如 `tushare-kline`
- 每个工具的 name 必须全局唯一，建议带数据源前缀，如 `tushare_daily_kline`
