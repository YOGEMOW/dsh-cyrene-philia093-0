#!/usr/bin/env node
/**
 * 开新卷（只应由人执行）。
 *
 * 新卷 = 给"我是谁"这层底稿重新装订一册：记录卷号、时间、原因、persona 指纹，并把当前
 * persona/chat.md、persona/work.md、philosophy/wuyu.md 快照进 `元/卷/<id>/persona/`。
 * **它不会自动改人设文本**；改文本仍需编辑 persona/ 后 npm run build + 重启。
 *
 * 用法：
 *   node scripts/new-volume.mjs --dry-run
 *   node scripts/new-volume.mjs --reason "调整说话方式" --confirm new-volume
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { openVolume, readVolumeState } from '../runtime/volume.mjs'
import { resolveRoot } from '../memory/store.js'

export function parseArgs(argv) {
  const args = { dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--reason') {
      args.reason = argv[i + 1]
      i += 1
    } else if (arg === '--confirm') {
      args.confirm = argv[i + 1]
      i += 1
    } else if (arg === '--root') {
      args.root = argv[i + 1]
      i += 1
    }
  }
  return args
}

/** 解析记忆根。 */
export function resolveRootFromArgs(args) {
  const home = String(process.env.DSH_HOME ?? '').trim() || path.join(os.homedir(), '.dsh')
  return resolveRoot(args.root !== undefined ? String(args.root) : path.join(home, 'cyrene-philia093-0'))
}

/** 执行开卷；confirm 不匹配时拒绝。 */
export function runNewVolume(args) {
  const root = resolveRootFromArgs(args)
  const state = readVolumeState(root)
  const next = Number(state.current) + 1
  const preview = {
    root,
    current: Number(state.current) || 0,
    next,
    volumes: (state.volumes ?? []).length + 1,
    reason: typeof args.reason === 'string' && args.reason.trim() !== '' ? args.reason.trim() : 'manual',
  }
  if (args.confirm !== 'new-volume') return { ok: false, error: '需要 --confirm new-volume 才执行。', preview }
  if (args.dryRun === true) return { ok: true, dryRun: true, preview }
  const result = openVolume(root, { reason: preview.reason })
  return { ...result, preview }
}

async function main() {
  const result = runNewVolume(parseArgs(process.argv.slice(2)))
  if (result.ok !== true) {
    process.stdout.write(`未开卷：${result.error}\n`)
    process.stdout.write(`${JSON.stringify(result.preview ?? result, null, 2)}\n`)
    process.exitCode = 1
    return
  }
  const p = result.preview
  process.stdout.write(`已开新卷 #${result.id ?? p.next}（${p.reason}）\n`)
  process.stdout.write(`- 记忆根：${p.root}\n- persona 指纹：${result.hash ?? '（dry-run 不计算）'}\n`)
  process.stdout.write(`- 快照：${result.snapshot ?? '元/卷/<id>/persona'}\n`)
  process.stdout.write('下一步：编辑 persona/ 或 philosophy/wuyu.md → npm run build → 重启 DSH。\n')
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) await main()

