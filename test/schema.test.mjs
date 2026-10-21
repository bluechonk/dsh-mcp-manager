// schema.js 的单元测试：条目归一化、JSON 文档解析、mcp-client 配置投影。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_TOOL_TIMEOUT_MS,
  describeTarget,
  inferTransport,
  normalizeServerEntry,
  normalizeTransport,
  parseServerDocument,
  splitArgs,
  toMcpClientConfig,
  toStringDict,
} from '../lib/schema.js'

test('normalizeTransport 认得常见别名', () => {
  assert.equal(normalizeTransport('stdio'), 'stdio')
  assert.equal(normalizeTransport('local'), 'stdio')
  assert.equal(normalizeTransport('http'), 'streamable-http')
  assert.equal(normalizeTransport('STREAMABLE-HTTP'), 'streamable-http')
  assert.equal(normalizeTransport('sse'), '')
})

test('splitArgs 按空格切分并保留引号整段', () => {
  assert.deepEqual(splitArgs('-y @modelcontextprotocol/server-memory'), ['-y', '@modelcontextprotocol/server-memory'])
  assert.deepEqual(splitArgs('  '), [])
  assert.deepEqual(splitArgs('--flag "a b"'), ['--flag', 'a b'])
  assert.deepEqual(splitArgs(['x', 'y']), ['x', 'y'])
})

test('toStringDict 只保留标量值', () => {
  assert.deepEqual(toStringDict({ A: '1', B: 2, C: null, D: { x: 1 } }), { A: '1', B: '2' })
  assert.deepEqual(toStringDict([1, 2]), {})
})

test('normalizeServerEntry 归一化 stdio 条目', () => {
  const result = normalizeServerEntry({
    serverName: 'memory',
    type: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-memory',
    env: { KEY: 'value' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.transport, 'stdio')
  assert.deepEqual(result.value.args, ['-y', '@modelcontextprotocol/server-memory'])
  assert.deepEqual(result.value.env, { KEY: 'value' })
  assert.equal(result.value.toolCallTimeoutMs, DEFAULT_TOOL_TIMEOUT_MS)
  assert.equal(result.value.enabled, true)
})

test('normalizeServerEntry 拒绝非法名称与缺失命令', () => {
  const badName = normalizeServerEntry({ serverName: 'bad name', transport: 'stdio', command: 'x' })
  assert.equal(badName.ok, false)
  assert.equal(badName.code, 'invalid-name')

  const noCommand = normalizeServerEntry({ serverName: 'ok', transport: 'stdio' })
  assert.equal(noCommand.ok, false)
  assert.equal(noCommand.code, 'missing-command')

  const badUrl = normalizeServerEntry({ serverName: 'ok', transport: 'streamable-http', url: 'ftp://x' })
  assert.equal(badUrl.ok, false)
  assert.equal(badUrl.code, 'invalid-url')
})

test('toMcpClientConfig 输出官方 mcp-client 需要的字段', () => {
  const entry = normalizeServerEntry({ serverName: 'memory', type: 'stdio', command: 'npx', args: '-y pkg' }).value
  const config = toMcpClientConfig(entry)
  assert.equal(config.serverName, 'memory')
  assert.equal(config.transport, 'stdio')
  assert.equal(config.command, 'npx')
  assert.deepEqual(config.args, ['-y', 'pkg'])
  assert.equal(config.failOnStartupError, false)
})

test('parseServerDocument 支持 mcpServers 与扁平映射', () => {
  const withWrapper = parseServerDocument(JSON.stringify({
    mcpServers: { alpha: { type: 'stdio', command: 'npx', args: ['-y', 'a'] } },
  }))
  assert.equal(withWrapper.ok, true)
  assert.equal(withWrapper.servers.length, 1)
  assert.equal(withWrapper.servers[0].serverName, 'alpha')

  const flat = parseServerDocument(JSON.stringify({
    beta: { type: 'streamable-http', url: 'http://127.0.0.1:8080/mcp' },
  }))
  assert.equal(flat.ok, true)
  assert.equal(flat.servers[0].serverName, 'beta')
  assert.equal(flat.servers[0].transport, 'streamable-http')
})

test('parseServerDocument 拒绝非法输入', () => {
  assert.equal(parseServerDocument('').code, 'empty')
  assert.equal(parseServerDocument('{oops').code, 'invalid-json')
  assert.equal(parseServerDocument('[]').code, 'empty-document')
  assert.equal(parseServerDocument('{}').code, 'empty-document')
})

test('不写 type/transport 时按字段推断传输方式', () => {
  assert.equal(inferTransport({ command: 'npx' }), 'stdio')
  assert.equal(inferTransport({ url: 'http://127.0.0.1:8080/mcp' }), 'streamable-http')
  assert.equal(inferTransport({}), '')

  // Claude Code / VS Code 常见的 mcpServers 形状不带 type，必须能直接粘贴
  const inferred = normalizeServerEntry({ command: 'npx', args: ['-y', '@playwright/mcp@latest'] }, { fallbackName: 'playwright' })
  assert.equal(inferred.ok, true)
  assert.equal(inferred.value.transport, 'stdio')
  assert.equal(inferred.value.serverName, 'playwright')
})

test('parseServerDocument 认得不带 type 的 Claude 风格配置', () => {
  const parsed = parseServerDocument(JSON.stringify({
    mcpServers: {
      playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
    },
  }))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.servers[0].serverName, 'playwright')
  assert.equal(parsed.servers[0].transport, 'stdio')
  assert.deepEqual(parsed.servers[0].args, ['-y', '@playwright/mcp@latest'])
})

test('describeTarget 给出命令或地址', () => {
  const stdio = normalizeServerEntry({ serverName: 'a', type: 'stdio', command: 'npx', args: '-y pkg' }).value
  assert.equal(describeTarget(stdio), 'npx -y pkg')
  const http = normalizeServerEntry({ serverName: 'b', transport: 'streamable-http', url: 'http://x/mcp' }).value
  assert.equal(describeTarget(http), 'http://x/mcp')
})
