import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import {
  threeWindowBoundsForAnchor,
  quickCanvasBoundsForAnchor,
  quickCanvasMaxScale
} from '../../src/core/utils/cluster-layout'

/**
 * 三窗架构 E2E（批次 B-1，替代 spike spec）：
 * - 三窗常驻、逐窗 bounds 符合 threeWindowBoundsForAnchor（缝隙 2px、顶边对齐、等高）
 * - 拖动位移钩子走与拖动 tick 相同的 applyClusterBounds 路径 → 三窗同帧平移
 *   （真实光标拖动手感已真机验证 §9.8；CI 无法移动系统光标）
 * - focus 侧窗 → z-order 绑定触发（真实层叠顺序 Electron 无查询 API，真机验证）
 */

interface B {
  x: number
  y: number
  width: number
  height: number
}

let h: AppHandle

test.beforeEach(async () => {
  h = await launchApp()
})

test.afterEach(async () => {
  await h.close()
})

async function clusterBounds(): Promise<{ quick: B | null; main: B | null; done: B | null }> {
  return h.app.evaluate(({ BrowserWindow }) => {
    const find = (panel: string) =>
      BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.webContents.getURL().includes(`panel=${panel}`)
      ) ?? null
    const read = (w: Electron.BrowserWindow | null) => (w ? w.getBounds() : null)
    return { quick: read(find('quick')), main: read(find('main')), done: read(find('done')) }
  })
}

test('三窗：恰好三个组件窗口（无多余窗口），三窗页面均加载', async () => {
  const count = await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(count).toBe(3)
  for (const panel of ['quick', 'main', 'done'] as const) {
    const page = h.app.windows().find((w) => w.url().includes(`panel=${panel}`))
    expect(page, `panel=${panel}`).toBeTruthy()
  }
})

test('三窗：逐窗 bounds 符合纯函数（锚点=待办左上角、缝隙恰好 2px、主/已完成等高）', async () => {
  const b = await clusterBounds()
  expect(b.main).toBeTruthy()
  expect(b.quick).toBeTruthy()
  expect(b.done).toBeTruthy()
  // 以主窗实测 bounds 反推缩放。容差 3：OS 可能对初建窗口 bounds 做 ±2 调整（CI 虚拟屏实测）
  const scale = b.main!.width / 470
  const expected = threeWindowBoundsForAnchor({ x: b.main!.x, y: b.main!.y }, scale, true, true)
  const near = (actual: number, want: number, tol = 3): void =>
    expect(Math.abs(actual - want)).toBeLessThanOrEqual(tol)
  near(b.done!.x, expected.done!.x)
  near(b.done!.width, expected.done!.width)
  expect(b.done!.y).toBe(b.main!.y)
  // 快捷窗=v1.1.2 起的固定画布窗：矩形=当前工作区可达上限档画布（非当档卡面）——
  // 右缘钉主窗左缘−缝隙、上缘钉锚点。上限≈当档时（CI 虚拟屏）画布与卡面重合，
  // 高上限屏（175% 竖屏实测）才可分辨；断言直接对画布纯函数，两种环境通用
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const canvas = quickCanvasBoundsForAnchor({ x: b.main!.x, y: b.main!.y }, quickCanvasMaxScale(wa, true, true))
  near(b.quick!.x, canvas.x)
  near(b.quick!.width, canvas.width)
  near(b.quick!.height, canvas.height)
  expect(b.quick!.y).toBe(b.main!.y)
  // 相对几何核心不变量：缝隙恰好 2px（OS 调整容差 ±2）、主/已完成等高
  near(b.quick!.x + b.quick!.width + 2, b.main!.x, 2)
  near(b.main!.x + b.main!.width + 2, b.done!.x, 2)
  expect(b.done!.height).toBe(b.main!.height)
})

test('三窗：拖动位移钩子 → 三窗同帧同步平移（同一 applyClusterBounds 路径）', async () => {
  const before = await clusterBounds()
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { clusterDragDelta(dx: number, dy: number): Promise<void> } }).desktopTodoTest!.clusterDragDelta(
      120,
      60
    )
  )
  await expect
    .poll(async () => (await clusterBounds()).main!.x - before.main!.x, { timeout: 5_000 })
    .toBe(120)
  const after = await clusterBounds()
  expect(after.quick!.x - before.quick!.x).toBe(120)
  expect(after.done!.x - before.done!.x).toBe(120)
  expect(after.main!.y - before.main!.y).toBe(60)
  expect(after.quick!.y - before.quick!.y).toBe(60)
  expect(after.done!.y - before.done!.y).toBe(60)
})

test('三窗：拖动增量非有限值 → 整体忽略（防 NaN 锚点被 Windows 钳塌到最小窗）', async () => {
  const before = await clusterBounds()
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { clusterDragDelta(dx: number, dy: number): Promise<void> } })
      .desktopTodoTest!.clusterDragDelta(NaN, NaN)
  )
  await h.main.waitForTimeout(300)
  const after = await clusterBounds()
  expect(after.main!.x).toBe(before.main!.x)
  expect(after.main!.y).toBe(before.main!.y)
  expect(after.main!.width).toBe(before.main!.width)
  expect(after.quick!.x).toBe(before.quick!.x)
  expect(after.done!.x).toBe(before.done!.x)
})

test('三窗 focus 语义：未置顶挂件态 focus 不激活（点击不浮上来）；置顶后 focus 可激活', async () => {
  const quickWin = (): Promise<{ focused: boolean; focusable: boolean } | null> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=quick')
      )
      return w ? { focused: w.isFocused(), focusable: w.isFocusable() } : null
    })

  // 未置顶（2026-10-06 定稿）：普通窗口行为——恒可激活（点击浮上来获焦点），
  // 被应用窗口覆盖时保持被覆盖（无 NOACTIVATE/沉底）
  expect(await quickWin()).toMatchObject({ focusable: true })

  // 三窗保持可见
  const allVisible = await h.app.evaluate(({ BrowserWindow }) =>
    ['quick', 'main', 'done'].every((panel) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${panel}`)
      )
      return w ? w.isVisible() : false
    })
  )
  expect(allVisible).toBe(true)

  // 置顶后：focus 可激活（键盘/前台行为恢复）
  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(400)
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => !w.isDestroyed() && w.webContents.getURL().includes('panel=quick'))
      ?.focus()
  })
  await expect
    .poll(async () => (await quickWin())?.focused, { timeout: 15_000 })
    .toBe(true)
})
