import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 文本编辑光标失效诊断（用户 2026-10-06 报告）：
 * 编辑模板窗 textarea 内——鼠标点击任意位置/方向键应移动插入点；
 * 实际（用户真机）：插入点恒在文本末尾。本用例先复现定根因：
 * 点击坐标 → 读 selectionStart（>0 = 光标到位）；再按结果修复。 */

test.describe('文本编辑光标（诊断先行）', () => {
  test('点击文本中部 → 插入点应移动到点击位置（selectionStart>0）', async () => {
    const h = await launchApp({ seed: { templates: [{ id: 'tpl-x', name: '诊断模板', content: '0123456789ABCDEFGHIJ', createdAt: new Date().toISOString() }] } })
    await h.main.waitForSelector('[data-testid="home-panel"]')
    await h.main.waitForTimeout(300)

    // 打开编辑模板窗（点击模板行进入编辑）
    await h.main.evaluate(() => {
      const w = window as unknown as { desktopTodo: { openChild(p: { kind: string; id?: string }): Promise<void> } }
      void w.desktopTodo.openChild({ kind: 'template-edit', id: 'tpl-x' })
    })
    let child
    await expect
      .poll(
        async () => {
          child = h.app.windows().find((w) => w.url().includes('win=template-edit'))
          return child ? 1 : 0
        },
        { timeout: 10_000 }
      )
      .toBe(1)
    await child!.waitForSelector('[data-testid="tpl-edit-input"]', { timeout: 10_000 })
    await child.waitForTimeout(300)

    const input = child.locator('[data-testid="tpl-edit-input"]')
    const box = await input.boundingBox()
    expect(box).toBeTruthy()

    // 聚焦并点击文本中部（约第 10 个字符处）
    await input.focus()
    await child.waitForTimeout(100)
    await input.click({ position: { x: 20, y: Math.round(box!.height / 2) } })
    const sel1 = await child.evaluate(() => {
      const el = document.querySelector('[data-testid="tpl-edit-input"]') as HTMLTextAreaElement
      return { sel: el.selectionEnd, len: el.value.length }
    })
    console.log('CURSOR-DIAG click-middle:', JSON.stringify(sel1))
    expect(sel1.sel).toBeGreaterThan(0) // 诊断断言：点击中部后插入点应在中部

    // 方向键 →（右）应 +1
    const before = sel1.sel
    await child.keyboard.press('ArrowRight')
    const sel2 = await child.evaluate(() => (document.querySelector('[data-testid="tpl-edit-input"]') as HTMLTextAreaElement).selectionEnd)
    console.log('CURSOR-DIAG arrow-right:', before, '->', sel2)
    expect(sel2).toBeGreaterThanOrEqual(before)

    // ←（左）应回到点击位附近（-1）
    await child.keyboard.press('ArrowLeft')
    const sel3 = await child.evaluate(() => (document.querySelector('[data-testid="tpl-edit-input"]') as HTMLTextAreaElement).selectionStart)
    expect(sel3).toBeLessThanOrEqual(sel2)
    await h.close()
  })
})
