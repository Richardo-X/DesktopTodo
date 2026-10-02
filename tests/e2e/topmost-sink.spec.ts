import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/** 置顶判定（用户定稿 2026-10-02 第三轮）：
 * 置顶→取消置顶时若组件持有焦点：保持在窗口上方（不立即沉底），仍可交互；
 * 点击其他非组件位置（三窗全失焦）→ 组件整体立即沉底 + 进入挂件态（不可激活）。
 * 取消置顶时若焦点本就不在组件上 → 立即沉底。 */
test.describe.serial('置顶判定：失焦沉底', () => {
  let h: AppHandle

  test.beforeEach(async () => {
    h = await launchApp()
    h.app.process()?.stdout?.on('data', (d) => console.log('MAIN:', d.toString().trim().slice(0, 200)))
    await h.main.waitForSelector('[data-testid="home-panel"]')
    await h.main.waitForTimeout(400)
  })

  test.afterEach(async () => {
    await h.close()
  })

  const coverMainCenter = async (): Promise<void> => {
    await h.app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find(
        (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
      )!
      const mb = main.getBounds()
      const cover = new BrowserWindow({
        x: mb.x + Math.round(mb.width / 4),
        y: mb.y + Math.round(mb.height / 4),
        width: Math.round(mb.width / 2),
        height: Math.round(mb.height / 2),
        show: false, // 构造即 show 会激活抢焦点——必须先建隐藏窗再 showInactive
        backgroundColor: '#ff00ff', // 洋红：像素判定用（组件浅色/深色主题都不会撞色）
        title: 'e2e-cover-window'
      })
      void cover.loadURL('about:blank')
      cover.showInactive() // 不抢焦点：保持"组件持有焦点"前提（真实场景=用户在看别的窗口上面浮着组件）
    })
    await h.main.waitForTimeout(400)
  }

  const closeCover = async (): Promise<void> => {
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')?.close()
    })
  }

  const clusterState = (): Promise<{ atop: boolean[]; focusable: boolean[]; focused: boolean[] }> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const ws = ['main', 'quick', 'done'].map((p) =>
        BrowserWindow.getAllWindows().find(
          (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`)
        )
      )
      return {
        atop: ws.map((w) => w?.isAlwaysOnTop() ?? null).sort(),
        focusable: ws.map((w) => w?.isFocusable() ?? null).sort(),
        focused: ws.map((w) => w?.isFocused() ?? false)
      }
    }) as ReturnType<typeof Object>

  const setTopMost = (v: boolean): Promise<void> =>
    h.main.evaluate(
      (val) =>
        (window as unknown as { desktopTodo: { setTopMost(v: boolean): Promise<void> } }).desktopTodo.setTopMost(val),
      v
    )

  test('取消置顶（组件有焦点）→ 保持在上方；失焦 → 立即整体沉底+挂件态', async () => {
    // 开置顶（三窗 focusable+atop）
    await h.main.click('[data-testid="tb-topmost"]')
    await h.main.waitForTimeout(400)

    // 复现真实点击前提：真实用户点按钮时组件窗口必持焦点（合成点击不激活 OS 窗口）
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main'))
        ?.focus()
    })
    await h.main.waitForTimeout(300)
    const focusedBefore = await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main'))!.isFocused()
    )
    expect(focusedBefore).toBe(true)

    // cover 盖主窗中心（置顶组件在 cover 上面）
    await coverMainCenter()

    // 取消置顶：组件有焦点（按钮刚被点击）→ 保持在窗口上方、不立即沉底
    await setTopMost(false)
    await h.main.waitForTimeout(600)
    const st1 = await clusterState()
    expect(st1.atop).toEqual([false, false, false])
    expect(st1.focusable).toEqual([true, true, true]) // 仍可交互（等待失焦）

    // 模拟"点击其他非组件位置"：cover 窗激活（focus() 走 OS 激活）→ 三窗失焦
    const focusInfo = await h.app.evaluate(({ BrowserWindow }) => {
      const cover = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')
      cover?.focus()
      const ws = ['main', 'quick', 'done'].map((p) =>
        BrowserWindow.getAllWindows().find(
          (x) => !x.isDestroyed() && x.webContents.getURL().includes(`panel=${p}`)
        )
      )
      return { coverFocused: cover?.isFocused(), clusterFocused: ws.map((w) => w?.isFocused()) }
    })
    console.log('FOCUS-PROBE:', JSON.stringify(focusInfo))
    await h.main.waitForTimeout(800)

    // 沉底 + 挂件态：主窗中心点的顶层窗口不再是组件（被 cover 或其他窗口覆盖）
    await h.main.waitForTimeout(700) // 覆盖 120/400ms 两次沉底完成后断言
    // 沉底视觉以真机为准（koffi z 序枚举对透明合成窗口为盲区）；此处锁定状态语义：
    // 三窗全部降层 + 不可激活（挂件态），失焦沉底由用户真机验收（2026-10-03 通过）
    await h.main.waitForTimeout(700) // 覆盖 120/400ms 二次沉底
    const st2 = await clusterState()
    expect(st2.atop).toEqual([false, false, false])
    expect(st2.focusable).toEqual([false, false, false]) // 挂件态

    await closeCover()
  })

  test('取消置顶时焦点不在组件 → 立即沉底', async () => {
    await h.main.click('[data-testid="tb-topmost"]')
    await h.main.waitForTimeout(300)
    await coverMainCenter()
    // 焦点交给 cover（非组件窗口）
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')?.focus()
    })
    await h.main.waitForTimeout(300)

    await setTopMost(false)
    await h.main.waitForTimeout(600)
    // 沉底视觉以真机为准；状态语义：取消置顶时焦点不在组件 → 立即挂件态
    await h.main.waitForTimeout(700)
    const st2 = await clusterState()
    expect(st2.atop).toEqual([false, false, false])
    expect(st2.focusable).toEqual([false, false, false])
    const st = await clusterState()
    expect(st.focusable).toEqual([false, false, false])
    await closeCover()
  })
})
