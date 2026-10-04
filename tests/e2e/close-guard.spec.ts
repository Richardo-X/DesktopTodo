import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 显隐途径收敛（用户定稿 2026-10-04）：Alt+F4（WM_CLOSE）对组件三窗无效——
 * 不关闭、不隐藏、应用不退出；退出仅经托盘菜单确认流程。
 * Win+M/系统最小化路径由 win-d.spec（minimize 兜底）覆盖。 */
test('Alt+F4 等价：WM_CLOSE 打组件窗无效（不关不隐不退出）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  const clusterState = (): Promise<{ count: number; vis: boolean[] }> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const wins = ['main', 'quick', 'done'].map((p) =>
        BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`))
      )
      return { count: wins.filter(Boolean).length, vis: wins.map((w) => (w ? w.isVisible() : false)) }
    })

  // 三窗就位
  await expect.poll(clusterState, { timeout: 5_000 }).toEqual({ count: 3, vis: [true, true, true] })

  // WM_CLOSE（0x0010，Alt+F4 的系统等价物）经主进程测试钩子逐窗发送
  for (const p of ['main', 'quick', 'done']) {
    await h.main.evaluate((panel) => {
      const bridge = (window as unknown as {
        desktopTodoTest?: { sysWmClose(panel: string): Promise<boolean> }
      }).desktopTodoTest
      if (!bridge) throw new Error('desktopTodoTest bridge missing')
      return bridge.sysWmClose(panel)
    }, p)
  }
  await h.main.waitForTimeout(800)

  // 应用健在（evaluate 仍响应）+ 三窗数量不变 + 全部可见（不关不隐）
  await expect.poll(clusterState, { timeout: 5_000 }).toEqual({ count: 3, vis: [true, true, true] })

  // 应用未退出：再等 1 秒后仍可取到窗口（quit 会断开连接抛错）
  await h.main.waitForTimeout(1000)
  const still = await clusterState()
  expect(still.count).toBe(3)
  await h.close()
})
