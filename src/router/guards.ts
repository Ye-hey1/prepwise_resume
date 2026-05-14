/**
 * 路由守卫
 * 检测 AI 配置状态、简历数据状态，提供引导提示
 */
import type { Router } from 'vue-router'
import { toast } from '@/utils/toast'

/** 需要 AI 配置的路由 */
const AI_REQUIRED_ROUTES = new Set(['ai-interviewer', 'jd-analysis'])

/** 需要简历数据的路由 */
const RESUME_REQUIRED_ROUTES = new Set(['jd-analysis'])

/** 检查 AI 配置是否完成 */
function hasAiConfig(): boolean {
  try {
    const raw = localStorage.getItem('resume-builder-ai-config-v2')
    if (!raw) return false
    const data = JSON.parse(raw)
    return Array.isArray(data.channels) && data.channels.length > 0
  } catch {
    return false
  }
}

/** 检查是否有简历数据 */
function hasResumeData(): boolean {
  try {
    const raw = localStorage.getItem('resume-builder-data')
    if (!raw) return false
    const data = JSON.parse(raw)
    // 至少有姓名或工作经历
    return Boolean(data.basicInfo?.name?.trim() || data.workList?.some((w: { company?: string }) => w.company?.trim()))
  } catch {
    return false
  }
}

/** 已提示过的路由（避免重复提示） */
const notifiedRoutes = new Set<string>()

export function setupRouterGuards(router: Router) {
  router.beforeEach((to, _from, next) => {
    const routeName = to.name as string | undefined

    if (!routeName) {
      next()
      return
    }

    // AI 配置检查
    if (AI_REQUIRED_ROUTES.has(routeName) && !hasAiConfig()) {
      const notifyKey = `ai-config-${routeName}`
      if (!notifiedRoutes.has(notifyKey)) {
        notifiedRoutes.add(notifyKey)
        toast.warning('请先配置 AI 模型（点击左下角云朵图标），否则 AI 功能无法使用')
        // 5 分钟后允许再次提示
        setTimeout(() => notifiedRoutes.delete(notifyKey), 300_000)
      }
    }

    // 简历数据检查
    if (RESUME_REQUIRED_ROUTES.has(routeName) && !hasResumeData()) {
      const notifyKey = `resume-data-${routeName}`
      if (!notifiedRoutes.has(notifyKey)) {
        notifiedRoutes.add(notifyKey)
        toast.info('建议先填写简历内容，JD 分析将基于你的简历进行匹配')
        setTimeout(() => notifiedRoutes.delete(notifyKey), 300_000)
      }
    }

    next()
  })
}
