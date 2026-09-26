export interface DblClickGuard {
  mark(): void
  blocked(): boolean
}

/** 连点保护窗（三轮反馈 8.2-9）：勾选框/反选框只有 20px，连点时第二击常偏出按钮落到行上，
 * 被系统合成为「行双击」而误开编辑/详情窗口。点击勾选框后的 windowMs 内忽略行双击。 */
export function createDblClickGuard(windowMs = 450, now: () => number = Date.now): DblClickGuard {
  let markedAt = Number.NEGATIVE_INFINITY
  return {
    mark(): void {
      markedAt = now()
    },
    blocked(): boolean {
      return now() - markedAt < windowMs
    }
  }
}
