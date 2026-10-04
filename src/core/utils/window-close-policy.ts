/**
 * 显隐途径收敛规格（用户定稿 2026-10-04）：
 * 组件的最小化/显隐仅有 3 条途径——
 *   ① 待办窗口右上角 × 按钮（hideToTray）
 *   ② 双击托盘图标（切换）
 *   ③ 托盘右键菜单「显示/隐藏」（切换；恢复=最小化前窗口状态）
 * 系统级关闭请求（Alt+F4 → WM_CLOSE → Electron close 事件）对组件三窗
 * 一律无效：不关闭、不隐藏。仅应用退出流程（before-quit 先行标记）放行，
 * 否则应用永远无法退出。
 * 二级窗口不在此列：自有 ←/× 按钮与 Alt+F4 均为合法关闭（普通窗口范式）。
 */

/** 组件窗口（快捷添加/待办/已完成）是否应阻止本次关闭 */
export function shouldBlockClusterClose(isQuitting: boolean): boolean {
  return !isQuitting
}

/** 二级窗口是否应阻止本次关闭（永不阻止） */
export function shouldBlockChildClose(): boolean {
  return false
}
