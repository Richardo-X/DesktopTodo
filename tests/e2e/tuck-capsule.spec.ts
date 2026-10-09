import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/** 三轮8.2-1 + 三窗形态 B（批次 B-1）：缩进=侧窗整窗隐藏 + 待办窗收缩为胶囊
 * （宽 160、水平居中于原簇、贴顶；高度受系统最小值钳制 ≤60）；弹出还原原位——
 * 缩进对 x 的改动不得污染位置记忆 */
test('缩进时待办窗收窄为胶囊、侧窗隐藏，弹出还原且位置不漂移', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const winByPanel = (panel: string) =>
    h.app.evaluate(({ BrowserWindow, screen }, p) => {
      const w = BrowserWindow.getAllWindows().find(
        (win) => !win.isDestroyed() && win.webContents.getURL().includes(`panel=${p}`)
      )
      if (!w) return null
      const b = w.getBounds()
      // 视觉可见判据：物理可见 且 透明度>0 且 与任一显示器工作区相交（缩进=滑出屏外悬挂，物理仍在）
      const offscreen = screen
        .getAllDisplays()
        .every((d) => b.x + b.width <= d.workArea.x || b.x >= d.workArea.x + d.workArea.width)
      return {
        x: b.x,
        y: b.y,
        w: b.width,
        h: b.height,
        vis: w.isVisible() && w.getOpacity() > 0 && !offscreen
      }
    }, panel)

  const mainBounds = async (): Promise<{ x: number; y: number; w: number; h: number; vis: boolean }> => {
    for (let i = 0; i < 50; i++) {
      const b = (await winByPanel('main')) as { x: number; y: number; w: number; h: number; vis: boolean } | null
      if (b) return b
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error('main window bounds unavailable')
  }

  const before = await mainBounds()
  expect(before.w).toBeGreaterThan(160)

  const setTucked = (v: boolean): void => {
    void h.main.evaluate(
      (val) =>
        (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(val),
      v
    )
  }

  setTucked(true)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 5_000 })
    .toBeLessThanOrEqual(1) // OS DPI 取整容差
  // Windows 系统最小高度约 39px 钳制（setMinimumSize 不豁免）；可见胶囊仍为热区顶部 6px
  const tucked = await mainBounds()
  expect(tucked.h).toBeGreaterThanOrEqual(12)
  expect(tucked.h).toBeLessThanOrEqual(60)
  // 侧窗收纳（C5 新形态）：滑出屏幕边缘=屏外悬挂——物理常驻（表面不销毁防弹动）、完全在工作区并集外
  const sideState = (panel: string): Promise<{ vis: boolean; offscreen: boolean } | null> =>
    h.app.evaluate(
      ({ BrowserWindow, screen }, p) => {
        const w = BrowserWindow.getAllWindows().find(
          (win) => !win.isDestroyed() && win.webContents.getURL().includes(`panel=${p}`)
        )
        if (!w) return null
        const b = w.getBounds()
        const offscreen = screen
          .getAllDisplays()
          .every((d) => b.x + b.width <= d.workArea.x || b.x >= d.workArea.x + d.workArea.width)
        return { vis: w.isVisible(), offscreen }
      },
      panel
    )
  // 滑出动画 250ms——poll 等待滑动完成
  await expect
    .poll(async () => (await sideState('quick'))?.offscreen, { timeout: 3_000 })
    .toBe(true)
  await expect
    .poll(async () => (await sideState('done'))?.offscreen, { timeout: 3_000 })
    .toBe(true)
  expect((await sideState('quick'))?.vis).toBe(true)
  expect((await sideState('done'))?.vis).toBe(true)


  setTucked(false)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - before.w), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)
  const restored = await mainBounds()
  expect(restored.x).toBe(before.x) // 位置不被胶囊 x 污染
  expect(restored.y).toBe(before.y)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(true)
  await h.close()
})

/** 真机"白条消失"回归（两段缺陷：①domTucked 间接层直接 IPC 不翻转→走渲染层状态机路径
 * ②文档流白条被常驻 640px zoom 容器挤出 38px 胶囊窗→rect.y 必须≈0） */
test('白条在胶囊态显示于窗口顶部可视区内（渲染层状态机路径）', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const sendMain = (channel: string, val: unknown): Promise<void> =>
    h.app.evaluate(
      ({ BrowserWindow }, [ch, v]) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
        w?.webContents.send(ch as string, v)
      },
      [channel, val] as [string, unknown]
    )

  // 吸附（snap-state=true=主进程 detectSnap 翻转时发的同一信号）→ 光标离开（轮询同通道）
  await sendMain('app:snap-state', true)
  await h.main.waitForTimeout(200)
  await sendMain('app:cursor-inside', false)
  // 30ms tick 宿主 ×400ms 缩进延时 → tucked → setTucked IPC → 胶囊 + domTucked
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
          return w?.getBounds().width ?? 0
        }),
      { timeout: 5_000 }
    )
    .toBeLessThanOrEqual(162) // 160 + OS DPI 取整容差

  const bar = await h.main.evaluate(() => {
    const el = document.querySelector('.tuck-bar') as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { display: getComputedStyle(el).display, y: Math.round(r.y), w: Math.round(r.width) }
  })
  expect(bar?.display).toBe('block')
  expect(bar!.y).toBeLessThanOrEqual(2) // 窗口顶部可视区内（挤出窗外的缺陷抓不住=白条消失）
  expect(Math.abs(bar!.w - 160)).toBeLessThanOrEqual(2) // OS DPI 取整容差

  // 弹出（光标回到胶囊内=轮询 enter 同通道）
  await sendMain('app:cursor-inside', true)
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
          return w?.getBounds().width ?? 0
        }),
      { timeout: 5_000 }
    )
    .toBeGreaterThan(160)
  await h.close()
})
