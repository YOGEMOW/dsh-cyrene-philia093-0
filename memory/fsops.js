/**
 * 余页文件操作（memory_fs 工具）。
 *
 * 规则（设计 §4.3）：
 *  - 读/列/统计：根目录内任意位置（元/ 除外）
 *  - 写/删/移动：只允许 余页/ 内
 *  - 路径不得越出根目录；单文件 ≤1MB；计入总配额
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { atomicWrite, readTextSafe, safeRelPath, quotaUsage } from './store.js'

const MB = 1024 * 1024
const MAX_FILE = 1 * MB
const MAX_READ = 10_000

/** 判断相对路径是否在允许写的区域（余页/）。 */
function writable(rel) {
  const normalized = posix.normalize(String(rel ?? '').replace(/\\/g, '/'))
  return normalized === '余页' || normalized.startsWith('余页/')
}

/** 读操作是否允许（元/ 下不给 AI 看）。 */
function readable(rel) {
  const normalized = posix.normalize(String(rel ?? '').replace(/\\/g, '/'))
  return normalized !== '元' && !normalized.startsWith('元/')
}

/** 字节数格式化。 */
function human(bytes) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/** 列目录（不递归，最多 200 项）。 */
function listDir(root, rel) {
  const abs = safeRelPath(root, rel === '' ? '.' : rel)
  if (abs === null) return { ok: false, text: '路径不在记忆目录内。' }
  if (!existsSync(abs)) return { ok: false, text: '目录不存在。' }
  let names
  try {
    names = readdirSync(abs).slice(0, 200)
  } catch (error) {
    return { ok: false, text: `读目录失败：${error instanceof Error ? error.message : String(error)}` }
  }
  const lines = names.map((name) => {
    try {
      const st = statSync(join(abs, name))
      if (st.isDirectory()) return `[目录] ${name}/`
      return `[文件] ${name} (${human(st.size)})`
    } catch {
      return `[?] ${name}`
    }
  })
  return { ok: true, text: lines.length === 0 ? '（空）' : lines.join('\n') }
}

/**
 * 执行一次文件操作。
 * @param root - 记忆根目录。
 * @param op - ls|read|write|append|rm|mkdir|mv|du|stat。
 * @param rel - 相对根目录的路径。
 * @param content - 写入内容（write/append）。
 * @param options - { quotaMB, softWarnRatio }
 */
export function fsOp(root, op, rel, content, options = {}) {
  const quotaBytes = Math.max(1, Number(options.quotaMB ?? 128)) * MB
  const freeQuotaBytes = Math.max(1, Math.min(Number(options.quotaMB ?? 128), Number(options.freeQuotaMB ?? 64))) * MB
  const target = typeof rel === 'string' ? rel.trim() : ''
  switch (op) {
    case 'ls': {
      if (readable(target) === false) return { ok: false, text: '元/ 目录不对 AI 开放。' }
      return listDir(root, target)
    }
    case 'read': {
      if (readable(target) === false) return { ok: false, text: '元/ 目录不对 AI 开放。' }
      const abs = safeRelPath(root, target)
      if (abs === null) return { ok: false, text: '路径不在记忆目录内。' }
      const text = readTextSafe(abs)
      if (text === '') return { ok: true, text: '（空或不是文本文件）' }
      return { ok: true, text: text.length > MAX_READ ? `${text.slice(0, MAX_READ)}\n…（已截断）` : text }
    }
    case 'write':
    case 'append': {
      if (writable(target) === false) return { ok: false, text: '只能写 余页/ 下的文件。' }
      const abs = safeRelPath(root, target)
      if (abs === null || abs === root) return { ok: false, text: '路径不在记忆目录内。' }
      const data = typeof content === 'string' ? content : ''
      if (Buffer.byteLength(data, 'utf8') > MAX_FILE) return { ok: false, text: '单文件超过 1 MB 上限。' }
      const usage = quotaUsage(root)
      const current = readTextSafe(abs)
      const finalText = op === 'append' ? current + data : data
      const delta = Math.max(0, Buffer.byteLength(finalText, 'utf8') - Buffer.byteLength(current, 'utf8'))
      const freeUsed = Number(usage.byTop?.['余页'] ?? usage.byTop?.['如我所书'] ?? usage.byTop?.['自留地'] ?? 0)
      if (freeUsed + delta > freeQuotaBytes) {
        return {
          ok: false,
          text: `余页已满（${human(freeUsed)} / ${human(freeQuotaBytes)}）。请先删掉一些旧草稿（memory_fs op=rm）。`
        }
      }
      if (usage.bytes + delta > quotaBytes) {
        return {
          ok: false,
          text: `一页永恒已满（${human(usage.bytes)} / ${human(quotaBytes)}）。请先归档或清理 余页/ 下的大文件。`
        }
      }
      atomicWrite(abs, finalText)
      const ratio = (freeUsed + delta) / freeQuotaBytes
      const warn = ratio >= Number(options.softWarnRatio ?? 0.8) ? '（余页已用超过 80%，注意清理）' : ''
      return { ok: true, text: `已写入 ${target}${warn}` }
    }
    case 'mkdir': {
      if (writable(target) === false) return { ok: false, text: '只能建 余页/ 下的目录。' }
      const abs = safeRelPath(root, target)
      if (abs === null) return { ok: false, text: '路径不在记忆目录内。' }
      mkdirSync(abs, { recursive: true })
      return { ok: true, text: `已创建 ${target}/` }
    }
    case 'rm': {
      if (writable(target) === false) return { ok: false, text: '只能删 余页/ 下的文件；记忆条目请用 memory_forget。' }
      const abs = safeRelPath(root, target)
      if (abs === null || abs === root) return { ok: false, text: '路径不在记忆目录内。' }
      if (!existsSync(abs)) return { ok: false, text: '不存在。' }
      rmSync(abs, { recursive: true, force: true })
      return { ok: true, text: `已删除 ${target}` }
    }
    case 'mv': {
      const [from, to] = String(content ?? '').split('\n').map((s) => s.trim())
      if (!writable(from) || !writable(to)) return { ok: false, text: '只能移动 余页/ 内的文件（content 第一行 from、第二行 to）。' }
      const fromAbs = safeRelPath(root, from)
      const toAbs = safeRelPath(root, to)
      if (fromAbs === null || toAbs === null) return { ok: false, text: '路径不在记忆目录内。' }
      mkdirSync(join(toAbs, '..'), { recursive: true })
      renameSync(fromAbs, toAbs)
      return { ok: true, text: `已移动 ${from} → ${to}` }
    }
    case 'du': {
      const usage = quotaUsage(root)
      const parts = [`总用量 ${human(usage.bytes)} / ${human(quotaBytes)}`]
      for (const [name, bytes] of Object.entries(usage.byTop ?? {})) {
        if (bytes > 0) parts.push(`- ${name}/：${human(bytes)}`)
      }
      parts.push(`余页额度：${human(Number(usage.byTop?.['余页'] ?? usage.byTop?.['如我所书'] ?? usage.byTop?.['自留地'] ?? 0))} / ${human(freeQuotaBytes)}`)
      return { ok: true, text: parts.join('\n') }
    }
    case 'stat': {
      const usage = quotaUsage(root)
      const freeUsed = Number(usage.byTop?.['余页'] ?? usage.byTop?.['如我所书'] ?? usage.byTop?.['自留地'] ?? 0)
      return {
        ok: true,
        text: `总用量 ${human(usage.bytes)} / ${human(quotaBytes)}（${((usage.bytes / quotaBytes) * 100).toFixed(1)}%）｜余页 ${human(freeUsed)} / ${human(freeQuotaBytes)}`
      }
    }
    default:
      return { ok: false, text: `未知 op：${op}` }
  }
}
