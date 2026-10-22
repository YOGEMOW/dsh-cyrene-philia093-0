/**
 * 版本与清单一致性：三处清单同版本，CHANGELOG 有对应条目。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

test('版本一致：package.json / dsh.plugin.json / plugin.json / package.dsh.version', () => {
  const pkg = readJSON('package.json')
  const versions = {
    'package.json': pkg.version,
    'package.dsh.version': pkg.dsh?.version,
    'dsh.plugin.json': readJSON('dsh.plugin.json').version,
    'plugin.json': readJSON('plugin.json').version,
  }
  const distinct = [...new Set(Object.values(versions))]
  assert.equal(distinct.length, 1, `版本不一致：${JSON.stringify(versions)}`)
  assert.match(distinct[0], /^\d+\.\d+\.\d+$/)
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  assert.match(changelog, new RegExp(`## \\[${distinct[0].replace(/\./g, '\\.')}\\]`))
})

test('清单 id 一致：package.dsh.id / dsh.plugin.json.id / plugin.json.id', () => {
  const pkg = readJSON('package.json')
  const ids = [pkg.dsh?.id, readJSON('dsh.plugin.json').id, readJSON('plugin.json').id]
  assert.deepEqual([...new Set(ids)], ['dsh-cyrene-philia093-0'])
})
