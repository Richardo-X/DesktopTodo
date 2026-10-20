import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { TUCK_BAR_HEIGHT, TUCK_BAR_WIDTH } from '../../src/core/constants'

/** 缩进（2026-10-17 §11.K 步2：整组三窗瞬间移出屏幕顶边之外，WPF R1 语义）：
 * 缩进=三窗几何不变、整体移到全显示器顶边之上（不 Hide、不改透明度=集合不变）+ 白条独立窗亮起；
 * 白条水平=主窗上缘中心（现状口径）、热区贴锚点（系统最小窗高余高挂锚点上方=屏外不可命中）；
 * 弹出=白条收+整组同一次落位回位；缩进不污染位置记忆（锚点）。 */
test('缩进=整组三窗移出屏幕顶边外（集合不变/几何不变）+白条亮起、弹出还原、位置不漂移', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)

  interface S {
    tucked: boolean
    barVis: boolean
    barBounds: { x: number; y: number; width: number; height: number } | null
  }
  const state = (): Promise<S> =>
    h.main.evaluate(() =>
      (window as unknown as { desktopTodoTest: { clusterState(): Promise<S> } }).desktopTodoTest.clusterState()
    )

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

  /** 白条窗客户端区（渲染页）bounds——可见区与热区几何的权威来源（窗口 rect 含不可见边框 ±1px） */
  const barContent = async (): Promise<{ x: number; y: number; w: number; h: number } | null> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes('win=bar')
      )
      if (!w) return null
      const b = w.getContentBounds()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })

  const before = await mainBounds()
  const quickBefore = await winByPanel('quick')
  const doneBefore = await winByPanel('done')
  expect(before.w).toBeGreaterThan(160)

  const setTucked = (v: boolean): void => {
    void h.main.evaluate(
      (val) =>
        (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(val),
      v
    )
  }

  setTucked(true)
  // 缩进信号：集群 tucked + 白条窗亮起
  await expect.poll(async () => (await state()).tucked, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await state()).barVis, { timeout: 5_000 }).toBe(true)
  // ① 整组离屏：三窗几何（宽/高/x）不变、整体移到工作区顶之上（底边 ≤ 顶-8 + 容差）
  const after = await mainBounds()
  expect(after.w).toBe(before.w)
  expect(after.h).toBe(before.h)
  expect(after.x).toBe(before.x)
  expect(after.y + after.h).toBeLessThanOrEqual(wa.y - 4)
  // 白条窗：客户端底边=锚点+热区高（可见区=贴顶热区）；系统最小窗高余高挂锚点上方（屏外不可命中）
  const cb = await barContent()
  expect(cb).not.toBeNull()
  expect(Math.abs(cb!.y + cb!.h - (before.y + TUCK_BAR_HEIGHT))).toBeLessThanOrEqual(1)
  expect(cb!.y).toBeLessThanOrEqual(before.y)
  // 水平=主窗上缘中心（现状口径，不算侧窗）
  const expX = before.x + Math.round((before.w - TUCK_BAR_WIDTH) / 2)
  expect(Math.abs(cb!.x - expX)).toBeLessThanOrEqual(3) // OS 边框/取整容差
  // ② 集合不变：侧窗不隐藏/不透明化，跟着整组离屏待机（几何亦不变）
  const quickAtTuck = await winByPanel('quick')
  const doneAtTuck = await winByPanel('done')
  expect(quickAtTuck?.vis).toBe(true)
  expect(doneAtTuck?.vis).toBe(true)
  expect(quickAtTuck!.y + quickAtTuck!.h).toBeLessThanOrEqual(wa.y - 4)
  expect(doneAtTuck!.y + doneAtTuck!.h).toBeLessThanOrEqual(wa.y - 4)

  setTucked(false)
  await expect.poll(async () => (await state()).tucked, { timeout: 5_000 }).toBe(false)
  await expect.poll(async () => (await state()).barVis, { timeout: 5_000 }).toBe(false)
  const restored = await mainBounds()
  expect(restored.x).toBe(before.x) // 位置不被缩进污染
  expect(restored.y).toBe(before.y)
  expect(restored.w).toBe(before.w)
  expect(restored.h).toBe(before.h)
  const quickBack = await winByPanel('quick')
  const doneBack = await winByPanel('done')
  expect(quickBack!.y).toBe(quickBefore!.y) // 弹出=同一次落位回到缩进前位置
  expect(doneBack!.y).toBe(doneBefore!.y)
  expect(quickBack!.vis).toBe(true)
  expect(doneBack!.vis).toBe(true)
  await h.close()
})

/** 真机"白条消失"回归（步1 形态）+ 贴顶几何 + 命中链：白条=独立窗，元素钉客户端底缘（页底），
 * 屏幕坐标=锚点（吸附后=工作区顶）；hover 白条元素 → 主进程中继 → 主窗状态机 mouse-enter → 弹出 */
test('白条独立窗：贴顶热区、元素钉页底、hover 弹出（渲染层状态机路径）', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  interface S {
    tucked: boolean
    barVis: boolean
  }
  const state = (): Promise<S> =>
    h.main.evaluate(() =>
      (window as unknown as { desktopTodoTest: { clusterState(): Promise<S> } }).desktopTodoTest.clusterState()
    )

  const setFake = (pt: { x: number; y: number } | null): Promise<void> =>
    h.main.evaluate(
      (p) =>
        (
          window as unknown as { desktopTodoTest: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } }
        ).desktopTodoTest.setFakeCursor(p),
      pt
    )

  const mainContent = (): Promise<{ x: number; y: number; w: number; h: number } | null> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
      )
      if (!w) return null
      const b = w.getContentBounds()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })

  // 真实吸附：拖到工作区顶（applyAnchor + detectSnap；CI 无法移动系统光标 → 位移钩子）
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const before = await mainContent()
  await setFake({ x: (before?.x ?? 0) + 100, y: (before?.y ?? 0) + 200 }) // 光标在组件内，稳定后续离链
  await h.main.evaluate(
    (dy) =>
      (
        window as unknown as { desktopTodoTest: { clusterDragDelta(dx: number, dy: number): Promise<void> } }
      ).desktopTodoTest.clusterDragDelta(0, dy),
    wa.y - (before?.y ?? 0)
  )
  await expect
    .poll(async () => (await mainContent())?.y, { timeout: 5_000 })
    .toBeLessThanOrEqual(wa.y + 1)
  await h.main.waitForTimeout(400) // 轮询 inside=true 稳定
  await setFake({ x: 60, y: 1400 }) // 移出组件 → inside=false → 400ms 缩进

  await expect.poll(async () => (await state()).tucked, { timeout: 8_000 }).toBe(true)
  await expect.poll(async () => (await state()).barVis, { timeout: 8_000 }).toBe(true)

  const bar = await h.bar.evaluate(() => {
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
      // 可见条（::after）=热区一半：厚度减半定稿（2026-10-16）
      pillH: getComputedStyle(el, '::after').height
    }
  })
  expect(bar?.display).toBe('block')
  expect(bar!.pillH).toBe('3px')
  expect(Math.abs(bar!.w - TUCK_BAR_WIDTH)).toBeLessThanOrEqual(2) // OS DPI 取整容差
  expect(Math.abs(bar!.y + bar!.h - bar!.innerH)).toBeLessThanOrEqual(1) // 元素钉客户端底缘
  expect(Math.abs(bar!.screenY + bar!.y - wa.y)).toBeLessThanOrEqual(2) // 屏幕坐标=工作区顶（贴顶）

  // hover 白条元素 → mouseenter → 主进程中继 → 状态机弹出（整组同一次落位回位）
  await h.bar.locator('.tuck-bar').hover()
  await expect.poll(async () => (await state()).tucked, { timeout: 5_000 }).toBe(false)
  await expect.poll(async () => (await state()).barVis, { timeout: 5_000 }).toBe(false)

  await setFake(null)
  await h.close()
})

/** 快捷窗非最大档（用户 2026-10-20 报告）：缩进光标判定必须跟随可见卡面，
 * 不能继续用最大档画布窗口 bounds（画布透明余量不算在组件内）。 */
test('快捷窗非最大档：缩进光标判定=可见卡面（画布余量不算组件内）', async () => {
  const h: AppHandle = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')

  interface S {
    tucked: boolean
    barVis: boolean
  }
  const state = (): Promise<S> =>
    h.main.evaluate(() =>
      (window as unknown as { desktopTodoTest: { clusterState(): Promise<S> } }).desktopTodoTest.clusterState()
    )
  const setFake = (pt: { x: number; y: number } | null): Promise<void> =>
    h.main.evaluate(
      (p) =>
        (
          window as unknown as { desktopTodoTest: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } }
        ).desktopTodoTest.setFakeCursor(p),
      pt
    )
  const mainContent = (): Promise<{ x: number; y: number; w: number; h: number } | null> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
      )
      if (!w) return null
      const b = w.getContentBounds()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })

  // 真实吸附到工作区顶（同既有缩进用例；先在默认档吸附，再缩到 0.7 制造画布余量）
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const before = await mainContent()
  await setFake({ x: (before?.x ?? 0) + 100, y: (before?.y ?? 0) + 200 })
  await h.main.evaluate(
    (dy) =>
      (
        window as unknown as { desktopTodoTest: { clusterDragDelta(dx: number, dy: number): Promise<void> } }
      ).desktopTodoTest.clusterDragDelta(0, dy),
    wa.y - (before?.y ?? 0)
  )
  await expect
    .poll(async () => (await mainContent())?.y, { timeout: 5_000 })
    .toBeLessThanOrEqual(wa.y + 1)
  await h.main.waitForTimeout(500)

  // 0.7 档：画布按工作区上限（测试环境约 0.84），卡面明显小于画布
  const scaled = await h.main.evaluate(
    (v) =>
      (
        window as unknown as { desktopTodoTest: { clusterScale(v: number): Promise<boolean> } }
      ).desktopTodoTest.clusterScale(v),
    0.7
  )
  expect(scaled).toBe(true)
  await h.main.waitForTimeout(700)

  const qb = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=quick'))
    if (!w) return null
    const b = w.getContentBounds()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  })
  const card = await h.quick.evaluate(() => {
    const el = document.querySelector('[data-testid="cluster-holder"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  expect(qb).not.toBeNull()
  expect(card.x).toBeGreaterThan(20) // 画布左侧确有透明余量

  // 光标先放在可见卡面内，稳定 inside=true
  await setFake({ x: qb!.x + card.x + card.w / 2, y: qb!.y + card.y + 60 })
  await h.main.waitForTimeout(600)

  // 移到画布内、但卡面左侧的透明余量：应视为离开组件 → 400ms 后缩进
  const onlyCanvas = { x: qb!.x + 10, y: qb!.y + card.y + 60 }
  expect(onlyCanvas.x).toBeLessThan(qb!.x + card.x)
  await setFake(onlyCanvas)
  await expect.poll(async () => (await state()).tucked, { timeout: 6_000 }).toBe(true)
  await expect.poll(async () => (await state()).barVis, { timeout: 6_000 }).toBe(true)

  await setFake(null)
  await h.close()
})
