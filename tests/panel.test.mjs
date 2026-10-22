/**
 * 设置面板宿主半：状态 / 立即同步 / 立即备份 / 立即整理 / 保存设置。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { resolveConfig } from '../memory/config.js'
import { ensureTree, resolveRoot } from '../memory/store.js'
import { buildPanelStatus, createPanelHandler, PANEL_PREFIX } from '../host/panel.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-panel-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

function fakeService(root) {
  return {
    root,
    config: resolveConfig({}),
    diagnostics: {},
    maintenance: {
      async syncNow() {
        return { ok: true, entries: 2 }
      },
      backupNow() {
        return { ok: true, path: path.join(root, '..', 'snap') }
      },
      status() {
        return {
          siyuan: { enabled: true, baseURL: 'http://127.0.0.1:6806', notebook: '93-昔涟' },
          backup: { enabled: true, intervalMinutes: 30, snapshotHour: 3, keep: 7 },
          lastMirrorAt: Date.now(),
          lastMirrorError: '',
        }
      },
    },
    dream: {
      status() {
        return {
          enabled: true,
          time: '23:30:00',
          timeZone: 'Asia/Shanghai',
          dreamedToday: false,
          running: false,
          schedules: 1,
          lastSessionId: 's1',
          lastDreamAt: 0,
        }
      },
      async triggerDream() {
        return { ok: true, message: '已启动整理。' }
      },
    },
  }
}

const fakeCtx = () => ({
  get(name) {
    if (name === 'agents') return { get: () => undefined }
    return undefined
  },
})

const makeRes = () => {
  const chunks = []
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(value) {
      chunks.push(value)
    },
    json() {
      return JSON.parse(chunks.join(''))
    },
  }
}

const request = (method, url, body) => {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
  req.method = method
  req.url = url
  return req
}

const call = async (handler, method, suffix, body) => {
  const res = makeRes()
  await handler(request(method, `${PANEL_PREFIX}${suffix}`, body), res)
  return { code: res.statusCode, body: res.json() }
}

test('status：锚点/条目/配额/思源/夜梦/备份/配置齐备', () => {
  const { dir, root } = setup()
  try {
    const status = buildPanelStatus({ service: fakeService(root) })
    assert.equal(status.root, root)
    assert.equal(status.entries.total, 0)
    assert.equal(status.mirror.enabled, true)
    assert.equal(status.mirror.notebook, '93-昔涟')
    assert.equal(status.dream.time, '23:30:00')
    assert.equal(status.backup.keep, 7)
    assert.equal(status.config.siyuan.baseURL, 'http://127.0.0.1:6806')
    assert.equal(status.volume.current, 0)
    assert.equal(status.volume.count, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('action：sync/backup/dream/save-config', async () => {
  const { dir, root } = setup()
  try {
    const service = fakeService(root)
    const handler = createPanelHandler({ ctx: fakeCtx(), service, pluginVersion: '0.1.0' })

    const status = await call(handler, 'GET', '/status')
    assert.equal(status.code, 200)
    assert.equal(status.body.entries.total, 0)

    const sync = await call(handler, 'POST', '/action', { action: 'sync' })
    assert.equal(sync.code, 200)
    assert.match(sync.body.message, /已同步到思源/)
    const backup = await call(handler, 'POST', '/action', { action: 'backup' })
    assert.equal(backup.code, 200)
    assert.match(backup.body.message, /已备份/)
    const dream = await call(handler, 'POST', '/action', { action: 'dream' })
    assert.equal(dream.body.ok, true)

    const save = await call(handler, 'POST', '/action', {
      action: 'save-config',
      config: { siyuan: { enabled: false, notebook: '新本子' } },
    })
    assert.equal(save.code, 200)
    const saved = JSON.parse(fs.readFileSync(path.join(root, '元', 'settings.json'), 'utf8'))
    assert.equal(saved.siyuan.enabled, false)
    assert.equal(saved.siyuan.notebook, '新本子')

    const note = await call(handler, 'POST', '/action', { action: 'note', days: 1 })
    assert.equal(note.code, 200)
    assert.match(note.body.message, /补记完成/)

    const unknown = await call(handler, 'POST', '/action', { action: 'nope' })
    assert.equal(unknown.code, 400)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
