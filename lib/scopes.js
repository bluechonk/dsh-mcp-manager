// 作用域与清单文件：用户·本机 + 各工作区。
//
// 作用域决定「清单存在哪」与「界面当前看哪一份」：
//   用户·本机  <DSH_HOME>/mcp-manager/servers.json
//   工作区     <工作区目录>/.dsh/mcp-manager/servers.json
//
// 运行期连接是进程级的（DSH 的工具注册表全局唯一），因此所有作用域里
// 已启用的服务器都会挂载；同名时以作用域顺序靠前者为准。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 用户作用域的固定 id。 */
export const USER_SCOPE_ID = 'user'

/** 清单文件相对作用域根的目录名。 */
export const STORE_DIR_NAME = 'mcp-manager'

/** 清单文件名。 */
export const STORE_FILE_NAME = 'servers.json'

/**
 * 解析作用域 id：'user' 或 'ws:<workspaceId>'。
 * @param {unknown} value
 * @returns {{ kind: 'user' | 'workspace', id: string } | null}
 */
export function parseScopeId(value) {
  const text = String(value ?? '').trim()
  if (text === '' || text === USER_SCOPE_ID) return { kind: 'user', id: USER_SCOPE_ID }
  if (text.startsWith('ws:')) {
    const rest = text.slice(3)
    return rest === '' ? null : { kind: 'workspace', id: text, workspaceId: rest }
  }
  return null
}

/**
 * 用户作用域。
 * @param {{ dshHome?: string }} options
 * @returns {{ id: string, kind: string, dir: string, title: string }}
 */
export function userScope(options = {}) {
  const dshHome = options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh')
  return { id: USER_SCOPE_ID, kind: 'user', dir: dshHome, title: '' }
}

/**
 * 工作区作用域。
 * @param {{ id: string, path?: string, title?: string }} workspace
 * @returns {{ id: string, kind: string, dir: string, title: string } | null} 路径缺失时返回 null
 */
export function workspaceScope(workspace) {
  if (!workspace || typeof workspace !== 'object') return null
  const path = String(workspace.path ?? workspace.directory ?? workspace.root ?? '').trim()
  if (path === '') return null
  const id = String(workspace.id ?? '').trim()
  if (id === '') return null
  return {
    id: `ws:${id}`,
    kind: 'workspace',
    dir: path,
    title: String(workspace.title ?? workspace.name ?? ''),
    workspaceId: id,
  }
}

/**
 * 作用域清单文件的绝对路径。
 * @param {{ dir: string }} scope
 * @returns {string}
 */
export function storeFileOf(scope) {
  const base = scope.kind === 'workspace' ? join(scope.dir, '.dsh') : scope.dir
  return join(base, STORE_DIR_NAME, STORE_FILE_NAME)
}

/**
 * 读取清单文件；文件缺失或损坏时返回空清单（不抛错，界面照常显示空态）。
 * @param {string} file
 * @returns {{ version: number, servers: object[] }}
 */
export function readStore(file) {
  const empty = { version: 1, servers: [] }
  try {
    if (!existsSync(file)) return empty
    // Windows 编辑器与 PS 5.1 会写 BOM，JSON.parse 不认，先剥掉。
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    if (text.trim() === '') return empty
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.servers)) return empty
    return { version: 1, servers: parsed.servers }
  } catch {
    return empty
  }
}

/**
 * 原子写清单文件（先写临时文件再改名，避免半截文件）。
 * @param {string} file
 * @param {{ version: number, servers: object[] }} data
 */
export function writeStore(file, data) {
  const dir = file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')))
  if (dir) mkdirSync(dir, { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
}
