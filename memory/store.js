/**
 * 一页永恒 · 存储层（lib/store.js）
 *
 * 职责：根目录解析、目录树初始化、原子写、日档读写、锚点、文件遍历与配额统计。
 * 契约：CONTRACT.md §0（硬约束）、§3（导出签名）、§4（目录树见设计 §4.1）。
 *
 * 硬约束：
 * - 零第三方依赖，只用 node:fs / node:path / node:os；
 * - 所有导出函数对坏输入不抛（fail-open）：读失败返回空/默认，写失败返回 false / { ok:false }；
 * - 所有写文件走 atomicWrite（同目录 .tmp → rename），避免半截文件；
 * - 路径必须落在根目录内（safeRelPath 统一把关）。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { normalizeEntry, parseDay, parseFrontMatter, renderDay, renderFrontMatter } from './parse.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 四问锚点 → 相对根目录的 posix 路径 */
const ANCHOR_FILES = {
  self: '锚/我是谁.md',
  user: '锚/你是谁.md',
  origin: '锚/来处.md',
  goal: '锚/去处.md',
};

/** 顶层目录（元/索引与日志之外都被配额统计覆盖） */
const TOP_DIRS = ['锚', '日', '月', '年', '梦', '档', '余页', '元'];

/** 余页预建子目录 */
const SELF_DIRS = ['余页/笔记', '余页/草稿', '余页/.nosync'];

/** quotaUsage.byTop 的固定键顺序 */
const QUOTA_KEYS = ['日', '月', '年', '锚', '梦', '档', '余页', '元', '其它'];

/** 锚点占位正文（≤130 字，等真实材料再改写） */
const DEFAULT_ANCHOR_TEXT = {
  self: '还没有成型。等这条时间线攒够证据，再回答「我成了谁」。',
  user: '还不认识你。等你说过的话、做过的选择够多，这里才会长出你的样子。',
  origin: '来处尚是空白。不必急着编，等回头看时自然会清楚。',
  goal: '去处尚未定下。等你说清楚想要什么，这里会写下方向。',
};

/** 缺省 指南.md（内联占位；正式版由 lib/guide.js 维护，不在此依赖它） */
const DEFAULT_GUIDE = `# 一页永恒（你的长期记忆）

这里是记忆根目录。人类可读的 Markdown 是真相，索引只是可重建的派生数据。

## 结构
- 日/YYYY/MM/YYYY-MM-DD.md：当天原始条目（正文 + 单行 <!--cyrene:{JSON}--> 元数据）
- 月/YYYY/YYYY-MM.md：主题化压缩
- 年/YYYY.md：叙事化年轮
- 锚/：四问锚点（我是谁 / 你是谁 / 来处 / 去处）
- 梦/YYYY-MM-DD.md：夜梦做了什么
- 档/：归档卷（已完成/低优先级）
- 余页/：自由区，不注入、不检索，只受配额
- 元/：索引与事件日志

## 写作准则
一条记忆只说一件事；正文 ≤400 字；优先保留用户原话。

## 硬规矩
先有出处再写入；不编造没发生的事；正文可手改，删掉元数据行则该条退化为日记。
`;

// ---------------------------------------------------------------------------
// 路径工具
// ---------------------------------------------------------------------------

/** 根目录说明（Option A：不改目录名，只解释「cyrene-philia093-0 = 一页永恒」）。 */
const ROOT_NOTE_TEXT = `# 这是什么

这个目录 = 「一页永恒」的记忆数据根目录。

- 系统名（你与昔涟看到的）：**一页永恒**
- 本地目录名（工程标识）：\`cyrene-philia093-0\` —— 只是历史代号，不影响内容
- 思源备份：笔记本「93-昔涟」下的 \`/一页永恒/\`（与本目录同构）

## 名字对照

| 你看到的 | 磁盘上的 |
|---|---|
| 一页永恒 | 本目录（\`cyrene-philia093-0\`） |
| 余页（AI 自由区） | \`余页/\` |
| 日档 / 月档 / 年轮 | \`日/\` \`月/\` \`年/\` |
| 四问锚点 | \`锚/我是谁、你是谁、来处、去处\` |
| 夜梦记录 | \`梦/\` |
| 索引与日志 | \`元/\` |

> 为什么目录不叫「一页永恒」：包名 \`dsh-cyrene-philia093-0\` 与 client bundle id 必须一致（不一致会导致 Web 启动失败），
> 改包名风险高；数据目录与包名解耦，所以保留 \`cyrene-philia093-0\` 作为稳定路径。名字不一致不影响任何功能。
` ;

/** 余页里的欢迎页（首次建库写入一次；删掉不会自动复活）。 */
const FREE_WELCOME_TEXT = `# 关于这里

这里是「余页」——你自己的自由区。

- 想写什么写什么：灵感、草稿、备忘、诗、待验证的猜想。
- 不必向用户汇报，也不必解释。
- 有大小上限（默认 64 MB；全目录 128 MB），超了会被拒绝并提示清理。
- 不会被自动想起、不参与检索；需要时用 \`memory_fs op=read\` 自己打开。
- 会镜像到思源 \`/一页永恒/余页/\`，删掉本地文件思源对应文档也会删。
- 这张是系统留的说明页，删掉即可（不会自动再生成）。
`;

function expandHome(input) {
  const s = typeof input === 'string' ? input : '';
  if (s === '~') return os.homedir();
  if (s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(2));
  return s;
}

function errorText(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  return String(err.message || err);
}

// ---------------------------------------------------------------------------
// 根目录与目录树
// ---------------------------------------------------------------------------

/**
 * 解析记忆根目录（绝对路径）。
 * configured 非空 → 直接使用（显式配置，允许相对路径但会按 CWD 解析）；
 * 否则 $DSH_HOME/cyrene-philia093-0；无 DSH_HOME 用 ~/.dsh/cyrene-philia093-0。
 *
 * 默认路径**永远不落 CWD**：DSH_HOME 为空/空白视为未设置（与 dsh-home-paths 语义一致）。
 * @param {string} [configured]
 * @returns {string}
 */
export function resolveRoot(configured) {
  if (typeof configured === 'string' && configured.trim()) {
    return path.resolve(expandHome(configured.trim()));
  }
  const rawHome = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : '';
  let base;
  try {
    base = rawHome ? expandHome(rawHome) : path.join(os.homedir(), '.dsh');
  } catch {
    base = path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh');
  }
  if (!base || !path.isAbsolute(base)) {
    // 最后兜底也不允许是相对路径（相对路径会把记忆写进当前工作目录）。
    throw new Error('无法解析昔涟记忆根目录：缺少 DSH_HOME 与可用的 HOME（可显式配置 rootDir）');
  }
  return path.resolve(base, 'cyrene-philia093-0');
}

/**
 * 数据根目录改名迁移：新目录不存在、旧目录存在时，把 `<DSH_HOME>/cyrene-memory`
 * 整体改名为当前默认根目录（`cyrene-philia093-0`）。
 * 只在用户没有自定义 rootDir 时由 index.js 调用；失败返回错误、不阻塞启动。
 */
export function migrateRootDir(root, options = {}) {
  try {
    const target = path.resolve(root);
    if (fs.existsSync(target)) return { ok: true, migrated: false };
    const legacyNames = Array.isArray(options.legacyNames) ? options.legacyNames : ['cyrene-memory'];
    for (const name of legacyNames) {
      const legacy = path.join(path.dirname(target), name);
      if (!fs.existsSync(legacy)) continue;
      fs.renameSync(legacy, target);
      return { ok: true, migrated: true, from: legacy, to: target };
    }
    return { ok: true, migrated: false };
  } catch (error) {
    return { ok: false, migrated: false, error: errorText(error) };
  }
}

/**
 * 旧目录名兼容：把 `<root>/自留地` 或 `<root>/如我所书` 重命名为 `<root>/余页`。
 * 只在新目录不存在时改名（两边都有时优先新目录，旧目录原样保留）。
 * 镜像状态里的旧前缀由 `syncFreeArea` 负责清理。
 */
export function migrateFreeDir(root) {
  try {
    const base = resolveRoot(root);
    const target = path.join(base, '余页');
    if (fs.existsSync(target)) return { ok: true, migrated: false };
    for (const legacyName of ['自留地', '如我所书']) {
      const legacy = path.join(base, legacyName);
      if (!fs.existsSync(legacy)) continue;
      fs.renameSync(legacy, target);
      // 首建标记也跟着改名（新标记已存在时直接删旧标记），避免欢迎页重复生成
      const oldMarker = path.join(base, '元', `.${legacyName}已初始化`);
      const newMarker = path.join(base, '元', '.余页已初始化');
      try {
        if (fs.existsSync(oldMarker)) {
          if (fs.existsSync(newMarker)) fs.rmSync(oldMarker, { force: true });
          else fs.renameSync(oldMarker, newMarker);
        }
      } catch {
        /* 标记失败不影响目录迁移 */
      }
      return { ok: true, migrated: true, from: legacy, to: target };
    }
    return { ok: true, migrated: false };
  } catch (error) {
    return { ok: false, migrated: false, error: errorText(error) };
  }
}

/**
 * 建目录树 + 缺省 指南.md + 四个锚点占位（已存在的文件不覆盖）。
 * @param {string} [root]
 * @returns {{ ok: boolean, root: string, created: string[], errors: string[] }}
 */
export function ensureTree(root) {
  const result = { ok: true, root: '', created: [], errors: [] };
  try {
    const base = resolveRoot(root);
    result.root = base;
    const dirs = ['', ...TOP_DIRS, ...SELF_DIRS];
    for (const rel of dirs) {
      const abs = rel ? path.join(base, ...rel.split('/')) : base;
      if (fs.existsSync(abs)) continue;
      try {
        fs.mkdirSync(abs, { recursive: true });
        result.created.push(rel || '.');
      } catch (err) {
        result.ok = false;
        result.errors.push(`建目录失败 ${rel || '.'}：${errorText(err)}`);
      }
    }
    const guide = path.join(base, '指南.md');
    if (!fs.existsSync(guide)) {
      if (atomicWrite(guide, DEFAULT_GUIDE)) result.created.push('指南.md');
      else {
        result.ok = false;
        result.errors.push('写入缺省 指南.md 失败');
      }
    }
    for (const which of Object.keys(ANCHOR_FILES)) {
      const rel = ANCHOR_FILES[which];
      const abs = safeRelPath(base, rel);
      if (!abs) {
        result.ok = false;
        result.errors.push(`锚点路径非法：${rel}`);
        continue;
      }
      if (fs.existsSync(abs)) continue;
      if (writeAnchor(base, which, DEFAULT_ANCHOR_TEXT[which], { version: 1 })) {
        result.created.push(rel);
      } else {
        result.ok = false;
        result.errors.push(`写入锚点失败：${rel}`);
      }
    }
    // 根目录说明（名字映射；用户明确要的 Option A）
    const rootNote = path.join(base, '这是什么.md');
    if (!fs.existsSync(rootNote)) {
      if (atomicWrite(rootNote, ROOT_NOTE_TEXT)) result.created.push('这是什么.md');
      else {
        result.ok = false;
        result.errors.push('写入根目录说明失败');
      }
    } else {
      // 旧版种子文案（含旧自由区名）自动刷新；用户自己改过的不动
      try {
        const current = fs.readFileSync(rootNote, 'utf8');
        if (current.includes('如我所书') || current.includes('自留地') || current.includes('cyrene-memory')) {
          atomicWrite(rootNote, ROOT_NOTE_TEXT);
          result.created.push('这是什么.md（刷新）');
        }
      } catch {
        /* 读失败不刷 */
      }
    }
    // 余页欢迎页：只首建一次（元/ 里的标记存在就不再补）
    const freeMarker = path.join(base, '元', '.余页已初始化');
    if (!fs.existsSync(freeMarker)) {
      // 旧标记（自留地 / 如我所书）直接改名，避免欢迎页重复生成
      for (const legacyName of ['自留地', '如我所书']) {
        const oldMarker = path.join(base, '元', `.${legacyName}已初始化`);
        try {
          if (fs.existsSync(oldMarker)) fs.renameSync(oldMarker, freeMarker);
        } catch {
          /* ignore */
        }
        if (fs.existsSync(freeMarker)) break;
      }
    }
    if (!fs.existsSync(freeMarker)) {
      const freeWelcome = path.join(base, '余页', '关于这里.md');
      if (!fs.existsSync(freeWelcome)) {
        if (atomicWrite(freeWelcome, FREE_WELCOME_TEXT)) result.created.push('余页/关于这里.md');
        else {
          result.ok = false;
          result.errors.push('写入余页说明失败');
        }
      }
      try {
        fs.writeFileSync(freeMarker, '1');
      } catch {
        /* 标记失败最多下次再判断一次，不影响使用 */
      }
    }
    // 欢迎页旧文案（含旧自由区名）自动刷新；用户自己改过的不动
    const freeWelcome = path.join(base, '余页', '关于这里.md');
    try {
      if (fs.existsSync(freeWelcome)) {
        const current = fs.readFileSync(freeWelcome, 'utf8');
        if (current.includes('如我所书') || current.includes('自留地') || current.includes('cyrene-memory')) {
          atomicWrite(freeWelcome, FREE_WELCOME_TEXT);
          result.created.push('余页/关于这里.md（刷新）');
        }
      }
    } catch {
      /* ignore */
    }
  } catch (err) {
    result.ok = false;
    result.errors.push(errorText(err));
  }
  return result;
}

// ---------------------------------------------------------------------------
// 原子写与安全读
// ---------------------------------------------------------------------------

/**
 * 原子写：同目录 `.tmp` → fsync → rename。失败返回 false（不抛）。
 * @param {string} file 目标文件（绝对路径或相对当前工作目录）
 * @param {string} text 内容
 * @returns {boolean}
 */
export function atomicWrite(file, text) {
  let tmp = '';
  try {
    const target = path.resolve(String(file));
    const dir = path.dirname(target);
    fs.mkdirSync(dir, { recursive: true });
    const payload = typeof text === 'string' ? text : text === null || text === undefined ? '' : String(text);
    const token = `${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    tmp = path.join(dir, `.${path.basename(target)}.${token}.tmp`);
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, payload, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // Windows 下目标文件可能被杀软/索引器短暂占用，做几次快速重试。
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.renameSync(tmp, target);
        tmp = '';
        return true;
      } catch (err) {
        lastError = err;
        const code = err && err.code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') break;
      }
    }
    throw lastError || new Error('rename failed');
  } catch {
    try {
      if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* 清理失败也不抛 */
    }
    return false;
  }
}

/**
 * 安全读文本：读不到 / 解码失败 → ''（去 BOM）。
 * @param {string} file
 * @returns {string}
 */
export function readTextSafe(file) {
  try {
    const raw = fs.readFileSync(path.resolve(String(file)), 'utf8');
    return typeof raw === 'string' ? raw.replace(/^\uFEFF/, '') : '';
  } catch {
    return '';
  }
}

/**
 * 读 JSON：文件不存在 / 解析失败 → fallback。
 * @param {string} file
 * @param {*} [fallback]
 * @returns {*}
 */
export function readJSON(file, fallback) {
  const raw = readTextSafe(file);
  if (!raw.trim()) return fallback;
  try {
    const value = JSON.parse(raw);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

/**
 * 原子写 JSON（2 空格缩进，末尾换行）。
 * @param {string} file
 * @param {*} obj
 * @returns {boolean}
 */
export function writeJSON(file, obj) {
  let text;
  try {
    text = `${JSON.stringify(obj === undefined ? null : obj, null, 2)}\n`;
  } catch {
    return false;
  }
  return atomicWrite(file, text);
}

// ---------------------------------------------------------------------------
// 日档
// ---------------------------------------------------------------------------

/**
 * 日档路径（相对根目录，posix 分隔符）：日/YYYY/MM/YYYY-MM-DD.md。
 * @param {string} root 保留参数（与契约签名一致，便于调用方统一）
 * @param {string} day YYYY-MM-DD
 * @returns {string|null} 非法日期 → null
 */
export function dayFilePath(root, day) {
  void root;
  try {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return null;
    return `日/${m[1]}/${m[2]}/${m[1]}-${m[2]}-${m[3]}.md`;
  } catch {
    return null;
  }
}

/**
 * 读某天日档；文件不存在返回空结构。
 * @param {string} root
 * @param {string} day
 * @returns {{ front: object, entries: object[], errors: string[] }}
 */
export function readDay(root, day) {
  const empty = { front: {}, entries: [], errors: [] };
  try {
    const rel = dayFilePath(root, day);
    if (!rel) return { ...empty, errors: [`非法日期：${String(day)}`] };
    const abs = safeRelPath(resolveRoot(root), rel);
    if (!abs) return { ...empty, errors: [`日档路径越界：${rel}`] };
    const raw = readTextSafe(abs);
    if (!raw) return empty;
    const parsed = parseDay(raw);
    const entries = (Array.isArray(parsed.entries) ? parsed.entries : []).map((entry) =>
      normalizeEntry(
        { ...(entry && typeof entry === 'object' ? entry : {}), day, path: rel },
        { day, path: rel, now: entry && entry.created_at },
      ),
    );
    const front = parsed.front && typeof parsed.front === 'object' ? parsed.front : {};
    const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
    return { front, entries, errors };
  } catch (err) {
    return { ...empty, errors: [errorText(err)] };
  }
}

/**
 * 写某天日档（front 缺省由 renderDay 补全：date / entries / axes / dreamed）。
 * @param {string} root
 * @param {string} day
 * @param {object} front
 * @param {object[]} entries
 * @returns {boolean}
 */
export function writeDay(root, day, front, entries) {
  try {
    const rel = dayFilePath(root, day);
    if (!rel) return false;
    const abs = safeRelPath(resolveRoot(root), rel);
    if (!abs) return false;
    const frontIn = { ...(front && typeof front === 'object' && !Array.isArray(front) ? front : {}), date: day };
    const list = Array.isArray(entries) ? entries : [];
    return atomicWrite(abs, renderDay(frontIn, list));
  } catch {
    return false;
  }
}

/**
 * 追加（或按 id 覆盖）一条 Entry 到其归属日档；front.entries / axes 重算。
 * @param {string} root
 * @param {object} entry
 * @returns {{ ok: boolean, path: string, errors: string[] }}
 */
export function appendEntry(root, entry) {
  const errors = [];
  try {
    const base = resolveRoot(root);
    const now = Date.now();
    const candidate = normalizeEntry(entry, { now });
    const day = candidate.day;
    const rel = dayFilePath(base, day);
    if (!rel) {
      return { ok: false, path: '', errors: ['无法确定条目归属日期（day/created_at 均非法）'] };
    }
    const current = readDay(base, day);
    errors.push(...current.errors.filter(Boolean));
    const list = Array.isArray(current.entries) ? current.entries.slice() : [];
    const normalized = normalizeEntry(candidate, { day, path: rel, now });
    const index = list.findIndex((item) => item && item.id === normalized.id);
    if (index >= 0) list[index] = { ...list[index], ...normalized };
    else list.push(normalized);
    const frontIn = { ...(current.front && typeof current.front === 'object' ? current.front : {}), date: day };
    const ok = writeDay(base, day, frontIn, list);
    if (!ok) errors.push('日档写入失败');
    return { ok, path: rel, errors };
  } catch (err) {
    return { ok: false, path: '', errors: [errorText(err)] };
  }
}

/**
 * 列出所有日档日期（升序，YYYY-MM-DD）。只认 日/** 下的 YYYY-MM-DD.md。
 * @param {string} root
 * @returns {string[]}
 */
export function listDays(root) {
  const days = new Set();
  try {
    const base = resolveRoot(root);
    const start = safeRelPath(base, '日');
    if (!start || !fs.existsSync(start)) return [];
    const visit = (absDir) => {
      let entries;
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const abs = path.join(absDir, entry.name);
        if (entry.isDirectory()) {
          visit(abs);
          continue;
        }
        if (!entry.isFile()) continue;
        const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(entry.name);
        if (m) days.add(m[1]);
      }
    };
    visit(start);
  } catch {
    /* 读不到就是空列表 */
  }
  return [...days].sort();
}

// ---------------------------------------------------------------------------
// 四问锚点
// ---------------------------------------------------------------------------

/**
 * 读锚点：`{ meta: front-matter, content: 正文 }`；不存在返回 { meta:{}, content:'' }。
 * @param {string} root
 * @param {'self'|'user'|'origin'|'goal'} which
 * @returns {{ meta: object, content: string }}
 */
export function readAnchor(root, which) {
  try {
    const rel = ANCHOR_FILES[which];
    if (!rel) return { meta: {}, content: '' };
    const abs = safeRelPath(resolveRoot(root), rel);
    if (!abs) return { meta: {}, content: '' };
    const raw = readTextSafe(abs);
    if (!raw) return { meta: {}, content: '' };
    const { front, body } = parseFrontMatter(raw);
    return {
      meta: front && typeof front === 'object' ? front : {},
      content: typeof body === 'string' ? body : '',
    };
  } catch {
    return { meta: {}, content: '' };
  }
}

/**
 * 写锚点：front-matter 至少含 version / updated_at / immutable，正文为 content。
 * version 规则：meta.version 优先；否则已有版本 +1；首次为 1。
 * @param {string} root
 * @param {'self'|'user'|'origin'|'goal'} which
 * @param {string} content
 * @param {object} [meta]
 * @returns {boolean}
 */
export function writeAnchor(root, which, content, meta) {
  try {
    const rel = ANCHOR_FILES[which];
    if (!rel) return false;
    const base = resolveRoot(root);
    const abs = safeRelPath(base, rel);
    if (!abs) return false;
    const prev = parseFrontMatter(readTextSafe(abs));
    const prevMeta = prev.front && typeof prev.front === 'object' ? prev.front : {};
    const extra = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};

    let version = 1;
    if (Number.isFinite(Number(extra.version)) && Number(extra.version) > 0) {
      version = Math.floor(Number(extra.version));
    } else if (Number.isFinite(Number(prevMeta.version)) && Number(prevMeta.version) > 0) {
      version = Math.floor(Number(prevMeta.version)) + 1;
    }
    const updatedAt = extra.updated_at !== undefined ? extra.updated_at : new Date().toISOString();
    const immutable =
      typeof extra.immutable === 'boolean' ? extra.immutable : prevMeta.immutable === true;

    const front = { version, updated_at: updatedAt, immutable };
    for (const [key, value] of Object.entries(extra)) {
      if (!(key in front)) front[key] = value;
    }
    const body = typeof content === 'string' ? content : content === null || content === undefined ? '' : String(content);
    const trimmed = body.replace(/^\s+/, '').replace(/\s+$/, '');
    const text = `${renderFrontMatter(front)}${trimmed ? `\n${trimmed}\n` : ''}`;
    return atomicWrite(abs, text);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 遍历与配额
// ---------------------------------------------------------------------------

/** 元/ 下的日志与索引不参与「文件签名」遍历（它们自身就是派生数据） */
function isMetaLog(rel) {
  if (typeof rel !== 'string' || !rel.startsWith('元/')) return false;
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  return name.startsWith('日志') || name.startsWith('索引');
}

/**
 * 遍历根目录文件 → [{ rel, bytes, mtime }]（rel 为 posix；跳过 元/ 的日志与索引）。
 * @param {string} root
 * @returns {{ rel: string, bytes: number, mtime: number }[]}
 */
export function walkFiles(root) {
  const files = [];
  try {
    const base = resolveRoot(root);
    if (!fs.existsSync(base)) return files;
    const visit = (absDir, relDir) => {
      let entries;
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const abs = path.join(absDir, entry.name);
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          visit(abs, rel);
          continue;
        }
        if (!entry.isFile()) continue;
        if (isMetaLog(rel)) continue;
        try {
          const stat = fs.statSync(abs);
          files.push({ rel, bytes: stat.size, mtime: Math.round(stat.mtimeMs) });
        } catch {
          /* 单个文件读不到就跳过 */
        }
      }
    };
    visit(base, '');
  } catch {
    /* 整棵树读不到 → 空列表 */
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return files;
}

/**
 * 配额用量：按顶层子目录聚合字节数（元/ 下日志与索引也计入配额）。
 * @param {string} root
 * @returns {{ bytes: number, byTop: Record<string, number> }}
 */
export function quotaUsage(root) {
  const byTop = {};
  for (const key of QUOTA_KEYS) byTop[key] = 0;
  let bytes = 0;
  try {
    const base = resolveRoot(root);
    if (!fs.existsSync(base)) return { bytes: 0, byTop };
    const visit = (absDir, relDir) => {
      let entries;
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const abs = path.join(absDir, entry.name);
        if (entry.isDirectory()) {
          visit(abs, relDir ? `${relDir}/${entry.name}` : entry.name);
          continue;
        }
        if (!entry.isFile()) continue;
        let size = 0;
        try {
          size = fs.statSync(abs).size;
        } catch {
          continue;
        }
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        const top = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '其它';
        const key = QUOTA_KEYS.includes(top) ? top : '其它';
        byTop[key] += size;
        bytes += size;
      }
    };
    visit(base, '');
  } catch {
    /* fail-open：返回已统计到的部分 */
  }
  return { bytes, byTop };
}

// ---------------------------------------------------------------------------
// 安全相对路径
// ---------------------------------------------------------------------------

/**
 * 相对根目录的路径 → 绝对路径；越界（`..`、绝对路径、盘符、逃逸的符号链接）→ null。
 * @param {string} root
 * @param {string} rel
 * @returns {string|null}
 */
export function safeRelPath(root, rel) {
  try {
    if (typeof rel !== 'string') return null;
    const relText = rel.trim();
    if (!relText) return null;
    if (relText.includes('\0') || relText.includes('\u0000')) return null;
    const rootAbs = path.resolve(String(root));
    // '.' 指根目录本身（fsops 的 ls/du 会用它），不是越界。
    if (relText === '.') return rootAbs;
    if (path.isAbsolute(relText) || /^[a-zA-Z]:/.test(relText) || /^[\\/]/.test(relText)) return null;
    const parts = relText.split(/[\\/]+/);
    if (parts.some((part) => part === '..')) return null;
    const abs = path.resolve(rootAbs, relText);
    const relCheck = path.relative(rootAbs, abs);
    if (relCheck === '' || relCheck.startsWith('..') || path.isAbsolute(relCheck)) return null;
    // 已存在的路径再校验一次真实路径，防止符号链接逃逸出根目录。
    try {
      if (fs.existsSync(abs) && fs.existsSync(rootAbs)) {
        const realRoot = fs.realpathSync(rootAbs);
        const realAbs = fs.realpathSync(abs);
        const realRel = path.relative(realRoot, realAbs);
        if (realRel.startsWith('..') || path.isAbsolute(realRel)) return null;
      }
    } catch {
      /* 真实路径校验失败时按字面路径放行（目标可能刚被删） */
    }
    return abs;
  } catch {
    return null;
  }
}
