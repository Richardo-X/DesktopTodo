import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 关闭语义最终版（用户 2026-10-05 裁定）：
 * Alt+F4（WM_CLOSE）= 强制退出整个应用（无确认框，before-quit 数据落盘照走）；
 * 二级窗 ×/←（IPC closeSelf）= 仅关自己，应用不受影响。 */

test('Alt+F4 等价：WM_CLOSE 打主窗 → 强制退出整个应用', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(300)

  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { sysWmClose(panel: string): Promise<boolean> } }).desktopTodoTest!
      .sysWmClose('main')
  )

  // 应用退出：evaluate 连接断开（抛错=已退出）
  await expect
    .poll(
      async () => {
        try {
          await h.app.evaluate(() => true)
          return false
        } catch {
          return true
        }
      },
      { timeout: 10_000 }
    )
    .toBe(true)

  // 应用已退出，关闭句柄容错
  try {
    await h.close()
  } catch {
    /* 已退出 */
  }
})

test('二级窗 ×（closeSelf）仅关自己，应用与组件不受影响', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(300)

  // 打开设置二级窗
  await h.main.click('[data-testid="tb-settings"]')
  await expect
    .poll(
      async () =>
        h.app.windows().filter((w) => w.url().includes('win=settings')).length,
      { timeout: 10_000 }
    )
    .toBe(1)

  // 二级窗内点 ×（closeSelf）→ 仅二级窗关闭
  const child = h.app.windows().find((w) => w.url().includes('win=settings'))!
  await child.waitForSelector('body', { timeout: 5_000 })
  await child.evaluate(() =>
    (window as unknown as { desktopTodo: { closeSelf(): Promise<void> } }).desktopTodo.closeSelf()
  )
  await expect
    .poll(
      async () =>
        h.app.windows().filter((w) => w.url().includes('win=settings')).length,
      { timeout: 5_000 }
    )
    .toBe(0)

  // 应用健在 + 组件三窗完好
  const cluster = await h.app.evaluate(({ BrowserWindow }) => {
    const wins = ['main', 'quick', 'done'].map((p) =>
      BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`))
    )
    return { count: wins.filter(Boolean).length, vis: wins.map((w) => (w ? w.isVisible() : false)) }
  })
  expect(cluster).toEqual({ count: 3, vis: [true, true, true] })
  await h.close()
})
