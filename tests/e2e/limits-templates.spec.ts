import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { createTemplateItem, type AppData } from '../../src/core/models'

/** T48 上限与模板（验收 15/31/32/33） */

test('验收15：待办满上限时新建被拦截并提示', async () => {
  const h: AppHandle = await launchApp()
  const main = h.main
  // 造满 2 条（默认上限 10 → 改用设置先降为 1 更直接：种子 1 条 + 手动建 1 条后上限 2）
  // 直接建满 2 条再把上限降为 2，然后尝试新建
  for (const text of ['占用一', '占用二']) {
    const wp = h.app.waitForEvent('window')
    await main.click('[data-testid="op-new"]')
    const c = await wp
    await c.fill('[data-testid="new-input"]', text)
    await c.click('[data-testid="new-submit"]')
    await c.waitForEvent('close', { timeout: 5000 }).catch(() => {})
  }
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(2)

  // 设置上限降到 2（=当前数量，减号置灰）
  const setPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="tb-settings"]')
  const settings = await setPromise
  await settings.waitForSelector('[data-testid="set-max-minus"]')
  for (let i = 0; i < 8; i++) await settings.click('[data-testid="set-max-minus"]')
  await expect(settings.locator('[data-testid="set-max-value"]')).toHaveText('2')
  await expect(settings.locator('[data-testid="set-max-note"]')).toHaveText('不可低于当前待办数量')
  await settings.close().catch(() => {})

  // 新建被拦截
  const wp = h.app.waitForEvent('window')
  await main.click('[data-testid="op-new"]')
  const c = await wp
  await c.fill('[data-testid="new-input"]', '超限的')
  await c.click('[data-testid="new-submit"]')
  await expect(c.locator('[data-testid="new-error"]')).toHaveText('待办数量已达上限')
  await c.close().catch(() => {})
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(2)
  await h.close()
})

test('验收31：模板查重提示"已存在相同内容"', async () => {
  const h: AppHandle = await launchApp()
  const wp = h.app.waitForEvent('window')
  await h.quick.click('[data-testid="quick-new"]')
  const tpl = await wp
  await tpl.fill('[data-testid="tpl-new-input"]', '喝水')
  await tpl.click('[data-testid="tpl-new-submit"]')
  await tpl.waitForEvent('close', { timeout: 5000 }).catch(() => {})

  const wp2 = h.app.waitForEvent('window')
  await h.quick.click('[data-testid="quick-new"]')
  const tpl2 = await wp2
  await tpl2.fill('[data-testid="tpl-new-input"]', '喝水')
  await tpl2.click('[data-testid="tpl-new-submit"]')
  await expect(tpl2.locator('[data-testid="tpl-new-error"]')).toHaveText('已存在相同内容')
  await tpl2.close().catch(() => {})
  await h.close()
})

test('验收32/33：模板满 10 拒绝新建；一键添加保留模板', async () => {
  const templates = Array.from({ length: 10 }, (_, i) =>
    createTemplateItem({ content: `模板${i}`, now: new Date(2026, 8, 20, 9), id: `tpl${i}` })
  )
  const h: AppHandle = await launchApp({ seed: { templates } as Partial<AppData> })
  const main = h.main

  // 满 10 → 新建被拒
  const wp = h.app.waitForEvent('window')
  await h.quick.click('[data-testid="quick-new"]')
  const tpl = await wp
  await tpl.fill('[data-testid="tpl-new-input"]', '第十一个')
  await tpl.click('[data-testid="tpl-new-submit"]')
  await expect(tpl.locator('[data-testid="tpl-new-error"]')).toHaveText('模板数量已达上限（10 个）')
  await tpl.close().catch(() => {})

  // 一键添加：待办末尾新增，模板保留
  await h.quick.locator('[data-testid="tpl-add"]').nth(2).click()
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(1)
  await expect(main.locator('[data-testid="row-content"]')).toContainText('模板2')
  await expect(h.quick.locator('[data-testid="tpl-row"]')).toHaveCount(10)
  await expect(h.quick.locator('[data-testid="quick-title"]')).toHaveText('模板 · 10/10')
  await h.close()
})
