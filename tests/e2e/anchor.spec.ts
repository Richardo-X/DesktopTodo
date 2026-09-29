import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { defaultAppData } from '../../src/core/models'

/** 批次 B-1 三窗口径：锚点=待办窗左上角；开关面板=侧窗显隐，待办窗自身纹丝不动（#31 隐藏不占位） */

async function waitMainVisible(h: { app: import('@playwright/test').ElectronApplication }): Promise<void> {
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible() && w.webContents.getURL().includes('panel=main'))
        ),
      { timeout: 10_000 }
    )
    .toBe(true)
}

async function mainBounds(h: AppHandle): Promise<{ x: number; y: number; width: number; height: number }> {
  return h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (win) => !win.isDestroyed() && win.webContents.getURL().includes('panel=main')
    )!
    return w.getBounds()
  })
}

test('开关面板：待办窗自身纹丝不动，侧窗整窗显隐', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await waitMainVisible(h)

  const before = await mainBounds(h)

  // 关闭已完成面板（主窗操作区按钮）→ 已完成窗口整窗隐藏，待办窗 bounds 不变
  await h.main.click('[data-testid="op-done-toggle"]')
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find(
            (win) => !win.isDestroyed() && win.webContents.getURL().includes('panel=done')
          )
          return w ? w.isVisible() : false
        }),
      { timeout: 5_000 }
    )
    .toBe(false)

  const afterHide = await mainBounds(h)
  expect(afterHide.x).toBe(before.x)
  expect(afterHide.y).toBe(before.y)
  expect(afterHide.width).toBe(before.width)
  expect(afterHide.height).toBe(before.height)

  // 重新打开 → 已完成窗口在原位恢复
  await h.main.click('[data-testid="op-done-toggle"]')
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find(
            (win) => !win.isDestroyed() && win.webContents.getURL().includes('panel=done')
          )
          return w ? w.isVisible() : false
        }),
      { timeout: 5_000 }
    )
    .toBe(true)
  const afterShow = await mainBounds(h)
  expect(afterShow.x).toBe(before.x)
  expect(afterShow.y).toBe(before.y)
  await h.close()
})

test('重启恢复：pos 语义=待办左上角锚点（待办窗口屏幕位置=存档值）', async () => {
  // 两阶段、屏幕无关：先启动读取实际锚点（屏幕坐标），关闭后把它作为存档值写回 data.json，
  // 重启断言待办窗口原位恢复——硬编码种子锚点在窄屏上会越界被正确的钳制改写，不可用作存档
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await waitMainVisible(h)
  await h.main.waitForTimeout(300)

  const b1 = await mainBounds(h)
  await h.close()

  const seed = defaultAppData()
  seed.uiState.pos = { x: b1.x, y: b1.y }
  const h2 = await launchApp({ seed })
  await h2.main.waitForSelector('[data-testid="home-panel"]')
  await waitMainVisible(h2)
  await h2.main.waitForTimeout(300)

  const b2 = await mainBounds(h2)
  expect(Math.abs(b2.x - b1.x), `b1=${JSON.stringify(b1)} b2=${JSON.stringify(b2)}`).toBeLessThanOrEqual(2)
  expect(Math.abs(b2.y - b1.y)).toBeLessThanOrEqual(2)
  await h2.close()
})
