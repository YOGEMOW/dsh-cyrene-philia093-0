/**
 * 余页镜像辅助（思源备份用）：列出可镜像的文本文件、跳过 .nosync、给出 upsert/delete 计划。
 *
 * 只镜像「文本类」文件（AI 写入余页时本来就只能是文本）；二进制/图片不镜像，避免把思源文档搞坏。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { hashText } from './parse.js'

/** 允许镜像的扩展名。 */
export const FREE_TEXT_EXT = ['.md', '.markdown', '.txt', '.json', '.yaml', '.yml', '.csv', '.log']

/** 相对路径（posix）是否在 .nosync 下。 */
export function inNoSync(rel) {
  const normalized = posix.normalize(String(rel ?? '').replace(/\\/g, '/'))
  return normalized === '余页/.nosync' || normalized.startsWith('余页/.nosync/')
}

/** 是否可镜像的文本文件。 */
export function isFreeTextFile(rel) {
  const lower = String(rel ?? '').toLowerCase()
  return FREE_TEXT_EXT.some((ext) => lower.endsWith(ext))
}

/**
 * 列出余页下可镜像的文件。
 * @returns [{ rel, abs, size, mtime, hash }]
 */
export function listFreeArea(root) {
  const base = join(root, '余页')
  const out = []
  const walk = (dir, prefix) => {
    let ents = []
    try {
      ents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      const abs = join(dir, ent.name)
      const rel = prefix === '' ? ent.name : `${prefix}/${ent.name}`
      const relFromRoot = `余页/${rel}`
      if (inNoSync(relFromRoot)) continue
      if (ent.isDirectory()) {
        walk(abs, rel)
        continue
      }
      if (!isFreeTextFile(rel)) continue
      try {
        const st = statSync(abs)
        if (st.size > 1024 * 1024) continue
        const text = readFileSync(abs, 'utf8')
        out.push({ rel: relFromRoot, abs, size: st.size, mtime: st.mtimeMs, hash: hashText(text), text })
      } catch {
        /* 单文件失败忽略 */
      }
    }
  }
  walk(base, '')
  return out
}

/**
 * 计算镜像计划。
 * @param files - listFreeArea 的结果
 * @param stateFree - 镜像状态里的 free 表：{ rel: { hash, docId } }
 * @returns { upserts, deletes }
 */
export function planFreeSync(files, stateFree) {
  const known = stateFree !== null && typeof stateFree === 'object' ? stateFree : {}
  const upserts = []
  const present = new Set()
  for (const f of files ?? []) {
    present.add(f.rel)
    const prev = known[f.rel]
    const same = prev !== null && typeof prev === 'object' && prev.hash === f.hash && typeof prev.docId === 'string'
    if (!same) upserts.push(f)
  }
  const deletes = Object.keys(known).filter((rel) => present.has(rel) === false)
  return { upserts, deletes }
}

/** 渲染成思源文档正文：md 原样，其他文本包成代码块。 */
export function renderFreeContent(rel, text) {
  const body = String(text ?? '')
  if (String(rel).toLowerCase().endsWith('.md') || String(rel).toLowerCase().endsWith('.markdown')) return body
  const ext = String(rel).split('.').pop() ?? ''
  return '```' + ext + '\n' + body.replace(/\n?$/, '\n') + '```\n'
}
