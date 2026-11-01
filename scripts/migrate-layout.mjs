#!/usr/bin/env node
/**
 * 0.4.0 记忆布局迁移（人执行；默认 dry-run）。
 *
 * 旧 → 新：
 *   日/YYYY/MM/YYYY-MM-DD.md → 岁月涟漪/日档/YYYY/MM/YYYY-MM-DD.md
 *   月/YYYY/YYYY-MM.md       → 岁月涟漪/月响/YYYY/YYYY-MM.md
 *   年/YYYY.md               → 岁月涟漪/年轮/YYYY.md
 *   梦/YYYY-MM-DD.md         → 梦境/YYYY/MM/YYYY-MM-DD.md
 *
 * 同时改写日档条目里的 path / source_ref，并让索引与思源缓存下次重建。
 * 幂等、不删数据；旧目录为空后移除。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { dayRelPath, dreamRelPath, monthRelPath, yearRelPath } from '../memory/paths.js'
import { resolveRoot } from '../memory/store.js'

function parseArgs(argv) {
  const args = { apply: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--root') {
      args.root = argv[i + 1]
      i += 1
    }
  }
  return args
}

function rootOf(args) {
  const home = String(process.env.DSH_HOME ?? '').trim() || path.join(os.homedir(), '.dsh')
  return resolveRoot(args.root !== undefined ? String(args.root) : path.join(home, 'cyrene-philia093-0'))
}

function walk(dir, out = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(abs, out)
    else if (ent.isFile()) out.push(abs)
  }
  return out
}

function moveFile(src, dest, stamp, dry) {
  if (!fs.existsSync(src)) return { moved: false, skipped: true }
  if (fs.existsSync(dest)) {
    const a = fs.readFileSync(src)
    const b = fs.readFileSync(dest)
    if (a.equals(b)) return { moved: false, skipped: true, same: true }
    if (dry) return { moved: false, conflict: true }
    fs.renameSync(dest, `${dest}.bak-layout-${stamp}`)
  }
  if (dry) return { moved: true }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(src, dest)
  return { moved: true }
}

function rewritePaths(file) {
  let text = fs.readFileSync(file, 'utf8')
  const before = text
  text = text.replace(/"path":"日\//g, '"path":"岁月涟漪/日档/')
  text = text.replace(/"source_ref":"日\//g, '"source_ref":"岁月涟漪/日档/')
  text = text.replace(/"path":"月\//g, '"path":"岁月涟漪/月响/')
  text = text.replace(/"path":"年\//g, '"path":"岁月涟漪/年轮/')
  text = text.replace(/"path":"梦\//g, '"path":"梦境/')
  if (text !== before) fs.writeFileSync(file, text)
  return text !== before
}

function removeEmptyDirs(root) {
  for (const name of ['日', '月', '年', '梦']) {
    const dir = path.join(root, name)
    try {
      if (!fs.existsSync(dir)) continue
      const walkRemove = (d) => {
        let entries = fs.readdirSync(d, { withFileTypes: true })
        for (const ent of entries) {
          if (ent.isDirectory()) walkRemove(path.join(d, ent.name))
        }
        if (fs.readdirSync(d).length === 0) fs.rmdirSync(d)
      }
      walkRemove(dir)
    } catch {
      /* 非空/权限问题保留 */
    }
  }
}

export function migrateLayout(root, options = {}) {
  const dry = options.apply !== true
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const report = { root, dry, moves: [], conflicts: [], renamed: [], rewrites: 0 }
  const plan = []
  for (const file of walk(path.join(root, '日'))) {
    if (!file.endsWith('.md')) continue
    const day = path.basename(file, '.md')
    const rel = dayRelPath(day)
    if (rel === '') continue
    plan.push([file, path.join(root, ...rel.split('/'))])
  }
  for (const file of walk(path.join(root, '月'))) {
    if (!file.endsWith('.md')) continue
    const month = path.basename(file, '.md')
    const rel = monthRelPath(month)
    if (rel === '') continue
    plan.push([file, path.join(root, ...rel.split('/'))])
  }
  for (const file of walk(path.join(root, '年'))) {
    if (!file.endsWith('.md')) continue
    const year = path.basename(file, '.md')
    const rel = yearRelPath(year)
    if (rel === '') continue
    plan.push([file, path.join(root, ...rel.split('/'))])
  }
  for (const file of walk(path.join(root, '梦'))) {
    if (!file.endsWith('.md')) continue
    const day = path.basename(file, '.md')
    const rel = dreamRelPath(day)
    if (rel === '') continue
    plan.push([file, path.join(root, ...rel.split('/'))])
  }
  for (const [src, dest] of plan) {
    const result = moveFile(src, dest, stamp, dry)
    if (result.conflict) report.conflicts.push(src)
    else if (result.moved) report.moves.push(`${path.relative(root, src)} → ${path.relative(root, dest)}`)
  }
  if (!dry) {
    for (const [src, dest] of plan) {
      if (fs.existsSync(dest) && rewritePaths(dest)) report.rewrites += 1
    }
    for (const rel of ['元/索引.jsonl', '元/思源镜像.json']) {
      const file = path.join(root, ...rel.split('/'))
      if (fs.existsSync(file)) {
        const backup = `${file}.bak-layout-${stamp}`
        fs.renameSync(file, backup)
        report.renamed.push(`${rel} → ${path.basename(backup)}`)
      }
    }
    removeEmptyDirs(root)
  }
  return report
}

function main() {
  const report = migrateLayout(rootOf(parseArgs(process.argv.slice(2))), { apply: process.argv.includes('--apply') })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

const isDirect = process.argv[1] !== undefined && import.meta.url === new URL(`file://${path.resolve(process.argv[1]).replace(/\\/g, '/')}`).href
if (isDirect) main()
