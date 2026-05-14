/**
 * 全局 Toast 通知系统
 * 轻量级通知，用于错误提示、操作反馈等
 */
import { reactive } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration: number
  createdAt: number
}

const MAX_TOASTS = 5

export const toastState = reactive<{
  items: ToastItem[]
}>({
  items: [],
})

let idCounter = 0

function generateId(): string {
  return `toast_${Date.now()}_${++idCounter}`
}

function removeToast(id: string) {
  const index = toastState.items.findIndex(item => item.id === id)
  if (index >= 0) {
    toastState.items.splice(index, 1)
  }
}

export function showToast(message: string, type: ToastType = 'info', duration = 4000): string {
  const id = generateId()

  const item: ToastItem = {
    id,
    type,
    message,
    duration,
    createdAt: Date.now(),
  }

  toastState.items.push(item)

  // 限制最大数量
  while (toastState.items.length > MAX_TOASTS) {
    toastState.items.shift()
  }

  // 自动移除
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration)
  }

  return id
}

export function dismissToast(id: string) {
  removeToast(id)
}

export function clearAllToasts() {
  toastState.items.splice(0, toastState.items.length)
}

// 便捷方法
export const toast = {
  info: (msg: string, duration?: number) => showToast(msg, 'info', duration),
  success: (msg: string, duration?: number) => showToast(msg, 'success', duration),
  warning: (msg: string, duration?: number) => showToast(msg, 'warning', duration),
  error: (msg: string, duration?: number) => showToast(msg, 'error', duration ?? 6000),
}
