import { test, expect, type Page } from '@playwright/test'
import { launchApp } from './helpers'

/** 文本编辑光标失效诊断（用户 2026-10-06 报告）：
 * 编辑模板窗 textarea 内——鼠标点击任意位置/方向键应移动插入点；
 * 实际（用户真机）：插入点恒在文本末尾。本用例先复现定根因：
 * 点击坐标 → 读 selectionEnd（>0 = 光标到位）；再按结果修复。 */

test.describe('文本编辑光标（诊断先行）', () => {
  test('点击文本起始 → 插入点应移动到点击位置；方向键可移动', async () => {
    const h = await launchApp({ seed: { templates: [{ id: 'tpl-x', content: '0123456789ABCDEFGHIJ', createdAt: new Date().toISOString() }] } })
    await h.main.waitForSelector('[data-testid="home-panel"]')
    await h.main.waitForTimeout(300)

    // 打开编辑模板窗
    await h.main.evaluate(() => {
      const w = window as unknown as { desktopTodo: { openChild(p: { kind: string; id?: string }): Promise<void> } }
      void w.desktopTodo.openChild({ kind: 'template-edit', id: 'tpl-x' })
    })
    let child: Page | undefined
    await expect
      .poll(
        async () => {
          child = h.app.windows().find((w) => w.url().includes('win=template-edit'))
          return child ? 1 : 0
        },
        { timeout: 10_000 }
      )
      .toBe(1)
    const cw = child!
    await cw.waitForSelector('[data-testid="tpl-edit-input"]', { timeout: 10_000 })
    await cw.waitForTimeout(300)

    const input = cw.locator('[data-testid="tpl-edit-input"]')
    const box = await input.boundingBox()
    expect(box).toBeTruthy()

    // 聚焦并点击文本起始（x=20，约第 1~2 个字符处）
    await input.focus()
    await cw.waitForTimeout(100)
    await input.click({ position: { x: 20, y: Math.round(box!.height / 2) } })
    const sel1 = await cw.evaluate(() => {
      const el = document.querySelector('[data-testid="tpl-edit-input"]') as HTMLTextAreaElement
      return { start: el.selectionStart, end: el.selectionEnd, len: el.value.length }
    })
    console.log('CURSOR-DIAG click-start:', JSON.stringify(sel1))
    expect(sel1.end).toBeLessThan(sel1.len) // 诊断断言：点击起始区后插入点应靠近开头

    // 方向键 →（右）应 +1；←（左）应 -1
    await cw.keyboard.press('ArrowRight')
    const sel2 = await cw.evaluate(() => (document.querySelector('[data-testid="tpl-edit-input"]') as HTMLTextAreaElement).selectionEnd)
    console.log('CURSOR-DIAG arrow-right:', sel1.end, '->', sel2)
    expect(sel2).toBe(sel1.end + 1)
    await cw.keyboard.press('ArrowLeft')
    const sel3 = await cw.evaluate(() => (document.querySelector('[data-testid="tpl-edit-input"]') as HTMLTextAreaElement).selectionEnd)
    expect(sel3).toBe(sel1.end)
    await h.close()
  })
})
