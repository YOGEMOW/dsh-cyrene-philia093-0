#!/usr/bin/env node
/**
 * 补记最近 N 天的梦志：当晚模型没写梦志的日子，用日档条目生成「补记」。
 *
 * 默认只预览；`--apply` 才写入。已有完整梦志的日子跳过；`--force` 强制再补一条。
 *
 * 用法：
 *   node scripts/repair-journals.mjs
 *   node scripts/repair-journals.mjs --days 14 --apply
 *   node scripts/repair-journals.mjs --days 7 --apply --force
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { repairJournals } from '../memory/journal.js'
import { resolveRoot } from '../memory/store.js'

/** 解析参数。 */
export function parseArgs(argv) {
  const args = { days: 7, apply: false, force: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--force') args.force = true
    else if (arg === '--days') {
      args.days = Number(argv[i + 1]) || 7
      i += 1
    } else if (arg === '--root') {
      args.root = argv[i + 1]
      i += 1
    }
  }
  return args
}

export function runRepair(args) {
  const home = String(args.home ?? process.env.DSH_HOME ?? '').trim() || path.join(os.homedir(), '.dsh')
  const root = resolveRoot(args.root !== undefined ? String(args.root) : path.join(home, 'cyrene-philia093-0'))
  return repairJournals(root, { days: args.days, force: args.force, dryRun: args.apply !== true })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = runRepair(args)
  const lines = [`补记${args.apply === true ? '完成' : '预览（--apply 才写入）'}：`]
  for (const item of report.days) lines.push(`- ${item.day}：${item.action}`)
  lines.push(`写入：${report.written} 天`)
  process.stdout.write(`${lines.join('\n')}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.days.some((item) => item.action.startsWith('skip') === false && item.action !== 'written')) {
    // 预览模式无需非零退出
  }
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) await main()
