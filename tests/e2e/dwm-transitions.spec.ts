import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/** C4.4：禁用 DWM 窗口过渡动画——系统"中心缩放+淡入淡出"出现动画是三窗显隐弹动的共同根源
 * （用户慢放实锤 2026-10-09：三窗出现后待办/快捷窗经历"中心缩小变透明→放大变清晰"的系统动画中间帧）
 * 三窗+气泡+二级窗创建时设置 DWMWA_TRANSITIONS_FORCEDISABLED，显隐为瞬间硬切 */

let h: AppHandle

test.beforeEach(async () => {
  h = await launchApp()
})

test.afterEach(async () => {
  await h.close()
})

test('三窗+气泡+二级窗均已禁用 DWM 过渡动画', async () => {
  await h.main.waitForSelector('[data-testid="home-panel"]')

  // 三窗
  const three = await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { dwmTransitions(): Promise<Record<string, { dis: boolean; handle: string } | null>> } })
      .desktopTodoTest!.dwmTransitions()
  )
  expect(three.quick?.dis).toBe(true)
  expect(three.main?.dis).toBe(true)
  expect(three.done?.dis).toBe(true)
  expect(three.bar?.dis).toBe(true) // 步1：白条独立窗同禁用系统过渡动画

  // 二级窗（气泡窗与三窗走同一 win32 设置函数，创建路径统一，不在此重复构造）
  await h.main.click('[data-testid="tb-settings"]')
  await expect
    .poll(async () => h.app.windows().filter((w) => w.url().includes('win=settings')).length, { timeout: 10_000 })
    .toBe(1)
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('win=settings'))
          return !!w && w.isVisible()
        }),
      { timeout: 10_000 }
    )
    .toBe(true)
})
