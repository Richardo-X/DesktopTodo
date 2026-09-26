import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 三轮8.2-1/8.2-2：缩进窗口=胶囊矩形（160×12、水平居中于原簇、贴顶）；
 * 弹出还原原簇位置——缩进对 x 的改动不得污染位置记忆 */
test('缩进时窗口收窄为胶囊，弹出还原且位置不漂移', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const bounds = async (): Promise<{ x: number; y: number; w: number; h: number }> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.isVisible())
      const b = w!.getBounds()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })

  const before = await bounds()
  expect(before.w).toBeGreaterThan(160) // 全簇宽

  const setTucked = (v: boolean): void => {
    void h.main.evaluate((val) => (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(val), v)
  }

  setTucked(true)
  await expect.poll(async () => (await bounds()).w, { timeout: 5_000 }).toBe(160)
  expect((await bounds()).h).toBe(12)

  setTucked(false)
  await expect.poll(async () => (await bounds()).w, { timeout: 5_000 }).toBe(before.w)
  expect((await bounds()).x).toBe(before.x) // 位置不被胶囊 x 污染
  expect((await bounds()).y).toBe(before.y)
  await h.close()
})
