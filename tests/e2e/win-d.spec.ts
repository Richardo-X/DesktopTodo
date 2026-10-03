import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 批次 C-1：Win+D（显示桌面）不影响组件。
 * E2E 以 window.minimize() 为 Win+D 的等价物（Win+D 的系统效果=窗口被最小化）：
 * minimizable:false + minimize 事件 restore 兜底 → 组件保持可见、状态不变。 */
test('Win+D 等价：最小化路径组件保持可见（展开/缩进两态）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  const clusterVis = (): Promise<boolean[]> =>
    h.app.evaluate(({ BrowserWindow }) =>
      ['main', 'quick', 'done'].map((p) => {
        const w = BrowserWindow.getAllWindows().find(
          (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`)
        )
        return w ? w.isVisible() && !w.isMinimized() : false
      })
    )

  // 展开态：minimize 全部三窗 → 自动恢复可见
  await h.app.evaluate(({ BrowserWindow }) => {
    for (const p of ['main', 'quick', 'done']) {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`))
        ?.minimize()
    }
  })
  await expect.poll(clusterVis, { timeout: 5_000 }).toEqual([true, true, true])
  // 尺寸不变（最小化-恢复不污染几何）
  const bounds = await h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))!
    return main.getBounds()
  })
  expect(bounds.width).toBeGreaterThan(160)

  // 缩进态：主窗收胶囊后 minimize → 恢复胶囊可见
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(true)
  )
  await h.main.waitForTimeout(600)
  await h.app.evaluate(({ BrowserWindow }) => {
    for (const p of ['main', 'done']) {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`))
        ?.minimize()
    }
  })
  await h.main.waitForTimeout(800)
  const tucked = await h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))!
    return { vis: main.isVisible(), mini: main.isMinimized(), w: main.getBounds().width }
  })
  expect(tucked.vis).toBe(true)
  expect(tucked.mini).toBe(false)
  expect(Math.abs(tucked.w - 160)).toBeLessThanOrEqual(2) // 胶囊宽度保持
  await h.close()
})
