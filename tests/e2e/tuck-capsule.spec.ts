import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { TUCK_BAR_HEIGHT } from '../../src/core/constants'

/** 三轮8.2-1 + 三窗形态 B（批次 B-1）：缩进=侧窗整窗隐藏 + 待办窗收缩为胶囊
 * （宽 160、水平居中于原簇、贴顶）；弹出还原原位——缩进对 x 的改动不得污染位置记忆。
 * 2026-10-16（用户裁定）：热区减半（12→6）；系统最小窗高钳制（~37-40，随 DPI）与首摆
 * 展开多出的部分整体挂屏幕上方——屏内可见区=热区本身（白条以外的区域不吞鼠标、不弹） */
test('缩进时待办窗收为胶囊：屏内可见区=贴顶热区（余高挂屏外），侧窗隐藏、弹出还原不漂移', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const winByPanel = (panel: string) =>
    h.app.evaluate(({ BrowserWindow }, p) => {
      const w = BrowserWindow.getAllWindows().find(
        (win) => !win.isDestroyed() && win.webContents.getURL().includes(`panel=${p}`)
      )
      if (!w) return null
      const b = w.getBounds()
      // 视觉可见判据（透明常驻兼容）：物理可见 且 透明度>0——对真 hide 与透明待机两种实现语义一致
      return { x: b.x, y: b.y, w: b.width, h: b.height, vis: w.isVisible() && w.getOpacity() > 0 }
    }, panel)

  const mainBounds = async (): Promise<{ x: number; y: number; w: number; h: number; vis: boolean }> => {
    for (let i = 0; i < 50; i++) {
      const b = (await winByPanel('main')) as { x: number; y: number; w: number; h: number; vis: boolean } | null
      if (b) return b
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error('main window bounds unavailable')
  }

  /** 客户端区（渲染页）bounds——可见区判定的权威来源（窗口 rect 含不可见边框 ±1px） */
  const contentBounds = async (): Promise<{ x: number; y: number; w: number; h: number } | null> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
      )
      if (!w) return null
      const b = w.getContentBounds()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })

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
  // 屏内可见区=热区：客户端（渲染页）底边=锚点(主窗原左上角)+热区高；系统最小窗高撑出的余高在锚点上方
  const cb = await contentBounds()
  expect(cb).not.toBeNull()
  expect(Math.abs(cb!.y + cb!.h - (before.y + TUCK_BAR_HEIGHT))).toBeLessThanOrEqual(1)
  expect(cb!.y).toBeLessThanOrEqual(before.y) // 余高挂锚点上方：屏内可见区只剩热区（白条以外不吞鼠标）
  // 侧窗整窗隐藏（形态 B）
  const quickVis = (await winByPanel('quick'))?.vis
  const doneVis = (await winByPanel('done'))?.vis
  expect(quickVis).toBe(false)
  expect(doneVis).toBe(false)


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
 * ②文档流白条被常驻 640px zoom 容器挤出胶囊窗可视区）。
 * 2026-10-16 新几何：白条元素=屏内可见区（钉客户端底缘；系统最小窗高撑出的余高由主进程
 * 挂锚点上方）——本用例同时守住"元素在可视区内"与"屏幕坐标=锚点往下热区"两条 */
test('白条在胶囊态显示于窗口底部热区（渲染层状态机路径）', async () => {
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

  const beforeY = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main'))
    return w?.getBounds().y ?? 0
  })

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
    return {
      display: getComputedStyle(el).display,
      y: Math.round(r.y),
      h: Math.round(r.height),
      w: Math.round(r.width),
      screenY: window.screenY,
      innerH: window.innerHeight,
      // 可见条（::after）=热区一半：2026-10-16 用户裁定厚度减半（原 6px）
      pillH: getComputedStyle(el, '::after').height
    }
  })
  expect(bar?.display).toBe('block')
  expect(Math.abs(bar!.w - 160)).toBeLessThanOrEqual(2) // OS DPI 取整容差
  expect(bar!.pillH).toBe('3px') // 厚度减半定稿（热区 6px 的一半）
  expect(Math.abs(bar!.y + bar!.h - bar!.innerH)).toBeLessThanOrEqual(1) // 元素钉客户端底缘（在可视区内）
  expect(Math.abs(bar!.screenY + bar!.y - beforeY)).toBeLessThanOrEqual(2) // 屏幕坐标=锚点往下热区（贴顶语义）

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
