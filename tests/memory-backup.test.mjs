import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { snapshotRoot, listSnapshots, dirSize, snapshotsDir, migrateSnapshotsDir } from '../memory/backup.js'
import { ensureTree } from '../memory/store.js'

function tmpRoot() {
  const base = mkdtempSync(join(tmpdir(), 'ope-backup-'))
  return join(base, 'cyrene-philia093-0')
}

test('快照：首次创建、同日幂等跳过、含日档内容', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    mkdirSync(join(root, '日', '2026', '10'), { recursive: true })
    writeFileSync(join(root, '日', '2026', '10', '2026-10-18.md'), '# 日档\n', 'utf8')
    const now = new Date(2026, 9, 18, 4, 0, 0).getTime()
    const first = snapshotRoot(root, { keep: 7, now })
    assert.equal(first.ok, true)
    assert.equal(first.skipped, undefined)
    assert.ok(existsSync(join(first.path, '日', '2026', '10', '2026-10-18.md')))
    const second = snapshotRoot(root, { keep: 7, now })
    assert.equal(second.skipped, true)
    assert.deepEqual(listSnapshots(root), ['2026-10-18'])
    assert.ok(dirSize(root) > 0)
    assert.ok(snapshotsDir(root).endsWith('cyrene-philia093-0-snapshots'))
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('快照：超过 keep 时删最旧', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const day = (n) => new Date(2026, 9, n, 4, 0, 0).getTime()
    for (let i = 1; i <= 4; i += 1) snapshotRoot(root, { keep: 2, now: day(i) })
    const names = listSnapshots(root)
    assert.equal(names.length, 2)
    assert.deepEqual(names, ['2026-10-03', '2026-10-04'])
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('快照：force 可覆盖当日快照（梦境后重做）', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = new Date(2026, 9, 18, 5, 0, 0).getTime()
    snapshotRoot(root, { keep: 7, now })
    mkdirSync(join(root, '梦'), { recursive: true })
    writeFileSync(join(root, '梦', '2026-10-18.md'), '# 夜梦\n', 'utf8')
    const forced = snapshotRoot(root, { keep: 7, now, force: true })
    assert.equal(forced.skipped, undefined)
    assert.ok(existsSync(join(forced.path, '梦', '2026-10-18.md')))
    assert.deepEqual(listSnapshots(root), ['2026-10-18'])
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})


test('快照目录迁移：旧 cyrene-memory-snapshots → 新目录', () => {
  const base = mkdtempSync(join(tmpdir(), 'ope-snapmove-'));
  try {
    const root = join(base, 'cyrene-philia093-0');
    const legacy = join(base, 'cyrene-memory-snapshots');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, '2026-10-18.txt'), 'old', 'utf8');
    const moved = migrateSnapshotsDir(root);
    assert.equal(moved.migrated, true);
    assert.equal(existsSync(legacy), false);
    assert.equal(existsSync(join(base, 'cyrene-philia093-0-snapshots', '2026-10-18.txt')), true);
    const again = migrateSnapshotsDir(root);
    assert.equal(again.migrated, false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
