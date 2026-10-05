import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 显隐语义最终版（用户 2026-10-05 裁定）：
 * 未置顶 = 普通窗口行为：系统级最小化（Win+M 等价物）后保持最小化，
 *          经托盘显示路径（setVisibility→showWindow）恢复；
 * 置顶   = Win+D/Win+M 免疫：系统级最小化后立即自动恢复（最小化即恢复兜底）。 */

type MainState = { vis: boolean; mini: boolean }

const mainState = async (h: Awaited<ReturnType<typeof launchApp>>): Promise<MainState> =>
  h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
    )
    return main ? { vis: main.isVisible(), mini: main.isMinimized() } : { vis: false, mini: false }
  })

const sysMinimizeMain = async (h: Awaited<ReturnType<typeof launchApp>>): Promise<void> => {
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { sysShowWindow(cmd: number): Promise<boolean> } }).desktopTodoTest!
      .sysShowWindow(6)
  )
}

test('未置顶：系统级最小化后保持最小化（普通窗口行为），托盘显示路径恢复', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  await sysMinimizeMain(h)
  await h.main.waitForTimeout(600)
  // 普通窗口行为：保持最小化（不自动恢复）
  const after = await mainState(h)
  expect(after.mini).toBe(true)

  // 托盘显示路径恢复整个组件
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(() => mainState(h), { timeout: 5_000 }).toEqual({ vis: true, mini: false })
  await h.close()
})

test('置顶：系统级最小化后立即自动恢复（Win+M 免疫兜底）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(300)

  await sysMinimizeMain(h)
  await expect.poll(() => mainState(h), { timeout: 5_000 }).toEqual({ vis: true, mini: false })

  // 还原未置顶态，避免污染后续用例
  await h.main.click('[data-testid="tb-topmost"]')
  await h.close()
})
