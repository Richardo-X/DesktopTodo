import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/** 置顶判定（用户定稿 2026-10-06）：
 * 取消沉底 + 删除挂件态（WS_EX_NOACTIVATE）——未置顶=普通窗口层级：
 * 取消置顶后三窗留在原层级（不沉底）、恒可激活（点击浮上来获焦点），
 * 应用窗口盖上来时组件被正常覆盖。
 * 断言用【真实 Win32 样式位】（test:exstyle 钩子）——Electron isFocusable()
 * 与实际 NOACTIVATE 位脱节（实测），不可作为信号。 */
test.describe.serial('置顶判定：未置顶=普通窗口层级', () => {
  let h: AppHandle

  test.beforeEach(async () => {
    h = await launchApp()
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
        show: false,
        backgroundColor: '#ff00ff',
        title: 'e2e-cover-window'
      })
      void cover.loadURL('about:blank')
      cover.showInactive()
    })
    await h.main.waitForTimeout(400)
  }

  const closeCover = async (): Promise<void> => {
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')?.close()
    })
  }

  /** 真实样式位（每窗）：noactivate=挂件态标志（定稿要求恒 false）；topmost=置顶标志 */
  const exState = (panel: string): Promise<{ noactivate: boolean; topmost: boolean }> =>
    h.main.evaluate(
      (p) =>
        (window as unknown as {
          desktopTodoTest?: { exstyle(panel: string): Promise<{ noactivate: boolean; topmost: boolean }> }
        }).desktopTodoTest!.exstyle(p),
      panel
    )

  const setTopMost = (v: boolean): Promise<void> =>
    h.main.evaluate(
      (val) =>
        (window as unknown as { desktopTodo: { setTopMost(v: boolean): Promise<void> } }).desktopTodo.setTopMost(val),
      v
    )

  test('未置顶默认：三窗均无挂件态标志（NOACTIVATE=false）且未置顶', async () => {
    for (const p of ['main', 'quick', 'done']) {
      const s = await exState(p)
      expect(s.noactivate).toBe(false)
      expect(s.topmost).toBe(false)
    }
  })

  test('取消置顶（组件有焦点）→ 留原层级：NOACTIVATE 恒 false、TOPMOST=false；失焦后不变', async () => {
    await h.main.click('[data-testid="tb-topmost"]')
    await h.main.waitForTimeout(400)

    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main'))
        ?.focus()
    })
    await h.main.waitForTimeout(300)

    await coverMainCenter()

    await setTopMost(false)
    await h.main.waitForTimeout(1400) // 覆盖旧实现 120/400ms 双次沉底时序
    for (const p of ['main', 'quick', 'done']) {
      const s = await exState(p)
      expect(s.noactivate).toBe(false) // 不进挂件态
      expect(s.topmost).toBe(false)
    }

    // 失焦（点其他窗口）→ 普通窗口行为：样式位不变
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')?.focus()
    })
    await h.main.waitForTimeout(1400)
    for (const p of ['main', 'quick', 'done']) {
      const s = await exState(p)
      expect(s.noactivate).toBe(false)
      expect(s.topmost).toBe(false)
    }

    await closeCover()
  })

  test('取消置顶时焦点不在组件 → 同样无挂件态', async () => {
    await h.main.click('[data-testid="tb-topmost"]')
    await h.main.waitForTimeout(300)
    await coverMainCenter()
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.getTitle() === 'e2e-cover-window')?.focus()
    })
    await h.main.waitForTimeout(300)

    await setTopMost(false)
    await h.main.waitForTimeout(1400)
    for (const p of ['main', 'quick', 'done']) {
      const s = await exState(p)
      expect(s.noactivate).toBe(false)
      expect(s.topmost).toBe(false)
    }
    await closeCover()
  })
})
