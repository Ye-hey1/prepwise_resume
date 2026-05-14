/**
 * JD 感知优化
 * 在 AI 优化时注入 JD 分析的核心要求，使优化结果更贴合目标岗位
 */
import { useJdAnalysisStore } from '@/stores/jdAnalysis'

export interface JdOptimizeContext {
  hasJdData: boolean
  targetCompany: string
  targetPosition: string
  mustHaveSkills: string[]
  jobDuties: string[]
  resumeGaps: string[]
}

/** 从 JD 分析 store 中提取优化上下文 */
export function getJdOptimizeContext(): JdOptimizeContext {
  const jdStore = useJdAnalysisStore()

  if (!jdStore.jdData) {
    return {
      hasJdData: false,
      targetCompany: '',
      targetPosition: '',
      mustHaveSkills: [],
      jobDuties: [],
      resumeGaps: [],
    }
  }

  const mustHaveSkills = [
    ...jdStore.jdData.requirements.techStack,
    ...jdStore.jdData.requirements.mustHave.map(item => item.text),
  ].slice(0, 8)

  const jobDuties = jdStore.jdData.requirements.jobDuties.slice(0, 5)

  // 从匹配结果中提取简历缺口
  const resumeGaps = jdStore.matchResult?.matches
    .filter(m => (m.riskGaps?.length ?? 0) > 0)
    .map(m => m.requirement)
    .slice(0, 4) ?? []

  return {
    hasJdData: true,
    targetCompany: jdStore.targetCompany || jdStore.jdData.basicInfo.company || '',
    targetPosition: jdStore.targetPosition || jdStore.jdData.basicInfo.jobTitle || '',
    mustHaveSkills,
    jobDuties,
    resumeGaps,
  }
}

/** 构建 JD 感知的优化补充 prompt */
export function buildJdAwarePromptSuffix(context: JdOptimizeContext): string {
  if (!context.hasJdData) return ''

  const parts: string[] = []
  parts.push('\n\n--- JD 岗位要求参考（请在优化时重点体现以下方面）---')

  if (context.targetPosition) {
    parts.push(`目标岗位：${context.targetCompany ? `${context.targetCompany} - ` : ''}${context.targetPosition}`)
  }

  if (context.mustHaveSkills.length > 0) {
    parts.push(`核心技能要求：${context.mustHaveSkills.join('、')}`)
  }

  if (context.jobDuties.length > 0) {
    parts.push(`岗位职责重点：${context.jobDuties.join('；')}`)
  }

  if (context.resumeGaps.length > 0) {
    parts.push(`当前简历缺口（需重点补强）：${context.resumeGaps.join('；')}`)
  }

  parts.push('请在优化内容中自然融入上述关键词和能力要求，但不要生硬堆砌。')

  return parts.join('\n')
}
