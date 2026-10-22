// 一页永恒 · 检索层（lib/search.js）
// 契约：CONTRACT.md §3「lib/search.js」；设计：README 技术附录 §8.5（检索打分 + 噪音门）
// 纯 Node 22 ESM、零第三方依赖。所有导出函数对坏输入不抛：返回 [] / 0 / 原样过滤。
//
// 打分口径（与 §8.5 对齐）：
//   kw 部分：idf 加权的 query token「在条目 kw 词表里的命中率」（词表优先）
//   文本部分：BM25（k1=1.5, b=0.75）在条目 text 上的归一化得分
//   rel = clamp(0.55·kwCov + 0.45·textCov, 0, 1)
//   score 与 rel 同值（rel 已归一化到 0..1，可直接喂给噪音门与 core.selectionScore）；
//   两个字段都保留是为了满足契约，同时便于 Phase 1 换打分器时只改 score。
//
// 噪音门（§8.5）：gateHit(hits) —— top1 < 0.45 整块丢弃；低于 0.6×top1 的候选丢弃。

const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const LATIN_RUN = /[a-z0-9]+(?:['’-][a-z0-9]+)*/g;
const PURE_DIGITS = /^[0-9]+$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// BM25 参数（§8.5）
const BM25_K1 = 1.5;
const BM25_B = 0.75;
// rel 合成权重：中文 2-gram 噪音大，词表命中优先（§8.5「词表优先」）
const REL_W_KW = 0.55;
const REL_W_TEXT = 0.45;
// 噪音门阈值（§8.5）
const GATE_TOP1_MIN = 0.45;
const GATE_RELATIVE = 0.6;

// 中文停用「二元组」：整体命中即丢弃
const STOP_GRAMS = new Set([
  '我们', '你们', '他们', '她们', '它们', '咱们', '什么', '怎么', '怎样', '这样',
  '那样', '这个', '那个', '这些', '那些', '就是', '还是', '也是', '因为', '所以',
  '但是', '不过', '如果', '虽然', '而且', '然后', '已经', '曾经', '自己', '现在',
  '时候', '可以', '可能', '应该', '需要', '一个', '一些', '一下', '一点', '大家',
  '别人', '知道', '觉得', '认为', '记得', '不是', '没有', '怎么', '多么', '一样',
  '这种', '那种', '其中', '以及', '或者', '由于', '因此', '于是', '甚至', '并且',
  '而是', '只是', '还有', '不会', '不能', '不用', '不要', '是否', '如何',
]);

// 中文停用单字：只有二元组「两个字都停用」时才丢（保留「喜欢 / 写作」这类实词组合）
const STOP_CHARS = new Set([
  '的', '了', '是', '在', '有', '和', '就', '不', '都', '也', '很', '到', '说',
  '要', '去', '会', '着', '看', '好', '这', '那', '么', '吗', '呢', '吧', '啊',
  '呀', '哦', '嗯', '我', '你', '他', '她', '它', '们', '个', '一', '上', '及',
  '与', '从', '对', '被', '把', '给', '而', '或', '且', '等', '之', '其', '又',
  '还', '再', '才', '已', '将', '则', '却', '只', '没', '无', '该', '让', '使',
]);

// 英文停用词（简单词干后依然查一次）
const STOP_WORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'it', 'its',
  'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'our', 'their', 'there',
  'here', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'not',
  'no', 'nor', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could',
  'should', 'would', 'will', 'just', 'very', 'so', 'about', 'into', 'over',
  'under', 'again', 'more', 'most', 'some', 'any', 'all', 'both', 'each',
  'other', 'such', 'only', 'own', 'same', 'too', 'also',
]);

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// 极简英文词干：只处理复数，避免误伤（Phase 0 够用，Phase 1 可换 Porter）
function stemEn(word) {
  if (typeof word !== 'string' || word.length <= 3) return word;
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function cjkTokens(run) {
  const chars = Array.from(run);
  if (chars.length === 1) {
    const c = chars[0];
    return STOP_CHARS.has(c) ? [] : [c];
  }
  const out = [];
  for (let i = 0; i + 1 < chars.length; i += 1) {
    const a = chars[i];
    const b = chars[i + 1];
    const gram = a + b;
    if (STOP_GRAMS.has(gram)) continue;
    if (STOP_CHARS.has(a) && STOP_CHARS.has(b)) continue;
    out.push(gram);
  }
  return out;
}

// 内部：保留重复（BM25 需要词频）
function rawTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const s = text.normalize('NFKC').toLowerCase();
  const out = [];
  for (const run of s.match(CJK_RUN) || []) {
    for (const t of cjkTokens(run)) out.push(t);
  }
  for (const w of s.match(LATIN_RUN) || []) {
    if (PURE_DIGITS.test(w)) continue; // 纯数字不参与检索
    if (STOP_WORDS_EN.has(w)) continue;
    const stem = stemEn(w);
    if (stem.length < 2 || STOP_WORDS_EN.has(stem)) continue;
    out.push(stem);
  }
  return out;
}

/**
 * 分词：中文 2-gram（去停用词）+ 英文小写化/简单词干；结果去重保序。
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const seen = new Set();
  const out = [];
  for (const t of rawTokens(text)) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function entryKws(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.kw)) return [];
  const out = [];
  for (const raw of entry.kw) {
    if (typeof raw !== 'string') continue;
    const k = raw.normalize('NFKC').toLowerCase().trim();
    if (k) out.push(k);
  }
  return out;
}

// kw 词表 → 词项集合（含整词 + 该词的 2-gram，实现「词表优先 + 子串命中」）
function kwTermSet(entry) {
  const set = new Set();
  for (const k of entryKws(entry)) {
    set.add(k);
    for (const g of tokenize(k)) set.add(g);
  }
  return set;
}

function textOf(entry) {
  return entry && typeof entry === 'object' && typeof entry.text === 'string' ? entry.text : '';
}

/**
 * 关键词得分：query token 命中条目 kw 的覆盖率，封顶 8 个 kw（§8.5）。
 * 分母 = max(3, min(8, |kw|))，避免 kw 少的条目白拿高分、kw 多的条目吃亏。
 * @param {object} entry
 * @param {string[]|string} queryTokens
 * @returns {number} 0..1
 */
export function keywordScore(entry, queryTokens) {
  if (!entry || typeof entry !== 'object') return 0;
  const toks = Array.isArray(queryTokens) ? queryTokens : tokenize(queryTokens);
  if (!toks.length) return 0;
  const kws = entryKws(entry);
  if (!kws.length) return 0;
  const denom = Math.max(3, Math.min(8, kws.length));
  let hits = 0;
  for (const kw of kws) {
    const grams = new Set([kw, ...tokenize(kw)]);
    if (toks.some((t) => grams.has(t))) hits += 1;
  }
  return clamp01(hits / denom);
}

function dayOf(entry) {
  if (!entry || typeof entry !== 'object') return '';
  if (typeof entry.day === 'string' && DAY_RE.test(entry.day)) return entry.day;
  for (const key of ['fact_time', 'created_at', 'reviewed_at']) {
    const v = entry[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return '';
}

function fieldMatch(value, want) {
  if (want === undefined || want === null) return true;
  if (Array.isArray(want)) return want.some((w) => w === value);
  return want === value;
}

function projectMatch(entry, want) {
  const wants = Array.isArray(want) ? want : [want];
  return wants.some((p) => {
    if (typeof p !== 'string' || !p) return false;
    if (entry.project === p) return true;
    if (Array.isArray(entry.kw) && entry.kw.some((k) => typeof k === 'string' && (k === p || k.includes(p)))) {
      return true;
    }
    return typeof entry.text === 'string' && entry.text.includes(p);
  });
}

/**
 * 结构化过滤。不按状态做默认过滤（那是 search 的 includeArchive 职责）。
 * filters: {axis, q, kind, dayFrom, dayTo, status, project}；文本类字段接受数组（或语义）。
 * @param {object[]} entries
 * @param {object} filters
 * @returns {object[]}
 */
export function filterEntries(entries, filters = {}) {
  if (!Array.isArray(entries)) return [];
  const f = filters && typeof filters === 'object' ? filters : {};
  const dayFrom = typeof f.dayFrom === 'string' && f.dayFrom ? f.dayFrom.slice(0, 10) : null;
  const dayTo = typeof f.dayTo === 'string' && f.dayTo ? f.dayTo.slice(0, 10) : null;
  return entries.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (!fieldMatch(entry.axis, f.axis)) return false;
    if (!fieldMatch(entry.q, f.q)) return false;
    if (!fieldMatch(entry.kind, f.kind)) return false;
    if (!fieldMatch(entry.status, f.status)) return false;
    if (dayFrom || dayTo) {
      const day = dayOf(entry);
      if (!day) return false;
      if (dayFrom && day < dayFrom) return false;
      if (dayTo && day > dayTo) return false;
    }
    if (f.project !== undefined && f.project !== null && !projectMatch(entry, f.project)) return false;
    return true;
  });
}

/**
 * 检索。archived/tombstone 默认过滤；显式 filters.status 优先于 includeArchive。
 * @param {object[]} entries
 * @param {string} query
 * @param {{topK?:number, includeArchive?:boolean, filters?:object}} [opts]
 * @returns {{entry:object, score:number, rel:number}[]}
 */
export function search(entries, query, opts = {}) {
  try {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const o = opts && typeof opts === 'object' ? opts : {};
    const topK = Number.isFinite(o.topK) && o.topK > 0 ? Math.floor(o.topK) : 5;
    const filters = o.filters && typeof o.filters === 'object' ? o.filters : {};
    const includeArchive = o.includeArchive === true;
    const explicitStatus = filters.status !== undefined && filters.status !== null;
    const qTokens = tokenize(typeof query === 'string' ? query : '');
    if (qTokens.length === 0) return []; // 无 query / 只有停用词 → 不注入「相关」

    let pool = filterEntries(entries, filters);
    if (!includeArchive && !explicitStatus) {
      pool = pool.filter((e) => e.status !== 'archived' && e.status !== 'tombstone');
    }
    if (pool.length === 0) return [];

    // df 用全库（含被过滤条目），保证分数跨 query 可比（§8.5）
    const df = new Map();
    let n = 0;
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      n += 1;
      const terms = new Set([...kwTermSet(e), ...rawTokens(textOf(e))]);
      for (const t of terms) df.set(t, (df.get(t) || 0) + 1);
    }
    const idfOf = (t) => {
      const d = df.get(t) || 0;
      return Math.log(1 + (n - d + 0.5) / (d + 0.5));
    };
    // 归一化只用「全库确实出现过」的 query token：df=0 的多半是 2-gram 噪音，
    // 让它进分母会把真实命中率稀释掉（噪音门 0.45 会失效）。
    let idfSum = 0;
    for (const t of qTokens) {
      if ((df.get(t) || 0) > 0) idfSum += idfOf(t);
    }
    if (!(idfSum > 0)) return [];

    const docs = pool.map((entry) => {
      const textTokens = rawTokens(textOf(entry));
      const tf = new Map();
      for (const t of textTokens) tf.set(t, (tf.get(t) || 0) + 1);
      return { entry, kwTerms: kwTermSet(entry), tf, dl: textTokens.length };
    });
    let totalDl = 0;
    for (const d of docs) totalDl += d.dl;
    const avgdl = docs.length > 0 ? totalDl / docs.length : 0;

    const scored = [];
    for (const d of docs) {
      let kwIdfHit = 0;
      for (const t of qTokens) {
        if (d.kwTerms.has(t)) kwIdfHit += idfOf(t);
      }
      const kwCov = clamp01(kwIdfHit / idfSum);
      let bm25 = 0;
      for (const t of qTokens) {
        const tfv = d.tf.get(t);
        if (!tfv) continue;
        const lenNorm = 1 - BM25_B + BM25_B * (avgdl > 0 ? d.dl / avgdl : 0);
        bm25 += (idfOf(t) * (tfv * (BM25_K1 + 1))) / (tfv + BM25_K1 * lenNorm);
      }
      const textCov = clamp01(bm25 / (idfSum * (BM25_K1 + 1)));
      const rel = clamp01(REL_W_KW * kwCov + REL_W_TEXT * textCov);
      if (rel <= 0) continue;
      scored.push({ entry: d.entry, score: rel, rel });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ai = typeof a.entry.id === 'string' ? a.entry.id : '';
      const bi = typeof b.entry.id === 'string' ? b.entry.id : '';
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
    return scored.slice(0, topK);
  } catch {
    return [];
  }
}

/**
 * 两个 id 数组的 Jaccard 相似度（用于去重/联结判断）。
 * @returns {number} 0..1；坏输入 → 0
 */
export function jaccard(a, b) {
  const as = Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x) : [];
  const bs = Array.isArray(b) ? b.filter((x) => typeof x === 'string' && x) : [];
  if (as.length === 0 && bs.length === 0) return 0;
  const A = new Set(as);
  const B = new Set(bs);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = new Set([...A, ...B]).size;
  return union > 0 ? inter / union : 0;
}

/**
 * 文本相似度：2-gram 余弦（§8.4 去重 / MMR 用）。
 * @returns {number} 0..1；坏输入 → 0
 */
export function textSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0;
  const ta = new Map();
  for (const t of rawTokens(a)) ta.set(t, (ta.get(t) || 0) + 1);
  const tb = new Map();
  for (const t of rawTokens(b)) tb.set(t, (tb.get(t) || 0) + 1);
  if (ta.size === 0 || tb.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [t, c] of ta) {
    na += c * c;
    const d = tb.get(t);
    if (d) dot += c * d;
  }
  for (const c of tb.values()) nb += c * c;
  if (na === 0 || nb === 0) return 0;
  return clamp01(dot / Math.sqrt(na * nb));
}

/**
 * 噪音门（§8.5）：top1 < 0.45 → 整块丢弃；低于 0.6×top1 的候选丢弃。
 * 输入是 search 的返回值（或任何带 rel 的 {rel} 数组），返回过滤后的数组（不保证顺序）。
 * @param {{rel?:number, score?:number}[]} hits
 * @returns {object[]}
 */
export function gateHit(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return [];
  const relOf = (h) => {
    if (!h || typeof h !== 'object') return 0;
    if (Number.isFinite(h.rel)) return h.rel;
    if (Number.isFinite(h.score)) return h.score;
    return 0;
  };
  const valid = hits.filter((h) => h && typeof h === 'object');
  if (valid.length === 0) return [];
  let top1 = 0;
  for (const h of valid) {
    const r = relOf(h);
    if (r > top1) top1 = r;
  }
  if (!(top1 >= GATE_TOP1_MIN)) return [];
  const floor = GATE_RELATIVE * top1;
  return valid.filter((h) => relOf(h) >= floor);
}
