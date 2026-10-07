/** 模态唤醒（用户 2026-10-07 新需求）：
 * 二级窗开着（模态锁定）时，点击锁定的组件窗任意可见处 → 应用整体浮到最上
 * （聚焦二级窗），锁定保持不变。
 * 背景：禁用窗口连点击事件都不产生（Windows 不向禁用窗投递鼠标）——
 * 常规点击激活不可用，需轮询「左键按下边缘 + 光标在组件窗内」判定。
 * 接线：electron/main/index.ts 模态期 50ms 轮询（GetAsyncKeyState+光标矩形判定）。 */

export interface ModalWakeInput {
  /** 本采样左键是否按下（GetAsyncKeyState VK_LBUTTON 符号位） */
  pressed: boolean
  /** 上一采样左键是否按下（按下边缘=pressed && !prevPressed） */
  prevPressed: boolean
  /** 光标是否位于任一可见组件窗矩形内 */
  cursorInside: boolean
  /** 是否有二级窗打开（模态锁激活中） */
  childOpen: boolean
}

/** 判定本次采样是否应唤醒应用（聚焦二级窗、整体浮前） */
export function shouldWakeModalFocus(input: ModalWakeInput): boolean {
  return input.childOpen && input.pressed && !input.prevPressed && input.cursorInside
}
