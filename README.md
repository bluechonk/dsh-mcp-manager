# dsh-mcp-manager

DeepSeek Harness 插件：设置页「模型」正下方的「MCP 服务器」分区——管理 MCP 服务器，运行期直接挂载，无需重启宿主。

## 能力

- 作用域切换：用户·本机与各工作区各管各的清单
- 新建/编辑：表单与 JSON 双模式，JSON 支持直接粘贴 `{"server-name": {...}}` 或 `{"mcpServers": {"server-name": {...}}}`
- 导入既有配置：一次粘贴多条
- 启停、重新连接、删除：停用即断开并注销该服务器的全部工具
- 状态可视：已连接（带工具数）/ 连接中 / 连接失败 / 离线 / 已停用 / 未连接
- 宿主提供的 MCP 服务器以只读分组展示，标明由哪个插件提供；启动失败的显示「MCP 进程启动失败。」
- 简体中文与 English，深浅色跟随 DSH 主题

## 截图

![服务器列表](docs/images/01-服务器列表.png)

![新建表单](docs/images/02-新建-表单模式.png)

## 安装

### 人类安装

```sh
dsh plugin --profile desktop add @bluechonk/dsh-mcp-manager
```

装完后在设置页「模型」正下方就能看到「MCP 服务器」分区。

从源码安装（本地目录会被 pnpm 以链接方式装进 profile）：

```sh
dsh plugin --profile desktop add /path/to/dsh-mcp-manager
```

### AI 助手安装

1. 先读本文件全文（尤其「已知限制」）。
2. 用 `plugin_manager` 的 `install_bundle`，target 传本包目录的绝对路径。
3. 读安装结果：`application` 为 `applied` 才算装好；`failed` 时按 `error.diagnostic` 排查后重装同一个包，不要新建副本。
4. 用 `cordis_inspect_query`（Slots.listSubTree，根 `settings.section`）确认 `dsh-mcp-manager` 出现在列表里。
5. 验证连接：新建一个服务器后，`cordis_inspect_query`（Tool.listTools）应出现 `mcp__<serverName>__<tool>`。

## 配置存放位置

```
用户·本机   <DSH_HOME>/mcp-manager/servers.json
工作区      <工作区目录>/.dsh/mcp-manager/servers.json
```

## 内部机制

- 连接层直接用官方 `@deepseek-ai/dsh-mcp-client`，不自研 MCP 协议。
- 运行期通过 `ctx.plugin(mcpClientApply, config)` 挂载，工具以 `mcp__<serverName>__<tool>` 注册到全局工具表。
- Host 半挂同源路由 `/dsh-mcp-manager/*`，只接受本机同源请求；Client 半注册 `settings.section`（order 10.5，紧贴「模型」下方）。
- 全部视觉用 `--dsw-alias-*` 令牌，不硬编码颜色。

细节见 [docs/设计与验证.md](docs/设计与验证.md)。

## 已知限制

- DSH 的工具注册表是进程级的：作用域只决定清单存放位置，不能把工具限定在某个工作区。
- 同名服务器以作用域顺序靠前者为准（用户·本机优先），另一条会被标记为连接失败。
- 协议版本由官方 SDK 自动协商，界面固定显示「自动（推荐）」，不可手动指定。
- 不支持 OAuth 2.0 授权流程（只支持静态请求头）。

## 开发

```sh
npm test        # node --test：schema / scopes / client 三组单测
npm run check   # 语法检查
```

client 半是单文件自包含，测试用最小 React 桩物化 `__ModuleLoader__` 工厂后直测 `__pure` 导出面。

## 许可证

MIT
