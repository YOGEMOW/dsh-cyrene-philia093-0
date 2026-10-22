// 一页永恒 · 调度核心（lib/core.js）
// 契约：CONTRACT.md §3「lib/core.js」；设计：README 技术附录 §8.2（优先级公式）/ §8.3（S 更新）/ §8.4（比例调度）
// 纯 Node 22 ESM、零依赖。所有导出函数不改入参、对坏输入不抛（返回 0/默认值/原对象副本）。
//
// 公式速查：
//   I_eff = clamp(I × U × (1 + 0.12·ln(1 + n_recall)), 0.5, 12)   U = entry.user_mult（默认 1，限 0.5..1.5）
//   R     = exp(-Δt_days / S)                                     Δt 用 reviewed_at
//   P     = I_eff × R                                             「去留与配额」
//   S_sel = I_eff^0.8 × (0.35 + 0.65·(1−R)) × relGate              「这一轮该取谁」
//   relGate = rel > 0 ? min(1, rel/0.6) : 0
//
// 时间戳约定（刻意区分 §1 的三种时间）：
//   reviewed_at —— 艾宾浩斯只认它；只有 event='used' 会把它刷新为 now（§8.7「被取用」）
//   touched_at  —— 系统最后触碰，任何 review 事件都会更新（审计用）
//   缺失 reviewed_at 时回退到 created_at；两者都缺 → 视为刚复习过（R=1，安全默认）。

const MS_PER_DAY = 86_400_000;

// §8.4.1 基础权重（保证每一类都有位置，防「近况垄断」）
const BASE_WEIGHTS = Object.freeze({
  near: 0.22,
  mid: 0.18,
  far: 0.14,
  todo: 0.16,
  hit: 0.20,
  due: 0.10,
});
const BUCKET_KEYS = Object.freeze(['near', 'mid', 'far', 'todo', 'hit', 'due']);

const DEFAULT_BUDGET_CHARS = 1000; // §8.4.1 默认预算 B
const MAX_ITEM_CHARS = 300; // 单条硬上限
const MIN_BUCKET_CHARS = 60; // §8.4.1 C_min：配额不足的桶并入其他桶
const MIN_ITEM_CHARS = 8; // 剩余字数少于此不再切一条无意义摘要，交给水填充
const WATER_ROUNDS = 2; // §8.4.1 第 5 步：水填充最多 2 轮

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function reviewedAtOf(entry) {
  const reviewed = entry && typeof entry === 'object' ? entry.reviewed_at : undefined;
  if (typeof reviewed === 'number' && Number.isFinite(reviewed) && reviewed > 0) return reviewed;
  const created = entry && typeof entry === 'object' ? entry.created_at : undefined;
  if (typeof created === 'number' && Number.isFinite(created) && created > 0) return created;
  return null;
}

// S ≤ 0 / 缺失 / 非数 → 视为 1 天
function stabilityOf(entry) {
  const s = entry && typeof entry === 'object' ? entry.S : undefined;
  return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1;
}

function importanceOf(entry) {
  return clamp(num(entry && entry.I, 1), 1, 10);
}

function userMultOf(entry) {
  return clamp(num(entry && entry.user_mult, 1), 0.5, 1.5);
}

// §8.2 有效重要度
function effectiveImportance(entry) {
  const I = importanceOf(entry);
  const U = userMultOf(entry);
  const n = Math.max(0, num(entry && entry.n_recall, 0));
  return clamp(I * U * (1 + 0.12 * Math.log(1 + n)), 0.5, 12);
}

// §8.3 S_cap = min(3650, 30 · I_eff^1.5)
function stabilityCap(entry) {
  return Math.min(3650, 30 * Math.pow(effectiveImportance(entry), 1.5));
}

function textOf(entry) {
  return entry && typeof entry === 'object' && typeof entry.text === 'string' ? entry.text : '';
}

/**
 * 可及性（艾宾浩斯）：R = exp(-Δt天 / S)，Δt 用 reviewed_at。
 * @param {object} entry
 * @param {number} [now] ms
 * @returns {number} 0..1
 */
export function retention(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 1;
  const t = num(now, Date.now());
  const stamp = reviewedAtOf(entry);
  if (stamp === null) return 1;
  const dtDays = Math.max(0, (t - stamp) / MS_PER_DAY);
  const r = Math.exp(-dtDays / stabilityOf(entry));
  return Number.isFinite(r) ? clamp(r, 0, 1) : 0;
}

/**
 * 优先级：P = I_eff × R（决定「去留与配额」）。
 * @param {object} entry
 * @param {number} [now]
 * @returns {number}
 */
export function priority(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 0;
  return effectiveImportance(entry) * retention(entry, now);
}

/**
 * 本轮选取分：S_sel = I_eff^0.8 × (0.35 + 0.65·(1−R)) × relGate（决定「这一轮取谁」）。
 * relGate = rel > 0 ? min(1, rel/0.6) : 0 —— rel 为 0/缺失/坏值时整体为 0（不要写反）。
 * @param {object} entry
 * @param {number} rel 相关性 0..1（由 search 给出；无 query 时传 1）
 * @param {number} [now]
 * @returns {number}
 */
export function selectionScore(entry, rel, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 0;
  const r = retention(entry, now);
  const relValue = typeof rel === 'number' && Number.isFinite(rel) ? rel : 0;
  const relGate = relValue > 0 ? Math.min(1, relValue / 0.6) : 0;
  return Math.pow(effectiveImportance(entry), 0.8) * (0.35 + 0.65 * (1 - r)) * relGate;
}

/**
 * 复习/反馈事件 → 返回更新后的新 Entry（不改入参）。
 * event:
 *   'used'      S ← min(S×(1.8+0.4·I/10), S_cap)，n_recall+1，reviewed_at=now（§8.3 / §8.7）
 *   'corrected' S ← max(0.5, S×0.4)，I ← max(1, I×0.75)，U ×0.75（§8.2 U 语义）
 *   'praised'   S ← S×1.3，I ← min(10, I×1.15)，U ×1.25
 *   'dream'     S ← S×1.1（梦境复评通过的轻量维护）
 * 任何事件都刷新 touched_at；未知事件返回原样副本（不抛）。
 * @param {object} entry
 * @param {'used'|'corrected'|'praised'|'dream'} event
 * @param {number} [now]
 * @returns {object}
 */
export function review(entry, event, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return {};
  const t = num(now, Date.now());
  const I = importanceOf(entry);
  const S = stabilityOf(entry);
  const nRecall = Math.max(0, num(entry.n_recall, 0));
  const U = userMultOf(entry);
  const base = { ...entry, touched_at: t };

  switch (event) {
    case 'used': {
      const grown = S * (1.8 + (0.4 * I) / 10);
      return {
        ...base,
        S: Math.min(grown, stabilityCap(entry)),
        n_recall: Math.floor(nRecall) + 1,
        reviewed_at: t,
      };
    }
    case 'corrected':
      return {
        ...base,
        S: Math.max(0.5, S * 0.4),
        I: Math.max(1, I * 0.75),
        user_mult: clamp(U * 0.75, 0.5, 1.5),
      };
    case 'praised':
      return {
        ...base,
        S: S * 1.3,
        I: Math.min(10, I * 1.15),
        user_mult: clamp(U * 1.25, 0.5, 1.5),
      };
    case 'dream':
      return { ...base, S: S * 1.1 };
    default:
      return base;
  }
}

/**
 * 归档判定（§9.1 冻结阈值）：
 *   ① I_eff < 3 且 R < 0.25 → true
 *   ② status === 'dormant' 且 P < 2.5 且距 reviewed_at ≥ 30 天 → true
 * @param {object} entry
 * @param {number} [now]
 * @returns {boolean}
 */
export function shouldArchive(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return false;
  const t = num(now, Date.now());
  const eff = effectiveImportance(entry);
  const r = retention(entry, t);
  if (eff < 3 && r < 0.25) return true;
  if (entry.status === 'dormant') {
    const stamp = reviewedAtOf(entry);
    if (stamp === null) return priority(entry, t) < 2.5;
    const idleDays = (t - stamp) / MS_PER_DAY;
    if (priority(entry, t) < 2.5 && idleDays >= 30) return true;
  }
  return false;
}

/**
 * 复习到期分：1 − R（§8.3「R < 0.55 即到期」，此值越大越该复习）。
 * @param {object} entry
 * @param {number} [now]
 * @returns {number} 0..1
 */
export function dueScore(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 0;
  return clamp(1 - retention(entry, now), 0, 1);
}

const BOUNDARY = /[。！？；，、…!?;,.]/;

/**
 * 按句读截断并补「…」，结果长度 ≤ maxChars。
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
export function truncateText(text, maxChars) {
  if (typeof text !== 'string') return '';
  const max = Number.isFinite(maxChars) ? Math.floor(maxChars) : 0;
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return '…';
  const head = text.slice(0, max - 1);
  let cut = head;
  let last = -1;
  for (let i = head.length - 1; i >= 0; i -= 1) {
    if (BOUNDARY.test(head[i])) {
      last = i;
      break;
    }
  }
  // 边界太靠前会只剩几个字，得不偿失 → 直接硬截
  if (last >= Math.floor((max - 1) * 0.5)) cut = head.slice(0, last + 1);
  return `${cut}…`;
}

function weightsOf(keys) {
  const list = [...keys];
  const out = {};
  let sum = 0;
  for (const k of list) sum += BASE_WEIGHTS[k] || 0;
  for (const k of list) out[k] = sum > 0 ? (BASE_WEIGHTS[k] || 0) / sum : 1 / list.length;
  return out;
}

function quotasOf(keys, weights, budget) {
  const list = [...keys];
  const q = {};
  let sum = 0;
  for (const k of list) {
    q[k] = Math.floor(budget * weights[k] + 1e-9);
    sum += q[k];
  }
  let rest = budget - sum;
  const order = list.slice().sort((a, b) => weights[b] - weights[a]);
  let i = 0;
  while (rest > 0 && order.length > 0) {
    q[order[i % order.length]] += 1;
    rest -= 1;
    i += 1;
  }
  return q;
}

/**
 * 比例调度器（§8.4.1）。
 * buckets: { near:[{entry, rel}], mid, far, todo, hit, due }（也接受直接放 entry，此时 rel 视为 1）
 * → { items:[{entry, bucket, chars, text}], alloc:{bucket: 实际字数}, dropped:n }
 *   items[].entry 是「浅拷贝 + text 已截断」的新对象，入参不会被修改。
 * opts: { now, maxItemChars }
 * @param {object} buckets
 * @param {number} [budgetChars]
 * @param {{now?:number, maxItemChars?:number}} [opts]
 * @returns {{items:object[], alloc:object, dropped:number, error?:string}}
 */
export function allocate(buckets, budgetChars, opts = {}) {
  const result = { items: [], alloc: {}, dropped: 0 };
  try {
    const o = opts && typeof opts === 'object' ? opts : {};
    const now = num(o.now, Date.now());
    const maxItem =
      Number.isFinite(o.maxItemChars) && o.maxItemChars > 0
        ? Math.floor(o.maxItemChars)
        : MAX_ITEM_CHARS;
    const budget =
      Number.isFinite(budgetChars) && budgetChars > 0
        ? Math.floor(budgetChars)
        : DEFAULT_BUDGET_CHARS;
    if (!buckets || typeof buckets !== 'object') {
      result.error = 'buckets 必须是对象';
      return result;
    }

    // 1) 归一化 + 桶内按 selectionScore 降序
    const pool = {};
    let totalCandidates = 0;
    for (const key of BUCKET_KEYS) {
      const raw = Array.isArray(buckets[key]) ? buckets[key] : [];
      if (Array.isArray(buckets[key])) result.alloc[key] = 0;
      const list = [];
      for (const item of raw) {
        let entry = null;
        let rel = 1;
        if (item && typeof item === 'object') {
          if (item.entry !== undefined) {
            entry = item.entry;
            rel = Number.isFinite(item.rel) ? item.rel : 1;
          } else {
            entry = item;
          }
        }
        if (!entry || typeof entry !== 'object') continue;
        list.push({ entry, rel });
      }
      list.sort((a, b) => {
        const d = selectionScore(b.entry, b.rel, now) - selectionScore(a.entry, a.rel, now);
        if (d !== 0) return d;
        const ai = typeof a.entry.id === 'string' ? a.entry.id : '';
        const bi = typeof b.entry.id === 'string' ? b.entry.id : '';
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      });
      pool[key] = list;
      totalCandidates += list.length;
    }

    const active = BUCKET_KEYS.filter((k) => pool[k].length > 0);
    if (active.length === 0) return result;

    // 2) C_min=60：配额不足的桶并入其他桶（至少保留一个桶，否则预算全废）
    const alive = new Set(active);
    while (alive.size > 1) {
      const w = weightsOf(alive);
      const small = [...alive].filter((k) => Math.floor(budget * w[k] + 1e-9) < MIN_BUCKET_CHARS);
      if (small.length === 0) break;
      small.sort((a, b) => BASE_WEIGHTS[a] - BASE_WEIGHTS[b]);
      for (const k of small) {
        if (alive.size <= 1) break;
        alive.delete(k);
      }
    }
    const weights = weightsOf(alive);
    const quotas = quotasOf(alive, weights, budget);

    // 3) 桶内贪心填充 + 单条 ≤300 字（超出截断到摘要）
    const state = {};
    for (const k of BUCKET_KEYS) state[k] = { ptr: 0, used: 0 };
    const usedIds = new Set();
    const usedEntries = new Set();
    let usedChars = 0;

    const take = (key, cap) => {
      let gained = 0;
      const list = pool[key];
      const st = state[key];
      while (st.ptr < list.length) {
        const remain = Math.min(maxItem, Math.floor(cap - gained), budget - usedChars);
        if (remain < 1) break;
        const cand = list[st.ptr];
        const entry = cand.entry;
        const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
        if ((id !== null && usedIds.has(id)) || usedEntries.has(entry)) {
          st.ptr += 1;
          continue;
        }
        const text = textOf(entry);
        if (!text) {
          st.ptr += 1;
          continue;
        }
        if (text.length > remain && remain < MIN_ITEM_CHARS) break; // 留待水填充
        const outText = text.length <= remain ? text : truncateText(text, remain);
        if (!outText) {
          st.ptr += 1;
          continue;
        }
        st.ptr += 1;
        if (id !== null) usedIds.add(id);
        usedEntries.add(entry);
        usedChars += outText.length;
        gained += outText.length;
        st.used += outText.length;
        result.alloc[key] = st.used;
        result.items.push({
          entry: { ...entry, text: outText },
          bucket: key,
          chars: outText.length,
          text: outText,
        });
      }
      return gained;
    };

    for (const key of alive) take(key, quotas[key]);

    // 4) 水填充：填不满的桶把剩余字数按基础权重还给仍有候选的桶，最多 2 轮
    for (let round = 0; round < WATER_ROUNDS; round += 1) {
      const leftover = budget - usedChars;
      if (leftover < MIN_ITEM_CHARS) break;
      const open = [...alive].filter((k) => state[k].ptr < pool[k].length);
      if (open.length === 0) break;
      let sumW = 0;
      for (const k of open) sumW += BASE_WEIGHTS[k] || 0;
      let gainedRound = 0;
      for (const k of open) {
        const room = budget - usedChars;
        if (room < MIN_ITEM_CHARS) break;
        const share = Math.max(
          0,
          Math.min(room, Math.round((leftover * (BASE_WEIGHTS[k] || 0)) / (sumW || 1))),
        );
        if (share < MIN_ITEM_CHARS) continue;
        gainedRound += take(k, share);
      }
      if (gainedRound === 0) break;
    }

    result.dropped = totalCandidates - result.items.length;
    return result;
  } catch (err) {
    return {
      items: [],
      alloc: {},
      dropped: 0,
      error: `allocate 失败：${err && err.message ? err.message : String(err)}`,
    };
  }
}
