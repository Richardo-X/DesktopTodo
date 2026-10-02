import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/** 置顶语义（用户定稿 2026-10-02）：切非置顶时组件整体立即沉底（HWND_BOTTOM）——
 * 降回普通层的 OS 默认行为停在普通层顶端（需点击其他窗口才被覆盖），不满足"立即下降到桌面层"；
 * 实现走 koffi SetWindowPos(HWND_BOTTOM, NOACTIVATE)，三窗 bounds 不得漂移 */
test('关置顶：三窗立即沉底且 bounds 不漂移；开置顶恢复最上层', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  const allBounds = (): Promise<Record<string, { x: number; y: number; w: number; h: number }>> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
      for (const p of ['main', 'quick', 'done']) {
        const w = BrowserWindow.getAllWindows().find(
          (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`)
        )
        if (w) {
          const b = w.getBounds()
          out[p] = { x: b.x, y: b.y, w: b.width, h: b.height }
        }
      }
      return out
    })

  // 普通激活窗口盖在主窗中央（模拟浏览器等应用窗口重叠）
  await h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main'))!
    const mb = main.getBounds()
    const cover = new BrowserWindow({
      x: mb.x + 40,
      y: mb.y + 40,
      width: 320,
      height: 220,
      backgroundColor: '#dde5ee',
      title: 'e2e-cover-window'
    })
    void cover.loadURL('about:blank')
    cover.show()
  })
  await h.main.waitForTimeout(500)
  const before = await allBounds()

  // 关置顶（生产 IPC=tb-topmost 同路径）：三窗立即沉到 cover 窗之下
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setTopMost(v: boolean): Promise<void> } }).desktopTodo.setTopMost(false)
  )
  await h.main.waitForTimeout(600)

  // bounds 不漂移（koffi 调用只动 z 序，SWP_NOMOVE|NOSIZE）
  expect(await allBounds()).toEqual(before)
  // 三窗与 cover 窗均健在可见（沉底不隐藏不销毁）
  const states = await h.app.evaluate(({ BrowserWindow }) => ({
    cluster: ['main', 'quick', 'done'].map((p) =>
      BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`)
      )?.isVisible()
    ),
    cover: BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')?.isVisible()
  }))
  expect(states.cluster).toEqual([true, true, true])
  expect(states.cover).toBe(true)

  // 开置顶恢复最上层
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setTopMost(v: boolean): Promise<void> } }).desktopTodo.setTopMost(true)
  )
  await h.main.waitForTimeout(400)
  const flags = await h.app.evaluate(({ BrowserWindow }) =>
    ['main', 'quick', 'done'].map((p) =>
      BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`)
      )?.isAlwaysOnTop()
    )
  )
  expect(flags).toEqual([true, true, true])
  await h.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')?.close()
  )
  await h.close()
})
