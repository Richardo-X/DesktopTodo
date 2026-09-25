import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'dtodo-repro-'))
const app = await electron.launch({
  args: ['out/main/index.js'],
  cwd: process.cwd(),
  env: { ...process.env, DTODO_TEST: '1', DTODO_USER_DATA: userData }
})
const main = await app.firstWindow()
await main.waitForSelector('[data-testid="home-panel"]', { timeout: 15000 })
await main.waitForTimeout(500)

const shot = (name) => main.screenshot({ path: `.repro-${name}.png` })
const geom = () => main.evaluate(() => {
  const s = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  return { quick: s('[data-testid="quick-panel"]'), home: s('[data-testid="home-panel"]'), done: s('[data-testid="done-panel"]'), vw: innerWidth, vh: innerHeight }
})
const winBounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).map(w => ({ x: w.getBounds().x, y: w.getBounds().y, w: w.getBounds().width, h: w.getBounds().height, vis: w.isVisible() })))

console.log('== 初始 ==', JSON.stringify({ page: await geom(), win: await winBounds() }))
await shot('1-initial')

// 开快捷添加
await main.click('[data-testid="op-quick-toggle"]')
await main.waitForTimeout(400)
console.log('== 开快捷后 ==', JSON.stringify({ page: await geom(), win: await winBounds() }))
await shot('2-quick-on')

// 关快捷添加
await main.click('[data-testid="op-quick-toggle"]')
await main.waitForTimeout(400)
console.log('== 关快捷后 ==', JSON.stringify({ page: await geom(), win: await winBounds() }))

// 拖二级窗口：打开新增待办，拖右下 grip 放大 60px 再缩小
const winP = app.waitForEvent('window')
await main.click('[data-testid="op-new"]')
const child = await winP
await child.waitForSelector('[data-testid="new-input"]', { timeout: 5000 })
await child.waitForTimeout(300)
const childGeom0 = await child.evaluate(() => { const r = document.querySelector('.child-window').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
console.log('== 子窗初始 ==', JSON.stringify(childGeom0), 'win:', JSON.stringify(await winBounds()))

// 用 CDP 拿 grip 位置后以鼠标事件拖动（pointerdown → move → up）
const grip = child.locator('.child-grip')
const gb = await grip.boundingBox()
console.log('grip box:', JSON.stringify(gb))
// browser context 可用 mouse
const page = child
await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
await page.mouse.down()
for (let i = 1; i <= 12; i++) { await page.mouse.move(gb.x + gb.width / 2 + i * 5, gb.y + gb.height / 2 + i * 5); await page.waitForTimeout(30) }
await page.mouse.up()
await page.waitForTimeout(400)
console.log('== 子窗放大拖动后 ==', JSON.stringify({ geom: await child.evaluate(() => { const r = document.querySelector('.child-window').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }), win: await winBounds() }))
await shot('3-child-big')

await app.close()
console.log('DONE')
