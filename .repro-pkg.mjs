import { _electron as electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdtempSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const userData = mkdtempSync(join(tmpdir(), 'dtodo-pkg-'))
copyFileSync(resolve('.repro-data/data.json'), join(userData, 'data.json'))

const app = await electron.launch({
  executablePath: resolve('dist/win-unpacked/桌面待办.exe'),
  args: [],
  cwd: resolve('dist/win-unpacked'),
  env: { ...process.env, DTODO_TEST: '1', DTODO_USER_DATA: userData }
})
await app.waitForEvent('window', { timeout: 10000 }).catch(e => console.log('NO WINDOW EVENT:', e.message))
const wins = app.windows()
console.log('windows count:', wins.length)
for (const w of wins) {
  console.log('  url:', w.url(), '| title:', await w.title().catch(() => 'n/a'))
}
const states = await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).map(w => ({
    id: w.id, vis: w.isVisible(), shown: !w.isMinimized(), bounds: w.getBounds(), readyPaint: true
  }))
).catch(e => { console.log('EVAL ERR:', e.message); return null })
console.log('win states:', JSON.stringify(states))

const main = wins[0]
if (main) {
  main.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 300)) })
  await main.waitForTimeout(2000)
  const page = await main.evaluate(() => ({ ready: document.readyState, appHtmlLen: document.getElementById('app')?.innerHTML.length ?? -1 }))
  console.log('page:', JSON.stringify(page))
  await main.screenshot({ path: '.repro-pkg.png' }).catch(e => console.log('shot err:', e.message))
}
await app.close()
console.log('DONE')
