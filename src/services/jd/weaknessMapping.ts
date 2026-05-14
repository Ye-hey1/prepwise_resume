import type { JdPrepModuleKey } from '@/services/types/jd'
import type { JDSuggestion } from '@/services/types/jd'
import type { ScoreBreakdown } from '@/components/ai/interview/types'
import { normalizeSuggestionContent } from './normalizers'

/** 评分维度 → 简历模块映射 */
const SCORE_DIMENSION_MAP: Array<{ key: keyof ScoreBreakdown; module: JdPrepModuleKey }> = [
  { key: 'projectScore', module: 'projectExperience' },
  { key: 'skillScore', module: 'skills' },
  { key: 'workScore', module: 'workExperience' },
  { key: 'educationScore', module: 'education' },
]

/** 低于此阈值的评分维度视为薄弱模块 */
const WEAK_THRESHOLD = 70

/**
 * 将面试评分维度映射到薄弱简历模块
 * 仅返回分数低于阈值的维度对应模块
 */
export function mapScoreBreakdownToWeakModules(scoreBreakdown: ScoreBreakdown | null): JdPrepModuleKey[] {
  if (!scoreBreakdown) return []
  return SCORE_DIMENSION_MAP
    .filter(({ key }) => {
      const score = scoreBreakdown[key]
      return typeof score === 'number' && score < WEAK_THRESHOLD
    })
    .map(({ module }) => module)
}

/** 弱项文本关键词 → 简历模块启发式映射 */
const WEAKNESS_KEYWORD_MAP: Array<{ keywords: RegExp; module: JdPrepModuleKey }> = [
  { keywords: /项目|功能|上线|迭代|交付|需求|产品|PM|里程碑|架构设计/, module: 'projectExperience' },
  { keywords: /技能|技术栈|框架|语言|工具|编程|算法|数据结构|设计模式/, module: 'skills' },
  { keywords: /工作|公司|团队|协作|管理|职责|业绩|KPI|OKR/, module: 'workExperience' },
  { keywords: /学历|教育|毕业|学校|专业|课程|学术|论文|GPA/, module: 'education' },
  { keywords: /自我介绍|总结|概述|个人|表达|沟通|逻辑/, module: 'selfIntro' },
  { keywords: /获奖|证书|荣誉|竞赛|成就|专利|论文/, module: 'awards' },
]

/**
 * 将弱项文本分类到简历模块
 * 返回每条弱项及其对应的建议模块列表
 */
export function mapWeaknessTextsToModules(
  weaknesses: string[],
): Array<{ weakness: string; suggestedModules: JdPrepModuleKey[] }> {
  return weaknesses.map((text) => {
    const modules = WEAKNESS_KEYWORD_MAP
      .filter(({ keywords }) => keywords.test(text))
      .map(({ module }) => module)
    return {
      weakness: text,
      suggestedModules: modules.length > 0 ? modules : ['selfIntro' as JdPrepModuleKey],
    }
  })
}

/**
 * 基于面试表现生成针对性优化建议
 * 与已有建议去重后合并
 */
export function buildInterviewDrivenSuggestions(
  weaknesses: string[],
  weakModules: JdPrepModuleKey[],
  existingSuggestions: JDSuggestion[],
): JDSuggestion[] {
  const existingKeys = new Set(
    existingSuggestions.map((s) => normalizeSuggestionContent(s.reason)),
  )

  const newSuggestions: JDSuggestion[] = []

  for (const weakness of weaknesses) {
    const key = weakness.toLowerCase().trim()
    if (!key || existingKeys.has(key)) continue

    // 根据弱项匹配的模块，或使用弱模块列表
    const mapped = mapWeaknessTextsToModules([weakness])
    const section = mapped[0]?.suggestedModules[0] ?? weakModules[0] ?? 'selfIntro'

    newSuggestions.push({
      section,
      issueType: 'interview-weakness',
      originalText: '',
      suggestedText: '',
      priority: 'high',
      reason: `[面试发现] ${weakness}`,
    })
    existingKeys.add(key)
  }

  return newSuggestions
}
