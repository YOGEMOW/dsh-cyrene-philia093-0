#!/usr/bin/env node
/**
 * 从退役插件仓库提取人设正文（**逐字**，不做任何改写）。
 *
 * 用法：
 *   node scripts/extract-legacy.mjs --from "E:/Git/repositoris/DSH-Cyrene" --write
 *   node scripts/extract-legacy.mjs --from <旧仓库> --check   # 校验已提交的人设与源逐字一致
 *
 * 提取方式：读 `preset/<id>/agent.cordis.yml` 里 `- id: persona` 的块标量 `prefix: |`，
 * 按 YAML 块标量规则（比 `prefix:` 多 2 格的缩进）反缩进，保留空行，去掉尾部空行。
 * 这是「人设是数据」的落地：人设只在 persona/ 下维护，构建器只负责拼装。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

export const MODES = [
  { id: 'chat', file: 'persona/chat.md', source: 'preset/chat/agent.cordis.yml' },
  { id: 'work', file: 'persona/work.md', source: 'preset/cyrene-work/agent.cordis.yml' },
]

/** 从 agent.cordis.yml 里取 persona 的块标量正文（逐字）。 */
export function extractPersonaBlock(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const start = lines.findIndex((line) => /^\s*-\s+id:\s*persona\s*$/.test(line))
  if (start < 0) throw new Error('找不到 persona 行')
  let prefixLine = -1
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = /^(\s+)prefix:\s*\|[-+]?\s*$/.exec(lines[i])
    if (m) {
      prefixLine = i
      break
    }
  }
  if (prefixLine < 0) throw new Error('persona 行缺少块标量 prefix: |')
  const baseIndent = /^(\s*)prefix:/.exec(lines[prefixLine])[1].length + 2
  const out = []
  for (let i = prefixLine + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') {
      out.push('')
      continue
    }
    const lead = line.length - line.trimStart().length
    if (lead < baseIndent) break
    out.push(line.slice(baseIndent))
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  while (out.length > 0 && out[0].trim() === '') out.shift()
  return `${out.join('\n')}\n`
}

/** CLI 主流程。 */
function main() {
  const args = process.argv.slice(2)
  const fromArg = args.indexOf('--from')
  const from = fromArg >= 0 ? args[fromArg + 1] : ''
  const write = args.includes('--write')
  const check = args.includes('--check')

  if (from === '') {
    console.error('用法：node scripts/extract-legacy.mjs --from <旧仓库> [--write|--check]')
    process.exit(1)
  }

  let failed = false
  for (const mode of MODES) {
    const sourcePath = path.join(from, mode.source)
    const targetPath = path.join(repo, mode.file)
    if (!fs.existsSync(sourcePath)) {
      console.error(`缺少源文件：${sourcePath}`)
      failed = true
      continue
    }
    const text = extractPersonaBlock(fs.readFileSync(sourcePath, 'utf8'))
    const chars = text.length
    const lines = text.split('\n').length - 1
    if (write) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.writeFileSync(targetPath, text, 'utf8')
      console.log(`写入 ${mode.file}（${lines} 行 / ${chars} 字符）`)
    } else if (check) {
      const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : ''
      if (current !== text) {
        console.error(`不一致：${mode.file} 与旧仓库源（${mode.source}）不是逐字一致`)
        failed = true
      } else {
        console.log(`一致 ${mode.file}（${lines} 行 / ${chars} 字符）`)
      }
    } else {
      console.log(`${mode.id}: ${lines} 行 / ${chars} 字符`)
    }
  }
  process.exit(failed ? 1 : 0)
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) main()
