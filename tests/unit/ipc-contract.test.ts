import { describe, expect, it } from 'vitest'
import { IPC } from '../../src/ipc/contract'

/** B1（决策#1）：点击穿透彻底移除——缝隙不再响应桌面操作，穿透通道与命中检测全部退场 */
describe('IPC 契约：点击穿透移除', () => {
  it('IPC 通道集合不含 setIgnoreMouseEvents', () => {
    expect(Object.values(IPC)).not.toContain('window:set-ignore-mouse-events')
    expect(Object.keys(IPC)).not.toContain('setIgnoreMouseEvents')
  })
})
