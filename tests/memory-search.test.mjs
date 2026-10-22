// test/search.test.mjs —— 检索层测试（node:test + assert/strict，构造假条目，不读真实目录）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  tokenize,
  keywordScore,
  search,
  filterEntries,
  jaccard,
  textSimilarity,
  gateHit,
} from '../memory/search.js';

const T0 = 1792000000000; // 固定时间戳（2026-10-18 前后），只当数据用

let seq = 0;
function makeEntry(over = {}) {
  seq += 1;
  return {
    id: `2026101814${String(seq).padStart(4, '0')}-a1b2c3`,
    text: '用户说他更喜欢先看结论，再看过程。',
    kind: 'fact',
    axis: '智',
    q: '你',
    I: 6,
    S: 3,
    status: 'active',
    kw: ['偏好', '写作', '结论'],
    src: 'conv',
    src_ids: [],
    src_quote: '',
    sup: null,
    links: [],
    fact_time: T0,
    reviewed_at: T0,
    touched_at: T0,
    created_at: T0,
    day: '2026-10-18',
    path: '日/2026/10/2026-10-18.md',
    sync: true,
    n_recall: 0,
    ...over,
  };
}

// 一个小型假库：a1/a2 与「写作偏好」相关，b1 无关，c* 是归档/墓志
function makeLibrary() {
  return [
    makeEntry({ id: 'a1', kw: ['偏好', '写作', '结论'], text: '用户说他更喜欢先看结论，再看过程。' }),
    makeEntry({
      id: 'a2',
      kw: ['写作', '偏好'],
      text: '用户希望写作时先给结论。',
      kind: 'decision',
      axis: '美',
    }),
    makeEntry({ id: 'b1', kw: ['作息', '睡眠'], text: '用户每天凌晨两点才睡。', kind: 'fact', axis: '体' }),
    makeEntry({ id: 'c1', kw: ['偏好', '写作', '结论'], status: 'archived' }),
    makeEntry({ id: 'c2', kw: ['偏好', '写作', '结论'], status: 'tombstone' }),
    makeEntry({ id: 'd1', kw: ['跑步', '计划'], text: '每周三跑步五公里。', axis: '体', day: '2026-10-20' }),
    makeEntry({ id: 'p1', kw: ['一页永恒', '设计'], text: '一页永恒的设计目标是可解释。', day: '2026-10-01' }),
  ];
}

// ---------- tokenize ----------

test('tokenize：中文 2-gram、去重保序', () => {
  const toks = tokenize('我喜欢写作，写作很重要');
  assert.ok(toks.includes('喜欢'), '应包含「喜欢」');
  assert.ok(toks.includes('写作'), '应包含「写作」');
  assert.ok(toks.includes('重要'), '应包含「重要」');
  assert.equal(toks.filter((t) => t === '写作').length, 1, '重复词应去重');
  assert.ok(!toks.includes('，'), '标点不应成为 token');
  assert.deepEqual(tokenize('写作'), ['写作']);
});

test('tokenize：停用词被丢弃', () => {
  assert.deepEqual(tokenize('我们 的 了 是 就 不'), []);
  assert.deepEqual(tokenize('的'), []);
  assert.deepEqual(tokenize('我们'), []);
  // 单字实词保留
  assert.deepEqual(tokenize('梦'), ['梦']);
});

test('tokenize：英文小写化 + 简单词干 + 纯数字丢弃', () => {
  assert.deepEqual(tokenize('Hello, the World!'), ['hello', 'world']);
  assert.deepEqual(tokenize('CATS'), ['cat']);
  assert.deepEqual(tokenize('2026 10 18 42'), []);
  assert.deepEqual(tokenize('A'), []);
});

test('tokenize：坏输入不抛，返回空数组', () => {
  for (const bad of [null, undefined, 42, {}, [], true]) {
    assert.deepEqual(tokenize(bad), []);
  }
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('！！！？？？……'), []);
});

// ---------- keywordScore ----------

test('keywordScore：kw 命中覆盖率 + 分母下限 3 / 上限 8', () => {
  const e3 = makeEntry({ kw: ['偏好', '写作', '结论'] });
  assert.equal(keywordScore(e3, tokenize('写作偏好结论')), 1);
  assert.ok(Math.abs(keywordScore(e3, ['偏好']) - 1 / 3) < 1e-12);

  // 只有 1 个 kw 时分母仍取 3（不让 kw 少的条目白拿满分）
  const e1 = makeEntry({ kw: ['写作'] });
  assert.ok(Math.abs(keywordScore(e1, ['写作']) - 1 / 3) < 1e-12);

  // 9 个 kw → 分母封顶 8
  const e9 = makeEntry({
    kw: ['写作', '偏好', '结论', '阅读', '睡眠', '跑步', '计划', '目标', '风格'],
  });
  assert.ok(Math.abs(keywordScore(e9, ['写作', '偏好', '结论', '阅读', '睡眠']) - 5 / 8) < 1e-12);
});

test('keywordScore：词表优先（kw 子串命中）与坏输入', () => {
  const e = makeEntry({ kw: ['写作偏好'] });
  assert.ok(keywordScore(e, tokenize('写作')) > 0, 'query 词应能命中更长的 kw');
  assert.equal(keywordScore(e, []), 0);
  assert.equal(keywordScore({ kw: [] }, ['写作']), 0);
  assert.equal(keywordScore(null, ['写作']), 0);
  assert.equal(keywordScore(e, null), 0);
  assert.equal(keywordScore(e, '写作'), keywordScore(e, tokenize('写作')));
});

// ---------- search ----------

test('search：命中按 rel 降序，无关条目不得分', () => {
  const lib = makeLibrary();
  const hits = search(lib, '写作偏好');
  assert.ok(hits.length >= 2, '应至少命中 a1/a2');
  assert.ok(hits[0].rel >= 0.45, `top1 应过噪音门，实际 ${hits[0].rel}`);
  assert.deepEqual(hits[0], {
    entry: hits[0].entry,
    score: hits[0].score,
    rel: hits[0].rel,
  });
  assert.equal(hits[0].score, hits[0].rel);
  for (let i = 1; i < hits.length; i += 1) {
    assert.ok(hits[i - 1].score >= hits[i].score, '必须按 score 降序');
  }
  assert.ok(!hits.some((h) => h.entry.id === 'b1'), '无关条目 rel=0 不应出现');
  assert.ok(hits.some((h) => h.entry.id === 'a1'));
});

test('search：archived / tombstone 默认过滤，includeArchive 后可取', () => {
  const lib = makeLibrary();
  const def = search(lib, '写作偏好', { topK: 20 });
  assert.ok(!def.some((h) => h.entry.id === 'c1'), 'archived 默认过滤');
  assert.ok(!def.some((h) => h.entry.id === 'c2'), 'tombstone 默认过滤');

  const all = search(lib, '写作偏好', { topK: 20, includeArchive: true });
  assert.ok(all.some((h) => h.entry.id === 'c1'), 'includeArchive 应含 archived');
  assert.ok(all.some((h) => h.entry.id === 'c2'), 'includeArchive 应含 tombstone');
});

test('search：topK、停用词 query、坏输入', () => {
  const lib = makeLibrary();
  assert.equal(search(lib, '写作偏好', { topK: 1 }).length, 1);
  assert.equal(search(lib, '写作偏好', { topK: 2 }).length, 2);

  // 无 query / 只有停用词 → 不注入「相关」块（§8.5）
  assert.deepEqual(search(lib, '我们 的 了 是'), []);
  assert.deepEqual(search(lib, ''), []);
  assert.deepEqual(search(lib, '，。！？'), []);

  assert.deepEqual(search(null, '写作'), []);
  assert.deepEqual(search([], '写作'), []);
  assert.deepEqual(search(lib, null), []);
  assert.deepEqual(search('not-array', '写作'), []);
});

test('search：filters（axis / kind / dayFrom / dayTo / status / project）', () => {
  const lib = makeLibrary();
  const axisHits = search(lib, '写作偏好', { filters: { axis: '智' } });
  assert.ok(axisHits.length > 0);
  assert.ok(axisHits.every((h) => h.entry.axis === '智'));

  const kindHits = search(lib, '写作偏好', { filters: { kind: 'decision' } });
  assert.ok(kindHits.length > 0);
  assert.ok(kindHits.every((h) => h.entry.kind === 'decision'));

  const dayHits = search(lib, '一页永恒', {
    filters: { dayFrom: '2026-10-01', dayTo: '2026-10-10' },
  });
  assert.deepEqual(dayHits.map((h) => h.entry.id), ['p1']);

  // 显式 filters.status 优先于 includeArchive=false
  const arc = search(lib, '写作偏好', { filters: { status: 'archived' } });
  assert.deepEqual(arc.map((h) => h.entry.id), ['c1']);

  const proj = search(lib, '一页永恒 设计', { filters: { project: '一页永恒' } });
  assert.deepEqual(proj.map((h) => h.entry.id), ['p1']);

  assert.deepEqual(search(lib, '写作偏好', { filters: { axis: '劳' } }), []);
});

test('search：不改入参', () => {
  const lib = makeLibrary();
  const before = JSON.stringify(lib);
  search(lib, '写作偏好', { topK: 20 });
  search(lib, '一页永恒', { includeArchive: true });
  filterEntries(lib, { axis: '智' });
  assert.equal(JSON.stringify(lib), before);
});

// ---------- filterEntries ----------

test('filterEntries：字段过滤与数组语义', () => {
  const lib = makeLibrary();
  assert.deepEqual(filterEntries(lib, { axis: ['体', '美'] }).map((e) => e.id), ['a2', 'b1', 'd1']);
  assert.deepEqual(filterEntries(lib, { status: 'archived' }).map((e) => e.id), ['c1']);
  assert.deepEqual(filterEntries(lib, { q: '你' }).length, lib.filter((e) => e.q === '你').length);
  assert.deepEqual(filterEntries(lib, { dayFrom: '2026-10-19' }).map((e) => e.id), ['d1']);
  assert.deepEqual(filterEntries(lib, { dayTo: '2026-10-01' }).map((e) => e.id), ['p1']);
  assert.deepEqual(filterEntries(lib, {}).length, lib.length);

  // 坏输入
  assert.deepEqual(filterEntries(null, {}), []);
  assert.deepEqual(filterEntries([null, 42, undefined, 'x'], {}), []);
  assert.equal(filterEntries(lib, null).length, lib.length);
});

// ---------- jaccard ----------

test('jaccard：id 集合相似度', () => {
  assert.equal(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
  assert.equal(jaccard(['a', 'b'], ['a', 'b']), 1);
  assert.equal(jaccard([], []), 0);
  assert.equal(jaccard(['a'], []), 0);
  assert.equal(jaccard(['a', 'a'], ['a']), 1);
  assert.equal(jaccard(null, ['a']), 0);
  assert.equal(jaccard(['a', 42, null], ['a']), 1);
});

// ---------- textSimilarity ----------

test('textSimilarity：2-gram 余弦，0..1', () => {
  const a = '用户喜欢先看结论再看过程';
  const b = '用户喜欢先看结论再看过程';
  assert.ok(Math.abs(textSimilarity(a, b) - 1) < 1e-9);
  assert.ok(Math.abs(textSimilarity(a, a) - 1) < 1e-9);
  const c = '今天天气不错适合出门散步';
  const cross = textSimilarity(a, c);
  assert.ok(cross >= 0 && cross < 0.3, `无关文本相似度应很低，实际 ${cross}`);
  assert.equal(textSimilarity('', ''), 0);
  assert.equal(textSimilarity(null, a), 0);
  assert.equal(textSimilarity(42, a), 0);
});

// ---------- gateHit（噪音门 §8.5）----------

test('gateHit：top1 < 0.45 整块丢弃', () => {
  assert.deepEqual(gateHit([{ rel: 0.44 }, { rel: 0.44 }]), []);
  assert.deepEqual(gateHit([]), []);
  assert.deepEqual(gateHit(null), []);
  assert.equal(gateHit([{ rel: 0.45 }]).length, 1, '恰好 0.45 应保留');
});

test('gateHit：低于 0.6×top1 的候选丢弃', () => {
  // top1 = 0.8 → 门槛 0.48
  const hits = [{ rel: 0.8 }, { rel: 0.5 }, { rel: 0.47 }, { rel: 0.3 }];
  assert.deepEqual(gateHit(hits), [{ rel: 0.8 }, { rel: 0.5 }]);
  assert.equal(gateHit([{ rel: 0.8 }, { rel: 0.49 }]).length, 2, '0.49 > 0.48 应保留');
  assert.equal(gateHit([{ rel: 0.8 }, { rel: 0.4799 }]).length, 1, '0.4799 < 0.48 应丢弃');
  // 支持 score 字段兜底、过滤非对象
  assert.equal(gateHit([{ score: 0.9 }, { score: 0.8 }, null, 42]).length, 2);
});
