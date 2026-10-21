// scopes.js 的单元测试：作用域 id 解析、清单路径、清单读写。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  STORE_DIR_NAME,
  parseScopeId,
  readStore,
  storeFileOf,
  userScope,
  workspaceScope,
  writeStore,
} from '../lib/scopes.js'

test('parseScopeId 认得用户与工作区作用域', () => {
  assert.deepEqual(parseScopeId('user'), { kind: 'user', id: 'user' })
  assert.deepEqual(parseScopeId(''), { kind: 'user', id: 'user' })
  assert.deepEqual(parseScopeId('ws:abc'), { kind: 'workspace', id: 'ws:abc', workspaceId: 'abc' })
  assert.equal(parseScopeId('ws:'), null)
  assert.equal(parseScopeId('other'), null)
})

test('userScope 落在 DSH_HOME 下', () => {
  const scope = userScope({ dshHome: '/tmp/dsh-home' })
  assert.equal(scope.id, 'user')
  assert.equal(scope.kind, 'user')
  assert.equal(scope.dir, '/tmp/dsh-home')
  assert.equal(storeFileOf(scope), join('/tmp/dsh-home', STORE_DIR_NAME, 'servers.json'))
})

test('workspaceScope 需要 id 与路径', () => {
  assert.equal(workspaceScope({ id: 'w1' }), null)
  assert.equal(workspaceScope({ path: '/tmp/ws' }), null)
  const scope = workspaceScope({ id: 'w1', path: '/tmp/ws', title: 'demo' })
  assert.equal(scope.id, 'ws:w1')
  assert.equal(scope.kind, 'workspace')
  assert.equal(scope.title, 'demo')
  assert.equal(storeFileOf(scope), join('/tmp/ws', '.dsh', STORE_DIR_NAME, 'servers.json'))
})

test('清单读写：缺失或损坏时回落到空清单', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dmm-'))
  try {
    const file = join(dir, 'nested', 'servers.json')
    assert.deepEqual(readStore(file), { version: 1, servers: [] })
    writeStore(file, { version: 1, servers: [{ serverName: 'a' }] })
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(parsed.servers.length, 1)
    assert.equal(parsed.servers[0].serverName, 'a')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
