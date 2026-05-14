/**
 * 全局错误处理
 * 统一捕获 Vue 组件错误、未处理的 Promise 拒绝、运行时异常
 */
import type { App, ComponentPublicInstance } from 'vue'
import { toast } from './toast'

/** 错误严重级别 */
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

/** 错误上下文 */
interface ErrorContext {
  component?: string
  hook?: string
  source?: string
  severity: ErrorSeverity
}

/** 判断错误严重级别 */
function classifyError(error: unknown, info?: string): ErrorSeverity {
  const message = error instanceof Error ? error.message : String(error)

  // 已知的非致命错误 — 忽略
  if (isKnownHarmlessError(message)) return 'low'

  // 网络/API 错误 — 中等
  if (/API 请求失败|fetch|network|timeout|超时/i.test(message)) return 'medium'

  // AI 相关错误 — 低（用户可重试）
  if (/AI|stream|SSE|模型/i.test(message)) return 'low'

  // 渲染错误 — 仅在确实是严重渲染崩溃时才标记为 high
  // 普通的属性访问错误、undefined 等在渲染中很常见，不应该弹 Toast
  if (info?.includes('render') || info?.includes('mounted')) {
    // 只有真正导致组件无法渲染的错误才是 high
    if (/Maximum call stack|out of memory|chunk.*failed/i.test(message)) return 'high'
    // 其他渲染错误降级为 low，仅记录日志
    return 'low'
  }

  // 未知错误 — 中等
  return 'medium'
}

/** 已知的非致命错误（不需要提示用户） */
function isKnownHarmlessError(message: string): boolean {
  const harmlessPatterns = [
    /ResizeObserver loop/i,
    /Cannot read properties of null.*reading 'offsetHeight'/i,
    /Cannot read properties of null.*reading 'offsetWidth'/i,
    /Cannot read properties of undefined/i,
    /null is not an object.*evaluating/i,
    /Attempting to parse an unsupported color function/i,
    /Non-Error promise rejection/i,
    /Loading chunk.*failed/i,
    /dynamically imported module/i,
    /navigation cancelled/i,
    /Avoided redundant navigation/i,
    /popstate/i,
  ]
  return harmlessPatterns.some(pattern => pattern.test(message))
}

/** 格式化错误消息（用户友好） */
function formatUserMessage(error: unknown, context: ErrorContext): string {
  const message = error instanceof Error ? error.message : String(error)

  // API 错误
  if (/API 请求失败 \(401\)/i.test(message)) return 'API 密钥无效，请检查配置'
  if (/API 请求失败 \(403\)/i.test(message)) return 'API 访问被拒绝，请检查权限'
  if (/API 请求失败 \(429\)/i.test(message)) return 'API 请求过于频繁，请稍后重试'
  if (/API 请求失败 \(5\d{2}\)/i.test(message)) return 'AI 服务暂时不可用，请稍后重试'
  if (/超时|timeout/i.test(message)) return '请求超时，请检查网络连接'
  if (/network|fetch|Failed to fetch/i.test(message)) return '网络连接失败，请检查网络'

  // 存储错误
  if (/quota|storage|localStorage/i.test(message)) return '存储空间不足，建议导出数据后清理'

  // 通用错误
  if (context.severity === 'high' || context.severity === 'critical') {
    return `页面出现异常${context.component ? `（${context.component}）` : ''}，请刷新重试`
  }

  // 截断过长的错误消息
  if (message.length > 80) return `${message.slice(0, 77)}...`
  return message
}

/** 错误日志记录 */
function logError(error: unknown, context: ErrorContext) {
  const timestamp = new Date().toISOString()
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  console.group(`[PrepWise Error] ${timestamp}`)
  console.error('Message:', message)
  console.info('Context:', context)
  if (stack) console.debug('Stack:', stack)
  console.groupEnd()
}

/** 已显示的错误消息去重（避免短时间内重复提示） */
const recentErrors = new Map<string, number>()
const ERROR_DEDUP_INTERVAL = 3000

function shouldShowToast(message: string): boolean {
  const now = Date.now()
  const lastShown = recentErrors.get(message)
  if (lastShown && now - lastShown < ERROR_DEDUP_INTERVAL) {
    return false
  }
  recentErrors.set(message, now)

  // 清理过期记录
  if (recentErrors.size > 20) {
    for (const [key, time] of recentErrors) {
      if (now - time > ERROR_DEDUP_INTERVAL * 2) {
        recentErrors.delete(key)
      }
    }
  }

  return true
}

/** 安装全局错误处理器 */
export function setupErrorHandler(app: App) {
  // Vue 组件错误
  app.config.errorHandler = (error: unknown, instance: ComponentPublicInstance | null, info: string) => {
    const componentName = instance?.$options?.name || instance?.$options?.__name || '未知组件'
    const severity = classifyError(error, info)

    const context: ErrorContext = {
      component: componentName,
      hook: info,
      source: 'vue-error-handler',
      severity,
    }

    logError(error, context)

    // 仅对中等及以上严重级别显示 Toast
    if (severity !== 'low') {
      const userMessage = formatUserMessage(error, context)
      if (shouldShowToast(userMessage)) {
        toast.error(userMessage)
      }
    }
  }

  // Vue 警告（仅开发环境）
  if (import.meta.env.DEV) {
    app.config.warnHandler = (msg: string, instance: ComponentPublicInstance | null, trace: string) => {
      const componentName = instance?.$options?.name || instance?.$options?.__name || '未知'
      console.warn(`[Vue Warn] ${componentName}: ${msg}`, trace)
    }
  }

  // 未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const error = event.reason
    const severity = classifyError(error)

    // AbortError 不需要提示（用户主动取消）
    if (error instanceof DOMException && error.name === 'AbortError') return

    const context: ErrorContext = {
      source: 'unhandled-rejection',
      severity,
    }

    logError(error, context)

    if (severity !== 'low') {
      const userMessage = formatUserMessage(error, context)
      if (shouldShowToast(userMessage)) {
        toast.error(userMessage)
      }
    }

    // 阻止默认的控制台错误输出（已经在 logError 中处理）
    event.preventDefault()
  })

  // 全局运行时错误
  window.addEventListener('error', (event: ErrorEvent) => {
    // 忽略资源加载错误（图片、脚本等）
    if (event.target && (event.target as HTMLElement).tagName) return

    const error = event.error || event.message
    const severity = classifyError(error)

    // 如果是已知无害错误，仅记录不提示
    if (severity === 'low') {
      logError(error, { source: 'window-error', severity })
      return
    }

    const context: ErrorContext = {
      source: 'window-error',
      severity,
    }

    logError(error, context)

    const userMessage = formatUserMessage(error, context)
    if (shouldShowToast(userMessage)) {
      toast.error(userMessage)
    }
  })
}
