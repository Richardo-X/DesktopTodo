import { app } from 'electron'
import { execFile } from 'node:child_process'

/** 清除 Windows"启动项已禁用"标记（2026-10-10 自启修复）：用户在任务管理器/设置
 * "启动应用"里禁用过本应用时，系统在 StartupApproved\Run 写入禁用标记——Run 键仍在
 * （Electron 回读 openAtLogin=true 显示开启），但开机被系统跳过=用户报告的"开关开着却
 * 无法自启"。删除该标记值 = 系统视为启用（用户主动开启开关即意图自启）。
 * 用 reg.exe 删除：零 koffi 依赖、值不存在时报错可忽略（silent） */
function clearStartupDisabledMark(): void {
  if (process.platform !== 'win32') return
  const key = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
  execFile('reg.exe', ['delete', key, '/v', app.getName(), '/f'], () => {
    /* 值不存在（未禁用过）或删除失败均无需处理：Run 键已由 setLoginItemSettings 写入 */
  })
}

/**
 * 开机自启（PRD §5.7-5，默认关闭；自启后直接显示窗口）。
 * 显式传入 exe 路径：规避安装路径含空格导致自启失效（§7 风险 9）。
 */
export function loginItemSettingsFor(enabled: boolean): { openAtLogin: boolean; path: string } {
  return { openAtLogin: enabled, path: app.getPath('exe') }
}

export function setAutoStart(enabled: boolean): boolean {
  // 批次 C-3：开发版（未打包）禁止写自启注册表——此前开发版 electron.exe
  // 曾把自身写进 HKCU Run 键，用户开机出现 Electron 空窗口（实测事故）
  if (!app.isPackaged) return false
  app.setLoginItemSettings(loginItemSettingsFor(enabled))
  if (enabled) clearStartupDisabledMark() // 清除系统禁用标记（详见函数注释）
  // 三轮：写后回读校验——Windows 策略可能拦截（任务管理器禁用启动应用等）
  try {
    return app.getLoginItemSettings().openAtLogin === enabled
  } catch {
    return false
  }
}

export function getAutoStart(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return false
  }
}

/** 三轮：每次启动按用户设置重写登录项——安装版开关开启但开机未启动的防御
 * （升级/移动安装目录后旧路径失效；写后回读即真实生效状态） */
export function syncAutoStartOnBoot(enabled: boolean): boolean {
  if (!enabled) return false
  return setAutoStart(true)
}
