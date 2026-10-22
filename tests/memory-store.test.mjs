/**
 * lib/store.js 单元测试（node:test + node:assert/strict，零第三方依赖）。
 *
 * 所有落盘都在 os.tmpdir() 下的临时目录，跑完清理；不触碰真实记忆目录。
 * 覆盖 CONTRACT §4：tmp 目录建树、append 两次计数、quota 统计、越界路径 null、原子写内容完整。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendEntry,
  atomicWrite,
  dayFilePath,
  ensureTree,
  listDays,
  migrateFreeDir,
  migrateRootDir,
  quotaUsage,
  readAnchor,
  readDay,
  readJSON,
  readTextSafe,
  resolveRoot,
  safeRelPath,
  walkFiles,
  writeAnchor,
  writeDay,
  writeJSON,
} from '../memory/store.js';

const DAY = '2026-10-18';
const TS = new Date(2026, 9, 18, 14, 2, 1, 0).getTime();

/** 每个测试一个独立临时根目录，结束自动清理 */
function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyh-store-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响测试结论 */
    }
  });
  return dir;
}

function makeEntry(overrides = {}) {
  return {
    text: '用户说他更喜欢先看结论、再看过程。',
    kind: 'fact',
    axis: '智',
    q: '你',
    I: 6,
    S: 3,
    kw: ['偏好', '写作'],
    src: 'conv',
    created_at: TS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveRoot
// ---------------------------------------------------------------------------

test('resolveRoot：configured 优先 / DSH_HOME / ~/.dsh 兜底', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyh-root-'));
  const oldHome = process.env.DSH_HOME;
  try {
    assert.equal(resolveRoot(dir), path.resolve(dir));
    assert.equal(resolveRoot('相对目录'), path.resolve('相对目录'));

    process.env.DSH_HOME = dir;
    assert.equal(resolveRoot(), path.join(path.resolve(dir), 'cyrene-philia093-0'));
    assert.equal(resolveRoot(''), path.join(path.resolve(dir), 'cyrene-philia093-0'));

    delete process.env.DSH_HOME;
    const fallback = resolveRoot();
    assert.equal(fallback, path.join(os.homedir(), '.dsh', 'cyrene-philia093-0'));
    assert.ok(path.isAbsolute(fallback));
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = oldHome;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ensureTree
// ---------------------------------------------------------------------------

test('ensureTree：建目录树 + 缺省 指南.md + 四问锚点，重复调用不覆盖', (t) => {
  const root = tempRoot(t);
  const first = ensureTree(root);
  assert.equal(first.ok, true, first.errors.join('; '));
  assert.deepEqual(first.errors, []);
  assert.equal(first.root, path.resolve(root));

  for (const dir of ['锚', '日', '月', '年', '梦', '档', '元', '余页', '余页/笔记', '余页/草稿', '余页/.nosync']) {
    assert.ok(fs.existsSync(path.join(root, ...dir.split('/'))), `应创建 ${dir}`);
  }
  const guide = path.join(root, '指南.md');
  assert.ok(fs.existsSync(guide));
  assert.ok(fs.statSync(guide).size > 0);
  assert.ok(readTextSafe(guide).includes('一页永恒'));

  for (const rel of ['锚/我是谁.md', '锚/你是谁.md', '锚/来处.md', '锚/去处.md']) {
    assert.ok(fs.existsSync(path.join(root, ...rel.split('/'))), `应创建 ${rel}`);
    const anchor = readAnchor(root, rel);
    assert.equal(typeof anchor.content, 'string');
  }
  assert.equal(readAnchor(root, 'self').meta.version, 1);
  assert.ok(readAnchor(root, 'self').content.length > 0);

  // 手改后再次 ensureTree：不覆盖已有内容
  atomicWrite(guide, '# 用户手改过的指南\n');
  const second = ensureTree(root);
  assert.equal(second.ok, true, second.errors.join('; '));
  assert.equal(readTextSafe(guide), '# 用户手改过的指南\n');
});

// ---------------------------------------------------------------------------
// 原子写 / 安全读 / JSON
// ---------------------------------------------------------------------------

test('atomicWrite：嵌套目录创建、内容完整、覆盖写入、无 tmp 残留', (t) => {
  const root = tempRoot(t);
  const file = path.join(root, 'a', 'b', 'c.txt');
  assert.equal(atomicWrite(file, '第一版\n'), true);
  assert.equal(readTextSafe(file), '第一版\n');
  assert.equal(atomicWrite(file, '第二版'), true);
  assert.equal(readTextSafe(file), '第二版');
  assert.equal(readTextSafe(path.join(root, 'a', 'missing.txt')), '');

  const dir = path.dirname(file);
  const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);

  // 目标父路径是文件 → 返回 false 而不是抛错
  const blocker = path.join(root, 'blocker');
  atomicWrite(blocker, 'iamfile');
  assert.equal(atomicWrite(path.join(blocker, 'child.txt'), 'x'), false);
});

test('readJSON / writeJSON：往返、坏 JSON 与缺文件都回落到 fallback', (t) => {
  const root = tempRoot(t);
  const file = path.join(root, '元', '配额.json');
  assert.equal(writeJSON(file, { bytes: 128, byTop: { 日: 1 } }), true);
  assert.deepEqual(readJSON(file, null), { bytes: 128, byTop: { 日: 1 } });
  assert.equal(readJSON(path.join(root, 'nope.json'), 'fallback'), 'fallback');

  atomicWrite(file, '{ 这不是合法 JSON');
  assert.deepEqual(readJSON(file, { ok: false }), { ok: false });
  assert.equal(readJSON(file), undefined);
});

// ---------------------------------------------------------------------------
// 日档路径与读写
// ---------------------------------------------------------------------------

test('dayFilePath：posix 相对路径；非法日期 → null', () => {
  assert.equal(dayFilePath('/whatever', DAY), '日/2026/10/2026-10-18.md');
  assert.equal(dayFilePath('', '2025-01-02'), '日/2025/01/2025-01-02.md');
  assert.equal(dayFilePath('', '2026-10-8'), null);
  assert.equal(dayFilePath('', '2026/10/18'), null);
  assert.equal(dayFilePath('', ''), null);
  assert.equal(dayFilePath('', null), null);
});

test('readDay / writeDay：无文件空结构、写入后读回、非法日期 false', (t) => {
  const root = tempRoot(t);
  assert.deepEqual(readDay(root, DAY), { front: {}, entries: [], errors: [] });
  assert.equal(readDay(root, 'bad-day').entries.length, 0);

  const entry = makeEntry();
  assert.equal(writeDay(root, DAY, { dreamed: true, dreamed_at: '2026-10-19T02:14:00+08:00' }, [entry]), true);
  const read = readDay(root, DAY);
  assert.equal(read.errors.length, 0);
  assert.equal(read.entries.length, 1);
  assert.equal(read.entries[0].text, entry.text);
  assert.equal(read.entries[0].day, DAY);
  assert.equal(read.entries[0].path, '日/2026/10/2026-10-18.md');
  assert.equal(read.front.dreamed, true);
  assert.equal(read.front.dreamed_at, '2026-10-19T02:14:00+08:00');
  assert.equal(read.front.entries, 1);
  assert.equal(writeDay(root, 'bad-day', {}, []), false);
});

// ---------------------------------------------------------------------------
// appendEntry
// ---------------------------------------------------------------------------

test('appendEntry：两次追加 → entries=2、axes 重算、正文都在磁盘上', (t) => {
  const root = tempRoot(t);
  const first = appendEntry(root, makeEntry({ text: '第一条：偏好先结论后过程。' }));
  assert.equal(first.ok, true, first.errors.join('; '));
  assert.equal(first.path, '日/2026/10/2026-10-18.md');
  assert.deepEqual(first.errors, []);

  const second = appendEntry(
    root,
    makeEntry({ text: '第二条：需要是非判断。', axis: '德', kind: 'decision', I: 7, created_at: TS + 1000 }),
  );
  assert.equal(second.ok, true, second.errors.join('; '));

  const day = readDay(root, DAY);
  assert.equal(day.errors.length, 0);
  assert.equal(day.entries.length, 2);
  assert.equal(day.front.entries, 2);
  assert.deepEqual(day.front.axes, { 德: 1, 智: 1, 体: 0, 美: 0, 劳: 0 });
  assert.deepEqual(day.entries.map((e) => e.text), ['第一条：偏好先结论后过程。', '第二条：需要是非判断。']);
  assert.notEqual(day.entries[0].id, day.entries[1].id);

  const raw = readTextSafe(path.join(root, ...first.path.split('/')));
  assert.ok(raw.includes('第一条：偏好先结论后过程。'));
  assert.ok(raw.includes('第二条：需要是非判断。'));
  assert.ok(raw.includes('<!--cyrene:'));
});

test('appendEntry：同 id 覆盖而非重复；保留 front.dreamed；日期可由 created_at 推导', (t) => {
  const root = tempRoot(t);
  writeDay(root, DAY, { dreamed: true, dreamed_at: '2026-10-19T02:14:00+08:00' }, []);

  appendEntry(root, makeEntry({ id: 'fixed-id-000001', text: '旧正文' }));
  appendEntry(root, makeEntry({ id: 'fixed-id-000001', text: '新正文' }));
  const day = readDay(root, DAY);
  assert.equal(day.entries.length, 1);
  assert.equal(day.entries[0].text, '新正文');
  assert.equal(day.front.dreamed, true);
  assert.equal(day.front.dreamed_at, '2026-10-19T02:14:00+08:00');

  // 无 day 字段：由 created_at 决定归属日
  const oldTs = new Date(2026, 9, 17, 23, 30, 0, 0).getTime();
  const result = appendEntry(root, makeEntry({ created_at: oldTs, text: '昨天的条目' }));
  assert.equal(result.ok, true);
  assert.equal(result.path, '日/2026/10/2026-10-17.md');
  assert.equal(readDay(root, '2026-10-17').entries.length, 1);
});

// ---------------------------------------------------------------------------
// listDays
// ---------------------------------------------------------------------------

test('listDays：跨年月升序，忽略非日期文件', (t) => {
  const root = tempRoot(t);
  ensureTree(root);
  for (const day of ['2026-10-18', '2026-01-02', '2025-12-31']) {
    assert.equal(writeDay(root, day, {}, []), true);
  }
  atomicWrite(path.join(root, '日', '2026', '10', 'notes.md'), '随手笔记');
  atomicWrite(path.join(root, '日', '2026', '10', '2026-1-2.md'), '非零填充');
  assert.deepEqual(listDays(root), ['2025-12-31', '2026-01-02', '2026-10-18']);
  assert.deepEqual(listDays(path.join(root, '不存在')), []);
});

// ---------------------------------------------------------------------------
// 锚点
// ---------------------------------------------------------------------------

test('writeAnchor / readAnchor：version 递增、immutable 保留、坏参数 false', (t) => {
  const root = tempRoot(t);
  assert.deepEqual(readAnchor(root, 'self'), { meta: {}, content: '' });
  assert.equal(readAnchor(root, 'nope').content, '');

  assert.equal(writeAnchor(root, 'self', '我是谁：一个整理记忆的助手。', {}), true);
  let anchor = readAnchor(root, 'self');
  assert.equal(anchor.content, '我是谁：一个整理记忆的助手。');
  assert.equal(anchor.meta.version, 1);
  assert.equal(anchor.meta.immutable, false);
  assert.match(anchor.meta.updated_at, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(writeAnchor(root, 'self', '我是谁：改过一次。', {}), true);
  anchor = readAnchor(root, 'self');
  assert.equal(anchor.meta.version, 2);
  assert.equal(anchor.content, '我是谁：改过一次。');

  assert.equal(writeAnchor(root, 'user', '你是谁：用户。', { immutable: true, version: 7 }), true);
  anchor = readAnchor(root, 'user');
  assert.equal(anchor.meta.version, 7);
  assert.equal(anchor.meta.immutable, true);

  assert.equal(writeAnchor(root, 'nope', 'x', {}), false);
  // 正文里的 emoji 与多段落原样保留
  assert.equal(writeAnchor(root, 'goal', '第一行 🌀\n\n第二段。', {}), true);
  assert.equal(readAnchor(root, 'goal').content, '第一行 🌀\n\n第二段。');
});

// ---------------------------------------------------------------------------
// 安全路径
// ---------------------------------------------------------------------------

test('safeRelPath：根目录内返回绝对路径，越界/绝对/盘符/空 → null', (t) => {
  const root = tempRoot(t);
  const abs = safeRelPath(root, '日/2026/10/2026-10-18.md');
  assert.equal(abs, path.join(path.resolve(root), '日', '2026', '10', '2026-10-18.md'));

  for (const bad of ['../evil.md', '..\\evil.md', '日/../../evil.md', '/etc/passwd', 'C:\\Windows\\win.ini', '', '   ', null, 42]) {
    assert.equal(safeRelPath(root, bad), null, `应拒绝 ${String(bad)}`);
  }
  // '.' 表示根目录本身（fsops 列根目录会用到），不是越界
  assert.equal(safeRelPath(root, '.'), path.resolve(root));
  // 反斜杠分隔的相对路径也能安全解析
  assert.equal(safeRelPath(root, '日\\x.md'), path.join(path.resolve(root), '日', 'x.md'));
});

// ---------------------------------------------------------------------------
// 遍历与配额
// ---------------------------------------------------------------------------

test('walkFiles：posix rel、跳过 元/ 日志与索引、坏根目录返回空', (t) => {
  const root = tempRoot(t);
  ensureTree(root);
  atomicWrite(path.join(root, '日', '2026', '10', '2026-10-18.md'), '# 日档\n');
  atomicWrite(path.join(root, '元', '思源镜像.json'), '{}');
  atomicWrite(path.join(root, '元', '日志.jsonl'), '{"op":"write"}\n');
  atomicWrite(path.join(root, '元', '索引.jsonl'), '{"t":"entry"}\n');
  atomicWrite(path.join(root, '余页', '笔记', 'a.md'), '灵感');

  const files = walkFiles(root);
  const rels = files.map((f) => f.rel);
  assert.ok(rels.includes('指南.md'));
  assert.ok(rels.includes('日/2026/10/2026-10-18.md'));
  assert.ok(rels.includes('元/思源镜像.json'));
  assert.ok(rels.includes('余页/笔记/a.md'));
  assert.ok(!rels.some((rel) => rel.includes('日志')));
  assert.ok(!rels.some((rel) => rel.includes('索引')));
  assert.ok(rels.every((rel) => !rel.includes('\\')), 'rel 必须是 posix 分隔符');
  for (const file of files) {
    assert.equal(typeof file.bytes, 'number');
    assert.ok(file.bytes > 0);
    assert.equal(typeof file.mtime, 'number');
  }
  assert.deepEqual(walkFiles(path.join(root, '不存在')), []);
});

test('quotaUsage：按顶层目录聚合字节（元/ 日志也计入），未知目录归 其它', (t) => {
  const root = tempRoot(t);
  ensureTree(root);
  const dayFile = path.join(root, '日', '2026', '10', '2026-10-18.md');
  atomicWrite(dayFile, '# 日档\n');
  atomicWrite(path.join(root, '余页', '笔记', 'a.md'), '12345');
  atomicWrite(path.join(root, '元', '日志.jsonl'), 'x'.repeat(10));
  atomicWrite(path.join(root, '元', '索引.jsonl'), 'y'.repeat(20));
  atomicWrite(path.join(root, '杂', 'x.txt'), 'z'.repeat(7));

  const quota = quotaUsage(root);
  assert.deepEqual(Object.keys(quota.byTop), ['日', '月', '年', '锚', '梦', '档', '余页', '元', '其它']);
  assert.equal(quota.byTop.日, fs.statSync(dayFile).size);
  // ensureTree 会在 余页/ 里留一张「关于这里.md」（首建一次），所以是 5 + 欢迎页大小
  assert.equal(quota.byTop.余页, 5 + fs.statSync(path.join(root, '余页', '关于这里.md')).size);
  // 元/ 里除了两篇日志，还有首建标记 .余页已初始化
  assert.equal(quota.byTop.元, 30 + fs.statSync(path.join(root, '元', '.余页已初始化')).size);
  // 根目录 指南.md + 这是什么.md + 杂/x.txt 都归 其它
  assert.equal(quota.byTop.其它, fs.statSync(path.join(root, '指南.md')).size + fs.statSync(path.join(root, '这是什么.md')).size + 7);
  assert.equal(quota.bytes, Object.values(quota.byTop).reduce((sum, n) => sum + n, 0));
  assert.ok(quota.bytes >= quota.byTop.日 + quota.byTop.余页 + quota.byTop.元);

  const empty = quotaUsage(path.join(root, '不存在'));
  assert.equal(empty.bytes, 0);
  assert.deepEqual(empty.byTop, { 日: 0, 月: 0, 年: 0, 锚: 0, 梦: 0, 档: 0, 余页: 0, 元: 0, 其它: 0 });
});

test('migrateFreeDir：旧 自留地 → 余页，且不覆盖已存在的新目录', (t) => {
  const root = tempRoot(t);
  ensureTree(root);
  // 删掉新建的 余页，造一个旧 自留地
  fs.rmSync(path.join(root, '余页'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, '自留地', '笔记'), { recursive: true });
  fs.writeFileSync(path.join(root, '自留地', '笔记', '旧.md'), '# 旧\n内容', 'utf8');

  const renamed = migrateFreeDir(root);
  assert.equal(renamed.ok, true);
  assert.equal(renamed.migrated, true);
  assert.equal(fs.existsSync(path.join(root, '自留地')), false);
  assert.equal(fs.readFileSync(path.join(root, '余页', '笔记', '旧.md'), 'utf8').includes('旧'), true);

  // 再跑一次：已是新名，不迁移
  const again = migrateFreeDir(root);
  assert.equal(again.migrated, false);
  // 新目录已存在时不覆盖
  fs.mkdirSync(path.join(root, '自留地'), { recursive: true });
  fs.writeFileSync(path.join(root, '自留地', 'x.md'), 'x', 'utf8');
  const kept = migrateFreeDir(root);
  assert.equal(kept.migrated, false);
  assert.equal(fs.existsSync(path.join(root, '余页', '笔记', '旧.md')), true);
});

test('migrateFreeDir：如我所书 → 余页，首建标记同步改名', (t) => {
  const root = tempRoot(t);
  ensureTree(root);
  fs.rmSync(path.join(root, '余页'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, '如我所书', '草稿'), { recursive: true });
  fs.writeFileSync(path.join(root, '如我所书', '草稿', 'a.md'), 'A', 'utf8');
  fs.writeFileSync(path.join(root, '元', '.如我所书已初始化'), '1', 'utf8');

  const renamed = migrateFreeDir(root);
  assert.equal(renamed.migrated, true);
  assert.equal(fs.existsSync(path.join(root, '如我所书')), false);
  assert.equal(fs.existsSync(path.join(root, '余页', '草稿', 'a.md')), true);
  assert.equal(fs.existsSync(path.join(root, '元', '.余页已初始化')), true);
  assert.equal(fs.existsSync(path.join(root, '元', '.如我所书已初始化')), false);

  // 重新建树：标记已存在，不应再生成欢迎页
  fs.rmSync(path.join(root, '余页', '关于这里.md'), { force: true });
  ensureTree(root);
  assert.equal(fs.existsSync(path.join(root, '余页', '关于这里.md')), false);
});

test('ensureTree：旧版种子文案（如我所书）自动刷新为余页', (t) => {
  const root = tempRoot(t);
  ensureTree(root);
  // 模拟旧版遗留文件：目录已是余页，但文案还是旧的
  fs.writeFileSync(path.join(root, '余页', '关于这里.md'), '# 关于这里\n\n这里是「如我所书」——你自己的自由区。\n', 'utf8');
  fs.writeFileSync(path.join(root, '这是什么.md'), '# 这是什么\n\n| 如我所书（AI 自由区） | `如我所书/` |\n', 'utf8');

  ensureTree(root);
  const welcome = fs.readFileSync(path.join(root, '余页', '关于这里.md'), 'utf8');
  const note = fs.readFileSync(path.join(root, '这是什么.md'), 'utf8');
  assert.equal(welcome.includes('如我所书'), false);
  assert.ok(welcome.includes('余页'));
  assert.equal(note.includes('如我所书'), false);
  assert.ok(note.includes('余页'));
});

test('migrateRootDir：旧 cyrene-memory → 新根目录，且不覆盖已存在的新目录', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ope-root-'));
  try {
    const target = path.join(base, 'cyrene-philia093-0');
    const legacy = path.join(base, 'cyrene-memory');
    fs.mkdirSync(path.join(legacy, '日'), { recursive: true });
    fs.writeFileSync(path.join(legacy, '日', '2026-10-18.md'), '# 旧\n', 'utf8');
    const moved = migrateRootDir(target, { legacyNames: ['cyrene-memory'] });
    assert.equal(moved.migrated, true);
    assert.equal(fs.existsSync(legacy), false);
    assert.equal(fs.readFileSync(path.join(target, '日', '2026-10-18.md'), 'utf8').includes('旧'), true);
    // 再跑一次：新目录已存在，不迁移
    const again = migrateRootDir(target, { legacyNames: ['cyrene-memory'] });
    assert.equal(again.migrated, false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
