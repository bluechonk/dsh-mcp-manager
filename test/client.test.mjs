// client.test.mjs —— client/client.js 的 __pure 直测面（零 DOM、零 npm 依赖）。
//
// 物化手法：client.js 顶层就摸 window.__ModuleLoader__.load({id, factory})，factory 收一个
// require 并从 "react" 拉桩。这里伪造最小宿主全局把 factory 跑一遍，捕获返回的
// module.exports，再从 __pure 取纯函数直调。

import test from 'node:test'
import assert from 'node:assert/strict'

// —— 最小 React 桩：只按 client.js 实际摸到的面给 ——
const reactStub = {
  Component: class {},
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  createElement: (t, p, ...c) => ({ t, p, c }),
}
const stubRequire = (id) => {
  if (id === 'react') return reactStub
  if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  throw new Error('client.test 桩未覆盖的 require：' + id)
}

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load: (def) => { captured = def.factory(stubRequire) },
  },
}
await import('../client/client.js')
delete globalThis.window
assert.ok(captured !== null && captured.__pure !== undefined, '桩物化失败：client.js 的 factory 未被宿主 load 调到')
const P = captured.__pure

test('__pure 导出面固定（防导出漂移）', () => {
  assert.deepEqual(Object.keys(P).sort(), ['fallbackT', 'interpolate', 'jsonTemplate', 'localeDict', 'localeNs', 'localizeError', 'tr'])
  assert.ok(Object.isFrozen(P))
})

test('中英词典键完全一致（缺一即视为漏翻）', () => {
  const zh = Object.keys(P.localeDict.zh).sort()
  const en = Object.keys(P.localeDict.en).sort()
  assert.deepEqual(en, zh)
  assert.ok(zh.length > 60, `词典条目过少：${zh.length}`)
})

test('中英词典没有空文案', () => {
  for (const [locale, dict] of Object.entries(P.localeDict)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${locale}.${key} 不是字符串`)
      assert.notEqual(value.trim(), '', `${locale}.${key} 为空`)
    }
  }
})

test('interpolate 填占位符，未命中的保留原样', () => {
  assert.equal(P.interpolate('共 {n} 个', { n: 3 }), '共 3 个')
  assert.equal(P.interpolate('共 {n} 个', { m: 3 }), '共 {n} 个')
  assert.equal(P.interpolate('无占位符'), '无占位符')
})

test('fallbackT 无宿主 t 时输出中文', () => {
  const t = P.fallbackT()
  assert.equal(t('section.title'), 'MCP 服务器')
  assert.equal(t('section.installed'), '已安装')
  assert.equal(t('not-exist-key'), 'not-exist-key')
})

test('tr 用传入的 t（宿主注入的翻译器）取文案', () => {
  const fake = (key, params) => 'EN:' + key + (params ? ':' + JSON.stringify(params) : '')
  assert.equal(P.tr(fake, 'section.title'), 'EN:section.title')
  assert.equal(P.tr(fake, 'status.connected', { n: 2 }), 'EN:status.connected:{"n":2}')
  // 没有 t 时退回中文兜底
  assert.equal(P.tr(null, 'section.title'), 'MCP 服务器')
})

test('localizeError 按 code 取本地化文案，缺 code 退回原文', () => {
  const error = new Error('boom')
  error.code = 'invalid-name'
  assert.equal(P.localizeError(error), P.localeDict.zh['error.invalid-name'])
  assert.equal(P.localizeError(new Error('raw message')), 'raw message')
  assert.equal(P.localizeError(null), P.localeDict.zh['error.internal-error'])
})

test('localeNs 与宿主注册项一致', () => {
  assert.equal(P.localeNs, 'dsh-mcp-manager')
})

test('JSON 模板是可解析的合法 JSON，且形状与 ZCode 模板一致', () => {
  const parsed = JSON.parse(P.jsonTemplate)
  const names = Object.keys(parsed)
  assert.equal(names.length, 1)
  assert.equal(names[0], 'my-mcp-server')
  assert.equal(parsed['my-mcp-server'].type, 'stdio')
  assert.deepEqual(parsed['my-mcp-server'].args, [])
})

test('英文词典里分组文案覆盖宿主归类键', () => {
  for (const key of ['browser', 'computer', 'document', 'host']) {
    assert.ok(P.localeDict.en['group.' + key], `缺少英文分组文案 group.${key}`)
    assert.ok(P.localeDict.zh['group.' + key], `缺少中文分组文案 group.${key}`)
  }
})
