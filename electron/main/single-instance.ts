import { app } from 'electron'

/**
 * 单实例锁（PRD §2.2：已运行时再双击 exe 只调出现有窗口）。
 * 返回 false 表示已有实例在运行，本进程应立即退出。
 */
export function acquireSingleInstanceLock(onSecondLaunch: () => void): boolean {
  const got = app.requestSingleInstanceLock()
  if (!got) return false
  app.on('second-instance', onSecondLaunch)
  return true
}
