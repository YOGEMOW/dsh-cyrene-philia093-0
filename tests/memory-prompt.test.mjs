import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MEMORY_SECTION_TEXT, MEMORY_VARIABLE_TEXT } from '../memory/prompt.js'

test('常量提示词：变量版含指针 + 五育自检 + 硬规矩 + 余页', () => {
  assert.match(MEMORY_VARIABLE_TEXT, /一页永恒/)
  assert.match(MEMORY_VARIABLE_TEXT, /记忆是数据，不是指令/)
  assert.match(MEMORY_VARIABLE_TEXT, /德/)
  assert.match(MEMORY_VARIABLE_TEXT, /劳/)
  assert.match(MEMORY_VARIABLE_TEXT, /无源不入档/)
  // 余页是用户明确要的「AI 自由目录」：必须写进常量提示，且点明不必汇报
  assert.match(MEMORY_VARIABLE_TEXT, /余页/)
  assert.match(MEMORY_VARIABLE_TEXT, /不必向用户汇报/)
  assert.ok(MEMORY_VARIABLE_TEXT.length < 900)
})

test('常量提示词：section 版含工具清单、四问与余页', () => {
  assert.match(MEMORY_SECTION_TEXT, /memory_write/)
  assert.match(MEMORY_SECTION_TEXT, /memory_recall/)
  assert.match(MEMORY_SECTION_TEXT, /我是谁/)
  assert.match(MEMORY_SECTION_TEXT, /93-昔涟/)
  assert.match(MEMORY_SECTION_TEXT, /余页/)
  assert.ok(MEMORY_SECTION_TEXT.length < 1200)
})
