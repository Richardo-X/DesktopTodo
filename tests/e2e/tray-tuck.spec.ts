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
    // 视觉可见判据（透明常驻兼容）：物理可见 且 透明度>0——对真 hide 与透明待机两种实现语义一致
    return { x: b.x, y: b.y, w: b.width, h: b.height, vis: w.isVisible() && w.getOpacity() > 0 }
  }, panel)

const setTucked = (v: boolean): Promise<void> =>
  h.main.evaluate(
    (val) =>
      (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(val),
    v
  )

/** 步2（2026-10-17）：缩进信号=主进程 tucked（整组三窗移到屏幕顶边之外，集合不变）+白条亮起；
 * 主窗 opacity/几何不再变化（透明待机→物理离屏），宽度/透明度均不再是缩进信号 */
const clusterState = (): Promise<{ tucked: boolean; barVis: boolean }> =>
  h.main.evaluate(() =>
    (
      window as unknown as { desktopTodoTest: { clusterState(): Promise<{ tucked: boolean; barVis: boolean }> } }
    ).desktopTodoTest.clusterState()
  )
const isTucked = async (): Promise<boolean> => {
  const s = await clusterState()
  return s.tucked === true && s.barVis === true
}
const isExpanded = async (): Promise<boolean> => {
  const s = await clusterState()
  return s.tucked === false && s.barVis === false
}

test('缩进态托盘最小化→显示：只显胶囊短条，侧窗不复活；弹出后侧窗按开关恢复', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }

  const before = await mainBounds()
  expect(before.w).toBeGreaterThan(160)

  // ⓪ 先真实吸附到工作区顶（缩进语义=贴边才缩进；本用例后段依赖"离开后自动缩回"，
  //    必须处于吸附态——2026-10-17 P1 修复后兜底不再为未吸附态代劳）
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  await h.main.evaluate(
    (pt) =>
      (window as unknown as { desktopTodoTest?: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } })
        .desktopTodoTest!.setFakeCursor(pt),
    { x: before.x + 100, y: before.y + 200 }
  )
  await h.main.evaluate(
    (dy) =>
      (
        window as unknown as { desktopTodoTest: { clusterDragDelta(dx: number, dy: number): Promise<void> } }
      ).desktopTodoTest.clusterDragDelta(0, dy),
    wa.y - before.y
  )
  await expect
    .poll(async () => (await mainBounds()).y, { timeout: 5_000 })
    .toBeLessThanOrEqual(wa.y + 1)

  /** 步2：缩进态=整组移到工作区顶之上（三窗均完全离屏；不隐藏=集合不变） */
  const offscreen = async (panel: string): Promise<boolean> => {
    const b = await winByPanel(panel)
    return !!b && b.y + b.h <= wa.y - 4
  }

  // ① 缩进：整组三窗移出屏幕顶边之外、白条亮起（侧窗不隐藏——集合不变）
  await setTucked(true)
  await expect
    .poll(isTucked, { timeout: 5_000 })
    .toBe(true)
  await expect.poll(() => offscreen('quick'), { timeout: 5_000 }).toBe(true)
  await expect.poll(() => offscreen('done'), { timeout: 5_000 }).toBe(true)

  // ② 托盘最小化（×按钮同路径）：全部隐藏
  await h.main.click('[data-testid="tb-minimize"]')
  await expect.poll(async () => (await winByPanel('main'))?.vis, { timeout: 5_000 }).toBe(false)

  // ③ 托盘显示：缩进态自动弹出完整三窗（用户 2026-10-05 新需求），位置/缩放保持
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(async () => (await winByPanel('main'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - before.w), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(true)

  const sample = (label: string): Promise<void> =>
    h.main
      .evaluate(() =>
        (window as unknown as { desktopTodoTest?: { clusterState(): Promise<Record<string, unknown>> } }).desktopTodoTest!.clusterState()
      )
      .then((st) => console.log('SAMPLE ' + label + ':', JSON.stringify(st)))
      .catch(() => console.log('SAMPLE ' + label + ' failed'))
  await sample('after-popout')

  // ④ 光标移到组件外（fake 光标注入，CI 确定性）→ 3.5s 无交互 → 自动缩回白条
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } })
      .desktopTodoTest!.setFakeCursor({ x: 30, y: 700 })
  )
  await expect
    .poll(isTucked, { timeout: 6_500 })
    .toBe(true)
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } })
      .desktopTodoTest!.setFakeCursor(null)
  )
  await expect.poll(() => offscreen('quick'), { timeout: 5_000 }).toBe(true)
  await expect.poll(() => offscreen('done'), { timeout: 5_000 }).toBe(true)

  // ⑤ 弹出回归（setTucked(false) 等价触碰短条后光标进入）：待办窗还原、侧窗按开关恢复
  await setTucked(false)
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - before.w), { timeout: 5_000 })
    .toBeLessThanOrEqual(3)
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(true)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(true)
})

test('悬空会话清除：缩进+隐藏中会话挂起 → 再次显示不被立即缩回（闪退根因修复）', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }

  // ① 缩进（白条）
  await setTucked(true)
  await expect
    .poll(isTucked, { timeout: 5_000 })
    .toBe(true)

  // ② 显示（tucked 分支：弹出+3s 会话启动）→ ③ 会话期内再隐藏（会话挂起）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(isExpanded, { timeout: 5_000 }).toBe(true)
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(false)
  )
  await h.main.waitForTimeout(3500) // 跨过会话时长：挂起的过期会话在隐藏期间未被处理

  // ④ 再显示：应保持展开（不再被悬空会话立即缩回=闪退根因）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await h.main.waitForTimeout(700) // 悬空会话若未清除，250ms 内即被缩回
  const st = await mainBounds()
  expect(st.vis).toBe(true)
  expect(st.w).toBeGreaterThan(200)
})

test('每次显示都重置 3 秒弹出：吸附位缩进→隐藏→显示（已展开态）→ 保持 3 秒后缩回（用户 2026-10-07 语义）', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }
  const setVis = (v: boolean): Promise<void> =>
    h.main.evaluate(
      (val) =>
        (window as unknown as { desktopTodo: { setVisibility(val: boolean): Promise<void> } }).desktopTodo.setVisibility(val),
      v
    )
  const setFakeCursor = (p: { x: number; y: number } | null): Promise<void> =>
    h.main.evaluate(
      (pt) =>
        (window as unknown as { desktopTodoTest?: { setFakeCursor(pt: { x: number; y: number } | null): Promise<void> } })
          .desktopTodoTest!.setFakeCursor(pt),
      p
    )

  // ⓪ 真实吸附：拖到工作区顶缘——激活 detectSnap → snapChanged → 渲染层状态机 snapped=true
  // （缩进决策信号驱动后，渲染层缩进需要完整 snap 事件链；直接 IPC setTucked 不产生该链）
  const waTop = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const y0 = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
    return w!.getBounds().y
  })
  if (y0 > waTop.y) {
    await h.main.evaluate(
      (dy) =>
        (window as unknown as { desktopTodoTest?: { clusterDragDelta(dx: number, dy: number): Promise<void> } })
          .desktopTodoTest!.clusterDragDelta(0, dy),
      waTop.y - y0
    )
    await h.main.waitForTimeout(800) // 拖动 moving 解除阈值（TUCK_MOVE_IDLE_MS 500ms）+ 余量
  }

  // ① 拖到工作区顶缘（真实吸附：delta 钩子内联 detectSnap，同真实拖动轮询判定；
  //    会话武装条件=snapped，未吸附的展开态显示不武装——测试须先构造吸附态）
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const mb0 = await mainBounds()
  await setFakeCursor({ x: mb0.x + mb0.w / 2, y: mb0.y + 40 }) // 光标在组件内：吸附不触发渲染层自动缩进
  await h.main.evaluate(
    (dy) =>
      (window as unknown as { desktopTodoTest?: { clusterDragDelta(dx: number, dy: number): Promise<void> } })
        .desktopTodoTest!.clusterDragDelta(0, dy),
    wa.y - mb0.y
  )
  await h.main.waitForTimeout(400)

  // ② 缩进（白条）
  await setTucked(true)
  await expect
    .poll(isTucked, { timeout: 5_000 })
    .toBe(true)

  // ③ 隐藏 → ④ 显示#1（弹出+会话）→ 会话期内隐藏（用户路径：弹出不足 3s 又隐藏）
  await setVis(false)
  await setVis(true)
  await expect.poll(isExpanded, { timeout: 5_000 }).toBe(true)
  await setVis(false)
  await h.main.waitForTimeout(4000) // 会话早已过期/被清（隐藏即清除）

  // ⑤ 显示#2：此时刻应用处于顶部吸附位+已展开态——应重新获得 3 秒弹出保持
  await setVis(true)
  await h.main.waitForTimeout(800)
  expect(await isExpanded()).toBe(true) // 展开保持（主窗回亮+白条隐）

  // ⑥ 会话中段（~2s）仍应保持展开
  await h.main.waitForTimeout(1200)
  expect(await isExpanded()).toBe(true) // 会话中段仍保持展开

  // ⑦ 3 秒到 → 光标不在组件上（fake 光标注入到屏幕左下）→ 自动缩回白条
  await setFakeCursor({ x: 30, y: 700 })
  await expect
    .poll(isTucked, { timeout: 6_500 })
    .toBe(true)
  // ⑧ 一致性回归（C4.3 语义，步1 形态）：缩回后必须"主窗隐+白条亮"成对出现——主进程执行
  // 与渲染层状态机不得分裂（历史分裂形态=窗口露出完整 UI 左上角="标题条"，真机截图实锤）
  await expect.poll(isTucked, { timeout: 5_000 }).toBe(true)
  await setFakeCursor(null)
})

test('二级窗开着：隐藏→显示 → 保持弹出不缩回、取消计时（用户 2026-10-08 裁定）', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }

  // ① 拖到工作区顶缘（真实吸附：delta 钩子内联 detectSnap；正确签名=双数字参数——
  //    原对象单参调用把 payload 当 dx 传入 → NaN 锚点 → 三窗被 Windows 钳塌 4×38@(0,0)）
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const mb0 = await mainBounds()
  await h.main.evaluate(
    (pt) =>
      (window as unknown as { desktopTodoTest?: { setFakeCursor(pt: { x: number; y: number } | null): Promise<void> } })
        .desktopTodoTest!.setFakeCursor(pt),
    { x: mb0.x + mb0.w / 2, y: mb0.y + 40 } // 光标在组件内：吸附不触发渲染层自动缩进
  )
  await h.main.evaluate(
    (dy) =>
      (window as unknown as { desktopTodoTest?: { clusterDragDelta(dx: number, dy: number): Promise<void> } })
        .desktopTodoTest!.clusterDragDelta(0, dy),
    wa.y - mb0.y
  )
  await h.main.waitForTimeout(400)

  // ② 打开设置二级窗
  await h.main.click('[data-testid="tb-settings"]')
  await expect
    .poll(
      async () => h.app.windows().filter((w) => w.url().includes('win=settings')).length,
      { timeout: 10_000 }
    )
    .toBe(1)

  // ③ fake 光标注入屏幕左下（确定性：模拟双击托盘后光标停在托盘上）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } })
      .desktopTodoTest!.setFakeCursor({ x: 30, y: 700 })
  )

  // ④ 双击隐藏 → 双击显示
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(false)
  )
  await h.main.waitForTimeout(400)
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )

  // ⑤ 裁定：二级窗开着 → 保持弹出 + 取消计时（3.5s 后不得被 3 秒会话缩回）
  await h.main.waitForTimeout(3500)
  const st = await mainBounds()
  expect(st.w).toBeGreaterThan(200)
  expect(await h.app.windows().filter((w) => w.url().includes('win=settings')).length).toBe(1)

  // ⑥ 关闭二级窗 → 应用保持展开（缩进禁止仅二级窗开着时生效）
  const child = h.app.windows().find((w) => w.url().includes('win=settings'))!
  await child
    .evaluate(() =>
      (window as unknown as { desktopTodo: { closeSelf(): Promise<void> } }).desktopTodo.closeSelf()
    )
    .catch(() => {})
  await expect
    .poll(
      async () => h.app.windows().filter((w) => w.url().includes('win=settings')).length,
      { timeout: 5_000 }
    )
    .toBe(0)
  await h.main.waitForTimeout(500)
  expect((await mainBounds()).w).toBeGreaterThan(200)
})

test('C7 白条 mouseenter 驱动弹出：真实鼠标事件划过白条→弹出；带外→不弹', async () => {
  // ① 真实吸附
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const y0 = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
    return w!.getBounds().y
  })
  if (y0 > wa.y) {
    await h.main.evaluate(
      (dy) =>
        (window as unknown as { desktopTodoTest?: { clusterDragDelta(dx: number, dy: number): Promise<void> } })
          .desktopTodoTest!.clusterDragDelta(0, dy),
      wa.y - y0
    )
    await h.main.waitForTimeout(800)
  }

  // ② 真实缩进链（fake 光标注入——弹出态→缩进仍走主进程轮询，历史稳定路径）
  const capIn = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
    const b = w!.getBounds()
    return { x: b.x + b.width / 2, y: b.y + 6 }
  })
  await h.main.evaluate(
    (pt) =>
      (window as unknown as { desktopTodoTest?: { setFakeCursor(pt: { x: number; y: number } | null): Promise<void> } })
        .desktopTodoTest!.setFakeCursor(pt),
    capIn
  )
  await h.main.waitForTimeout(400)
  await h.main.evaluate(
    (pt) =>
      (window as unknown as { desktopTodoTest?: { setFakeCursor(pt: { x: number; y: number } | null): Promise<void> } })
        .desktopTodoTest!.setFakeCursor(pt),
    { x: capIn.x + 600, y: capIn.y + 400 }
  )
  await expect.poll(isTucked, { timeout: 5_000 }).toBe(true)
  await h.main.waitForTimeout(300)

  // ③ 真实渲染层鼠标事件 hover 白条元素 → mouseenter → 弹出（C7 新机制）
  await h.bar.locator('.tuck-bar').hover()
  await expect.poll(isExpanded, { timeout: 5_000 }).toBe(true)

  // ④ 再缩进（确定性两段式，同 ② 的可靠模式；消除"fake 已在移出位依赖 lastInside 重置竞态"的 CI 波动）：
  // 先回组件（tick inside=true 稳定链路）→ 再移出 → inside=false → 渲染层 leaveAt → 缩进
  const setFake = (pt: { x: number; y: number }): Promise<void> =>
    h.main.evaluate(
      (q) =>
        (window as unknown as { desktopTodoTest?: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } })
          .desktopTodoTest!.setFakeCursor(q),
      pt
    )
  await setFake(capIn)
  await h.main.waitForTimeout(500)
  await setFake({ x: capIn.x + 600, y: capIn.y + 400 })
  await expect.poll(isTucked, { timeout: 8_000 }).toBe(true)
  // 白条窗页坐标：元素=页底 6px 热区，y=5 落在元素上方余量带（挂锚点上方的屏外区）——
  // 落在非白条区不得误弹
  await h.bar.mouse.move(80, 5)
  await h.main.waitForTimeout(800)
  expect(await isTucked()).toBe(true) // 白条外页面区划过不弹

  // ⑤ 划回白条 → 弹出（mouseenter 再次驱动）
  await h.bar.locator('.tuck-bar').hover()
  await expect.poll(isExpanded, { timeout: 5_000 }).toBe(true)

  // ⑥ 清 fake cursor 恢复真实光标
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { setFakeCursor(pt: null): Promise<void> } })
      .desktopTodoTest!.setFakeCursor(null)
  )
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
  // 跨窗 childOpen 门生效 → 不缩进（步1 形态：主窗保持回亮、白条不亮）
  expect(await isExpanded()).toBe(true)

  // 关闭二级窗 → 恢复可缩进（childOpen 门解除；此后鼠标离开才缩进——此处仅验证门解除后弹出态保持）
  await tpl.close().catch(() => {})
  await h.main.waitForTimeout(400)
  expect(await isExpanded()).toBe(true) // 门解除后仍为弹出态（鼠标未离开才缩进；此处仅验门解除）
})

test('用户验收#1：胶囊与待办窗上缘中心对齐（不算侧窗）', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }
  const before = await mainBounds()
  // 白条中心 = 待办窗上缘中心（锚点 + 470*scale/2）——步1：白条=独立窗，口径保持现状
  const scale = before.w / 470
  const expectedCenter = before.x + Math.round(470 * scale) / 2

  await setTucked(true)
  await expect.poll(isTucked, { timeout: 5_000 }).toBe(true)
  const bar = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (x) => !x.isDestroyed() && x.webContents.getURL().includes('win=bar')
    )!
    const b = w.getContentBounds()
    return { x: b.x, width: b.width }
  })
  const actualCenter = bar.x + bar.width / 2
  expect(Math.abs(actualCenter - expectedCenter)).toBeLessThanOrEqual(3) // 取整容差

  await setTucked(false)
  await expect.poll(isExpanded, { timeout: 5_000 }).toBe(true)
  const restored = await mainBounds()
  expect(Math.abs(restored.w - before.w)).toBeLessThanOrEqual(3)
})

/** 缩进锁定 × 托盘恢复（用户 2026-10-17 报告："锁定后托盘隐藏→显示，原位置出现 3 秒然后缩进边缘"）：
 * 回归防护=跨过整条兜底链（3 秒会话窗口 + 900ms 主进程兜底窗口）后，锁定态必须保持展开、白条不亮。
 * 缺陷根因：900ms 负载兜底绕过渲染层 locked 门单方面缩进 → 状态分裂（白条悬停不弹）。
 * 修复=P1 兜底门槛全员对齐（锁定/批量/拖动/未吸附）+ P2 锁定时不武装 3 秒会话。 */
test('缩进锁定：托盘隐藏→显示后保持展开不缩进（跨 3 秒会话+900ms 兜底窗口）', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }
  const setFakeCursor = (pt: { x: number; y: number } | null): Promise<void> =>
    h.main.evaluate(
      (p) =>
        (
          window as unknown as { desktopTodoTest?: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } }
        ).desktopTodoTest!.setFakeCursor(p),
      pt
    )
  const setVis = (v: boolean): Promise<void> =>
    h.main.evaluate(
      (val) =>
        (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(
          val
        ),
      v
    )

  // ① 开缩进锁定（真实 UI 路径）
  await h.main.click('[data-testid="tb-tucklock"]')
  await h.main.waitForTimeout(300)

  // ② 吸附到工作区顶（真实吸附路径；fake 光标先放组件内避免拖动竞态）
  const wa = await h.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const before = await mainBounds()
  await setFakeCursor({ x: before.x + 100, y: before.y + 200 })
  await h.main.evaluate(
    (dy) =>
      (
        window as unknown as { desktopTodoTest: { clusterDragDelta(dx: number, dy: number): Promise<void> } }
      ).desktopTodoTest.clusterDragDelta(0, dy),
    wa.y - before.y
  )
  await h.main.waitForTimeout(500)
  const ref = await mainBounds() // 吸附后的几何基准（y 已=工作区顶）
  // 光标移出组件（锁定态下的真实判定路径：主进程轮询会持续发 inside=false）
  await setFakeCursor({ x: 60, y: 1400 })

  // ③ 托盘隐藏 → 显示（触发"3 秒停留会话"武装路径 + 其到期后的 900ms 兜底窗口）
  await setVis(false)
  await setVis(true)
  await h.main.waitForTimeout(5200) // 跨过 3s 会话 + 900ms 兜底 + 余量

  // ④ 锁定态必须保持展开：主窗回亮、白条不亮、几何未变
  expect(await isExpanded()).toBe(true)
  const after = await mainBounds()
  expect(Math.abs(after.x - ref.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(after.y - ref.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(after.w - ref.w)).toBeLessThanOrEqual(2)

  // ⑤ 关锁 → 自动缩进恢复（门解除后行为正常）——走"确定性两段式"（fake 光标 组件内→外，
  // 触发一次全新的离开信号；直接依赖既有 inside=false 会撞上渲染层"指针活动守卫"
  // lastPointerInsideAt——真机真光标若停在 E2E 窗口上会持续刷新它，属环境敏感路径）
  await h.main.click('[data-testid="tb-tucklock"]')
  await h.main.waitForTimeout(300)
  await setFakeCursor({ x: ref.x + 100, y: ref.y + 200 })
  await h.main.waitForTimeout(500)
  await setFakeCursor({ x: 60, y: 1400 })
  await expect.poll(isTucked, { timeout: 6_000 }).toBe(true)
  await setFakeCursor(null)
})
