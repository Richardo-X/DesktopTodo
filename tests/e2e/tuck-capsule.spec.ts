import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/** 三轮8.2-1 + 三窗形态 B（批次 B-1）：缩进=侧窗整窗隐藏 + 待办窗收缩为胶囊
 * （宽 160、水平居中于原簇、贴顶；高度受系统最小值钳制 ≤60）；弹出还原原位——
 * 缩进对 x 的改动不得污染位置记忆 */
test('缩进时待办窗收窄为胶囊、侧窗隐藏，弹出还原且位置不漂移', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const winByPanel = (panel: string) =>
    h.app.evaluate(({ BrowserWindow }, p) => {
      const w = BrowserWindow.getAllWindows().find(
        (win) => !win.isDestroyed() && win.webContents.getURL().includes(`panel=${p}`)
      )
      if (!w) return null
      const b = w.getBounds()
      return { x: b.x, y: b.y, w: b.width, h: b.height, vis: w.isVisible() }
    }, panel)

  const mainBounds = async (): Promise<{ x: number; y: number; w: number; h: number; vis: boolean }> => {
    for (let i = 0; i < 50; i++) {
      const b = (await winByPanel('main')) as { x: number; y: number; w: number; h: number; vis: boolean } | null
      if (b) return b
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error('main window bounds unavailable')
  }

  const before = await mainBounds()
  expect(before.w).toBeGreaterThan(160)

  const setTucked = (v: boolean): void => {
    void h.main.evaluate(
      (val) =>
        (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(val),
      v
    )
  }

  setTucked(true)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 5_000 })
    .toBeLessThanOrEqual(1) // OS DPI 取整容差
  // Windows 系统最小高度约 39px 钳制（setMinimumSize 不豁免）；可见胶囊仍为热区顶部 6px
  const tucked = await mainBounds()
  expect(tucked.h).toBeGreaterThanOrEqual(12)
  expect(tucked.h).toBeLessThanOrEqual(60)
  // 侧窗整窗隐藏（形态 B）
  const quickVis = (await winByPanel('quick'))?.vis
  const doneVis = (await winByPanel('done'))?.vis
  expect(quickVis).toBe(false)
  expect(doneVis).toBe(false)

  setTucked(false)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - before.w), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)
  const restored = await mainBounds()
  expect(restored.x).toBe(before.x) // 位置不被胶囊 x 污染
  expect(restored.y).toBe(before.y)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(true)
  await h.close()
})
