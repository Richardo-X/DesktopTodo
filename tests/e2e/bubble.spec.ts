import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchApp } from './helpers'
import { createTodoItem, createTemplateItem } from '../../src/core/models'

const LONG = '这'.repeat(90)

/** 四轮定稿：气泡=独立小窗口（可越出主窗口）——默认行左侧弹；会碰屏幕左缘的窗（快捷添加）翻右侧弹；
 * 逐窗独立判定：快捷窗翻右时待办窗不受影响，移回后同一行恢复左弹 */

async function waitMainVisible(app: ElectronApplication): Promise<void> {
  await expect
    .poll(
      async () =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())),
      { timeout: 10_000 }
    )
    .toBe(true)
}

async function bubbleBounds(app: ElectronApplication): Promise<{ x: number; y: number; width: number; visible: boolean } | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('win=bubble'))
    if (!w) return null
    const r = w.getBounds()
    return { x: r.x, y: r.y, width: r.width, visible: w.isVisible() }
  })
}

async function bubblePage(app: ElectronApplication): Promise<Page | null> {
  return app.windows().find((w) => w.url().includes('win=bubble')) ?? null
}

async function mainX(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('panel=main'))
    return w!.getBounds().x
  })
}

async function moveMainTo(app: ElectronApplication, x: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, px) => {
    const w = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('panel=main'))
    w!.setPosition(px, 100)
  }, x)
}

test('8.2-4：气泡独立窗——待办行左弹、快捷行碰左缘翻右弹、移开隐藏、逐窗独立', async () => {
  const h = await launchApp({
    seed: {
      todos: [createTodoItem({ content: LONG, now: new Date(), id: 't1' })],
      templates: [createTemplateItem({ content: LONG, now: new Date(), id: 'tp1' })]
    }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await waitMainVisible(h.app)

  // —— 待办行（默认位置在屏幕右侧）：左弹（气泡右缘 ≤ 行左缘），内容=全文 ——
  await h.main.locator('[data-testid="todo-row"] [data-testid="row-content"]').hover()
  await h.main.waitForTimeout(1200)
  await expect
    .poll(async () => (await bubbleBounds(h.app))?.visible === true, { timeout: 5000 })
    .toBe(true)
  const page1 = (await bubblePage(h.app))!
  await page1.waitForSelector('[data-testid="content-bubble"]')
  expect((await page1.locator('[data-testid="content-bubble"]').textContent())?.trim()).toBe(LONG)

  const mainX0 = await mainX(h.app)
  const todoRowLeft = await h.main.evaluate(
    () => Math.round((document.querySelector('[data-testid="todo-row"]') as HTMLElement).getBoundingClientRect().left)
  )
  const bb1 = (await bubbleBounds(h.app))!
  expect(bb1.x + bb1.width).toBeLessThanOrEqual(mainX0 + todoRowLeft + 2) // 左弹：不越行左缘

  // 移开 → 气泡窗隐藏
  await h.main.locator('[data-testid="clock-time"]').hover()
  await expect
    .poll(async () => (await bubbleBounds(h.app))?.visible === false, { timeout: 5000 })
    .toBe(true)

  // —— 快捷模板行：窗口贴屏幕左缘 → 左弹必被切 → 翻转到行右侧（允许遮列表） ——
  await moveMainTo(h.app, 8)
  await h.quick.locator('[data-testid="tpl-row"] [data-testid="tpl-content"]').hover()
  await h.main.waitForTimeout(1200)
  await expect
    .poll(async () => (await bubbleBounds(h.app))?.visible === true, { timeout: 5000 })
    .toBe(true)
  const mainX1 = await mainX(h.app)
  const tplRowRight = await h.quick.evaluate(
    () => Math.round((document.querySelector('[data-testid="tpl-row"]') as HTMLElement).getBoundingClientRect().right)
  )
  const bb2 = (await bubbleBounds(h.app))!
  expect(bb2.x).toBeGreaterThanOrEqual(mainX1 + tplRowRight - 2) // 翻右：起于行右缘
  const page2 = (await bubblePage(h.app))!
  expect((await page2.locator('[data-testid="content-bubble"]').textContent())?.trim()).toBe(LONG)

  // 移开 → 隐藏（三窗：移动快捷窗自己的虚拟鼠标，跨窗 hover 不触发 mouseleave）
  await h.quick.locator('[data-testid="quick-title"]').hover()
  await expect
    .poll(async () => (await bubbleBounds(h.app))?.visible === false, { timeout: 5000 })
    .toBe(true)

  // —— 同一模板行，窗口移回屏幕右侧 → 不碰左缘 → 保持左弹（逐窗独立判定） ——
  await moveMainTo(h.app, 1500)
  await h.quick.locator('[data-testid="tpl-row"] [data-testid="tpl-content"]').hover()
  await h.main.waitForTimeout(1200)
  await expect
    .poll(async () => (await bubbleBounds(h.app))?.visible === true, { timeout: 5000 })
    .toBe(true)
  const mainX2 = await mainX(h.app)
  const tplRowLeft = await h.quick.evaluate(
    () => Math.round((document.querySelector('[data-testid="tpl-row"]') as HTMLElement).getBoundingClientRect().left)
  )
  const bb3 = (await bubbleBounds(h.app))!
  expect(bb3.x + bb3.width).toBeLessThanOrEqual(mainX2 + tplRowLeft + 2) // 左弹
  await h.close()
})
