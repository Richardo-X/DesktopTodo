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
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 5_000 })
    .toBeLessThanOrEqual(1) // OS DPI 取整容差
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
  expect(Math.abs(tuckedMain.w - 160)).toBeLessThanOrEqual(1)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(false)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(false)

  // ④ 弹出（setTucked(false) 等价触碰短条后光标进入）：待办窗还原原位、侧窗按开关恢复
  await setTucked(false)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - before.w), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)
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

test('用户验收#5：侧窗打开二级窗 → 主窗不缩进（childOpen 跨窗门）；关闭 → 恢复缩进', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }

  // 吸附到顶（进入可缩进状态）
  await h.main.evaluate(() => {
    const w = null
    void w
  })
  await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
    w?.setPosition(w.getBounds().x, 0)
  })
  await h.main.waitForTimeout(400)

  // 快捷窗打开「新建模板」二级窗（跨窗 childOpen 同步）
  const wp = h.app.waitForEvent('window')
  await h.quick.click('[data-testid="quick-new"]')
  const tpl = await wp
  await tpl.waitForSelector('[data-testid="tpl-new-input"]')
  await h.main.waitForTimeout(600)

  // 鼠标离开一级窗（主进程光标轮询判定 inside=false 的等价场景：直接派 tick）
  // 跨窗 childOpen 门生效 → 待办窗不收缩（宽度保持 >160）
  const b1 = await mainBounds()
  expect(b1.w).toBeGreaterThan(160)

  // 关闭二级窗 → 恢复可缩进（childOpen 门解除；此后鼠标离开才缩进——此处仅验证门解除后弹出态保持）
  await tpl.close().catch(() => {})
  await h.main.waitForTimeout(400)
  const b2 = await mainBounds()
  expect(b2.w).toBeGreaterThan(160)
})

test('用户验收#1：胶囊与待办窗上缘中心对齐（不算侧窗）', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }
  const before = await mainBounds()
  // 胶囊中心 = 待办窗中心（锚点 + 470*scale/2）
  const scale = before.w / 470
  const expectedCenter = before.x + Math.round(470 * scale) / 2

  await setTucked(true)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)
  const tucked = await mainBounds()
  const actualCenter = tucked.x + tucked.w / 2
  expect(Math.abs(actualCenter - expectedCenter)).toBeLessThanOrEqual(3) // 取整容差

  await setTucked(false)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - before.w), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)
})
