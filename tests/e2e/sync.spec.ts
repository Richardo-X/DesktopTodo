import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { createTodoItem } from '../../src/core/models'

/**
 * 批次 B-2/B-5 跨窗状态同步：
 * - 数据同步：待办窗新建 → 已完成窗计数/行实时更新（stateUpdated 广播）
 * - 主题同步：主窗切换日/夜 → 三窗 data-theme 逐窗一致（令牌逐窗应用）
 * - 批量模式跨窗同步（B-5）：快捷窗进批量 → 待办窗/已完成窗整面板冻结；返回 → 解冻
 */

let h: AppHandle

test.beforeEach(async () => {
  h = await launchApp({
    seed: { todos: [createTodoItem({ content: '甲', now: new Date(), id: 't1' })] }
  })
})

test.afterEach(async () => {
  await h.close()
})

test('数据同步：待办窗勾选完成 → 已完成窗口行与计数实时更新', async () => {
  await expect(h.done.locator('[data-testid="done-title"]')).toHaveText('已完成 · 0')
  await h.main.locator('[data-testid="row-checkbox"]').first().click()
  await expect(h.done.locator('[data-testid="done-row"]')).toHaveCount(1, { timeout: 5000 })
  await expect(h.done.locator('[data-testid="done-title"]')).toHaveText('已完成 · 1')
})

test('主题同步：主窗切夜 → 三窗 data-theme 一致（令牌逐窗）', async () => {
  const themeOf = (page: typeof h.main): Promise<string> =>
    page.evaluate(() => document.querySelector('.stage')?.getAttribute('data-theme') ?? 'none')
  expect(await themeOf(h.main)).toBe('day')
  expect(await themeOf(h.quick)).toBe('day')
  expect(await themeOf(h.done)).toBe('day')

  await h.main.click('[data-testid="tb-theme"]')
  await expect.poll(async () => themeOf(h.done), { timeout: 5000 }).toBe('night')
  expect(await themeOf(h.main)).toBe('night')
  expect(await themeOf(h.quick)).toBe('night')
})

test('批量跨窗同步（B-5）：快捷窗进批量 → 待办窗/已完成窗整面板冻结；返回 → 解冻', async () => {
  await h.quick.click('[data-testid="quick-batch"]')
  await expect(h.quick.locator('[data-testid="batch-bar"]')).toBeVisible()
  // 其余两窗整面板冻结（置灰示意）
  await expect(h.main.locator('[data-testid="home-panel"]')).toHaveClass(/frozen/, { timeout: 5000 })
  await expect(h.done.locator('[data-testid="done-panel"]')).toHaveClass(/frozen/, { timeout: 5000 })
  // 快捷窗自身面板不冻结
  await expect(h.quick.locator('[data-testid="quick-panel"]')).not.toHaveClass(/frozen/)

  // 待办窗行点击不参与选择（冻结不可点 + 状态集不污染）
  await h.quick.click('[data-testid="batch-cancel"]')
  await expect(h.main.locator('[data-testid="home-panel"]')).not.toHaveClass(/frozen/, { timeout: 5000 })
  await expect(h.done.locator('[data-testid="done-panel"]')).not.toHaveClass(/frozen/, { timeout: 5000 })
})
