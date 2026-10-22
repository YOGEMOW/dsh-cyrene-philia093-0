#!/usr/bin/env node
/**
 * 从两个退役插件导入数据到新卷记忆根目录。
 *
 * 用法：
 *   node scripts/import.mjs --dry-run
 *   node scripts/import.mjs
 *   node scripts/import.mjs --root <dir> --legacy <md> --eternal <dir> --home <dir>
 *
 * 行为：
 *   1. 若新根目录尚无日档，把一页永恒根目录整体复制过来（不覆盖已有文件）；
 *   2. 把旧 `cyrene-memory.md` 的 `- ` 条目导入为 Entry（src=import, gate=imported），按正文 hash 幂等；
 *   3. 迁移配置：style / worldbook / nickname（只补缺，不覆盖）；
 *   4. 写 `元/卷.json`（卷 0）与 `元/迁移报告.md`；
 *   5. `--dry-run` 只打印计划，不落盘。
 *
 * 作为模块被测试/演练脚本调用时用 `runImport(options)`，返回 summary，不 process.exit。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  appendEntry,
  atomicWrite,
  ensureTree,
  listDays,
  readDay,
  readJSON,
  resolveRoot,
  safeRelPath,
  writeJSON,
} from '../memory/store.js'
import { hashText, normalizeEntry } from '../memory/parse.js'
import { personaHash, ensureVolumePersonaHash } from '../memory/persona.js'

/** 递归复制：目标已存在则不覆盖。 */
function copyTree(src, dst, rel = '') {
  let count = 0
  const items = fs.readdirSync(path.join(src, rel), { withFileTypes: true })
  for (const item of items) {
    const from = path.join(src, rel, item.name)
    const to = path.join(dst, rel, item.name)
    if (item.isDirectory()) {
      if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true })
      count += copyTree(src, dst, path.join(rel, item.name))
    } else if (item.isFile()) {
      if (fs.existsSync(to)) continue
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      count += 1
    }
  }
  return count
}

/** 读旧记忆 md 的条目行：返回 [{ text, line }]。 */
function readLegacyLines(file) {
  let raw = ''
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  raw.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    const m = /^\s*-\s+(.*\S)\s*$/.exec(line)
    if (m) out.push({ text: m[1].trim(), line: index + 1 })
  })
  return out
}

/** 收集现有全部条目正文 hash（幂等键）。 */
function existingHashes(base) {
  const set = new Set()
  for (const day of listDays(base)) {
    const parsed = readDay(base, day)
    for (const entry of parsed.entries || []) {
      if (typeof entry?.text === 'string') set.add(hashText(entry.text))
    }
  }
  return set
}

/**
 * 执行一次导入（幂等）。
 * @param {{ home?: string, root?: string, legacy?: string, eternal?: string, dryRun?: boolean }} [options]
 * @returns summary
 */
export function runImport(options = {}) {
  const dryRun = options.dryRun === true
  const home = (options.home || process.env.DSH_HOME || '').trim() || path.join(os.homedir(), '.dsh')
  const root = resolveRoot(options.root || path.join(home, 'cyrene-philia093-0'))
  const legacyPath = options.legacy || path.join(home, 'cyrene-memory.md')
  const eternalDir = options.eternal || path.join(home, 'cyrene-eternal-page-remembrance')

  const summary = {
    dryRun,
    root,
    sources: { legacy: legacyPath, eternal: eternalDir },
    copied: 0,
    imported: 0,
    duplicated: 0,
    configs: [],
    errors: [],
  }
  const log = (message) => {
    if (options.quiet !== true) process.stdout.write(`${dryRun ? '[dry-run] ' : ''}${message}\n`)
  }

  // ── 1. 复制一页永恒根目录（仅当新根还没有日档） ───────────────────────────
  let hasDays = false
  try {
    hasDays = listDays(root).length > 0
  } catch {
    hasDays = false
  }

  if (!dryRun) {
    const tree = ensureTree(root)
    if (!tree.ok) summary.errors.push(...tree.errors)
  }

  if (fs.existsSync(eternalDir) && !hasDays) {
    if (dryRun) {
      log(`会复制目录：${eternalDir} → ${root}`)
    } else {
      summary.copied = copyTree(eternalDir, root)
      log(`已复制一页永恒目录：${summary.copied} 个文件`)
    }
  } else if (!fs.existsSync(eternalDir)) {
    log(`跳过：没有一页永恒目录（${eternalDir}）`)
  } else {
    log('跳过目录复制：新根目录已有日档数据')
  }

  // ── 2. 导入旧 remember/forget 记忆 ─────────────────────────────────────────
  const legacyLines = readLegacyLines(legacyPath)
  if (legacyLines.length === 0) {
    log(`跳过：没有可导入的旧记忆（${legacyPath}）`)
  } else {
    const existing = existingHashes(root)
    const today = new Date()
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const now = Date.now()
    for (const item of legacyLines) {
      const key = hashText(item.text)
      if (existing.has(key)) {
        summary.duplicated += 1
        continue
      }
      const entry = normalizeEntry(
        {
          text: item.text,
          kind: 'fact',
          axis: '智',
          q: '你',
          I: 5,
          S: 3,
          src: 'import',
          src_ids: [`legacy:${path.basename(legacyPath)}#L${item.line}`],
          gate: 'imported',
          day,
          created_at: now,
        },
        { now },
      )
      if (dryRun) {
        summary.imported += 1
        continue
      }
      const result = appendEntry(root, entry)
      if (result.ok) {
        existing.add(key)
        summary.imported += 1
      } else {
        summary.errors.push(`导入第 ${item.line} 行失败：${result.errors.join('；')}`)
      }
    }
    log(`旧记忆：导入 ${summary.imported} 条，跳过重复 ${summary.duplicated} 条`)
  }

  // ── 3. 迁移配置（只补缺） ─────────────────────────────────────────────────
  const metaDir = safeRelPath(root, '元')
  const configs = [
    ['style', path.join(home, 'cyrene-style.json'), 'style.json'],
    ['worldbook', path.join(home, 'cyrene-worldbook.json'), 'worldbook.json'],
  ]
  for (const [label, from, to] of configs) {
    if (!fs.existsSync(from)) continue
    const target = path.join(metaDir, to)
    if (fs.existsSync(target)) continue
    if (dryRun) {
      summary.configs.push(`${label}（会复制）`)
      continue
    }
    fs.mkdirSync(metaDir, { recursive: true })
    fs.copyFileSync(from, target)
    summary.configs.push(label)
  }

  const nicknameTarget = path.join(metaDir, 'nickname.json')
  if (!fs.existsSync(nicknameTarget)) {
    const merged = {}
    const brand = readJSON(path.join(home, 'dsha-brand-rename.json'), null)
    if (brand && typeof brand.nickname === 'string' && brand.nickname.trim()) {
      merged.nickname = brand.nickname.trim()
    }
    const extra = readJSON(path.join(home, 'cyrene-nickname.json'), null)
    if (extra && typeof extra.relationshipPush === 'boolean') {
      merged.relationshipPush = extra.relationshipPush
    }
    if (Object.keys(merged).length > 0) {
      if (dryRun) summary.configs.push('nickname（会合并）')
      else {
        fs.mkdirSync(metaDir, { recursive: true })
        writeJSON(nicknameTarget, merged)
        summary.configs.push('nickname')
      }
    }
  }

  // ── 4. 卷 0 与迁移报告 ─────────────────────────────────────────────────────
  const volPath = path.join(metaDir, '卷.json')
  if (!dryRun && !fs.existsSync(volPath)) {
    writeJSON(volPath, {
      current: 0,
      volumes: [
        {
          id: 0,
          started_at: Date.now(),
          reason: 'migrated from dsh-cyrene / dsh-cyrene-eternal-page-remembrance',
          persona_hash: personaHash(),
          wuyu_version: '1',
        },
      ],
    })
  }
  // 已存在的卷（例如上一次迁移建的空章）也补上指纹。
  if (!dryRun) {
    const stamped = ensureVolumePersonaHash(root)
    if (stamped.changed === true) log(`卷 0 persona_hash 已补：${stamped.hash.slice(0, 16)}`)
  }

  const reportPath = path.join(metaDir, '迁移报告.md')
  if (!dryRun) {
    const days = listDays(root)
    const totalEntries = days.reduce((sum, day) => sum + (readDay(root, day).entries?.length ?? 0), 0)
    const lines = [
      '# 迁移报告',
      '',
      `- 时间：${new Date().toISOString()}`,
      `- 新根目录：\`${root}\``,
      `- 旧记忆：\`${legacyPath}\``,
      `- 一页永恒目录：\`${eternalDir}\``,
      `- 当前数据：${days.length} 天日档 / ${totalEntries} 条记忆`,
      `- 本次复制文件：${summary.copied}（目标已存在则跳过）`,
      `- 本次导入条目：${summary.imported}；跳过重复：${summary.duplicated}`,
      `- 迁移配置：${summary.configs.join('、') || '无'}`,
      `- 错误：${summary.errors.length === 0 ? '无' : `${summary.errors.length} 条`}`,
      '',
      '> 导入是幂等的，可以重复执行。本次复制/导入为 0 只表示没有新增，不是迁移失败。',
      '',
    ]
    atomicWrite(reportPath, lines.join('\n'))
  }

  log(JSON.stringify(summary, null, 2))
  return summary
}

/** CLI。 */
function main() {
  const args = process.argv.slice(2)
  const opt = (name) => {
    const i = args.indexOf(name)
    return i >= 0 && i + 1 < args.length ? args[i + 1] : ''
  }
  const summary = runImport({
    home: opt('--home') || undefined,
    root: opt('--root') || undefined,
    legacy: opt('--legacy') || undefined,
    eternal: opt('--eternal') || undefined,
    dryRun: args.includes('--dry-run'),
  })
  if (summary.errors.length > 0) process.exitCode = 1
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) main()
