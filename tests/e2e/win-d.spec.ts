import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** Win+M 语义（用户 2026-10-06 裁定）：
 * Win+M 对置顶/未置顶两态都生效——最小化整个应用（三窗+二级窗自然同时最小化）；
 * 恢复途径=托盘（三窗无任务栏按钮是既定设计；托盘恢复后置顶自动重申）。
 * 声明式前提：三窗 minimizable=true（否则系统"全部最小化"直接跳过组件）。 */

type MainState = { vis: boolean; mini: boolean; minimizable: boolean }

const mainState = async (h: Awaited<ReturnType<typeof launchApp>>): Promise<MainState> =>
  h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
    )
    return main
      ? { vis: main.isVisible(), mini: main.isMinimized(), minimizable: main.isMinimizable() }
      : { vis: false, mini: false, minimizable: false }
  })

const sysMinimizeMain = async (h: Awaited<ReturnType<typeof launchApp>>): Promise<void> => {
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { sysShowWindow(cmd: number): Promise<boolean> } }).desktopTodoTest!
      .sysShowWindow(6)
  )
}

test('三窗 minimizable=true（Win+M 可作用于组件的声明式前提）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  const mins = await h.app.evaluate(({ BrowserWindow }) =>
    ['main', 'quick', 'done'].map((p) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`)
      )
      return w ? w.isMinimizable() : false
    })
  )
  expect(mins).toEqual([true, true, true])
  await h.close()
})

test('未置顶：系统级最小化后保持最小化，托盘显示路径恢复', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  await sysMinimizeMain(h)
  await h.main.waitForTimeout(600)
  const after = await mainState(h)
  expect(after.mini).toBe(true)

  // 托盘显示路径恢复（showWindow→show 还原最小化）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(() => mainState(h), { timeout: 5_000 }).toEqual({ vis: true, mini: false, minimizable: true })
  await h.close()
})

test('置顶：系统级最小化后保持最小化（Win+M 两态生效），托盘恢复后置顶保持', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(300)

  await sysMinimizeMain(h)
  await h.main.waitForTimeout(600)
  // 语义变更本体：置顶态不再自动恢复，保持最小化
  const after = await mainState(h)
  expect(after.mini).toBe(true)

  // 托盘恢复 → 可见 + 置顶保持
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(() => mainState(h), { timeout: 5_000 }).toEqual({ vis: true, mini: false, minimizable: true })
  const atop = await h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main'))
    return main ? main.isAlwaysOnTop() : false
  })
  expect(atop).toBe(true)

  // 还原未置顶态，避免污染后续用例
  await h.main.click('[data-testid="tb-topmost"]')
  await h.close()
})
