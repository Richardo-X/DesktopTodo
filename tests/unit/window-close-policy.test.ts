import { describe, it, expect } from 'vitest'
import { shouldBlockClusterClose, shouldBlockChildClose } from '../../src/core/utils/window-close-policy'

/**
 * 显隐途径收敛规格（用户定稿 2026-10-04）：
 * 组件的最小化/显隐仅有 3 条途径——
 *   ① 待办窗口右上角 × 按钮
 *   ② 双击托盘图标（切换）
 *   ③ 托盘右键菜单「显示/隐藏」（切换，恢复=最小化前窗口状态）
 * 系统级关闭请求（Alt+F4 → WM_CLOSE）对组件三窗一律无效：不关闭、不隐藏，
 * 仅应用退出流程（before-quit 标记后）放行关闭。
 * 二级窗口不在此列：自有关闭按钮（←/×）与 Alt+F4 均按普通窗口关闭。
 */
describe('window-close-policy 组件窗口关闭策略', () => {
  it('非退出流程：组件窗口关闭必须阻止（Alt+F4=无效，不关闭不隐藏）', () => {
    expect(shouldBlockClusterClose(false)).toBe(true)
  })

  it('退出流程（before-quit 已标记）：放行关闭，否则应用无法退出', () => {
    expect(shouldBlockClusterClose(true)).toBe(false)
  })

  it('二级窗口关闭永不阻止（自有 ←/× 按钮与 Alt+F4 均为合法关闭）', () => {
    expect(shouldBlockChildClose()).toBe(false)
  })
})
