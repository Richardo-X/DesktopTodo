import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 三轮8.2-1/8.2-2：缩进窗口=胶囊矩形（宽 160、水平居中于原簇、贴顶；高度受系统最小值钳制 ≤40）；
 * 弹出还原原簇位置——缩进对 x 的改动不得污染位置记忆 */
test('缩进时窗口收窄为胶囊，弹出还原且位置不漂移', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const bounds = async (): Promise<{ x: number; y: number; w: number; h: number } | null> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.isVisible())
      if (!w) return null
      const b = w.getBounds()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })

  const untilBounds = async (): Promise<{ x: number; y: number; w: number; h: number }> => {
    for (let i = 0; i < 50; i++) {
      const b = await bounds()
      if (b) return b
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error('main window bounds unavailable')
  }

  const before = await untilBounds()
  expect(before.w).toBeGreaterThan(160) // 全簇宽

  const setTucked = (v: boolean): void => {
    void h.main.evaluate((val) => (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(val), v)
  }

  setTucked(true)
  await expect.poll(async () => (await bounds())?.w ?? 0, { timeout: 5_000 }).toBe(160)
  // Windows 系统最小高度约 39px 钳制（setMinimumSize 不豁免）；可见胶囊仍为热区顶部 6px
  const tucked = await untilBounds()
  expect(tucked.h).toBeGreaterThanOrEqual(12)
  expect(tucked.h).toBeLessThanOrEqual(60) // CI DPI 缩放会抬高系统最小高度

  setTucked(false)
  await expect.poll(async () => (await bounds())?.w ?? 0, { timeout: 5_000 }).toBe(before.w)
  const restored = await untilBounds()
  expect(restored.x).toBe(before.x) // 位置不被胶囊 x 污染
  expect(restored.y).toBe(before.y)
  await h.close()
})
