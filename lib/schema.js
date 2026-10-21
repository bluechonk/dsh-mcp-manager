// MCP 服务器条目的归一化、校验与 JSON 文档解析（纯函数，不依赖宿主）。
//
// 宿主半用它把「界面表单」「粘贴的 JSON」两种输入统一成同一条内部记录，
// 再投影成官方 @deepseek-ai/dsh-mcp-client 的 Config。纯函数部分可单测。

/** serverName 命名空间规则（与 mcp-client 一致）：[A-Za-z0-9_-]{1,32}。 */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** 单次工具调用的默认超时（毫秒）。 */
export const DEFAULT_TOOL_TIMEOUT_MS = 30000

/** 支持的传输方式。 */
export const TRANSPORTS = ['stdio', 'streamable-http']

/** 表单里的类型标签 → 传输方式。 */
const TRANSPORT_ALIASES = new Map([
  ['stdio', 'stdio'],
  ['local', 'stdio'],
  ['command', 'stdio'],
  ['streamable-http', 'streamable-http'],
  ['streamable_http', 'streamable-http'],
  ['http', 'streamable-http'],
  ['https', 'streamable-http'],
  ['remote', 'streamable-http'],
])

/**
 * 归一化传输方式。
 * @param {unknown} value
 * @returns {string} 合法传输方式，空串表示无法识别
 */
export function normalizeTransport(value) {
  const text = String(value ?? '').trim().toLowerCase()
  return TRANSPORT_ALIASES.get(text) ?? ''
}

/**
 * 按空格切分参数串，双引号包裹的整段视为一个参数。
 * @param {unknown} value
 * @returns {string[]}
 */
export function splitArgs(value) {
  if (Array.isArray(value)) return value.map((item) => String(item))
  const text = String(value ?? '').trim()
  if (text === '') return []
  const out = []
  let current = ''
  let quoted = false
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && /\s/.test(char)) {
      if (current !== '') {
        out.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current !== '') out.push(current)
  return out
}

/**
 * 把任意 JSON 值转成字符串字典（环境变量、请求头用）。
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function toStringDict(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue
    if (typeof item === 'object') continue
    out[String(key)] = String(item)
  }
  return out
}

/**
 * 按字段推断传输方式：带 command 是本地命令，带 url 是远程服务。
 * @param {Record<string, unknown>} raw
 * @returns {string} 传输方式；无法判断时返回空串
 */
export function inferTransport(raw) {
  const source = raw ?? {}
  if (typeof source.command === 'string' && source.command.trim() !== '') return 'stdio'
  if (typeof source.url === 'string' && source.url.trim() !== '') return 'streamable-http'
  return ''
}

/**
 * 归一化单个服务器条目。
 *
 * @param {unknown} input 原始条目（表单字段或 JSON 片段）
 * @param {{ fallbackName?: string, requireName?: boolean }} options
 * @returns {{ ok: true, value: object } | { ok: false, error: string, code: string }}
 */
export function normalizeServerEntry(input, options = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '服务器配置必须是对象', code: 'not-object' }
  }
  const raw = input
  const serverName = String(raw.serverName ?? raw.name ?? options.fallbackName ?? '').trim()
  if (serverName === '') {
    return { ok: false, error: '缺少服务器名称', code: 'missing-name' }
  }
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    return { ok: false, error: `服务器名称「${serverName}」不合法：只允许字母、数字、下划线与连字符，且不超过 32 个字符`, code: 'invalid-name' }
  }

  // 传输方式：显式写了 type/transport 就用它；没写则按字段推断——
  // 有 command 是本地命令（stdio），有 url 是远程服务（streamable-http）。
  // 这样 Claude Code / VS Code 那种不带 type 的 mcpServers 配置也能直接粘贴。
  const declared = raw.transport ?? raw.type
  const transport = declared === undefined || declared === null || String(declared).trim() === ''
    ? inferTransport(raw)
    : normalizeTransport(declared)
  if (transport === '') {
    return { ok: false, error: `不支持的连接类型「${String(declared)}」`, code: 'invalid-transport' }
  }

  const timeoutRaw = raw.toolCallTimeoutMs ?? raw.timeoutMs ?? raw.timeout
  let toolCallTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS
  if (timeoutRaw !== undefined && timeoutRaw !== null && timeoutRaw !== '') {
    const value = Number(timeoutRaw)
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: '超时时间必须是正整数（毫秒）', code: 'invalid-timeout' }
    }
    toolCallTimeoutMs = Math.round(value)
  }

  const value = {
    serverName,
    transport,
    toolCallTimeoutMs,
    enabled: raw.enabled === undefined ? true : raw.enabled !== false,
  }

  if (transport === 'stdio') {
    const command = String(raw.command ?? '').trim()
    if (command === '') {
      return { ok: false, error: '本地命令类型必须填写命令', code: 'missing-command' }
    }
    value.command = command
    value.args = splitArgs(raw.args)
    value.env = toStringDict(raw.env)
    const cwd = String(raw.cwd ?? '').trim()
    if (cwd !== '') value.cwd = cwd
  } else {
    const url = String(raw.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: '远程服务类型必须填写 http:// 或 https:// 开头的地址', code: 'invalid-url' }
    }
    value.url = url
    value.headers = toStringDict(raw.headers)
  }
  return { ok: true, value }
}

/**
 * 投影成官方 mcp-client 的 Config。
 * @param {object} entry 归一化后的条目
 * @returns {object}
 */
export function toMcpClientConfig(entry) {
  const base = {
    serverName: entry.serverName,
    transport: entry.transport,
    toolCallTimeoutMs: entry.toolCallTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    // 首次连接失败不炸掉整棵插件树：状态由宿主半记录并展示在界面上。
    failOnStartupError: false,
  }
  if (entry.transport === 'stdio') {
    return {
      ...base,
      command: entry.command,
      args: entry.args ?? [],
      env: entry.env ?? {},
      cwd: entry.cwd ?? '',
    }
  }
  return { ...base, url: entry.url, headers: entry.headers ?? {} }
}

/**
 * 解析粘贴的 JSON 文档，支持三种常见形状：
 *   1. {"mcpServers": {"name": {...}}}      —— Claude / VS Code 风格
 *   2. {"name": {...}, "other": {...}}      —— 扁平映射
 *   3. 单个扁平配置（含 serverName）        —— 单条服务器
 *
 * @param {string} text
 * @returns {{ ok: true, servers: object[] } | { ok: false, error: string, code: string }}
 */
export function parseServerDocument(text) {
  const source = String(text ?? '').trim()
  if (source === '') {
    return { ok: false, error: '内容为空', code: 'empty' }
  }
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    return { ok: false, error: '不是合法的 JSON', code: 'invalid-json' }
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'JSON 顶层必须是对象', code: 'not-object' }
  }

  const containers = []
  if (!Array.isArray(parsed) && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
    containers.push(parsed.mcpServers)
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) containers.push({ '': item })
  } else {
    const mapping = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'mcpServers') continue
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        mapping[key] = value
      }
    }
    if (Object.keys(mapping).length > 0) containers.push(mapping)
  }

  if (containers.length === 0) {
    return { ok: false, error: '没有找到任何服务器配置', code: 'empty-document' }
  }

  const servers = []
  const errors = []
  for (const container of containers) {
    for (const [key, value] of Object.entries(container)) {
      const result = normalizeServerEntry(value, { fallbackName: key === '' ? undefined : key })
      if (result.ok) servers.push(result.value)
      else errors.push(`${key || '(未命名)'}：${result.error}`)
    }
  }
  if (servers.length === 0) {
    return { ok: false, error: errors[0] ?? '没有找到任何服务器配置', code: 'invalid-entry' }
  }
  return { ok: true, servers, errors }
}

/**
 * 条目的连接目标摘要（卡片副标题用）。
 * @param {object} entry
 * @returns {string}
 */
export function describeTarget(entry) {
  if (!entry) return ''
  if (entry.transport === 'stdio') {
    const args = Array.isArray(entry.args) ? entry.args : []
    return [entry.command, ...args].filter(Boolean).join(' ')
  }
  return String(entry.url ?? '')
}
