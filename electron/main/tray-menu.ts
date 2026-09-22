/**
 * 托盘右键菜单配置与退出确认文案（纯函数，PRD §2.2 / 速查 #3）。
 * Electron 侧把 id 映射为实际动作；退出是唯一关闭途径，必经确认框。
 */

export interface TrayMenuItem {
  id: 'toggle-visibility' | 'exit'
  label: string
  /** 退出项点击后必须弹确认框 */
  requiresConfirm?: boolean
  /** 标注唯一退出途径（文档性，防止未来误加退出入口） */
  onlyExitPath?: boolean
}

export function buildTrayContextMenu(state: { visible: boolean }): TrayMenuItem[] {
  return [
    { id: 'toggle-visibility', label: state.visible ? '隐藏' : '显示' },
    { id: 'exit', label: '退出', requiresConfirm: true, onlyExitPath: true }
  ]
}

/** 退出确认框文案；有未保存编辑输入时一并提示（速查 #3） */
export function exitConfirmMessage(hasUnsavedInput: boolean): string {
  const base = '确定要退出桌面待办吗？退出后组件将从桌面消失，可再次打开。'
  return hasUnsavedInput ? `编辑窗口中还有未保存的内容，退出后将丢失。\n${base}` : base
}
