# 更新日志

本文件记录 dsh-mcp-manager 的重要变更。

## 0.1.0

首个版本。

- 设置页「模型」正下方新增「MCP 服务器」分区（`settings.section` order 10.5）。
- 作用域：用户·本机与各工作区，清单分别存放在 `<作用域>/mcp-manager/servers.json`。
- 新建/编辑页提供表单与 JSON 双模式，JSON 兼容 `{"name": {...}}` 与 `{"mcpServers": {...}}`。
- 导入既有 MCP 配置、搜索、启停、重新连接、删除。
- 运行期通过官方 `@deepseek-ai/dsh-mcp-client` 挂载连接，工具以 `mcp__<serverName>__<tool>` 注册，无需重启宿主。
- 状态展示：已连接（工具数）、连接中、连接失败、离线、已停用、未连接；首次连接失败按指数退避自动重试。
- 宿主提供的 MCP 服务器以只读分组展示。
- 简体中文与 English；深浅色跟随 DSH 主题。
