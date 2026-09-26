import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'
import { createTodoItem } from '../../src/core/models'

const LONG = '这'.repeat(90)

function todo(content: string, id: string) {
  return createTodoItem({ content, now: new Date(), id })
}

/** 三轮反馈（8.2-4）：气泡只在确实截断的行出现，位置固定在行左侧（不遮待办列表） */
test('8.2-4：截断行悬停 1 秒弹气泡于行左侧；未截断行不弹', async () => {
  const h = await launchApp({
    seed: {
      todos: [todo('短事项', 't1'), todo(LONG, 't2')]
    }
  })
  await h.main.waitForSelector('[data-testid="todo-row"]')

  // 长行：悬停内容 1.1 秒 → 气泡出现，右缘不越过行左缘
  await h.main.locator('[data-testid="todo-row"]').nth(1).locator('[data-testid="row-content"]').hover()
  await h.main.waitForTimeout(1100)
  const m = await h.main.evaluate(() => {
    const b = document.querySelector('[data-testid="content-bubble"]') as HTMLElement | null
    if (!b) return null
    const rows = document.querySelectorAll('[data-testid="todo-row"]')
    const r = rows[1].getBoundingClientRect()
    const br = b.getBoundingClientRect()
    return { display: getComputedStyle(b).display, text: b.textContent, right: br.right, rowLeft: r.left }
  })
  expect(m).not.toBeNull()
  expect(m!.display).not.toBe('none')
  expect(m!.text).toBe(LONG)
  expect(m!.right).toBeLessThanOrEqual(m!.rowLeft)

  // 移开 → 气泡消失
  await h.main.locator('[data-testid="clock-time"]').hover()
  await h.main.waitForTimeout(200)
  const gone = await h.main.evaluate(() => {
    const b = document.querySelector('[data-testid="content-bubble"]') as HTMLElement | null
    return b ? getComputedStyle(b).display : 'absent'
  })
  expect(gone === 'none' || gone === 'absent').toBe(true)

  // 短行：悬停 1.1 秒也不弹
  await h.main.locator('[data-testid="todo-row"]').nth(0).locator('[data-testid="row-content"]').hover()
  await h.main.waitForTimeout(1100)
  const m2 = await h.main.evaluate(() => {
    const b = document.querySelector('[data-testid="content-bubble"]') as HTMLElement | null
    return b ? getComputedStyle(b).display : 'absent'
  })
  expect(m2 === 'none' || m2 === 'absent').toBe(true)
  await h.close()
})
