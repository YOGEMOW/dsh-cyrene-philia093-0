/**
 * 五育闸门（写入时硬门槛）。
 *
 * 规则（docs/CONTRACT.md 第 6 节）：
 *   1. 必须有 text；
 *   2. 必须有 axis（德智体美劳之一）——「五育归属」；
 *   3. 必须有溯源：src_quote 或 src_ids（无源不入档，德）；
 *   4. decision 类必须有至少一项多尺度后果（德）；
 *   5. base:true 一律拒绝（体：基座只能由人改）。
 *
 * 通过 → 日档（gate:day）；不通过 → 余页/待定（gate:pending），月检/年检可复检提升。
 * 返回结果里带「为什么没进日档」，让模型知道下一步该补什么。
 */
import { normalizeEntry } from '../memory/parse.js'
import { appendEntry, readJSON } from '../memory/store.js'
import { appendPending } from '../memory/pending.mjs'

export const AXES = ['德', '智', '体', '美', '劳']
export const KINDS = ['fact', 'event', 'decision', 'lesson', 'rule', 'goal', 'identity', 'style', 'topic', 'artifact']
const MAX_TEXT_CHARS = 400

/** 当前卷号（元/卷.json；缺省 0）。 */
export function currentVolume(root) {
  try {
    const meta = readJSON(`${root}/元/卷.json`, null)
    const current = Number(meta?.current)
    return Number.isFinite(current) && current >= 0 ? Math.round(current) : 0
  } catch {
    return 0
  }
}

/** 清洗文本：归一换行、去控制字符、限长。 */
export function sanitizeText(value) {
  let text = typeof value === 'string' ? value : String(value ?? '')
  text = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
  if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS - 1)}…`
  return text
}

/** 把工具参数整理成 Entry 草案。 */
export function draftEntry(input = {}) {
  const srcIds = Array.isArray(input.src_ids)
    ? input.src_ids
    : typeof input.src_ids === 'string' && input.src_ids.trim() !== ''
      ? [input.src_ids.trim()]
      : []
  return normalizeEntry(
    {
      text: sanitizeText(input.text),
      kind: input.kind,
      axis: input.axis,
      q: input.q,
      I: input.I,
      S: input.S,
      kw: input.kw,
      src: input.src,
      src_ids: srcIds,
      src_quote: input.src_quote,
      links: input.links,
      consequence: input.consequence,
      entropy: input.entropy,
      legacy: input.legacy,
      aim: input.aim,
      nature: input.nature,
      base: input.base === true,
      vol: currentVolume(input.root),
    },
    { now: Date.now() },
  )
}

/**
 * 评估一条写入是否过硬门槛。
 * @param input 工具参数（可含 root）
 * @returns {{ ok:boolean, entry:object, reasons:string[] }}
 */
export function assessWrite(input = {}) {
  const entry = draftEntry(input)
  const reasons = []
  if (entry.text === '') reasons.push('缺少正文')
  if (entry.base === true) reasons.push('基座条目只能由人修改（体）')
  if (!AXES.includes(entry.axis)) reasons.push('缺少五育归属（axis 必须是德/智/体/美/劳）')
  const hasSource = (Array.isArray(entry.src_ids) && entry.src_ids.length > 0) || entry.src_quote !== ''
  if (!hasSource) reasons.push('缺少溯源（src_quote 或 src_ids），无源不入档（德）')
  if (entry.kind === 'decision') {
    const consequence = entry.consequence ?? {}
    if (Object.keys(consequence).length === 0) reasons.push('决策类必须给多尺度后果（自己/对方/关系/世界/未来）')
  }
  return { ok: reasons.length === 0, entry, reasons }
}

/**
 * 五育闸门写入：过硬门槛 → 日档；不过 → 待定区。
 * @param root 记忆根目录
 * @param input 工具参数
 * @returns {{ ok:boolean, gate:'day'|'pending', id:string, day:string, message:string, reasons:string[] }}
 */
export function writeThroughGate(root, input = {}) {
  const assessed = assessWrite({ ...input, root })
  const entry = assessed.entry
  if (assessed.ok) {
    entry.gate = 'day'
    const result = appendEntry(root, entry)
    if (!result.ok) {
      return {
        ok: false,
        gate: 'day',
        id: entry.id,
        day: entry.day,
        reasons: result.errors,
        message: `写入日档失败：${result.errors.join('；') || '未知原因'}`,
      }
    }
    return {
      ok: true,
      gate: 'day',
      id: entry.id,
      day: entry.day,
      reasons: [],
      message: `已记住（${entry.axis}·${entry.kind}，id: ${entry.id}）。`,
    }
  }

  entry.gate = 'pending'
  const result = appendPending(root, entry)
  const why = assessed.reasons.join('；')
  if (!result.ok) {
    return {
      ok: false,
      gate: 'pending',
      id: entry.id,
      day: entry.day,
      reasons: assessed.reasons,
      message: `未通过五育闸门（${why}），且待定区写入失败：${result.errors.join('；') || '未知原因'}`,
    }
  }
  return {
    ok: false,
    gate: 'pending',
    id: entry.id,
    day: entry.day,
    reasons: assessed.reasons,
    message: `未通过五育闸门：${why}。已暂记在待定区（id: ${entry.id}），月检/年检会重新评估；补齐后再写入会进日档。`,
  }
}
