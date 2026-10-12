import { test, expect } from '@playwright/test'
import { launchApp, dateKeyOffset } from './helpers'
import { createTodoItem } from '../../src/core/models'

/** L2 排版与节奏（体验说明书 docs/v1.1.2-L2-体验说明书.md）自动化锁定：
 * ① 12 种散乱字号 → 6 档字阶（38 display / 15 heading / 13.5 body / 12 label / 11 caption / 10 micro），
 *    全应用可见文本零离群（getComputedStyle 不受 zoom 影响，直接取 CSS 值）；
 * ② 行样式归一（四类行 padding 11×12）与列表节奏（gap 8 / win-body 顶距 8）；
 * ③ 正文行高统一 1.5。
 * 防止后续回归再引入离群字号/三套行高。 */

/** 6 档字阶白名单 */
const TIERS = ['38px', '15px', '13.5px', '12px', '11px', '10px']

/** 收集页面内「有直接文本节点」元素的 computed font-size（去重；仅 body 内＝实际渲染内容） */
const collectFontSizes = (): string[] => {
  const out = new Set<string>()
  for (const el of document.body.querySelectorAll('*')) {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && n.textContent && n.textContent.trim()) {
        out.add(getComputedStyle(el).fontSize)
        break
      }
    }
  }
  return [...out]
}

test('L2-①：字号阶梯——全应用可见文本全部落 6 档（三面板 + 历史/设置/新建子窗）', async () => {
  const h = await launchApp({
    seed: {
      todos: [
        createTodoItem({ content: '待办甲', now: new Date(), id: 't1' }),
        // 逾期徽标（micro 10px 锚点）：昨日创建 + 显式置位——启动补结算按日期重算时仍为 true，双重保险
        { ...createTodoItem({ content: '逾期乙', now: new Date(Date.now() - 86_400_000), id: 't2' }), overdue: true }
      ],
      templates: [createTodoItem({ content: '模板甲', now: new Date(), id: 'tp1' })],
      completed: [
        { ...createTodoItem({ content: '已完成甲', now: new Date(), id: 'd1' }), completedAt: new Date().toISOString() }
      ],
      archive: {
        [dateKeyOffset(-1)]: [
          { ...createTodoItem({ content: '存档甲', now: new Date(), id: 'a1' }), completedAt: new Date().toISOString() }
        ]
      }
    }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.done.waitForSelector('[data-testid="done-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(300)

  // 三大面板逐页收集
  for (const [name, page] of [['主窗', h.main], ['快捷窗', h.quick], ['已完成窗', h.done]] as const) {
    const sizes = await page.evaluate(collectFontSizes)
    expect(sizes.length, `${name} 未采到任何字号`).toBeGreaterThan(3)
    for (const s of sizes) expect(TIERS, `${name} 出现离群字号 ${s}`).toContain(s)
  }

  // 历史窗（子窗＝无 zoom）
  const hp = h.app.waitForEvent('window')
  await h.done.click('[data-testid="done-history"]')
  const hist = await hp
  await hist.waitForSelector('[data-testid="hist-row"]')
  const histSizes = await hist.evaluate(collectFontSizes)
  expect(histSizes.length).toBeGreaterThanOrEqual(3)
  for (const s of histSizes) expect(TIERS, `历史窗出现离群字号 ${s}`).toContain(s)

  // 设置窗
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const setwin = await sp
  await setwin.waitForSelector('.form-row')
  const setSizes = await setwin.evaluate(collectFontSizes)
  expect(setSizes.length).toBeGreaterThanOrEqual(3)
  for (const s of setSizes) expect(TIERS, `设置窗出现离群字号 ${s}`).toContain(s)

  // 新建待办窗
  const np = h.app.waitForEvent('window')
  await h.main.click('[data-testid="op-new"]')
  const nwin = await np
  await nwin.waitForSelector('textarea')
  const nSizes = await nwin.evaluate(collectFontSizes)
  expect(nSizes.length).toBeGreaterThanOrEqual(2)
  for (const s of nSizes) expect(TIERS, `新建窗出现离群字号 ${s}`).toContain(s)

  await h.close()
})

test('L2-②：字阶抽样锚点（display/heading/body/label/caption/micro 各落其位）', async () => {
  const h = await launchApp({
    seed: {
      todos: [
        { ...createTodoItem({ content: '待办甲', now: new Date(Date.now() - 86_400_000), id: 't1' }), overdue: true }
      ],
      templates: [createTodoItem({ content: '模板甲', now: new Date(), id: 'tp1' })],
      completed: [
        { ...createTodoItem({ content: '已完成甲', now: new Date(), id: 'd1' }), completedAt: new Date().toISOString() }
      ]
    }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.done.waitForSelector('[data-testid="done-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(300)

  const fs = (page: typeof h.main, sel: string) =>
    page.evaluate((s) => getComputedStyle(document.querySelector(s) as Element).fontSize, sel)

  // display 38：主窗时钟
  expect(await fs(h.main, '[data-testid="clock-time"]')).toBe('38px')
  // heading 15：时钟下日期 + 两个侧窗面板标题
  expect(await fs(h.main, '[data-testid="clock-date"]')).toBe('15px')
  expect(await fs(h.quick, '.panel-title')).toBe('15px')
  expect(await fs(h.done, '.panel-title')).toBe('15px')
  // body 13.5：四类行内容（主窗/模板/已完成在此验证，历史窗在下一条用例）
  expect(await fs(h.main, '[data-testid="row-content"]')).toBe('13.5px')
  expect(await fs(h.quick, '[data-testid="tpl-content"]')).toBe('13.5px')
  expect(await fs(h.done, '.todo-row .content')).toBe('13.5px')
  // label 12：主窗批量删除（30→26 小按钮为 caption 11；此处取标题栏与确认框口径）
  expect(await fs(h.main, '.tb-left')).toBe('12px')
  // caption 11 / micro 10：计数芯片与逾期徽标
  expect(await fs(h.main, '[data-testid="op-count"]')).toBe('11px')
  expect(await fs(h.main, '[data-testid="row-overdue-tag"]')).toBe('10px')

  // 确认框（子窗外的渲染在面板内）：label 12 + 行高 1.5
  await h.main.click('[data-testid="op-batch"]')
  await h.main.click('[data-testid="todo-row"]')
  await h.main.click('[data-testid="batch-delete"]')
  await h.main.waitForSelector('[data-testid="confirm-dialog"]')
  const msg = await h.main.evaluate(() => {
    const el = document.querySelector('.message') as HTMLElement
    const cs = getComputedStyle(el)
    return { fs: cs.fontSize, lh: cs.lineHeight }
  })
  expect(msg.fs).toBe('12px')
  expect(msg.lh).toBe('18px') // 12 × 1.5

  await h.close()
})

test('L2-③：行样式归一与列表节奏（padding 11×12 / gap 8 / win-body 顶距 8）', async () => {
  const h = await launchApp({
    seed: {
      todos: [createTodoItem({ content: '待办甲', now: new Date(), id: 't1' })],
      templates: [createTodoItem({ content: '模板甲', now: new Date(), id: 'tp1' })],
      completed: [
        { ...createTodoItem({ content: '已完成甲', now: new Date(), id: 'd1' }), completedAt: new Date().toISOString() }
      ],
      archive: {
        [dateKeyOffset(-1)]: [
          { ...createTodoItem({ content: '存档甲', now: new Date(), id: 'a1' }), completedAt: new Date().toISOString() }
        ]
      }
    }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.done.waitForSelector('[data-testid="done-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(300)

  const probe = (page: typeof h.main, sel: string) =>
    page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement | null
      if (!el) return null
      const cs = getComputedStyle(el)
      return { padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, gap: cs.rowGap }
    }, sel)

  const ROW = '11px 12px 11px 12px'
  // 四类行：同一高度口径
  expect((await probe(h.main, '[data-testid="todo-row"]'))!.padding, '主窗待办行').toBe(ROW)
  expect((await probe(h.quick, '[data-testid="tpl-row"]'))!.padding, '模板行').toBe(ROW)
  expect((await probe(h.done, '[data-testid="done-row"]'))!.padding, '已完成行').toBe(ROW)

  // 三窗列表 gap 8 + win-body 顶距 8
  expect((await probe(h.main, '.scroll'))!.gap, '主窗列表 gap').toBe('8px')
  expect((await probe(h.quick, '.scroll'))!.gap, '快捷窗列表 gap').toBe('8px')
  expect((await probe(h.done, '.scroll'))!.gap, '已完成窗列表 gap').toBe('8px')
  for (const [name, page] of [['主窗', h.main], ['快捷窗', h.quick], ['已完成窗', h.done]] as const) {
    const pt = await page.evaluate(() => getComputedStyle(document.querySelector('.win-body') as Element).paddingTop)
    expect(pt, `${name} win-body 顶距`).toBe('8px')
  }

  // 历史窗：行 padding / 列表 gap / 行内容字号与行高
  const hp = h.app.waitForEvent('window')
  await h.done.click('[data-testid="done-history"]')
  const hist = await hp
  await hist.waitForSelector('[data-testid="hist-row"]')
  expect((await probe(hist as never, '[data-testid="hist-row"]'))!.padding, '历史行').toBe(ROW)
  expect((await probe(hist as never, '.list'))!.gap, '历史列表 gap').toBe('8px')
  const histContent = await hist.evaluate(() => {
    const el = document.querySelector('[data-testid="hist-row"] .content') as HTMLElement
    const cs = getComputedStyle(el)
    return { fs: cs.fontSize, lh: cs.lineHeight }
  })
  expect(histContent.fs).toBe('13.5px')
  expect(histContent.lh).toBe('20.25px') // 13.5 × 1.5

  await h.close()
})

test('L2-④：空态与输入字号（空态 heading 15 / 输入 body 13.5 + 行高 1.5）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.done.waitForSelector('[data-testid="done-panel"]')
  await h.main.waitForTimeout(300)

  // 主窗空态：主文案 heading 15、副文案 caption 11
  const mainEmpty = await h.main.evaluate(() => {
    const main = document.querySelector('.empty-main') as HTMLElement
    const sub = document.querySelector('.empty-sub') as HTMLElement
    return { main: getComputedStyle(main).fontSize, sub: getComputedStyle(sub).fontSize }
  })
  expect(mainEmpty.main).toBe('15px')
  expect(mainEmpty.sub).toBe('11px')

  // 已完成窗空态：heading 15
  const doneEmpty = await h.done.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="done-empty"]') as Element).fontSize
  )
  expect(doneEmpty).toBe('15px')

  // 新建待办输入框：body 13.5 + 行高 1.5（textarea 无文本节点，单独断言）
  const np = h.app.waitForEvent('window')
  await h.main.click('[data-testid="op-new"]')
  const nwin = await np
  await nwin.waitForSelector('textarea')
  const ta = await nwin.evaluate(() => {
    const el = document.querySelector('textarea') as HTMLElement
    const cs = getComputedStyle(el)
    return { fs: cs.fontSize, lh: cs.lineHeight }
  })
  expect(ta.fs).toBe('13.5px')
  expect(ta.lh).toBe('20.25px')

  await h.close()
})
