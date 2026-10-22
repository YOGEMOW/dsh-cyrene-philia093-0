/**
 * 能力快照漂移检测测试（第 5 步）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  checkDrift,
  checkPresetDrift,
  idsFromDocument,
  loadSnapshot,
  snapshotIds,
} from '../host/drift.mjs'
import { apply as hostApply } from '../host/index.mjs'

/** 把快照渲染成类似 readDocument 的 entry-list 文本。 */
function documentFor(base, { dropId = '' } = {}) {
  const snapshot = loadSnapshot(base)
  const lines = []
  const walk = (rows, indent) => {
    for (const row of rows ?? []) {
      if (row?.id === dropId) continue
      lines.push(`${' '.repeat(indent)}- id: '${row.id}'`)
      if (row?.group === true && Array.isArray(row.config)) walk(row.config, indent + 2)
    }
  }
  walk(snapshot.plugins, 0)
  return lines.join('\n')
}

const fakeAgentPresets = (documents) => ({
  async readDocument(base) {
    if (documents[base] === undefined) throw new Error(`no preset ${base}`)
    return { content: documents[base] }
  },
})

test('快照 id 提取：含组内子行；文档扫描只认行首 - id:', () => {
  const snapshot = loadSnapshot('standard')
  const ids = snapshotIds(snapshot)
  assert.equal(ids.length, 32)
  assert.equal(ids.includes('tool-fs'), true)
  assert.equal(ids.includes('compaction-basic'), true)

  const doc = [
    "- id: 'persona'",
    '    prefix: |',
    '      正文里的 - id: 假命中',
    "  - id: 'planning'",
    '    config:',
    "      - id: 'plan-mode'",
  ].join('\n')
  assert.deepEqual(idsFromDocument(doc), ['persona', 'planning', 'plan-mode'])
})

test('单预设对比：一致 / 缺行 / 多行', async () => {
  const ok = await checkPresetDrift(fakeAgentPresets({ standard: documentFor('standard') }), 'standard')
  assert.equal(ok.ok, true)
  assert.equal(ok.missing.length, 0)
  assert.equal(ok.live, 32)

  const missing = await checkPresetDrift(fakeAgentPresets({ standard: documentFor('standard', { dropId: 'tool-fs' }) }), 'standard')
  assert.equal(missing.ok, false)
  assert.deepEqual(missing.missing, ['tool-fs'])

  const extra = await checkPresetDrift(
    fakeAgentPresets({ standard: `${documentFor('standard')}\n- id: 'brand-new-tool'` }),
    'standard',
  )
  assert.equal(extra.ok, false)
  assert.deepEqual(extra.extra, ['brand-new-tool'])
})

test('checkDrift：两个 base 都对比；readDocument 失败算漂移', async () => {
  const report = await checkDrift(fakeAgentPresets({
    standard: documentFor('standard'),
    cordis: documentFor('cordis'),
  }))
  assert.equal(report.ok, true)
  assert.equal(report.presets.length, 2)

  const broken = await checkDrift(fakeAgentPresets({ standard: documentFor('standard') }))
  assert.equal(broken.ok, false)
  assert.equal(broken.presets.find((item) => item.base === 'cordis').error.includes('no preset'), true)
})

test('宿主：漂移报告写进 service.diagnostics', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-drift-home-'))
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const provided = []
    const services = {
      agentPresets: fakeAgentPresets({ standard: documentFor('standard'), cordis: documentFor('cordis') }),
    }
    const ctx = {
      logger: { info() {}, warn() {} },
      provide(name, value) {
        provided.push({ name, value })
        return () => {}
      },
      inject(names, callback) {
        if (!names.every((name) => services[name] !== undefined)) return
        const scope = { ...ctx }
        for (const name of names) scope[name] = services[name]
        callback(scope)
      },
    }
    hostApply(ctx, {})
    const service = provided.find((item) => item.name === 'cyreneMemory').value
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(service.diagnostics.drift.ok, true)
    assert.equal(service.diagnostics.drift.presets.length, 2)
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
    fs.rmSync(home, { recursive: true, force: true })
  }
})
