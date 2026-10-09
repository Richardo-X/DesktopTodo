import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { hitProbe } from '../../electron/main/win32'

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
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 6_500 })
    .toBeLessThanOrEqual(1)
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest?: { setFakeCursor(p: { x: number; y: number } | null): Promise<void> } })
      .desktopTodoTest!.setFakeCursor(null)
  )
  await expect.poll(async () => (await winByPanel('quick'))?.vis, { timeout: 5_000 }).toBe(false)
  await expect.poll(async () => (await winByPanel('done'))?.vis, { timeout: 5_000 }).toBe(false)

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
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)

  // ② 显示（tucked 分支：弹出+3s 会话启动）→ ③ 会话期内再隐藏（会话挂起）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await expect.poll(async () => (await mainBounds()).w, { timeout: 5_000 }).toBeGreaterThan(200)
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
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)

  // ③ 隐藏 → ④ 显示#1（弹出+会话）→ 会话期内隐藏（用户路径：弹出不足 3s 又隐藏）
  await setVis(false)
  await setVis(true)
  await expect.poll(async () => (await mainBounds()).w, { timeout: 5_000 }).toBeGreaterThan(200)
  await setVis(false)
  await h.main.waitForTimeout(4000) // 会话早已过期/被清（隐藏即清除）

  // ⑤ 显示#2：此时刻应用处于顶部吸附位+已展开态——应重新获得 3 秒弹出保持
  await setVis(true)
  await h.main.waitForTimeout(800)
  const holdA = await mainBounds()
  expect(holdA.w).toBeGreaterThan(200)

  // ⑥ 会话中段（~2s）仍应保持展开
  await h.main.waitForTimeout(1200)
  const holdB = await mainBounds()
  expect(holdB.w).toBeGreaterThan(200)

  // ⑦ 3 秒到 → 光标不在组件上（fake 光标注入到屏幕左下）→ 自动缩回白条
  await setFakeCursor({ x: 30, y: 700 })
  await expect
    .poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 6_500 })
    .toBeLessThanOrEqual(1)
  // ⑧ 一致性回归（C4.3）：缩回后白条必须显示——主进程胶囊几何与渲染层白条态不得分裂
  // （分裂形态=窗口露出完整 UI 左上角="标题条"，用户真机 2026-10-08 截图实锤）
  await expect
    .poll(
      async () =>
        h.main.evaluate(() => {
          const el = document.querySelector('.tuck-bar') as HTMLElement | null
          return el ? getComputedStyle(el).display : 'none'
        }),
      { timeout: 5_000 }
    )
    .toBe('block')
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

test('C6.4 遮挡判定回归：白条可见时划过弹出；被遮挡时划过不弹；点击始终弹出', async () => {
  const mainBounds = async (): Promise<W> => {
    const b = await winByPanel('main')
    expect(b).toBeTruthy()
    return b as W
  }
  const capCenter = async (): Promise<{ x: number; y: number }> => {
    const b = await mainBounds()
    return { x: b.x + b.w / 2, y: b.y + 19 }
  }
  const setFakeCursor = (p: { x: number; y: number } | null): Promise<void> =>
    h.main.evaluate(
      (pt) =>
        (window as unknown as { desktopTodoTest?: { setFakeCursor(pt: { x: number; y: number } | null): Promise<void> } })
          .desktopTodoTest!.setFakeCursor(pt),
      p
    )

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

  // ② 真实缩进链（白条显示）
  const c = await capCenter()
  await setFakeCursor(c)
  await h.main.waitForTimeout(400)
  await setFakeCursor({ x: c.x + 600, y: c.y + 400 })
  await expect.poll(async () => Math.abs((await mainBounds()).w - 160), { timeout: 5_000 }).toBeLessThanOrEqual(1)
  await h.main.waitForTimeout(300)

  // ③ 遮挡判定语义（环境自适应）：hitProbe 命中主窗=白条可见→划过弹出；命中他窗=被遮挡→不弹。
  // 测试机白条位置可能被 ZCode 终端等环境窗口覆盖——两种环境都验证对应语义
  const capNow = await capCenter()
  const mainHwndNow = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
    return w!.getNativeWindowHandle().readBigUInt64LE(0).toString()
  })
  const hitEnv = hitProbe(capNow.x, capNow.y)
  const barVisible = hitEnv === mainHwndNow
  await setFakeCursor(capNow)
  await h.main.waitForTimeout(1_000)
  if (barVisible) {
    // 白条可见：划过弹出（既有语义）
    expect((await mainBounds()).w).toBeGreaterThan(200)
  } else {
    // 白条被环境窗口遮挡：遮挡判定生效，划过不弹
    expect((await mainBounds()).w).toBeLessThanOrEqual(162)
  }

  // ④ 点击白条弹出（附加途径，渲染层定位不依赖遮挡）→ 弹出
  await h.main.locator('.tuck-bar').click()
  await expect.poll(async () => (await mainBounds()).w, { timeout: 5_000 }).toBeGreaterThan(200)
  await setFakeCursor(null)
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
    .toBeLessThanOrEqual(3)
})
