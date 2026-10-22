/**
 * 一页永恒 · 日档解析层（lib/parse.js）
 *
 * 职责：Entry 的规范化、日档 Markdown 的序列化与解析、front-matter 读写、内容哈希。
 * 契约：CONTRACT.md §1（Entry 形状）、§2（日档格式）、§3（导出签名）。
 *
 * 硬约束：
 * - 只依赖 Node 内置（本文件实际只用 node:crypto），零第三方依赖；
 * - 所有导出函数对坏输入不抛（fail-open，因为注入链路不能被一条脏数据打断）；
 * - 日档格式的唯一约定见 CONTRACT §2：人类可读部分 + 单行 `<!--cyrene:{JSON}-->`。
 *
 * 手改容错原则（CONTRACT §2）：
 * - 正文随便改，正文承载 text；
 * - 元数据行缺失或 JSON 坏掉时，该条按默认值收编（I=4、S=1、axis=无），
 *   在同文件的 errors 里记一条，**不影响其他条目**；
 * - 手改条目的 created_at 尽量从 `## HH:MM` 小标题 + front-matter 日期还原。
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// 枚举与常量
// ---------------------------------------------------------------------------

/** 五育主维度 */
const AXES = ['德', '智', '体', '美', '劳'];
/** 四问 */
const QUESTIONS = ['我', '你', '来', '去'];
/** 条目类型 */
const KINDS = ['fact', 'event', 'decision', 'lesson', 'rule', 'goal', 'identity', 'style', 'topic', 'artifact'];
/** 生命周期状态 */
const STATUSES = ['fresh', 'active', 'dormant', 'archived', 'tombstone'];
/** 来源 */
const SOURCES = ['conv', 'dream', 'user', 'import', 'web', 'restore'];
/** 五育闸门状态（缺省视为 day；imported = 迁移导入） */
const GATES = ['day', 'pending', 'promoted', 'imported'];
/** 天性层级（劳） */
const TIERS = ['high', 'low'];

/** 手改缺元数据时的默认值（设计 §4.2：I=4、S=1、axis=无） */
const DEFAULTS = {
  kind: 'fact',
  axis: '无',
  q: '我',
  I: 4,
  S: 1,
  status: 'active',
  src: 'import',
};

const DAY_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** ms 时间戳 → 本地日期 "YYYY-MM-DD"（与日档所属日一致，按本机时区） */
function ymd(ms) {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ms 时间戳 → 本地 "HH:MM" */
function hhmm(ms) {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '00:00';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 日期字符串 → 相对根目录的日档路径（posix 分隔符） */
function dayRelPath(day) {
  const m = DAY_DATE_RE.exec(String(day || ''));
  if (!m) return '';
  return `日/${m[1]}/${m[2]}/${m[1]}-${m[2]}-${m[3]}.md`;
}

/** 日期 + "HH:MM" → 本地时间戳；非法返回 NaN */
function timestampFrom(day, time) {
  try {
    const dm = DAY_DATE_RE.exec(String(day || ''));
    const tm = TIME_RE.exec(String(time || ''));
    if (!dm || !tm) return NaN;
    const h = Number(tm[1]);
    const mi = Number(tm[2]);
    if (h > 23 || mi > 59) return NaN;
    const dt = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, mi, 0, 0);
    const ts = dt.getTime();
    return Number.isFinite(ts) ? ts : NaN;
  } catch {
    return NaN;
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** S（稳定性，天）：有限正数；坏值回落到 1 */
function normalizeS(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULTS.S;
  return Math.min(n, 1e9);
}

/** 时间戳字段：有限正数取整；否则回落 */
function pickTs(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return fallback;
}

/** 字符串数组：去空、去重、保序 */
function uniqStrings(value) {
  if (typeof value === 'string') {
    const s = value.trim();
    return s ? [s] : [];
  }
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (item === null || item === undefined) continue;
    const s = String(item).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function asText(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return String(value);
  } catch {
    return '';
  }
}

/** 拆一行里的「key: value」之外的顶层逗号（支持引号与嵌套括号） */
function splitTopLevel(str, sep = ',') {
  const text = asText(str);
  const out = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') {
        if (i + 1 < text.length) {
          cur += text[i + 1];
          i += 1;
        }
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

/** 找顶层冒号（用于 inline map 的 `德: 2`） */
function findTopLevelColon(str) {
  const text = asText(str);
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

/** 双引号字符串：优先 JSON 解析（支持转义），失败退化为去引号 */
function parseQuoted(v) {
  try {
    return JSON.parse(v);
  } catch {
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
    return undefined;
  }
}

/** front-matter 里的一个标量值：数字 / 布尔 / null / 数组 / inline map / 字符串 */
function parseScalar(raw) {
  try {
    const v = asText(raw).trim();
    if (v === '') return '';
    if (v === 'null' || v === '~') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v.startsWith('"')) {
      const quoted = parseQuoted(v);
      if (quoted !== undefined) return quoted;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
    if (v.startsWith('[') && v.endsWith(']')) {
      return splitTopLevel(v.slice(1, -1)).map((item) => parseScalar(item));
    }
    if (v.startsWith('{') && v.endsWith('}')) {
      const obj = {};
      for (const part of splitTopLevel(v.slice(1, -1))) {
        const idx = findTopLevelColon(part);
        if (idx < 0) continue;
        const key = part.slice(0, idx).trim().replace(/^["']|["']$/g, '');
        if (key) obj[key] = parseScalar(part.slice(idx + 1));
      }
      return obj;
    }
    if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
    return v;
  } catch {
    return asText(raw).trim();
  }
}

/** 值 → front-matter 文本（与 parseScalar 对称） */
function renderScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (Array.isArray(value)) return `[${value.map(renderScalar).join(', ')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${renderScalar(v)}`);
    return `{${entries.join(', ')}}`;
  }
  const s = asText(value);
  if (s === '') return '""';
  const needQuote =
    s !== s.trim() ||
    /^[\s{}[\],:>|*&!%@`"'#-]/.test(s) ||
    /[:#\n\r]/.test(s) ||
    ['null', 'true', 'false', '~'].includes(s) ||
    /^-?\d+(?:\.\d+)?$/.test(s);
  return needQuote ? JSON.stringify(s) : s;
}

/** 去掉引用行的包裹引号（「」『』“”""） */
function cleanQuote(raw) {
  let s = asText(raw).trim();
  if (!s) return '';
  const pairs = [
    ['「', '」'],
    ['『', '』'],
    ['“', '”'],
    ['"', '"'],
    ["'", "'"],
  ];
  for (const [open, close] of pairs) {
    if (s.length >= open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
      s = s.slice(open.length, s.length - close.length).trim();
      break;
    }
  }
  return s;
}

/** S 在人类可读标题里最多保留一位小数 */
function headingNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  if (Number.isInteger(x)) return String(x);
  return String(Math.round(x * 10) / 10);
}

// ---------------------------------------------------------------------------
// id 与哈希
// ---------------------------------------------------------------------------

/**
 * 生成条目 id：`YYYYMMDDHHmmss-xxxxxx`（本地时间前缀 + 6 位 base36 随机）。
 * @param {number} [now] 时间戳（ms），默认 Date.now()
 * @param {number} [random] 0..1 的随机源，便于测试与复现
 * @returns {string}
 */
export function entryId(now = Date.now(), random) {
  try {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const d = new Date(ts);
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    const stamp = `${safe.getFullYear()}${pad2(safe.getMonth() + 1)}${pad2(safe.getDate())}${pad2(safe.getHours())}${pad2(safe.getMinutes())}${pad2(safe.getSeconds())}`;
    const r = typeof random === 'number' && Number.isFinite(random) ? random : Math.random();
    const seed = Math.min(Math.max(r, 0), 0.9999999999);
    const n = Math.floor(seed * 36 ** 6);
    return `${stamp}-${n.toString(36).padStart(6, '0')}`;
  } catch {
    return `${Date.now().toString(36)}-000000`;
  }
}

/**
 * 内容哈希：sha256 前 12 位十六进制（用于墓碑审计与文件签名）。
 * @param {string} text
 * @returns {string} 12 位小写 hex；坏输入返回 ''
 */
export function hashText(text) {
  try {
    const src = typeof text === 'string' ? text : asText(text);
    return createHash('sha256').update(src, 'utf8').digest('hex').slice(0, 12);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// front-matter
// ---------------------------------------------------------------------------

/**
 * 解析 front-matter：首个 `---` 到下一个 `---` 之间的简单 YAML 子集。
 * 支持 key: 字符串 / 数字 / 布尔 / null / `[a, b]` / `{k: v}`。
 * 没有合法 front-matter 时 front={}、body=原文（去 CRLF / BOM）。
 * @param {string} text
 * @returns {{ front: object, body: string }}
 */
export function parseFrontMatter(text) {
  let src = asText(text);
  src = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line === '---') start = i;
    break;
  }
  if (start < 0) return { front: {}, body: src };
  let end = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) return { front: {}, body: src };
  const front = {};
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().replace(/^["']|["']$/g, '');
    if (!key) continue;
    front[key] = parseScalar(line.slice(colon + 1));
  }
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  return { front, body };
}

/**
 * 渲染 front-matter（含首尾 `---`，末尾带一个换行）。
 * @param {object} front
 * @returns {string}
 */
export function renderFrontMatter(front) {
  const obj = front && typeof front === 'object' && !Array.isArray(front) ? front : {};
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${renderScalar(value)}`);
  }
  return ['---', ...lines, '---', ''].join('\n');
}

// ---------------------------------------------------------------------------
// Entry 规范化
// ---------------------------------------------------------------------------

/**
 * 五育扩展字段的收编规则：**只收非空值，缺省不写**。
 *
 * 这样旧条目（没有五育扩展）序列化后仍然逐字不变，新字段只在真正需要时出现；
 * 读取侧一律按「缺省 = 未填」处理。字段清单见 docs/CONTRACT.md 第 5–6 节。
 */
function optionalTextFields(value, keys) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const key of keys) {
    const text = asText(src[key]);
    if (text !== '') out[key] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 德：多尺度后果（自己/对方/关系/世界/未来）。 */
function optionalConsequence(value) {
  return optionalTextFields(value, ['self', 'other', 'relation', 'world', 'future']);
}

/** 智：负熵与相契要素。 */
function optionalEntropy(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const reduces = asText(src.reduces);
  const resonances = uniqStrings(src.resonances);
  if (reduces === '' && resonances.length === 0) return null;
  const out = {};
  if (reduces !== '') out.reduces = reduces;
  if (resonances.length > 0) out.resonances = resonances;
  return out;
}

/** 劳：这次选择养出的天性。 */
function optionalNature(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const name = asText(src.name);
  if (name === '') return null;
  return {
    name,
    tier: TIERS.includes(src.tier) ? src.tier : 'high',
    serves_aim: src.serves_aim === true,
  };
}

/**
 * 把任意（手改 / 坏 JSON / 半截）对象补全成完整 Entry。
 * 对 partial 不做校验抛错，所有非法值回落到默认值。
 * @param {object} partial
 * @param {{day?:string, path?:string, now?:number}} [ctx]
 * @returns {object} 完整 Entry（字段顺序见 CONTRACT §1）
 */
export function normalizeEntry(partial, ctx) {
  const p = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const nowRaw = Number(c.now);
  const now = Number.isFinite(nowRaw) && nowRaw > 0 ? Math.round(nowRaw) : Date.now();
  const ctxDay = typeof c.day === 'string' && DAY_DATE_RE.test(c.day) ? c.day : '';
  const ctxPath = typeof c.path === 'string' ? c.path : '';

  const text = asText(p.text);
  const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : entryId(now);
  const kind = KINDS.includes(p.kind) ? p.kind : DEFAULTS.kind;
  const axis = AXES.includes(p.axis) ? p.axis : DEFAULTS.axis;
  const q = QUESTIONS.includes(p.q) ? p.q : DEFAULTS.q;
  const I = clampInt(p.I, 1, 10, DEFAULTS.I);
  const S = normalizeS(p.S);
  const status = STATUSES.includes(p.status) ? p.status : DEFAULTS.status;
  const kw = uniqStrings(p.kw).slice(0, 13);
  const src = SOURCES.includes(p.src) ? p.src : DEFAULTS.src;
  const srcIds = uniqStrings(p.src_ids);
  const srcQuote = asText(p.src_quote);
  const sup = typeof p.sup === 'string' && p.sup.trim() ? p.sup.trim() : null;
  const links = uniqStrings(p.links);

  const createdAt = pickTs(p.created_at, now);
  const factTime = pickTs(p.fact_time, createdAt);
  const reviewedAt = pickTs(p.reviewed_at, createdAt);
  const touchedAt = pickTs(p.touched_at, createdAt);

  const pDay = typeof p.day === 'string' && DAY_DATE_RE.test(p.day) ? p.day : '';
  const day = pDay || ctxDay || ymd(createdAt);
  const pathValue =
    typeof p.path === 'string' && p.path.trim()
      ? p.path.trim()
      : ctxPath || (day ? dayRelPath(day) : '');

  const entry = {
    id,
    text,
    kind,
    axis,
    q,
    I,
    S,
    status,
    kw,
    src,
    src_ids: srcIds,
    src_quote: srcQuote,
    sup,
    links,
    fact_time: factTime,
    reviewed_at: reviewedAt,
    touched_at: touchedAt,
    created_at: createdAt,
    day,
    path: pathValue,
    sync: p.sync === undefined ? true : p.sync !== false,
    n_recall: clampInt(p.n_recall, 0, 1e9, 0),
    n_review: clampInt(p.n_review, 0, 1e9, 0),
  };
  if (p.axis_scores && typeof p.axis_scores === 'object' && !Array.isArray(p.axis_scores)) {
    entry.axis_scores = p.axis_scores;
  }
  // ── 五育扩展（只收非空值；旧条目不受影响） ──────────────────────────────
  const consequence = optionalConsequence(p.consequence);
  if (consequence) entry.consequence = consequence;
  const entropy = optionalEntropy(p.entropy);
  if (entropy) entry.entropy = entropy;
  const legacy = asText(p.legacy);
  if (legacy !== '') entry.legacy = legacy;
  const aim = asText(p.aim);
  if (aim !== '') entry.aim = aim;
  const nature = optionalNature(p.nature);
  if (nature) entry.nature = nature;
  if (p.base === true) entry.base = true;
  if (Number.isFinite(Number(p.vol)) && Number(p.vol) >= 0) entry.vol = Math.round(Number(p.vol));
  if (GATES.includes(p.gate)) entry.gate = p.gate;
  if (p.promoted_at !== undefined) {
    const promotedAt = pickTs(p.promoted_at, 0);
    if (promotedAt > 0) entry.promoted_at = promotedAt;
  }
  const sourceRef = asText(p.source_ref);
  if (sourceRef !== '') entry.source_ref = sourceRef;
  return entry;
}

// ---------------------------------------------------------------------------
// 日档：序列化
// ---------------------------------------------------------------------------

/** 生成人类可读小标题：`## 14:02 · 智 · I6 S3 · #偏好 #写作` */
function buildHeading(entry) {
  const parts = [
    hhmm(entry.created_at),
    AXES.includes(entry.axis) ? entry.axis : DEFAULTS.axis,
    `I${headingNumber(entry.I)} S${headingNumber(entry.S)}`,
  ];
  const tags = (Array.isArray(entry.kw) ? entry.kw : [])
    .slice(0, 5)
    .map((k) => `#${asText(k).replace(/[\s#·]/g, '_')}`)
    .filter((t) => t.length > 1);
  if (tags.length) parts.push(tags.join(' '));
  return `## ${parts.join(' · ')}`;
}

/**
 * 序列化单条 Entry 为一个日档块（末尾带换行）。
 * 结构：小标题 + 正文 + 可选引用行 + 单行元数据注释（JSON 不含 text）。
 * @param {object} entry
 * @returns {string}
 */
export function serializeEntry(entry) {
  const e = normalizeEntry(entry, {});
  const parts = [buildHeading(e), ''];
  if (e.text) parts.push(e.text, '');
  const quote = cleanQuote(e.src_quote);
  if (quote) parts.push(`> 原话：「${quote}」`, '');
  const payload = { ...e };
  delete payload.text;
  let json = '{}';
  try {
    json = JSON.stringify(payload);
    if (typeof json !== 'string') json = '{}';
    // 注释不能提前闭合：正文里的 `-->` 以 \u003e 转义（JSON.parse 后还原）。
    json = json.replace(/-->/g, '--\\u003e');
  } catch {
    json = '{}';
  }
  parts.push(`<!--cyrene:${json}-->`);
  return `${parts.join('\n')}\n`;
}

/** 汇总 front：日期、条目数、五育计数、梦境标记，其余字段保留 */
function normalizeDayFront(front, entries) {
  const src = front && typeof front === 'object' && !Array.isArray(front) ? front : {};
  const axes = { 德: 0, 智: 0, 体: 0, 美: 0, 劳: 0 };
  for (const entry of entries) {
    if (AXES.includes(entry.axis)) axes[entry.axis] += 1;
  }
  let date = typeof src.date === 'string' && DAY_DATE_RE.test(src.date) ? src.date : '';
  if (!date) {
    const firstDay = entries.find((e) => typeof e.day === 'string' && DAY_DATE_RE.test(e.day));
    date = firstDay ? firstDay.day : ymd(Date.now());
  }
  const out = { date, entries: entries.length, axes };
  out.dreamed = src.dreamed === true || src.dreamed === 'true';
  out.dreamed_at = src.dreamed_at === undefined ? null : src.dreamed_at;
  for (const key of Object.keys(src)) {
    if (!(key in out)) out[key] = src[key];
  }
  return out;
}

/**
 * 渲染整份日档（front 缺省自动补全：日期 / 条目数 / 五育计数 / dreamed）。
 * @param {object} front
 * @param {object[]} entries
 * @returns {string} 含末尾换行
 */
export function renderDay(front, entries) {
  const list = Array.isArray(entries)
    ? entries.filter((e) => e && typeof e === 'object').map((e) => normalizeEntry(e, {}))
    : [];
  const f = normalizeDayFront(front, list);
  const chunks = [`# ${f.date} · 日档`];
  for (const entry of list) chunks.push(serializeEntry(entry).replace(/\n$/, ''));
  return `${renderFrontMatter(f)}\n${chunks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// 日档：解析
// ---------------------------------------------------------------------------

/** 解析小标题（元数据缺失时的兜底来源） */
function parseHeading(line) {
  const out = { time: '', axis: '', I: null, S: null, tags: [] };
  try {
    const raw = asText(line).replace(/^##\s+/, '').trim();
    const m =
      /^(\d{1,2}:\d{2})\s*[·•]\s*(.+?)\s*[·•]\s*I\s*(\d+(?:\.\d+)?)\s*S\s*(\d+(?:\.\d+)?)(?:\s*[·•]\s*(.*))?$/.exec(
        raw,
      );
    if (m) {
      out.time = m[1].length === 4 ? `0${m[1]}` : m[1];
      out.axis = m[2].trim();
      out.I = Number(m[3]);
      out.S = Number(m[4]);
      out.tags = (m[5] || '')
        .split(/\s+/)
        .filter((t) => t.startsWith('#'))
        .map((t) => t.slice(1));
      return out;
    }
    const tm = /^(\d{1,2}:\d{2})/.exec(raw);
    if (tm) out.time = tm[1].length === 4 ? `0${tm[1]}` : tm[1];
    const am = /[·•]\s*([德智体美劳])\s*[·•]/.exec(raw);
    if (am) out.axis = am[1];
    const im = /I\s*(\d+(?:\.\d+)?)\s*S\s*(\d+(?:\.\d+)?)/.exec(raw);
    if (im) {
      out.I = Number(im[1]);
      out.S = Number(im[2]);
    }
    out.tags = [...raw.matchAll(/#([^\s#·•]+)/g)].map((x) => x[1]);
  } catch {
    /* 标题坏掉就用默认值 */
  }
  return out;
}

/** 当日档正文按 `## ` 小标题切块 */
function splitDayBlocks(body) {
  const lines = asText(body).split('\n');
  const heads = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) heads.push(i);
  }
  const blocks = [];
  for (let h = 0; h < heads.length; h += 1) {
    const start = heads[h];
    const end = h + 1 < heads.length ? heads[h + 1] : lines.length;
    blocks.push({ headingLine: lines[start], contentLines: lines.slice(start + 1, end) });
  }
  return blocks;
}

/**
 * 解析一份日档 Markdown。
 * 不抛错；坏条目按 normalizeEntry 默认值收编并写进 errors，同文件其他条目不受影响。
 * @param {string} text
 * @returns {{ front: object, entries: object[], errors: string[] }}
 */
export function parseDay(text) {
  const errors = [];
  const src = asText(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const parsed = parseFrontMatter(src);
  const front = parsed.front && typeof parsed.front === 'object' ? parsed.front : {};
  const day = typeof front.date === 'string' && DAY_DATE_RE.test(front.date) ? front.date : '';
  const body = parsed.body;
  const hasContent = Object.keys(front).length > 0 || body.trim() !== '';
  if (!day && hasContent) errors.push('缺少合法的 front-matter 日期（date: YYYY-MM-DD）');

  let blocks = [];
  try {
    blocks = splitDayBlocks(body);
  } catch {
    blocks = [];
  }
  if (!blocks.length) {
    if (body.trim()) errors.push('未找到条目小标题（## HH:MM · …），正文未收编');
    return { front, entries: [], errors };
  }

  const entries = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const { headingLine, contentLines } = blocks[index];
    const heading = parseHeading(headingLine);
    const label = `第 ${index + 1} 条${heading.time ? `（${heading.time}）` : ''}`;

    // 1) 找单行元数据注释
    let metaRaw = null;
    let content = contentLines.slice();
    for (let i = 0; i < content.length; i += 1) {
      const m = /^\s*<!--cyrene:([\s\S]*?)-->\s*$/.exec(content[i]);
      if (m) {
        metaRaw = m[1].trim();
        content.splice(i, 1);
        break;
      }
    }

    // 2) 元数据 → partial；坏 JSON 只影响本条
    let meta = null;
    if (metaRaw !== null) {
      try {
        const json = JSON.parse(metaRaw);
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          meta = json;
        } else {
          errors.push(`${label}：元数据不是对象，按默认值收编`);
        }
      } catch {
        errors.push(`${label}：元数据 JSON 解析失败，按默认值收编`);
      }
    } else {
      errors.push(`${label}：缺少 <!--cyrene:…--> 元数据，按默认值收编（I=4 S=1 axis=无）`);
    }

    // 3) 正文与引用行（引用行只在「> 原话：」时被摘出）
    let srcQuote = '';
    const kept = [];
    for (const line of content) {
      const qm = /^\s*>\s*原话\s*[:：]\s*(.*)$/.exec(line);
      if (qm) {
        if (!srcQuote) srcQuote = cleanQuote(qm[1]);
        continue;
      }
      kept.push(line);
    }
    const entryText = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (!meta && !entryText && !srcQuote) continue; // 空块跳过

    // 4) 元数据缺失/坏掉时严格按 CONTRACT §2 与设计 §4.2 的默认值收编：
    //    不拿人类可读小标题反推 axis/I/S（避免把「日记」伪造成结构化记忆）。
    //    小标题只用来兜底 created_at，让手改条目的时间仍然可读。
    const partial = { ...(meta || {}) };
    partial.text = entryText;
    partial.src_quote = srcQuote || partial.src_quote || '';

    const headingTs = timestampFrom(day, heading.time);
    const ctx = {
      day: day || undefined,
      path: day ? dayRelPath(day) : undefined,
    };
    if (Number.isFinite(headingTs)) ctx.now = headingTs;
    entries.push(normalizeEntry(partial, ctx));
  }

  // 5) front.entries 与实际条目数不一致时提示（不影响解析）
  const declared = Number(front.entries);
  if (Number.isFinite(declared) && declared !== entries.length) {
    errors.push(`front-matter 声明 entries=${declared}，实际解析到 ${entries.length} 条`);
  }
  return { front, entries, errors };
}
