import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { threeWindowBoundsForAnchor } from '../../src/core/utils/cluster-layout'

/**
 * 批次 A 技术验证 E2E（HANDOFF §9.5）：三窗 spike。
 * - 三窗存在且逐窗 bounds 符合 threeWindowBoundsForAnchor（锚点=待办左上角、缝隙 6px）
 * - 同帧位移不变量：test:spike-drag-delta 走与拖动 tick 相同的 applySpikeBounds 路径，
 *   任一侧窗 bounds 与主窗同步平移（真实光标拖动的手感需真机验证，CI 无法移动系统光标）
 * - z-order 绑定：focus 侧窗不抛错、三窗保持可见（真 z-order 顺序 Electron 无查询 API，真机验证）
 */

interface B {
  x: number
  y: number
  width: number
  height: number
}

let h: AppHandle

test.beforeEach(async () => {
  h = await launchApp({ spike: true })
})

test.afterEach(async () => {
  await h.close()
})

async function spikeWindowBounds(): Promise<{ quick: B | null; main: B | null; done: B | null }> {
  return h.app.evaluate(({ BrowserWindow }) => {
    const find = (panel: string) =>
      BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.webContents.getURL().includes(`panel=${panel}`)
      ) ?? null
    const read = (w: Electron.BrowserWindow | null) => (w ? w.getBounds() : null)
    return { quick: read(find('quick')), main: read(find('main')), done: read(find('done')) }
  })
}

test('spike：恰好三个窗口（无旧单窗），三窗页面均加载', async () => {
  const count = await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(count).toBe(3)
  for (const panel of ['quick', 'main', 'done'] as const) {
    const page = h.app.windows().find((w) => w.url().includes(`panel=${panel}`))
    expect(page, `panel=${panel}`).toBeTruthy()
    await page!.locator('[data-testid="spike-panel"]').waitFor({ state: 'visible' })
    await expect(page!.locator('[data-testid="spike-title"]')).toHaveText(
      { quick: '快捷添加', main: '桌面待办', done: '已完成' }[panel]
    )
  }
})

test('spike：逐窗 bounds 符合纯函数（锚点=待办左上角、缝隙恰好 6px）', async () => {
  const b = await spikeWindowBounds()
  expect(b.main).toBeTruthy()
  expect(b.quick).toBeTruthy()
  expect(b.done).toBeTruthy()
  // 以主窗实测 bounds 反推缩放，与纯函数输出对比。容差 3：OS 可能对初建窗口 bounds
  // 做 ±2 调整（CI 虚拟屏实测），绝对尺寸 1:1 校验属批次 B（与渲染层 zoom 联动断言）
  const scale = b.main!.width / 470
  const expected = threeWindowBoundsForAnchor({ x: b.main!.x, y: b.main!.y }, scale, true, true)
  const near = (actual: number, want: number, tol = 3): void =>
    expect(Math.abs(actual - want)).toBeLessThanOrEqual(tol)
  near(b.quick!.x, expected.quick!.x)
  near(b.quick!.width, expected.quick!.width)
  near(b.quick!.height, expected.quick!.height)
  near(b.done!.x, expected.done!.x)
  near(b.done!.width, expected.done!.width)
  expect(b.quick!.y).toBe(b.main!.y)
  expect(b.done!.y).toBe(b.main!.y)
  // 相对几何（spike 核心不变量）：缝隙恰好 6px（OS 调整容差 ±2）、三窗等高
  near(b.quick!.x + b.quick!.width + 6, b.main!.x, 2)
  near(b.main!.x + b.main!.width + 6, b.done!.x, 2)
  expect(b.quick!.height).toBe(b.main!.height)
  expect(b.done!.height).toBe(b.main!.height)
})

test('spike：拖动位移钩子 → 三窗同帧同步平移（同一 applySpikeBounds 路径）', async () => {
  const before = await spikeWindowBounds()
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { spikeDragDelta(dx: number, dy: number): Promise<void> } }).desktopTodoTest!.spikeDragDelta(
      120,
      60
    )
  )
  await expect
    .poll(async () => (await spikeWindowBounds()).main!.x - before.main!.x, { timeout: 5_000 })
    .toBe(120)
  const after = await spikeWindowBounds()
  expect(after.quick!.x - before.quick!.x).toBe(120)
  expect(after.done!.x - before.done!.x).toBe(120)
  expect(after.main!.y - before.main!.y).toBe(60)
  expect(after.quick!.y - before.quick!.y).toBe(60)
  expect(after.done!.y - before.done!.y).toBe(60)
})

test('spike：focus 侧窗（z-order 绑定触发点）不抛错且三窗保持可见', async () => {
  // z-order 绑定=每窗 focus 事件 → raiseSpikeAll（三窗 moveTop）；此处验证 focus 可达且三窗保持可见，
  // 真实层叠顺序 Electron 无查询 API，真机验证（§9.3）
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => !w.isDestroyed() && w.webContents.getURL().includes('panel=quick'))
      ?.focus()
  })
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) => {
          const quick = BrowserWindow.getAllWindows().find(
            (w) => !w.isDestroyed() && w.webContents.getURL().includes('panel=quick')
          )
          return quick ? quick.isFocused() : false
        }),
      { timeout: 5_000 }
    )
    .toBe(true)
  const allVisible = await h.app.evaluate(({ BrowserWindow }) =>
    ['quick', 'main', 'done'].every((panel) => {
      const w = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${panel}`)
      )
      return w ? w.isVisible() : false
    })
  )
  expect(allVisible).toBe(true)
})
