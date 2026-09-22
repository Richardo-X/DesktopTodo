import { test, expect } from '@playwright/test'
import { launchApp, dateKeyOffset, localIso, type AppHandle } from './helpers'
import { createTodoItem } from '../../src/core/models'

/** T46 跨天结算（验收 16/18）：归档+逾期+静默+启动补结算 */

test('验收16/18：跨过0点 → 未完成挂逾期标签、昨日完成归档、全程静默', async () => {
  const h: AppHandle = await launchApp()
  const main = h.main

  // 建两条待办，完成其中一条
  const winPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="op-new"]')
  const child = await winPromise
  await child.fill('[data-testid="new-input"]', '会完成的')
  await child.click('[data-testid="new-submit"]')
  await child.waitForEvent('close', { timeout: 5000 }).catch(() => {})

  const win2 = h.app.waitForEvent('window')
  await main.click('[data-testid="op-new"]')
  const child2 = await win2
  await child2.fill('[data-testid="new-input"]', '不做完的')
  await child2.click('[data-testid="new-submit"]')
  await child2.waitForEvent('close', { timeout: 5000 }).catch(() => {})

  await main.locator('[data-testid="row-checkbox"]').first().click()
  await expect(main.locator('[data-testid="done-row"]')).toHaveCount(1, { timeout: 5000 })

  // 强制跨天结算（+1 天偏移时钟，测试钩子）
  await main.evaluate(() => {
    return (window as unknown as { desktopTodoTest: { forceSettle(days: number): Promise<unknown> } }).desktopTodoTest.forceSettle(1)
  })
  await main.waitForTimeout(500)

  // 静默：无任何确认框/弹窗
  expect(await main.locator('[data-testid="confirm-dialog"]').count()).toBe(0)

  // 未完成待办挂逾期标签，位置不变
  const lastRow = main.locator('[data-testid="todo-row"]')
  await expect(lastRow).toHaveCount(1, { timeout: 10_000 })
  await expect(lastRow.locator('[data-testid="row-overdue-tag"]')).toHaveText('逾期', { timeout: 10_000 })

  // 昨日完成归档：已完成面板清空
  await expect(main.locator('[data-testid="done-row"]')).toHaveCount(0)

  // 历史记录里能看到归档条目（今天键=真实今天）
  const histPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="done-history"]')
  const hist = await histPromise
  await hist.waitForSelector('[data-testid="hist-count"]')
  await expect(hist.locator('[data-testid="hist-count"]')).toHaveText('1 条')
  await expect(hist.locator('[data-testid="hist-row"]')).toHaveCount(1)
  await h.close()
})

test('验收16：启动补结算（关机跨天）', async () => {
  const t = new Date()
  const todayKey = dateKeyOffset(0)

  // 预置：昨天创建未完成的待办（结算时挂逾期）、今天完成的记录
  const todo = createTodoItem({ content: '跨天未完成', now: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 9), id: 's1' })
  const doneItem = {
    ...createTodoItem({ content: '昨天完成的', now: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 8), id: 's2' }),
    completedAt: localIso(t.getFullYear(), t.getMonth() + 1, t.getDate(), 7)
  }

  // 用偏移时钟 +24h 启动：boot 结算把"今天完成"归档、待办标逾期
  const h = await launchApp({
    seed: { todos: [{ ...todo, completedAt: null }], completed: [doneItem] },
    clockOffsetHours: 24
  })
  const main = h.main
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(1)
  await expect(main.locator('[data-testid="todo-row"]').locator('[data-testid="row-overdue-tag"]')).toHaveText('逾期')
  await expect(main.locator('[data-testid="done-row"]')).toHaveCount(0)

  void todayKey
  await h.close()
})
