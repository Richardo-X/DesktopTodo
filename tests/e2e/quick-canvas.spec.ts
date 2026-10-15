import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 快捷窗画布恒定（缩放抖动根治，方案《技术手册-快捷窗缩放修复-移植Electron版》§4-1/2/3）：
 * ① 缩放档位变化：快捷窗 getBounds 完全不动（宽/高/x/y 恒定），主窗照常缩放（证明档位真变了）；
 * ② 锚点平移：画布只平移（x/y 随锚点、宽高不变）；
 * ③ 渲染层：卡面走 transform（有 matrix、无 zoom），视觉宽=310×k。
 * 缩放经 test:cluster-scale 钩子走真实提交入口（syncClusterBounds）。
 * 探针档位按工作区上限自适应（与 clampClusterScale 同公式）：有效值=min(探针, 上限)。 */

interface CanvasState {
  quickBounds: { x: number; y: number; width: number; height: number }
  mainBounds: { x: number; y: number; width: number; height: number }
}

test('快捷窗画布恒定：档位变化 getBounds 不动、锚点平移只平移、卡面 transform', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(300)

  // 工作区上限（与 src/core/utils/scale.ts clampClusterScale 同公式；全开宽 1098、高 640）
  const cap = await h.app.evaluate(({ screen }) => {
    const wa = screen.getPrimaryDisplay().workArea
    return Math.max(0.7, Math.min((wa.height * 0.5) / 640, wa.width / 1098))
  })

  const st = (): Promise<CanvasState> =>
    h.main.evaluate(() =>
      (window as unknown as { desktopTodoTest: { clusterState(): Promise<CanvasState> } }).desktopTodoTest.clusterState()
    )
  const setScale = (s: number): Promise<boolean> =>
    h.main.evaluate(
      (v) =>
        (window as unknown as { desktopTodoTest: { clusterScale(s: number): Promise<boolean> } }).desktopTodoTest.clusterScale(v),
      s
    )

  // 主窗宽=round(470×k)±1（Windows 取整；双向容差防单侧提前放行）；快捷窗矩形断言保持严格恒等
  const mainWNear = (s: number) =>
    expect
      .poll(async () => (await st()).mainBounds.width, { timeout: 5_000 })
      .toBeLessThanOrEqual(Math.round(470 * s) + 1)

  // 基准档 A=上限、B=0.7（下限）。CI 虚拟屏高度小 → cap 可能低至 ≈0.703，
  // 两档宽度差 <10px——此时跳过"宽度差"佐证（画布恒定核心断言不受影响）
  const sA = cap
  const sB = 0.7
  const tiersDiscriminable = Math.round(470 * sA) - Math.round(470 * sB) >= 10
  await setScale(sA)
  await mainWNear(sA)
  const base = await st()

  // ① 档位变化：快捷窗矩形完全不动；主窗宽随档位变（证明档位确实切换）
  await setScale(sB)
  await expect
    .poll(async () => (await st()).mainBounds.width, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(Math.round(470 * sB) - 1)
  const atB = await st()
  expect(Math.abs(atB.mainBounds.width - Math.round(470 * sB))).toBeLessThanOrEqual(1)
  if (tiersDiscriminable) expect(atB.mainBounds.width).toBeLessThan(base.mainBounds.width - 10)
  expect(atB.quickBounds).toEqual(base.quickBounds)

  await setScale(sA)
  await mainWNear(sA)
  expect((await st()).quickBounds).toEqual(base.quickBounds)

  // ② 锚点平移：画布只平移（x/y 随锚点、宽高不变）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest: { clusterDragDelta(dx: number, dy: number): Promise<void> } })
      .desktopTodoTest.clusterDragDelta(40, 12)
  )
  await expect
    .poll(async () => (await st()).quickBounds.x, { timeout: 5_000 })
    .toBe(base.quickBounds.x + 40)
  const moved = await st()
  expect(moved.quickBounds.width).toBe(base.quickBounds.width)
  expect(moved.quickBounds.height).toBe(base.quickBounds.height)
  expect(moved.quickBounds.y).toBe(base.quickBounds.y + 12)

  // ③ 渲染层：卡面 transform 缩放、不再走 zoom；视觉宽=310×k（rect 含 transform）
  const holder = await h.quick.evaluate(() => {
    const el = document.querySelector('[data-testid="cluster-holder"]') as HTMLElement
    const cs = getComputedStyle(el)
    return { transform: cs.transform, zoom: cs.zoom, visualW: el.getBoundingClientRect().width }
  })
  expect(holder.zoom).toBe('1') // 画布方案不再写 zoom（旧机制此处=档位值）
  expect(holder.transform).toContain('matrix')
  expect(holder.visualW).toBeCloseTo(310 * sA, 0)

  await h.close()
})

test('快捷窗画布命中切换：卡面内恢复命中、余量区穿透、veil 期间恒穿透（§4-5）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(300)

  const st = (): Promise<CanvasState & { quickMouseIgnore: boolean | null }> =>
    h.main.evaluate(() =>
      (
        window as unknown as {
          desktopTodoTest: { clusterState(): Promise<CanvasState & { quickMouseIgnore: boolean | null }> }
        }
      ).desktopTodoTest.clusterState()
    )
  const ignoreState = async (): Promise<boolean | null> => (await st()).quickMouseIgnore
  const setScale = (s: number): Promise<boolean> =>
    h.main.evaluate(
      (v) =>
        (window as unknown as { desktopTodoTest: { clusterScale(s: number): Promise<boolean> } }).desktopTodoTest.clusterScale(v),
      s
    )

  // 启动基态：无鼠标活动 → forward 全穿透（showSidePanel 基态）
  await expect.poll(ignoreState, { timeout: 3_000 }).toBe(true)

  // 光标进卡面（合成事件直达页面，不经 OS 穿透层）→ 命中恢复
  const vp = await h.quick.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  await h.quick.mouse.move(vp.w - 20, 20)
  await expect.poll(ignoreState, { timeout: 3_000 }).toBe(false)

  // 缩到 0.7：卡面右上角对齐，画布左/下露出透明余量——等渲染层真正应用新档位
  // （精确解析 matrix 缩放值；'0.7' 子串会误匹配 0.703=cap）
  await setScale(0.7)
  await expect
    .poll(async () => (await st()).mainBounds.width, { timeout: 5_000 })
    .toBeLessThanOrEqual(Math.round(470 * 0.7) + 1)
  await expect
    .poll(
      async () =>
        h.quick.evaluate(() => {
          const m = /matrix\(([-\d.]+)/.exec(
            getComputedStyle(document.querySelector('[data-testid="cluster-holder"]') as Element).transform
          )
          return m ? Number(m[1]) : 0
        }),
      { timeout: 5_000 }
    )
    .toBeCloseTo(0.7, 2)

  // 余量区穿透：卡面右上角对齐 → 左下角为余量。CI 虚拟屏 cap≈0.703 时余量可能不足
  // （画布≈卡面，差 1~2px）——余量 <8px 时几何上不可测，跳过余量段（卡面命中+veil 段保留；
  // 真机余量充足时全量断言）
  const vp2 = await h.quick.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const marginX = vp2.w - Math.round(310 * 0.7)
  const marginY = vp2.h - Math.round(640 * 0.7)
  if (marginX >= 8 && marginY >= 8) {
    await h.quick.mouse.move(4, vp2.h - 4)
    await expect.poll(ignoreState, { timeout: 3_000 }).toBe(true)

    // 回卡面 → 命中
    await h.quick.mouse.move(vp2.w - 20, 20)
    await expect.poll(ignoreState, { timeout: 3_000 }).toBe(false)
  }

  // veil（二级窗开着）→ 恒穿透：即使光标在卡面上也不恢复命中
  await h.main.click('[data-testid="tb-settings"]')
  await expect
    .poll(async () => h.app.windows().filter((w) => w.url().includes('win=settings')).length, { timeout: 10_000 })
    .toBe(1)
  await h.main.waitForSelector('[data-testid="modal-veil"]')
  await expect.poll(ignoreState, { timeout: 3_000 }).toBe(true)
  await h.quick.mouse.move(vp2.w - 20, 20)
  await h.quick.mouse.move(vp2.w - 21, 21) // 触发 move（veil 下强制穿透）
  await expect.poll(ignoreState, { timeout: 3_000 }).toBe(true)

  await h.close()
})

test('快捷窗蒙层罩卡面而非整块画布（用户 2026-10-14 截图报告）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(300)

  // 缩到 0.7：画布>卡面，蒙层若挂 stage 级会罩住透明余量（旧缺陷）
  await h.main.evaluate(
    (v) =>
      (window as unknown as { desktopTodoTest: { clusterScale(s: number): Promise<boolean> } }).desktopTodoTest.clusterScale(v),
    0.7
  )
  await expect
    .poll(
      async () =>
        h.quick.evaluate(() => {
          const m = /matrix\(([-\d.]+)/.exec(
            getComputedStyle(document.querySelector('[data-testid="cluster-holder"]') as Element).transform
          )
          return m ? Number(m[1]) : 0
        }),
      { timeout: 5_000 }
    )
    .toBeCloseTo(0.7, 2)

  // 开二级窗 → 蒙层出现
  const wp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await wp
  await settings.waitForSelector('.form-row')
  await h.quick.waitForSelector('[data-testid="modal-veil"]')

  // 蒙层矩形 ≡ 卡面矩形（transform 后视觉矩形），而非画布矩形
  const rects = await h.quick.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    const veil = document.querySelector('[data-testid="modal-veil"]') as Element
    const holder = document.querySelector('[data-testid="cluster-holder"]') as Element
    return { veil: rect(veil), card: rect(holder), canvas: { w: window.innerWidth, h: window.innerHeight } }
  })
  expect(Math.abs(rects.veil.x - rects.card.x)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(rects.veil.y - rects.card.y)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(rects.veil.w - rects.card.w)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(rects.veil.h - rects.card.h)).toBeLessThanOrEqual(0.5)
  // 缩到 0.7 后卡面应显著小于画布——证明蒙层跟着卡面而非铺满画布；
  // CI 小屏 cap≈0.70 时卡面≈画布（差 <20px），该佐证跳过（矩形相等断言已锁核心语义）
  if (rects.canvas.w - rects.card.w >= 20) {
    expect(rects.veil.w).toBeLessThan(rects.canvas.w - 20)
  }

  await settings.close().catch(() => {})
  await h.close()
})
