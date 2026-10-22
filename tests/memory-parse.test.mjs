/**
 * lib/parse.js 单元测试（node:test + node:assert/strict，零第三方依赖）。
 *
 * 覆盖 CONTRACT §4 对 parse 的要求：
 * roundtrip（多段正文 / 引号 / emoji / 手改缺元数据 / 坏 JSON）、坏输入不抛、front-matter。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  entryId,
  hashText,
  normalizeEntry,
  parseDay,
  parseFrontMatter,
  renderDay,
  renderFrontMatter,
  serializeEntry,
} from '../memory/parse.js';

const DAY = '2026-10-18';
const REL_PATH = '日/2026/10/2026-10-18.md';
/** 2026-10-18 14:02:01 本地时间 */
const TS = new Date(2026, 9, 18, 14, 2, 1, 0).getTime();

function makeEntry(overrides = {}) {
  return normalizeEntry(
    {
      text: '用户说他更喜欢先看结论、再看过程。',
      kind: 'fact',
      axis: '智',
      q: '你',
      I: 6,
      S: 3,
      kw: ['偏好', '写作', '结论'],
      src: 'conv',
      src_ids: ['s-8f2/ev-42'],
      src_quote: '你以后先说结论，过程我有兴趣再问。',
      ...overrides,
    },
    { day: DAY, path: REL_PATH, now: TS },
  );
}

// ---------------------------------------------------------------------------
// entryId / hashText
// ---------------------------------------------------------------------------

test('entryId：时间前缀 + 6 位 base36，且 random 可复现', () => {
  const id = entryId(TS, 0.5);
  assert.match(id, /^\d{14}-[0-9a-z]{6}$/);
  assert.equal(id, '20261018140201-i00000'); // 本地时间前缀
  assert.equal(entryId(TS, 0.5), id);
  assert.notEqual(entryId(TS, 0.1), entryId(TS, 0.9));

  const many = new Set();
  for (let i = 0; i < 20; i += 1) many.add(entryId());
  assert.equal(many.size, 20);

  // 坏 now / 坏 random 都不抛
  assert.match(entryId(Number.NaN, Number.NaN), /^\d{14}-[0-9a-z]{6}$/);
  assert.match(entryId(undefined, undefined), /^\d{14}-[0-9a-z]{6}$/);
});

test('hashText：12 位 sha256 前缀，稳定且区分内容', () => {
  const h = hashText('一页永恒');
  assert.match(h, /^[0-9a-f]{12}$/);
  assert.equal(hashText('一页永恒'), h);
  assert.notEqual(hashText('一页永恒！'), h);
  assert.match(hashText(undefined), /^[0-9a-f]{12}$/); // 不抛
});

// ---------------------------------------------------------------------------
// front-matter
// ---------------------------------------------------------------------------

test('parseFrontMatter：无 front-matter / 坏行 / CRLF / BOM 都不抛', () => {
  const plain = parseFrontMatter('纯正文\n第二行');
  assert.deepEqual(plain.front, {});
  assert.equal(plain.body, '纯正文\n第二行');

  const noDate = parseFrontMatter('---\n坏行没有冒号\n---\n正文');
  assert.deepEqual(noDate.front, {});
  assert.equal(noDate.body, '正文');

  const crlf = parseFrontMatter('\uFEFF---\r\ndate: 2026-10-18\r\nentries: 2\r\n---\r\n\r\n正文\r\n');
  assert.equal(crlf.front.date, '2026-10-18');
  assert.equal(crlf.front.entries, 2);
  assert.equal(crlf.body, '正文');

  assert.equal(parseFrontMatter(undefined).front && Object.keys(parseFrontMatter(undefined).front).length, 0);
  assert.equal(parseFrontMatter(null).body, '');
});

test('parseFrontMatter：标量 / 内联 map / 内联数组 / 引号 / null 布尔数字', () => {
  const text = [
    '---',
    'date: 2026-10-18',
    'entries: 14',
    'axes: {德: 2, 智: 5, 体: 1, 美: 3, 劳: 3}',
    'dreamed: true',
    'dreamed_at: 2026-10-19T02:14:00+08:00',
    'themes: [写作偏好, 一页永恒设计, "a b"]',
    'nothing: null',
    'quoted: "含: 冒号 的字符串"',
    '---',
    '',
    '正文',
  ].join('\n');
  const { front, body } = parseFrontMatter(text);
  assert.equal(front.date, '2026-10-18');
  assert.equal(front.entries, 14);
  assert.deepEqual(front.axes, { 德: 2, 智: 5, 体: 1, 美: 3, 劳: 3 });
  assert.equal(front.dreamed, true);
  assert.equal(front.dreamed_at, '2026-10-19T02:14:00+08:00');
  assert.deepEqual(front.themes, ['写作偏好', '一页永恒设计', 'a b']);
  assert.equal(front.nothing, null);
  assert.equal(front.quoted, '含: 冒号 的字符串');
  assert.equal(body, '正文');
});

test('renderFrontMatter ↔ parseFrontMatter 往返一致', () => {
  const front = {
    date: DAY,
    entries: 3,
    axes: { 德: 1, 智: 2, 体: 0, 美: 0, 劳: 0 },
    dreamed: true,
    dreamed_at: '2026-10-19T02:14:00+08:00',
    themes: ['写作偏好', 'a b'],
    nothing: null,
  };
  const rendered = renderFrontMatter(front);
  assert.ok(rendered.startsWith('---\n'));
  assert.ok(rendered.endsWith('---\n'));
  assert.deepEqual(parseFrontMatter(`${rendered}正文`).front, front);

  const empty = renderFrontMatter({});
  assert.equal(empty, '---\n---\n');
  assert.deepEqual(parseFrontMatter(`${empty}`).front, {});
});

// ---------------------------------------------------------------------------
// normalizeEntry / serializeEntry
// ---------------------------------------------------------------------------

test('normalizeEntry：缺省值符合设计 §4.2（I=4 S=1 axis=无），且幂等', () => {
  const e = normalizeEntry({ text: '手写的一行' }, { day: DAY, path: REL_PATH, now: TS });
  assert.match(e.id, /^\d{14}-[0-9a-z]{6}$/);
  assert.equal(e.text, '手写的一行');
  assert.equal(e.kind, 'fact');
  assert.equal(e.axis, '无');
  assert.equal(e.q, '我');
  assert.equal(e.I, 4);
  assert.equal(e.S, 1);
  assert.equal(e.status, 'active');
  assert.deepEqual(e.kw, []);
  assert.equal(e.src, 'import');
  assert.deepEqual(e.src_ids, []);
  assert.equal(e.src_quote, '');
  assert.equal(e.sup, null);
  assert.deepEqual(e.links, []);
  assert.equal(e.created_at, TS);
  assert.equal(e.fact_time, TS);
  assert.equal(e.reviewed_at, TS);
  assert.equal(e.touched_at, TS);
  assert.equal(e.day, DAY);
  assert.equal(e.path, REL_PATH);
  assert.equal(e.sync, true);
  assert.equal(e.n_recall, 0);
  assert.equal(e.n_review, 0);

  assert.deepEqual(normalizeEntry(e), e); // 幂等
  const fromNothing = normalizeEntry(undefined);
  assert.equal(fromNothing.text, '');
  assert.equal(fromNothing.I, 4);
  assert.equal(fromNothing.S, 1);
  assert.equal(fromNothing.axis, '无');
  assert.match(fromNothing.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(fromNothing.path, /^日\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/);
});

test('normalizeEntry：越界数值与非法枚举回落到合法值', () => {
  const e = normalizeEntry(
    {
      id: '  keep-me  ',
      I: 99,
      S: -3,
      axis: '水',
      q: '它',
      kind: 'nope',
      status: 'zombie',
      src: 'ftp',
      kw: ['a', 'a', ' b ', '', 3],
      src_ids: ['x', 'x', 'y'],
      sync: false,
    },
    { day: DAY, path: REL_PATH, now: TS },
  );
  assert.equal(e.id, 'keep-me');
  assert.equal(e.I, 10);
  assert.equal(e.S, 1);
  assert.equal(e.axis, '无');
  assert.equal(e.q, '我');
  assert.equal(e.kind, 'fact');
  assert.equal(e.status, 'active');
  assert.equal(e.src, 'import');
  assert.deepEqual(e.kw, ['a', 'b', '3']);
  assert.deepEqual(e.src_ids, ['x', 'y']);
  assert.equal(e.sync, false);
  assert.equal(normalizeEntry({ I: 0 }, { now: TS }).I, 1);
  assert.equal(normalizeEntry({ S: 0 }, { now: TS }).S, 1);
});

test('serializeEntry：标题 / 正文 / 引用行 / 单行元数据（JSON 不含 text）', () => {
  const e = makeEntry();
  const block = serializeEntry(e);
  assert.ok(block.endsWith('\n'));
  const lines = block.split('\n');
  assert.equal(lines[0], '## 14:02 · 智 · I6 S3 · #偏好 #写作 #结论');
  assert.ok(block.includes('用户说他更喜欢先看结论、再看过程。'));
  assert.ok(block.includes('> 原话：「你以后先说结论，过程我有兴趣再问。」'));

  const metaLine = lines.find((line) => line.startsWith('<!--cyrene:'));
  assert.ok(metaLine, '应有元数据行');
  assert.equal((block.match(/<!--cyrene:/g) || []).length, 1);
  const payload = JSON.parse(metaLine.slice('<!--cyrene:'.length, -'-->'.length));
  assert.equal('text' in payload, false);
  assert.equal(payload.id, e.id);
  assert.equal(payload.axis, '智');
  assert.equal(payload.day, DAY);
  assert.equal(payload.path, REL_PATH);
});

// ---------------------------------------------------------------------------
// 日档 roundtrip
// ---------------------------------------------------------------------------

test('日档 roundtrip：多段正文 / emoji / 引号 / 特殊字段，且二次渲染稳定', () => {
  const entry = makeEntry({
    text: '第一段：先看结论。\n\n第二段：过程留待追问 🌀，保留 emoji 与空行。\n第三行（无空行）。',
    src_quote: '带「内层引号」与箭头 --> 的原话',
    kind: 'decision',
    q: '我',
    I: 7,
    S: 2.5,
    status: 'active',
    sup: '20261001000000-aaaaaa',
    links: ['20261002000000-bbbbbb'],
    n_recall: 3,
    fact_time: TS - 86400000,
    reviewed_at: TS + 1000,
    touched_at: TS + 2000,
    created_at: TS,
  });
  const dayText = renderDay({ date: DAY }, [entry]);
  assert.match(dayText, /^---\ndate: 2026-10-18\n/);

  const parsed = parseDay(dayText);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries.length, 1);
  assert.deepEqual(parsed.entries[0], entry);

  // 二次渲染稳定（parse → render 不产生漂移）
  const again = renderDay(parsed.front, parsed.entries);
  assert.equal(again, dayText);

  // parse → render → parse 仍一致
  assert.deepEqual(parseDay(again).entries[0], entry);
});

test('renderDay：front 缺省补全（日期 / entries / axes / dreamed）', () => {
  const a = makeEntry({ axis: '德' });
  const b = makeEntry({ axis: '智', id: '20261018150000-cccccc' });
  const text = renderDay({}, [a, b]);
  const { front } = parseFrontMatter(text);
  assert.equal(front.date, '2026-10-18');
  assert.equal(front.entries, 2);
  assert.deepEqual(front.axes, { 德: 1, 智: 1, 体: 0, 美: 0, 劳: 0 });
  assert.equal(front.dreamed, false);
  assert.equal(front.dreamed_at, null);
  assert.ok(text.includes('# 2026-10-18 · 日档'));

  const empty = renderDay({ date: DAY }, []);
  assert.equal(parseFrontMatter(empty).front.entries, 0);
  assert.ok(empty.includes('# 2026-10-18 · 日档'));

  // 额外 front 字段保留
  const withMonth = parseFrontMatter(renderDay({ date: DAY, month: '2026-10', tags: ['a'] }, [])).front;
  assert.equal(withMonth.month, '2026-10');
  assert.deepEqual(withMonth.tags, ['a']);
});

// ---------------------------------------------------------------------------
// 手改容错
// ---------------------------------------------------------------------------

test('parseDay：缺元数据 / 坏 JSON 各自收编成默认值，且不影响同文件其他条目', () => {
  const md = [
    '---',
    'date: 2026-10-18',
    'entries: 7',
    'axes: {德: 1, 智: 1, 体: 0, 美: 0, 劳: 0}',
    '---',
    '',
    '# 2026-10-18 · 日档',
    '',
    '## 09:10 · 德 · I8 S2 · #原则 #诚实',
    '',
    '手改条目，没有元数据行。',
    '',
    '> 原话：「别替我编没发生的事。」',
    '',
    '## 14:02 · 智 · I6 S3 · #偏好 #写作',
    '',
    '好条目，元数据完好。',
    '',
    '<!--cyrene:{"id":"20261018140201-a1b2c3","kind":"fact","axis":"智","q":"你","I":6,"S":3,"status":"active","kw":["偏好","写作"],"src":"conv"}-->',
    '',
    '## 15:00 · 体',
    '',
    '坏 JSON 条目。',
    '',
    '<!--cyrene:{oops-->',
    '',
  ].join('\r\n'); // 顺带覆盖 CRLF

  const parsed = parseDay(md);
  assert.equal(parsed.front.date, DAY);
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.errors.length, 3); // 缺元数据 + 坏 JSON + entries 数量不符
  assert.ok(parsed.errors.some((msg) => msg.includes('缺少') && msg.includes('第 1 条')));
  assert.ok(parsed.errors.some((msg) => msg.includes('JSON') && msg.includes('第 3 条')));
  assert.ok(parsed.errors.some((msg) => msg.includes('entries=7') && msg.includes('实际解析到 3 条')));

  const [degraded, intact, broken] = parsed.entries;
  // 手改条目：正文与引用保留，元数据按默认值（I=4 S=1 axis=无）
  assert.equal(degraded.text, '手改条目，没有元数据行。');
  assert.equal(degraded.src_quote, '别替我编没发生的事。');
  assert.equal(degraded.I, 4);
  assert.equal(degraded.S, 1);
  assert.equal(degraded.axis, '无');
  assert.equal(degraded.day, DAY);
  assert.equal(degraded.path, REL_PATH);
  // created_at 从 ## 09:10 小标题还原
  assert.equal(new Date(degraded.created_at).getHours(), 9);
  assert.equal(new Date(degraded.created_at).getMinutes(), 10);

  // 好条目完全不受影响
  assert.equal(intact.id, '20261018140201-a1b2c3');
  assert.equal(intact.text, '好条目，元数据完好。');
  assert.deepEqual(intact.kw, ['偏好', '写作']);
  assert.equal(intact.I, 6);

  // 坏 JSON 条目同样按默认值收编
  assert.equal(broken.text, '坏 JSON 条目。');
  assert.equal(broken.I, 4);
  assert.equal(broken.S, 1);
  assert.equal(broken.axis, '无');
});

test('parseDay：CRLF 与 LF 解析结果一致', () => {
  const entry = makeEntry({ text: '第一段。\n\n第二段 🌀。' });
  const lf = renderDay({ date: DAY }, [entry]);
  const lfParsed = parseDay(lf);
  const crlfParsed = parseDay(lf.replace(/\n/g, '\r\n'));
  assert.deepEqual(crlfParsed.front, lfParsed.front);
  assert.deepEqual(crlfParsed.entries, lfParsed.entries);
  assert.deepEqual(crlfParsed.errors, lfParsed.errors);
});

test('parseDay：引用行只在「> 原话：」时摘出，普通 blockquote 留在正文', () => {
  const md = [
    '---',
    `date: ${DAY}`,
    '---',
    '',
    '# 2026-10-18 · 日档',
    '',
    '## 10:00 · 智 · I5 S1',
    '',
    '正文第一段。',
    '',
    '> 这是一条普通引用，应留在正文。',
    '',
    '> 原话：「去掉引号后的原话」',
    '',
    '<!--cyrene:{"id":"20261018100000-abcdef","axis":"智","I":5,"S":1,"status":"active","kw":[],"src":"conv"}-->',
  ].join('\n');
  const parsed = parseDay(md);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].src_quote, '去掉引号后的原话');
  assert.ok(parsed.entries[0].text.includes('> 这是一条普通引用，应留在正文。'));

  // 无引用行 → src_quote 为空
  const noQuote = parseDay(
    `---\ndate: ${DAY}\n---\n\n## 10:00 · 智 · I5 S1\n\n正文。\n\n<!--cyrene:{"id":"x1","axis":"智","I":5,"S":1}-->`,
  );
  assert.equal(noQuote.entries[0].src_quote, '');
});

// ---------------------------------------------------------------------------
// 坏输入 fail-open
// ---------------------------------------------------------------------------

test('全部导出函数对坏输入不抛（fail-open）', () => {
  const bads = [undefined, null, 42, '', 'not a day file', {}, [], '\u0000', '---\n---'];
  for (const bad of bads) {
    assert.doesNotThrow(() => parseDay(bad));
    assert.doesNotThrow(() => parseFrontMatter(bad));
    assert.doesNotThrow(() => normalizeEntry(bad));
    assert.doesNotThrow(() => serializeEntry(bad));
    assert.doesNotThrow(() => renderFrontMatter(bad));
    assert.doesNotThrow(() => hashText(bad));
    assert.doesNotThrow(() => renderDay(bad, bad));
  }
  const r = parseDay('');
  assert.deepEqual(r.entries, []);
  assert.deepEqual(r.errors, []);

  const noFront = parseDay('## 10:00 · 智 · I5 S1\n\n只有正文。');
  assert.equal(noFront.entries.length, 1);
  assert.equal(noFront.entries[0].text, '只有正文。');
  assert.ok(noFront.errors.some((msg) => msg.includes('front-matter')));

  // metadata 里的 `-->` 已转义，不会提前闭合注释
  const tricky = makeEntry({ src_quote: '箭头 --> 结束', kw: ['a-->b'] });
  const round = parseDay(renderDay({ date: DAY }, [tricky]));
  assert.deepEqual(round.errors, []);
  assert.deepEqual(round.entries[0], tricky);
});
