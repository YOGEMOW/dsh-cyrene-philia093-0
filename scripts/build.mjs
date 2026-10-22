#!/usr/bin/env node
/**
 * 生成 `cordis.patch.yml`。
 *
 *   node scripts/build.mjs           # 写入
 *   node scripts/build.mjs --check   # 只校验（与仓库里的补丁逐字一致）
 *   node scripts/build.mjs --out=<path>
 *
 * 生成物不要手改；改人设改 persona/，改能力/模式改 modes/。
 */
import fs from 'node:fs'
import path from 'node:path'

import { buildPatch, repoRoot } from './build-lib.mjs'

const args = process.argv.slice(2)
const check = args.includes('--check')
const outArg = args.find((a) => a.startsWith('--out='))
const target = outArg ? path.resolve(outArg.slice('--out='.length)) : path.join(repoRoot, 'cordis.patch.yml')

const next = await buildPatch()
const normalize = (text) => text.replace(/\r\n?/g, '\n')

if (check) {
  if (!fs.existsSync(target)) {
    console.error(`缺少 ${target} —— 先运行 node scripts/build.mjs`)
    process.exit(1)
  }
  const current = normalize(fs.readFileSync(target, 'utf8'))
  if (current !== normalize(next)) {
    console.error('cordis.patch.yml 与源不同步 —— 运行 node scripts/build.mjs 重新生成。')
    process.exit(1)
  }
  console.log(`一致：${path.relative(repoRoot, target)}`)
  process.exit(0)
}

fs.writeFileSync(target, next, 'utf8')
const declarations = (next.match(/^- insert:$/gm) || []).length - 1
console.log(`已写入 ${path.relative(repoRoot, target)}（${declarations} 个预设声明，${next.length} 字符）`)
