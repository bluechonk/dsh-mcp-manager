// dsh-mcp-manager —— host 半。
//
// 职责：
//  - 维护「MCP 服务器」清单：用户·本机与各工作区各一份 JSON 文件；
//  - 用官方 @deepseek-ai/dsh-mcp-client 在运行期挂载 / 卸载连接，
//    服务器工具以 mcp__<serverName>__<tool> 注册到全局工具表；
//  - 汇总宿主组合里由插件提供的 MCP 行（只读展示，不可编辑）；
//  - 通过同源 HTTP 路由把这一切交给设置页的「MCP 服务器」分区。
//
// 安全：路由只接受本机同源请求；写操作的目标路径由宿主按「已发现的作用域」
// 反查得到，客户端不能指定任意路径。

import { describeTarget, normalizeServerEntry, parseServerDocument, toMcpClientConfig } from './schema.js'
import {
  STORE_DIR_NAME,
  parseScopeId,
  readStore,
  storeFileOf,
  userScope,
  workspaceScope,
  writeStore,
} from './scopes.js'

/** 官方 MCP 客户端插件的包名（运行期由宿主解析）。 */
const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'

/** 插件在宿主里的稳定标识（与包名一致）。 */
export const name = '@bluechonk/dsh-mcp-manager'

/** 依赖的宿主服务：tools 用于统计已注册工具，webServer 用于挂路由。 */
export const inject = ['tools', 'webServer']

/** HTTP 路由前缀。 */
const API_BASE = '/dsh-mcp-manager'

/** 请求体上限。 */
const BODY_LIMIT_BYTES = 512 * 1024

/** 远端可达性探测：缓存时长与单次超时。 */
const PROBE_TTL_MS = 5000
const PROBE_TIMEOUT_MS = 2500

/** 连接超时判定：超过该时长仍是「连接中」即视为失败。 */
const CONNECT_TIMEOUT_MS = 30000

/** 首次连接失败后的自动重试：3 秒起步，翻倍到 60 秒封顶。 */
const RETRY_BASE_MS = 3000
const RETRY_MAX_MS = 60000

/** 批量重挂时单台服务器的等待上限：超过就放行，连接在后台继续。 */
const CONNECT_WAIT_MS = 3000

/** 宿主提供的 MCP 行归类关键词 → 分类键。 */
const PROVIDED_CATEGORY_RULES = [
  [/browser/i, 'browser'],
  [/computer/i, 'computer'],
  [/(doc|word|office)/i, 'document'],
]

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

/**
 * 同源 + 回环守卫：只接受本机同源请求。
 * @param {import('node:http').IncomingMessage} request
 * @returns {boolean}
 */
export function isLoopbackRequest(request) {
  const address = request.socket && request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/**
 * 写 JSON 响应。
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

/**
 * 读取请求体（超限即失败）。
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<string>}
 */
function readBody(request) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let total = 0
    let rejected = false
    request.on('data', (chunk) => {
      if (rejected) return
      total += chunk.length
      if (total > BODY_LIMIT_BYTES) {
        rejected = true
        request.resume()
        reject(new Error('请求体过大'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (!rejected) resolvePromise(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })
}

/**
 * 解析 JSON 请求体。
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonBody(request) {
  const raw = await readBody(request)
  if (raw.trim() === '') return {}
  const parsed = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('请求体必须是 JSON 对象')
  }
  return parsed
}

/**
 * 宿主提供的 MCP 行归类。
 * @param {string} id
 * @returns {string} 分类键
 */
export function providedCategoryOf(id) {
  const text = String(id ?? '')
  for (const [pattern, category] of PROVIDED_CATEGORY_RULES) {
    if (pattern.test(text)) return category
  }
  return 'host'
}

/* ------------------------------------------------------------------ */
/* 插件主体                                                            */
/* ------------------------------------------------------------------ */

/**
 * 解析官方 mcp-client 插件模块。
 *
 * 插件包可能被「链接」到宿主目录树之外（本地开发目录），此时普通的包名解析
 * 找不到宿主安装的 @deepseek-ai/*：宿主 Loader 的解析基址在宿主目录树内，
 * 由它解析才命中运行期解析表。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {Promise<{ apply: Function }>}
 */
export async function resolveMcpClient(ctx) {
  const attempts = []
  const loader = ctx.get('loader')
  if (loader && typeof loader.import === 'function') {
    try {
      const mod = await loader.import(MCP_CLIENT_PACKAGE)
      if (mod && typeof mod.apply === 'function') return mod
      attempts.push('loader.import：模块里没有 apply')
    } catch (error) {
      attempts.push(`loader.import：${String(error)}`)
    }
  }
  try {
    const mod = await import(MCP_CLIENT_PACKAGE)
    if (mod && typeof mod.apply === 'function') return mod
    attempts.push('import：模块里没有 apply')
  } catch (error) {
    attempts.push(`import：${String(error)}`)
  }
  throw new Error(`无法加载 ${MCP_CLIENT_PACKAGE} —— ${attempts.join('；')}`)
}

/**
 * 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export async function apply(ctx) {
  const mcpClient = await resolveMcpClient(ctx)
  const mcpClientApply = mcpClient.apply
  /** serverName → 已挂载的 mcp-client fiber。 */
  const fibers = new Map()
  /** serverName → 运行期状态。 */
  const states = new Map()
  /** serverName → 远端可达性探测缓存。 */
  const probes = new Map()
  /** serverName → 本次连接开始时刻。 */
  const connectingSince = new Map()
  /** serverName → 自动重试定时器。 */
  const retryTimers = new Map()
  /** 同一 serverName 的操作串行化，避免连接/断开互相踩踏。 */
  const queues = new Map()

  /* ---------------- 作用域 ---------------- */

  /** 全部作用域（用户·本机在前，工作区按名称排序）。 */
  function scopes() {
    const list = [userScope()]
    const registry = ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      let workspaces = []
      try {
        workspaces = registry.list() ?? []
      } catch {
        workspaces = []
      }
      for (const workspace of workspaces) {
        const scope = workspaceScope(workspace)
        if (scope) list.push(scope)
      }
    }
    return list
  }

  /**
   * 按 id 找作用域；找不到返回 null。
   * @param {unknown} id
   * @returns {object | null}
   */
  function scopeById(id) {
    const parsed = parseScopeId(id)
    if (!parsed) return null
    return scopes().find((scope) => scope.id === parsed.id) ?? null
  }

  /**
   * 读某作用域的清单。
   * @param {object} scope
   * @returns {{ version: number, servers: object[] }}
   */
  function loadScope(scope) {
    return readStore(storeFileOf(scope))
  }

  /**
   * 写某作用域的清单。
   * @param {object} scope
   * @param {{ version: number, servers: object[] }} data
   */
  function saveScope(scope, data) {
    writeStore(storeFileOf(scope), data)
  }

  /* ---------------- 运行期连接 ---------------- */

  /**
   * 同一 serverName 的操作串行化。
   * @template T
   * @param {string} name
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  function enqueue(name, fn) {
    const previous = queues.get(name) ?? Promise.resolve()
    const next = previous.then(fn, fn)
    queues.set(name, next.then(() => {}, () => {}))
    return next
  }

  /**
   * 已注册工具数（mcp__<serverName>__ 前缀）。
   * @param {string} name
   * @returns {number}
   */
  function toolCountOf(name) {
    const prefix = `mcp__${name}__`
    try {
      return ctx.tools.schemas().filter((schema) => String(schema.name).startsWith(prefix)).length
    } catch {
      return 0
    }
  }

  /**
   * 取消某个服务器的自动重试。
   * @param {string} name
   */
  function clearRetry(name) {
    const timer = retryTimers.get(name)
    if (timer !== undefined) {
      clearTimeout(timer)
      retryTimers.delete(name)
    }
  }

  /**
   * 首次连接失败后按指数退避自动重试，服务器恢复即自动接上。
   * @param {object} entry 归一化后的条目
   * @param {number} attempt 已尝试的次数
   */
  function scheduleRetry(entry, attempt) {
    clearRetry(entry.serverName)
    const delay = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS)
    ctx.logger.info(`dsh-mcp-manager: 服务器「${entry.serverName}」将在 ${Math.round(delay / 1000)} 秒后重试连接`)
    const timer = setTimeout(() => {
      retryTimers.delete(entry.serverName)
      void enqueue(entry.serverName, () => connect(entry, attempt + 1))
    }, delay)
    timer.unref?.()
    retryTimers.set(entry.serverName, timer)
  }

  /**
   * 挂载一个服务器。
   * @param {object} entry 归一化后的条目
   * @param {number} attempt 重试次数（仅用于退避计算）
   * @returns {Promise<void>}
   */
  async function connect(entry, attempt = 1) {
    const name = entry.serverName
    if (fibers.has(name)) return
    clearRetry(name)
    states.delete(name)
    connectingSince.set(name, Date.now())
    let fiber
    try {
      fiber = ctx.plugin(mcpClientApply, toMcpClientConfig(entry))
    } catch (error) {
      connectingSince.delete(name)
      states.set(name, { status: 'error', toolCount: 0, error: error instanceof Error ? error.message : String(error) })
      return
    }
    fibers.set(name, fiber)
    try {
      await fiber
      connectingSince.delete(name)
      const count = toolCountOf(name)
      states.set(name, { status: count > 0 ? 'connected' : 'connecting', toolCount: count })
    } catch (error) {
      fibers.delete(name)
      connectingSince.delete(name)
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined
      const message = cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error)
      states.set(name, { status: 'error', toolCount: 0, error: message })
      ctx.logger.error(`dsh-mcp-manager: 服务器「${name}」启动失败：${message}`)
      void fiber.dispose().catch(() => {})
      scheduleRetry(entry, attempt + 1)
    }
  }

  /**
   * 卸载一个服务器。
   * @param {string} name
   * @returns {Promise<void>}
   */
  async function disconnect(name) {
    clearRetry(name)
    const fiber = fibers.get(name)
    if (!fiber) {
      states.delete(name)
      return
    }
    fibers.delete(name)
    states.delete(name)
    connectingSince.delete(name)
    try {
      await fiber.dispose()
    } catch (error) {
      ctx.logger.warn(`dsh-mcp-manager: 卸载服务器「${name}」时报告：${String(error)}`)
    }
  }

  /**
   * 远端可达性探测（仅 streamable-http）：拿到任意 HTTP 响应即视为进程在线。
   * @param {object} entry
   * @returns {Promise<boolean>}
   */
  async function probeReachable(entry) {
    if (entry.transport !== 'streamable-http' || !entry.url) return true
    const cached = probes.get(entry.serverName)
    if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.reachable
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    let reachable = false
    try {
      const response = await fetch(entry.url, {
        method: 'GET',
        headers: { accept: 'application/json', ...(entry.headers ?? {}) },
        signal: controller.signal,
        redirect: 'manual',
      })
      reachable = true
      void response.body?.cancel().catch(() => {})
    } catch {
      reachable = false
    } finally {
      clearTimeout(timer)
    }
    probes.set(entry.serverName, { reachable, at: Date.now() })
    return reachable
  }

  /**
   * 计算运行期状态。
   * @param {object} entry
   * @returns {{ status: string, toolCount: number, error?: string }}
   */
  function statusOf(entry) {
    const name = entry.serverName
    if (entry.enabled === false) return { status: 'disabled', toolCount: 0 }
    const state = states.get(name)
    if (state && state.status === 'error') return { status: 'error', toolCount: 0, error: state.error }
    if (!fibers.has(name)) {
      const since = connectingSince.get(name)
      if (since !== undefined && Date.now() - since > CONNECT_TIMEOUT_MS) {
        return { status: 'error', toolCount: 0, error: '连接超时' }
      }
      return { status: 'disconnected', toolCount: 0 }
    }
    const toolCount = toolCountOf(name)
    if (toolCount > 0) return { status: 'connected', toolCount }
    return { status: 'connecting', toolCount }
  }

  /**
   * 全量重挂：按作用域顺序把已启用的服务器连上，其余断开。
   *
   * 单个服务器的首次连接可能耗时数十秒（stdio 冷启动、HTTP 握手），
   * 因此每台最多等 3 秒就放行——没连上的继续在后台跑，界面显示「连接中」。
   *
   * @returns {Promise<void>}
   */
  async function syncConnections() {
    const wanted = new Map()
    for (const scope of scopes()) {
      const data = loadScope(scope)
      for (const entry of data.servers) {
        if (entry.enabled === false) continue
        if (wanted.has(entry.serverName)) continue
        wanted.set(entry.serverName, entry)
      }
    }
    for (const [name, fiber] of [...fibers]) {
      if (!wanted.has(name)) {
        fibers.delete(name)
        states.delete(name)
        void fiber.dispose().catch(() => {})
      }
    }
    for (const [name, entry] of wanted) {
      if (fibers.has(name)) continue
      const pending = connect(entry)
      await Promise.race([
        pending.catch(() => {}),
        new Promise((resolve) => { setTimeout(resolve, CONNECT_WAIT_MS).unref?.() }),
      ])
    }
  }

  /* ---------------- 宿主提供的 MCP 行 ---------------- */

  /**
   * 组合里由插件提供的 MCP 行（只读展示）。
   * @returns {object[]}
   */
  function providedServers() {
    const loader = ctx.get('loader')
    if (!loader || typeof loader.entries !== 'function') return []
    const out = []
    for (const entry of loader.entries()) {
      const options = entry.options ?? {}
      if (options.name !== '@deepseek-ai/dsh-mcp-client') continue
      const config = options.config ?? {}
      out.push({
        id: String(options.id ?? ''),
        serverName: String(config.serverName ?? options.id ?? ''),
        transport: String(config.transport ?? ''),
        target: describeTarget(config),
        category: providedCategoryOf(options.id),
        active: Boolean(entry.fiber) && options.disabled !== true,
      })
    }
    return out
  }

  /* ---------------- 路由 ---------------- */

  /**
   * 组装界面需要的完整状态。
   * @param {string | undefined} scopeId
   */
  async function buildState(scopeId) {
    const all = scopes()
    const active = scopeById(scopeId) ?? all[0]
    const scopeViews = []
    for (const scope of all) {
      const data = loadScope(scope)
      scopeViews.push({
        id: scope.id,
        kind: scope.kind,
        title: scope.title,
        path: scope.dir,
        installed: data.servers.length,
      })
    }
    const data = loadScope(active)
    const servers = []
    for (const entry of data.servers) {
      const status = statusOf(entry)
      let finalStatus = status.status
      if (finalStatus === 'connected' && !(await probeReachable(entry))) finalStatus = 'offline'
      servers.push({
        ...entry,
        scope: active.id,
        target: describeTarget(entry),
        status: finalStatus,
        toolCount: status.toolCount,
        error: status.error,
      })
    }
    const provided = providedServers()
    return {
      ok: true,
      scopes: scopeViews,
      activeScope: active.id,
      servers,
      provided,
      totals: { installed: servers.length, provided: provided.length, all: servers.length + provided.length },
      storeDir: STORE_DIR_NAME,
    }
  }

  /**
   * 路由分发。
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    if (!isLoopbackRequest(req)) {
      sendJson(res, 403, { ok: false, error: '仅允许本机同源请求' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://loopback')
    const path = url.pathname.replace(/\/+$/, '')
    const method = req.method ?? 'GET'
    try {
      if (path === `${API_BASE}/state` && method === 'GET') {
        sendJson(res, 200, await buildState(url.searchParams.get('scope') ?? undefined))
        return
      }

      if (path === `${API_BASE}/servers` && method === 'POST') {
        const body = await readJsonBody(req)
        const scope = scopeById(body.scope)
        if (!scope) {
          sendJson(res, 400, { ok: false, error: '作用域不存在', code: 'scope-not-found' })
          return
        }
        const normalized = normalizeServerEntry(body.server)
        if (!normalized.ok) {
          sendJson(res, 400, { ok: false, error: normalized.error, code: normalized.code })
          return
        }
        const data = loadScope(scope)
        if (data.servers.some((entry) => entry.serverName === normalized.value.serverName)) {
          sendJson(res, 409, { ok: false, error: `服务器「${normalized.value.serverName}」已存在`, code: 'duplicate-name' })
          return
        }
        data.servers.push(normalized.value)
        saveScope(scope, data)
        await syncConnections()
        sendJson(res, 200, await buildState(scope.id))
        return
      }

      if (path === `${API_BASE}/servers/update` && method === 'POST') {
        const body = await readJsonBody(req)
        const scope = scopeById(body.scope)
        if (!scope) {
          sendJson(res, 400, { ok: false, error: '作用域不存在', code: 'scope-not-found' })
          return
        }
        const data = loadScope(scope)
        const index = data.servers.findIndex((entry) => entry.serverName === body.serverName)
        if (index < 0) {
          sendJson(res, 404, { ok: false, error: '服务器不存在', code: 'not-found' })
          return
        }
        const normalized = normalizeServerEntry({ ...body.server, serverName: body.serverName })
        if (!normalized.ok) {
          sendJson(res, 400, { ok: false, error: normalized.error, code: normalized.code })
          return
        }
        data.servers[index] = { ...normalized.value, enabled: body.enabled === undefined ? data.servers[index].enabled : body.enabled !== false }
        saveScope(scope, data)
        await syncConnections()
        sendJson(res, 200, await buildState(scope.id))
        return
      }

      if (path === `${API_BASE}/servers/toggle` && method === 'POST') {
        const body = await readJsonBody(req)
        const scope = scopeById(body.scope)
        if (!scope) {
          sendJson(res, 400, { ok: false, error: '作用域不存在', code: 'scope-not-found' })
          return
        }
        const data = loadScope(scope)
        const entry = data.servers.find((item) => item.serverName === body.serverName)
        if (!entry) {
          sendJson(res, 404, { ok: false, error: '服务器不存在', code: 'not-found' })
          return
        }
        entry.enabled = body.enabled !== false
        saveScope(scope, data)
        await syncConnections()
        sendJson(res, 200, await buildState(scope.id))
        return
      }

      if (path === `${API_BASE}/servers/delete` && method === 'POST') {
        const body = await readJsonBody(req)
        const scope = scopeById(body.scope)
        if (!scope) {
          sendJson(res, 400, { ok: false, error: '作用域不存在', code: 'scope-not-found' })
          return
        }
        const data = loadScope(scope)
        const before = data.servers.length
        data.servers = data.servers.filter((entry) => entry.serverName !== body.serverName)
        if (data.servers.length === before) {
          sendJson(res, 404, { ok: false, error: '服务器不存在', code: 'not-found' })
          return
        }
        saveScope(scope, data)
        await syncConnections()
        sendJson(res, 200, await buildState(scope.id))
        return
      }

      if (path === `${API_BASE}/servers/reconnect` && method === 'POST') {
        const body = await readJsonBody(req)
        const scope = scopeById(body.scope)
        if (!scope) {
          sendJson(res, 400, { ok: false, error: '作用域不存在', code: 'scope-not-found' })
          return
        }
        const data = loadScope(scope)
        const entry = data.servers.find((item) => item.serverName === body.serverName)
        if (!entry) {
          sendJson(res, 404, { ok: false, error: '服务器不存在', code: 'not-found' })
          return
        }
        await enqueue(entry.serverName, async () => {
          await disconnect(entry.serverName)
          await connect(entry)
        })
        sendJson(res, 200, await buildState(scope.id))
        return
      }

      if (path === `${API_BASE}/import` && method === 'POST') {
        const body = await readJsonBody(req)
        const scope = scopeById(body.scope)
        if (!scope) {
          sendJson(res, 400, { ok: false, error: '作用域不存在', code: 'scope-not-found' })
          return
        }
        const parsed = parseServerDocument(body.content)
        if (!parsed.ok) {
          sendJson(res, 400, { ok: false, error: parsed.error, code: parsed.code })
          return
        }
        const data = loadScope(scope)
        const imported = []
        const skipped = []
        for (const entry of parsed.servers) {
          if (data.servers.some((item) => item.serverName === entry.serverName)) {
            skipped.push(entry.serverName)
            continue
          }
          data.servers.push(entry)
          imported.push(entry.serverName)
        }
        saveScope(scope, data)
        await syncConnections()
        const state = await buildState(scope.id)
        sendJson(res, 200, { ...state, imported, skipped })
        return
      }

      sendJson(res, 404, { ok: false, error: '未找到该接口' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 400, { ok: false, error: message })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_BASE, handler: handle }), 'dsh-mcp-manager: routes')

  // 连接与探测缓存都归本插件所有：卸载时全部断开，工具随之注销。
  ctx.effect(() => () => {
    for (const timer of retryTimers.values()) clearTimeout(timer)
    retryTimers.clear()
    for (const fiber of fibers.values()) {
      void fiber.dispose().catch(() => {})
    }
    fibers.clear()
    states.clear()
    probes.clear()
    connectingSince.clear()
    queues.clear()
  }, 'dsh-mcp-manager: connections')

  // 启动时把各作用域里已启用的服务器连上。
  void syncConnections().catch((error) => {
    ctx.logger.error(`dsh-mcp-manager: 启动连接失败：${String(error)}`)
  })
}
