#!/usr/bin/env node
/**
 * 灾难恢复：从思源「93-昔涟」回灌记忆到本地根目录。
 *
 * 默认只补本地缺失（按正文 hash 去重），不覆盖已有记忆；`--force` 才覆盖锚点/梦志
 * （条目仍去重）。`--dry-run` 在临时副本上跑一遍并给出报表，不碰真实数据。
 *
 * 用法：
 *   node scripts/restore-siyuan.mjs --dry-run
 *   node scripts/restore-siyuan.mjs
 *   node scripts/restore-siyuan.mjs --force --yes
 *
 * 配置来源（后者覆盖前者）：默认值 ← <root>/元/settings.json ← 命令行参数。
 * Token 只从环境变量读（默认 SIYUAN_API_TOKEN）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveSiYuanConfig } from '../memory/siyuan.js'
import { readSettings } from '../memory/settings.js'
import { ensureTree, resolveRoot } from '../memory/store.js'
import { restoreFromSiYuan } from '../memory/restore.js'

/** 解析 CLI 参数。 */
export function parseArgs(argv) {
  const args = { dryRun: false, force: false, yes: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--force') args.force = true
    else if (arg === '--yes') args.yes = true
    else if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('--')) {
        args[key] = value
        i += 1
      } else {
        args[key] = true
      }
    }
  }
  return args
}

/** 组合命令行/设置文件的思源配置。 */
export function buildConfig(args, settings) {
  const fromSettings = settings?.siyuan ?? {}
  return resolveSiYuanConfig({
    ...fromSettings,
    ...(args.base !== undefined ? { baseURL: String(args.base) } : {}),
    ...(args.notebook !== undefined ? { notebook: String(args.notebook) } : {}),
    ...(args['token-env'] !== undefined ? { tokenEnv: String(args['token-env']) } : {}),
    ...(args['root-hpath'] !== undefined ? { rootHPath: String(args['root-hpath']) } : {}),
  })
}

/** 把报告格式化成可读文本。 */
export function formatReport(report) {
  const lines = [
    `思源恢复：${report.ok === true ? '完成' : '有错误'}`,
    `- 笔记本：${report.notebook || '（未找到）'}`,
    `- 扫描：日档 ${report.docs?.days ?? 0} 篇｜锚点 ${report.docs?.anchors ?? 0} 篇｜梦志 ${report.docs?.journals ?? 0} 篇`,
    `- 条目：新增 ${report.entries?.added ?? 0}｜跳过（重复/已存在）${report.entries?.skipped ?? 0}`,
    `- 锚点：恢复 ${report.anchors?.restored ?? 0}`,
    `- 梦志：恢复 ${report.journals?.restored ?? 0}`,
  ]
  for (const error of report.errors ?? []) lines.push(`- 错误：${error}`)
  return lines.join('\n')
}

/** 复制现有根目录到临时目录（不存在则空目录）。 */
function stageCopy(root, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `philia-restore-${tag}-`))
  const staged = path.join(dir, 'root')
  try {
    if (fs.existsSync(root)) fs.cpSync(root, staged, { recursive: true })
    else fs.mkdirSync(staged, { recursive: true })
  } catch {
    fs.mkdirSync(staged, { recursive: true })
  }
  return { dir, staged }
}

/**
 * 执行恢复。
 * @returns { report }
 */
export async function runRestore(args, options = {}) {
  const home = String(args.home ?? process.env.DSH_HOME ?? '').trim() || path.join(os.homedir(), '.dsh')
  const root = resolveRoot(args.root !== undefined ? String(args.root) : path.join(home, 'cyrene-philia093-0'))
  const settings = fs.existsSync(root) ? readSettings(root) : {}
  const cfg = buildConfig(args, settings)

  if (args.force === true && args.yes !== true) {
    return { ok: false, errors: ['--force 会覆盖锚点/梦志；确认时同时加 --yes。'], notRun: true }
  }

  let target = root
  let staged = null
  if (args.dryRun === true) {
    staged = stageCopy(root, 'dry')
    target = staged.staged
  }
  if (!fs.existsSync(target)) ensureTree(target)

  const report = await restoreFromSiYuan(cfg, target, { force: args.force === true })
  report.root = root
  report.dryRun = args.dryRun === true
  if (staged !== null) {
    try {
      fs.rmSync(staged.dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
  return report
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = await runRestore(args)
  process.stdout.write(`${formatReport(report)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.notRun === true || report.ok !== true) process.exitCode = 1
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) await main()
