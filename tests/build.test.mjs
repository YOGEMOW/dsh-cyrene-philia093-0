/**
 * 构建器测试（第 2 步验收）：
 *   - 生成物与仓库里的 cordis.patch.yml 逐字一致；
 *   - persona 与 persona/*.md 逐字一致（sealed：complete: true、无 suffix）；
 *   - 能力行与 modes/base/ 快照逐字段一致（除 persona）；
 *   - 预设 id / order / 名称固定；生成确定性；无 tab/CRLF。
 *
 * 不 spawn 子进程、不依赖 DSH 安装，可在任何机器跑。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildDeclaration,
  buildPatch,
  loadModes,
  repoRoot,
} from '../scripts/build-lib.mjs'

const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n?/g, '\n')

test('生成物与 cordis.patch.yml 逐字一致（npm run build 后才能过）', async () => {
  const next = await buildPatch()
  assert.equal(read('cordis.patch.yml'), next)
})

test('预设定义：id / 名称 / order / base 固定，且与契约一致', async () => {
  const modes = await loadModes()
  assert.deepEqual(modes.map((m) => m.id), ['chat', 'cyrene-work'])
  const byId = Object.fromEntries(modes.map((m) => [m.id, m]))
  assert.equal(byId.chat.loaderId, 'preset-cyrene-chat')
  assert.equal(byId['cyrene-work'].loaderId, 'preset-cyrene-work')
  assert.equal(byId.chat.order, 5)
  assert.equal(byId['cyrene-work'].order, 6)
  assert.equal(byId.chat.base, 'standard')
  assert.equal(byId['cyrene-work'].base, 'cordis')
  assert.equal(byId.chat.persona, 'persona/chat.md')
  assert.equal(byId['cyrene-work'].persona, 'persona/work.md')
  for (const mode of modes) {
    assert.equal(mode.name.length > 0, true)
    assert.equal(mode.description.length > 0, true)
  }
})

test('sealed：两个预设的 persona 都是 complete:true、includeRuntimeContext:true、无 suffix', async () => {
  const modes = await loadModes()
  for (const mode of modes) {
    const decl = buildDeclaration(mode)
    const persona = decl.config.plugins.find((row) => row.id === 'persona')
    assert.ok(persona, `${mode.id} 必须有 persona 行`)
    assert.deepEqual(Object.keys(persona.config).sort(), ['complete', 'includeRuntimeContext', 'prefix'])
    assert.equal(persona.config.complete, true)
    assert.equal(persona.config.includeRuntimeContext, true)
    assert.equal(persona.config.prefix, read(mode.persona), `${mode.id} persona 必须与源文件逐字一致`)
  }
})

test('能力行：与内置快照逐字段一致（只替换 persona，尾部追加昔涟行）', async () => {
  const modes = await loadModes()
  for (const mode of modes) {
    const snapshot = JSON.parse(read(`modes/base/${mode.base}.plugins.json`))
    const decl = buildDeclaration(mode)
    const tailCount = (mode.tail ?? []).length
    assert.equal(
      decl.config.plugins.length,
      snapshot.plugins.length + tailCount,
      `${mode.id} 行数 = 内置快照 + tail`,
    )
    for (let i = 0; i < snapshot.plugins.length; i += 1) {
      const expected = structuredClone(snapshot.plugins[i])
      const actual = structuredClone(decl.config.plugins[i])
      if (expected.id === 'persona') {
        // persona 被替换，其余字段（id/name）不能变。
        assert.equal(actual.id, 'persona')
        assert.equal(actual.name, expected.name)
        continue
      }
      if (expected.id === 'planning') {
        // planning 组被追加了计划桥：先比对原有子行，再看追加行。
        assert.deepEqual(actual.isolate, expected.isolate)
        const baseChildren = expected.config
        for (let j = 0; j < baseChildren.length; j += 1) {
          assert.deepEqual(actual.config[j], baseChildren[j], `${mode.id}/planning/${baseChildren[j].id} 不一致`)
        }
        continue
      }
      assert.deepEqual(actual, expected, `${mode.id}/${expected.id} 与内置快照不一致`)
    }
    // tail 行：只允许昔涟运行时行。
    const tail = decl.config.plugins.slice(snapshot.plugins.length)
    assert.deepEqual(tail.map((row) => row.id), ['cyrene-runtime'])
    // 计划桥必须在 planning 组内，且与 plan-mode 同组（隔离 realm）。
    const planning = decl.config.plugins.find((row) => row.id === 'planning')
    const bridge = planning.config.find((row) => row.id === 'cyrene-plan-bridge')
    assert.ok(bridge, `${mode.id}: planning 组内必须有 cyrene-plan-bridge`)
    assert.equal(bridge.name, 'dsh-cyrene-philia093-0/runtime/plan-bridge')
    assert.equal(planning.config.some((row) => row.id === 'plan-mode'), true)
    assert.equal(decl.config.plugins.some((row) => row.id === 'cyrene-plan-bridge'), false, '计划桥不能挂在顶层')
  }
})

test('生成确定性：两次构建结果相同；无 tab、纯 LF、!!js 表达式被引号包住', async () => {
  const a = await buildPatch()
  const b = await buildPatch()
  assert.equal(a, b)
  assert.equal(a.includes('\t'), false, '生成物里不允许 tab')
  assert.equal(a.includes('\r'), false, '生成物必须是 LF')
  assert.match(a, /disabled: !!js "process\.platform === 'win32'"/)
  assert.match(a, /disabled: !!js "!ctx\.get\('profileContext'\)"/)
})

test('自定义快照与 persona 的每条路径可解析（构建前置校验）', async () => {
  const modes = await loadModes()
  for (const mode of modes) {
    const snapshotPath = path.join(repoRoot, 'modes', 'base', `${mode.base}.plugins.json`)
    const personaPath = path.join(repoRoot, mode.persona)
    assert.equal(fs.existsSync(snapshotPath), true, `缺少 ${snapshotPath}`)
    assert.equal(fs.existsSync(personaPath), true, `缺少 ${personaPath}`)
    assert.equal(fs.statSync(personaPath).size > 1000, true, `${mode.persona} 太小，疑似空文件`)
  }
})

test('sealed 约定：cyrene 运行时模块不得注册 prompt section', () => {
  const files = [
    'runtime/index.mjs',
    'runtime/rails.mjs',
    'runtime/capability.mjs',
    'runtime/plan-bridge.mjs',
    'runtime/memory-rail.mjs',
    'runtime/nickname.mjs',
    'runtime/scene.mjs',
    'runtime/style.mjs',
    'runtime/worldbook/index.mjs',
    'runtime/tools.mjs',
    'runtime/wuyu.mjs',
    'runtime/review.mjs',
    'runtime/volume.mjs',
  ]
  for (const file of files) {
    const text = read(file)
    assert.equal(/\.section\s*\(/.test(text), false, `${file} 不得注册 prompt section（sealed 下会被丢弃，且会误导后续维护）`)
  }
})

test('人设与上游提取工具一致（旧仓库在场时逐字校验）', async () => {
  const legacy = process.env.LEGACY_CYRENE_REPO || 'E:/Git/repositoris/DSH-Cyrene'
  const script = path.join(repoRoot, 'scripts', 'extract-legacy.mjs')
  if (!fs.existsSync(path.join(legacy, 'preset', 'chat', 'agent.cordis.yml'))) {
    // 旧仓库不在场的机器上跳过（人设已在仓库里，构建不依赖它）。
    return
  }
  const { extractPersonaBlock } = await import('../scripts/extract-legacy.mjs')
  for (const [src, dst] of [
    ['preset/chat/agent.cordis.yml', 'persona/chat.md'],
    ['preset/cyrene-work/agent.cordis.yml', 'persona/work.md'],
  ]) {
    const text = extractPersonaBlock(fs.readFileSync(path.join(legacy, src), 'utf8'))
    assert.equal(text, read(dst), `${dst} 与旧仓库源不是逐字一致`)
  }
  assert.equal(fs.existsSync(script), true)
})
