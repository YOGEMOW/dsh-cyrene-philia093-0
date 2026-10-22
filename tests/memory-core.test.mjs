// test/core.test.mjs —— 艾宾浩斯 / 比例调度测试（node:test + assert/strict，构造假条目）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  retention,
  priority,
  selectionScore,
  review,
  shouldArchive,
  dueScore,
  allocate,
  truncateText,
} from '../memory/core.js';

const DAY = 86400000;
const NOW = 1792000000000; // 固定「现在」，所有数值断言都可复现

function mkEntry(over = {}) {
  return {
    id: 'e1',
    text: '用户更喜欢先看结论。',
    kind: 'fact',
    axis: '智',
    q: '你',
    I: 6,
    S: 3,
    status: 'active',
    kw: ['偏好'],
    src: 'conv',
    src_ids: [],
    src_quote: '',
    sup: null,
    links: [],
    fact_time: NOW,
    reviewed_at: NOW,
    touched_at: NOW,
    created_at: NOW,
    day: '2026-10-18',
    path: '日/2026/10/2026-10-18.md',
    sync: true,
    n_recall: 0,
    ...over,
  };
}

function close(actual, expected, eps = 1e-9, msg) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    msg ?? `期望 ${expected}，实际 ${actual}（容差 ${eps}）`,
  );
}

let idSeq = 0;
function mkText(len, over = {}) {
  idSeq += 1;
  return mkEntry({ id: `id-${String(idSeq).padStart(3, '0')}`, text: '甲'.repeat(len), ...over });
}
function list(n, len, over = {}) {
  return Array.from({ length: n }, () => ({ entry: mkText(len, over), rel: 1 }));
}

// ---------- retention（§8.2 艾宾浩斯）----------

test('retention：R = exp(-Δt/S)，Δt 用 reviewed_at', () => {
  close(retention(mkEntry({ S: 2 }), NOW), 1, 1e-12);
  close(retention(mkEntry({ S: 2 }), NOW + DAY), Math.exp(-0.5), 1e-12);
  close(retention(mkEntry({ S: 2 }), NOW + 2 * DAY), Math.exp(-1), 1e-12);
  close(retention(mkEntry({ S: 2 }), NOW + 10 * DAY), Math.exp(-5), 1e-12);
  // S ≤ 0 / 非数 → 视为 1 天
  close(retention(mkEntry({ S: 0 }), NOW + DAY), Math.exp(-1), 1e-12);
  close(retention(mkEntry({ S: -3 }), NOW + DAY), Math.exp(-1), 1e-12);
  close(retention(mkEntry({ S: 'x' }), NOW + DAY), Math.exp(-1), 1e-12);
  // reviewed_at 在未来 → Δt 取 0
  close(retention(mkEntry({ S: 2 }), NOW - 5 * DAY), 1, 1e-12);
  // 缺 reviewed_at → 回退 created_at
  const fallback = mkEntry({ reviewed_at: undefined, created_at: NOW - 2 * DAY, S: 2 });
  close(retention(fallback, NOW), Math.exp(-1), 1e-12);
  // 两者都缺 → 安全默认（视为刚复习过）
  assert.equal(retention(mkEntry({ reviewed_at: undefined, created_at: undefined }), NOW + 100 * DAY), 1);
  // 坏输入不抛
  assert.equal(retention(null, NOW), 1);
  assert.equal(retention(42, NOW), 1);
});

// ---------- priority（§8.2 I_eff × R）----------

test('priority：I_eff × R，含 U / n_recall 增益与 clamp', () => {
  close(priority(mkEntry({ S: 2 }), NOW + DAY), 6 * Math.exp(-0.5), 1e-12);
  close(priority(mkEntry({ S: 2, user_mult: 1.2 }), NOW + DAY), 7.2 * Math.exp(-0.5), 1e-12);

  const gain = 5 * (1 + 0.12 * Math.log(11));
  close(priority(mkEntry({ I: 5, S: 2, n_recall: 10 }), NOW + DAY), gain * Math.exp(-0.5), 1e-12);

  // 上限 12
  close(priority(mkEntry({ I: 10, user_mult: 1.5, n_recall: 1000, S: 100 }), NOW), 12, 1e-9);
  // 下限 0.5
  close(priority(mkEntry({ I: 1, user_mult: 0.5, S: 100 }), NOW), 0.5, 1e-9);
  // I 越界夹回 1..10
  close(priority(mkEntry({ I: 0, S: 100 }), NOW), 1, 1e-9);
  close(priority(mkEntry({ I: 99, S: 100 }), NOW), 10, 1e-9);
  assert.equal(priority(null, NOW), 0);
});

// ---------- selectionScore（§8.4.1 relGate）----------

test('selectionScore：relGate 方向（rel≤0 关死门）与「快忘了优先」', () => {
  const base = mkEntry({ I: 6, S: 100 }); // R ≈ 1
  close(selectionScore(base, 1, NOW), Math.pow(6, 0.8) * 0.35, 1e-9);
  close(selectionScore(base, 0.6, NOW), Math.pow(6, 0.8) * 0.35, 1e-9); // 0.6 → gate=1
  close(selectionScore(base, 0.3, NOW), Math.pow(6, 0.8) * 0.35 * 0.5, 1e-9); // 0.3 → gate=0.5

  assert.equal(selectionScore(base, 0, NOW), 0);
  assert.equal(selectionScore(base, undefined, NOW), 0, 'rel 缺失时 relGate 必须为 0');
  assert.equal(selectionScore(base, -1, NOW), 0);
  assert.equal(selectionScore(base, NaN, NOW), 0);
  assert.equal(selectionScore(null, 1, NOW), 0);

  // 快忘了的条目本轮更应该被取用（复习调度方向）
  const decayed = mkEntry({ I: 6, S: 1, reviewed_at: NOW - 2 * DAY });
  const R = Math.exp(-2);
  close(selectionScore(decayed, 1, NOW), Math.pow(6, 0.8) * (0.35 + 0.65 * (1 - R)), 1e-9);
  assert.ok(selectionScore(decayed, 1, NOW) > selectionScore(base, 1, NOW));
});

// ---------- review（§8.3 S 更新）----------

test('review(used)：S 增长、S_cap、n_recall、reviewed_at，且不改入参', () => {
  const e = mkEntry({ I: 6, S: 3, n_recall: 2 });
  const now = NOW + DAY;
  const r = review(e, 'used', now);
  const grown = 3 * (1.8 + 0.4 * 0.6);
  const cap = Math.min(3650, 30 * Math.pow(6, 1.5));
  close(r.S, Math.min(grown, cap), 1e-12);
  assert.equal(r.n_recall, 3);
  assert.equal(r.reviewed_at, now);
  assert.equal(r.touched_at, now);
  assert.notEqual(r, e);
  assert.equal(e.S, 3, '入参不得被修改');
  assert.equal(e.n_recall, 2);
  assert.equal(e.reviewed_at, NOW);

  // S_cap 压住暴涨：30·I_eff^1.5
  const big = review(mkEntry({ I: 8, S: 1000 }), 'used', now);
  close(big.S, Math.min(3650, 30 * Math.pow(8, 1.5)), 1e-9);

  // S=0 → 视为 1
  close(review(mkEntry({ I: 6, S: 0 }), 'used', now).S, 1 * (1.8 + 0.24), 1e-12);
});

test('review(corrected/praised/dream)：S/I/U 按 §8.3，纠正不刷新 reviewed_at', () => {
  const e = mkEntry({ I: 6, S: 3, n_recall: 1 });
  const now = NOW + DAY;

  const c = review(e, 'corrected', now);
  close(c.S, 1.2); // 3 × 0.4
  close(c.I, 4.5); // 6 × 0.75
  assert.equal(c.user_mult, 0.75);
  assert.equal(c.reviewed_at, NOW, '纠正不重置艾宾浩斯（优先级应下降）');
  assert.equal(c.touched_at, now);

  const floorE = review(mkEntry({ I: 1, S: 1 }), 'corrected', now);
  assert.equal(floorE.S, 0.5);
  assert.equal(floorE.I, 1);

  const p = review(mkEntry({ I: 9, S: 2 }), 'praised', now);
  close(p.S, 2.6);
  assert.equal(p.I, 10);
  assert.equal(p.user_mult, 1.25);

  const d = review(mkEntry({ I: 6, S: 2 }), 'dream', now);
  close(d.S, 2.2);

  // 未知事件 → 原样副本（只刷 touched_at），不抛
  const u = review(e, 'nope', now);
  assert.deepEqual(u, { ...e, touched_at: now });
  assert.deepEqual(review(null, 'used', now), {});
});

// ---------- shouldArchive（§9.1 冻结阈值）----------

test('shouldArchive：I_eff<3 且 R<0.25，或 dormant 且 P<2.5 且 ≥30 天', () => {
  assert.equal(shouldArchive(mkEntry({ I: 2, S: 1, reviewed_at: NOW - 2 * DAY }), NOW), true);
  assert.equal(shouldArchive(mkEntry({ I: 2, S: 100, reviewed_at: NOW - DAY }), NOW), false);
  // I_eff ≥ 3 时第一条不触发
  assert.equal(shouldArchive(mkEntry({ I: 4, S: 1, reviewed_at: NOW - 3 * DAY }), NOW), false);
  // dormant 分支：P 低 + 闲置 ≥30 天
  assert.equal(
    shouldArchive(mkEntry({ I: 4, S: 1, status: 'dormant', reviewed_at: NOW - 40 * DAY }), NOW),
    true,
  );
  assert.equal(
    shouldArchive(mkEntry({ I: 4, S: 1, status: 'dormant', reviewed_at: NOW - 2 * DAY }), NOW),
    false,
  );
  // dormant 但 P 高 → 不归档
  assert.equal(
    shouldArchive(mkEntry({ I: 10, S: 100, status: 'dormant', reviewed_at: NOW - 40 * DAY }), NOW),
    false,
  );
  assert.equal(shouldArchive(null, NOW), false);
});

test('dueScore：1 − R', () => {
  close(dueScore(mkEntry({ S: 2 }), NOW + DAY), 1 - Math.exp(-0.5), 1e-12);
  assert.equal(dueScore(mkEntry({ S: 100 }), NOW), 0);
  assert.equal(dueScore(null, NOW), 0);
});

// ---------- truncateText ----------

test('truncateText：按句读截断、补「…」、长度 ≤ maxChars', () => {
  assert.equal(truncateText('你好', 5), '你好');
  assert.equal(truncateText('abc', 3), 'abc');
  assert.equal(truncateText('你好。世界。再见。', 8), '你好。世界。…');
  assert.equal(truncateText('abcdefghij', 5), 'abcd…');
  assert.equal(truncateText('你好世界', 1), '…');
  assert.equal(truncateText('你好世界', 0), '');
  assert.equal(truncateText('你好世界', -3), '');
  assert.equal(truncateText(null, 5), '');
  assert.equal(truncateText(42, 5), '');
  for (const max of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const out = truncateText('今天天气很好。我们出门散步吧。', max);
    assert.ok(out.length <= max, `max=${max} 结果超长：${out}`);
    assert.ok(out.endsWith('…'), `max=${max} 应补省略号`);
  }
});

// ---------- allocate（§8.4 比例调度）----------

test('allocate：基础权重配额（6 桶全有货，预算 1000）', () => {
  const buckets = {
    near: list(12, 20),
    mid: list(12, 20),
    far: list(12, 20),
    todo: list(12, 20),
    hit: list(12, 20),
    due: list(12, 20),
  };
  const res = allocate(buckets, 1000, { now: NOW });
  assert.equal(res.error, undefined);
  assert.deepEqual(res.alloc, { near: 220, mid: 180, far: 140, todo: 160, hit: 200, due: 100 });

  const counts = {};
  let sum = 0;
  for (const it of res.items) {
    counts[it.bucket] = (counts[it.bucket] || 0) + 1;
    assert.ok(it.chars <= 300, '单条不得超过 300 字');
    assert.equal(it.chars, it.text.length);
    assert.equal(it.entry.text, it.text);
    sum += it.chars;
  }
  assert.equal(sum, 1000);
  assert.deepEqual(counts, { near: 11, mid: 9, far: 7, todo: 8, hit: 10, due: 5 });
  assert.equal(res.dropped, 72 - 50);
});

test('allocate：空桶权重按比例并给存在的桶', () => {
  const buckets = { near: list(30, 20), mid: list(30, 20), far: [], todo: [], hit: [], due: [] };
  const res = allocate(buckets, 1000, { now: NOW });
  assert.equal(res.alloc.near, 550); // .22/.40
  assert.equal(res.alloc.mid, 450); // .18/.40
  assert.equal(res.alloc.far, 0);
  assert.equal(res.items.reduce((s, i) => s + i.chars, 0), 1000);
});

test('allocate：单条 ≤300 字（truncateText 截断），且不改入参', () => {
  const e = mkText(1000);
  const res = allocate({ near: [{ entry: e, rel: 1 }] }, 1000, { now: NOW });
  assert.equal(res.items.length, 1);
  const it = res.items[0];
  assert.equal(it.chars, 300);
  assert.equal(it.text.length, 300);
  assert.ok(it.text.endsWith('…'));
  assert.notEqual(it.entry, e, '返回的 entry 应是新对象');
  assert.equal(it.entry.text.length, 300);
  assert.equal(e.text.length, 1000, '入参不得被截断');
  assert.equal(res.alloc.near, 300);
  assert.equal(res.dropped, 0);
});

test('allocate：预算很小时 C_min 把配额并入其他桶，总量不超预算', () => {
  const buckets = {
    near: list(10, 20),
    mid: list(10, 20),
    far: list(10, 20),
    todo: list(10, 20),
    hit: list(10, 20),
    due: list(10, 20),
  };
  const res = allocate(buckets, 200, { now: NOW });
  const sum = res.items.reduce((s, i) => s + i.chars, 0);
  assert.equal(sum, 200);
  const used = [...new Set(res.items.map((i) => i.bucket))];
  assert.deepEqual(used, ['near'], 'C_min 后应只剩权重最大的桶（near）');
});

test('allocate：水填充最多 2 轮，把剩余额度还给仍有候选的桶', () => {
  const near = [{ entry: mkText(10), rel: 1 }];
  const mid = list(30, 20);
  const res = allocate({ near, mid }, 1000, { now: NOW });
  assert.equal(res.alloc.near, 10);
  assert.equal(res.alloc.mid, 590); // 450 配额 + 140 水
  assert.equal(res.items.reduce((s, i) => s + i.chars, 0), 600);
  assert.equal(res.items.length, 31);
  assert.equal(res.dropped, 0);
});

test('allocate：桶内按 selectionScore 降序（快忘了的优先）', () => {
  const fresh = { entry: mkText(20, { I: 8, S: 100 }), rel: 1 };
  const decayed = { entry: mkText(20, { I: 8, S: 1, reviewed_at: NOW - 2 * DAY }), rel: 1 };
  const res = allocate({ near: [fresh, decayed] }, 1000, { now: NOW });
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].entry.id, decayed.entry.id);
});

test('allocate：跨桶同一条目只注入一次', () => {
  const shared = mkText(20);
  const res = allocate(
    { near: [{ entry: shared, rel: 1 }], hit: [{ entry: shared, rel: 1 }] },
    1000,
    { now: NOW },
  );
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].bucket, 'near');
  assert.equal(res.dropped, 1);
});

test('allocate：坏输入不抛，返回默认结构', () => {
  assert.deepEqual(allocate(null, 1000), {
    items: [],
    alloc: {},
    dropped: 0,
    error: 'buckets 必须是对象',
  });
  assert.deepEqual(allocate({}, 1000).items, []);

  const badEntry = allocate({ near: [{ entry: null }, 42, null] }, 1000);
  assert.deepEqual(badEntry.items, []);

  const weirdBudget = allocate({ near: list(3, 20) }, 'abc');
  assert.ok(Array.isArray(weirdBudget.items));
  assert.equal(weirdBudget.error, undefined);

  const nonArray = allocate({ near: mkText(20) }, 1000);
  assert.deepEqual(nonArray.items, []);

  // 允许桶里直接放 entry（不带 {entry, rel}）→ rel 视为 1
  const bare = allocate({ near: [mkText(20)] }, 1000, { now: NOW });
  assert.equal(bare.items.length, 1);
  assert.ok(bare.items[0].chars > 0);
});
