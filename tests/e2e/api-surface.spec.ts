import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'
import { IPC } from '../../src/ipc/contract'

/**
 * 回归防线（批次 B 验收轮教训）：preload 桥必须暴露 DesktopTodoApi 的完整方法面。
 * 缺一个方法会在 PanelWindow onMounted 中抛错，导致后续 document 监听器全部不注册
 * （表现为"整体无法拖动"等连环故障）——typecheck 无法捕捉（preload 与渲染层接口独立）。
 */
test('preload 桥暴露 DesktopTodoApi 完整方法面', async () => {
  const h = await launchApp()
  const keys = Object.keys(IPC)
  void keys
  const expected = [
    'getState',
    'getVersion',
    'getDataPath',
    'onStateUpdated',
    'commit',
    'flush',
    'setTopMost',
    'setVisibility',
    'setAutoStart',
    'saveCsv',
    'openCsv',
    'minimizeToTray',
    'setUnsavedEdits',
    'openChild',
    'closeSelf',
    'resizeSelf',
    'setTucked',
    'onWindowMoving',
    'bubbleShow',
    'bubbleHide',
    'bubbleResize',
    'onBubblePayload',
    'onCursorInside',
    'onSnapChanged',
    'onChildClosed',
    'clusterDragStart',
    'clusterDragEnd',
    'setBatchState',
    'onBatchState',
    'onChildCount',
    // 步1：白条独立窗命中上报/接收（白条窗→主进程→主窗）
    'barHit',
    'onBarHit'
  ]
  const present = await h.main.evaluate((list: string[]) => {
    const api = (window as unknown as { desktopTodo?: Record<string, unknown> }).desktopTodo
    if (!api) return null
    return list.filter((k) => typeof api[k] !== 'function')
  }, expected)
  expect(present, '缺失的 API 方法').toEqual([])
  await h.close()
})
