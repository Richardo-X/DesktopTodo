import { app } from 'electron'

/**
 * 开机自启（PRD §5.7-5，默认关闭；自启后直接显示窗口）。
 * 显式传入 exe 路径：规避安装路径含空格导致自启失效（§7 风险 9）。
 */
export function loginItemSettingsFor(enabled: boolean): { openAtLogin: boolean; path: string } {
  return { openAtLogin: enabled, path: app.getPath('exe') }
}

export function setAutoStart(enabled: boolean): boolean {
  app.setLoginItemSettings(loginItemSettingsFor(enabled))
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
