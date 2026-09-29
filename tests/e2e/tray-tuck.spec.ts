import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/**
 * 用户真机反馈修复验证（批次 B 验收轮）：
 * 序列=组件缩进（胶囊）→ 托盘最小化 → 托盘显示 → 触碰弹出。
 * 定稿行为：胶囊态托盘显示后只显主窗短条（侧窗不复活）；弹出后侧窗按面板开关恢复。
 */

let h: AppHandle

test.beforeEach(async () => {
  h = await launchApp()
})

test.afterEach(async () => {
  await h.close()
})

interface W {
  x: number
  y: number
  w: number
  h: number
  vis: boolean
}

const winByPanel = (panel: string): Promise<W | null> =>
  h.app.evaluate(({ BrowserWindow }, p) => {
    const w = BrowserWindow.getAllWindows().find(
      (win) => !win.isDestroyed() && win.webContents.getURL().includes(`panel=${p}`)
    )
    if (!w) return null
    const b = w.getBounds()
    return { x: b.x, y: b.y, w: b.width, h: b.height, vis: w.isVisible() }
  }, panel)

const setTucked = (v: boolean): Promise<void> =>
  h.main.evaluate(
    (val) =>
      (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(val),
    v
  )

test('缩进态托盘最小化→显示：只显胶囊短条，侧窗不复活；弹出后侧窗按开关恢复', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }

  const before = await mainBounds()
  expect(before.w).toBeGreaterThan(160)

  // ① 缩进：待办窗收胶囊、侧窗隐藏
  await setTucked(true)
  await expect.poll(async () => (await mainBounds()).w, { timeout: 5_000 }).toBe(160)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(false)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(false)

  // 采样实验：锁定 quick 可见性翻转的确切时刻
  const sample = (label: string): Promise<void> =>
    h.main
      .evaluate(() =>
        (window as unknown as { desktopTodoTest?: { clusterState(): Promise<Record<string, unknown>> } }).desktopTodoTest!.clusterState()
      )
      .then((st) => console.log(`SAMPLE ${label}:`, JSON.stringify(st)))
      .catch(() => console.log(`SAMPLE ${label}: failed`))

  await sample('after-tuck')
  // ② 托盘最小化（×按钮同路径）：全部隐藏
  await h.main.click('[data-testid="tb-minimize"]')
  await sample('after-minimize')
  await new Promise((r) => setTimeout(r, 1500))
  await sample('minimize+1500ms')
  await expect.poll(async () => (await winByPanel('main'))?.vis, { timeout: 5_000 }).toBe(false)

  // ③ 托盘显示：只显胶囊短条——侧窗不得复活（用户实测混乱点）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(async () => (await winByPanel('main'))?.vis, { timeout: 5_000 }).toBe(true)
  const tuckedMain = await mainBounds()
  expect(tuckedMain.w).toBe(160)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(false)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(false)

  // ④ 弹出（setTucked(false) 等价触碰短条后光标进入）：待办窗还原原位、侧窗按开关恢复
  await setTucked(false)
  await expect.poll(async () => (await mainBounds()).w, { timeout: 5_000 }).toBe(before.w)
  const restored = await mainBounds()
  expect(restored.x).toBe(before.x)
  expect(restored.y).toBe(before.y)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(true)
})

test('展开态托盘最小化→显示：三窗原位恢复（placeAll 修跨 DPI 尺寸残留）', async () => {
  const before = await winByPanel('main')
  expect(before?.vis).toBe(true)

  await h.main.click('[data-testid="tb-minimize"]')
  await expect.poll(async () => (await winByPanel('main'))?.vis, { timeout: 5_000 }).toBe(false)

  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(async () => (await winByPanel('main'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(true)

  const after = await winByPanel('main')
  expect(after!.x).toBe(before!.x)
  expect(after!.y).toBe(before!.y)
  expect(after!.w).toBe(before!.w)
  expect(after!.h).toBe(before!.h)
})
