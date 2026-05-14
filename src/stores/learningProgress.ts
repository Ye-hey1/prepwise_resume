/**
 * 学习进度 Store
 * 跟踪面试练习的各维度掌握度变化，支持雷达图可视化和趋势分析
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/** 能力维度定义 */
export type SkillDimension =
  | 'technical'       // 技术深度
  | 'projectDesign'   // 项目设计
  | 'communication'   // 表达沟通
  | 'problemSolving'  // 问题解决
  | 'businessSense'   // 业务理解
  | 'systemThinking'  // 系统思维

export interface DimensionMeta {
  key: SkillDimension
  label: string
  description: string
}

export const SKILL_DIMENSIONS: DimensionMeta[] = [
  { key: 'technical', label: '技术深度', description: '对技术原理、实现细节的掌握程度' },
  { key: 'projectDesign', label: '项目设计', description: '架构设计、方案选型的能力' },
  { key: 'communication', label: '表达沟通', description: '清晰表达、逻辑组织的能力' },
  { key: 'problemSolving', label: '问题解决', description: '分析问题、提出解决方案的能力' },
  { key: 'businessSense', label: '业务理解', description: '对业务场景、需求的理解深度' },
  { key: 'systemThinking', label: '系统思维', description: '全局视角、权衡取舍的能力' },
]

/** 单次评估记录 */
export interface ProgressRecord {
  id: string
  analysisId: string       // 关联的 JD 分析 ID
  interviewRecordId: string // 关联的面试记录 ID
  scores: Record<SkillDimension, number>  // 各维度得分 0-100
  totalScore: number
  weaknesses: string[]
  strengths: string[]
  timestamp: string
}

/** 维度趋势数据点 */
export interface TrendPoint {
  timestamp: string
  score: number
}

const STORAGE_KEY = 'prepwise-learning-progress'

export const useLearningProgressStore = defineStore('learningProgress', () => {
  const records = ref<ProgressRecord[]>([])

  /** 当前各维度最新得分（用于雷达图） */
  const currentScores = computed<Record<SkillDimension, number>>(() => {
    const latest: Record<SkillDimension, number> = {
      technical: 0,
      projectDesign: 0,
      communication: 0,
      problemSolving: 0,
      businessSense: 0,
      systemThinking: 0,
    }

    if (records.value.length === 0) return latest

    // 取最近 3 次的加权平均（最近的权重更高）
    const recentRecords = [...records.value]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 3)

    const weights = [0.5, 0.3, 0.2]

    for (const dimension of SKILL_DIMENSIONS) {
      let weightedSum = 0
      let totalWeight = 0

      recentRecords.forEach((record, index) => {
        const weight = weights[index] ?? 0.1
        const score = record.scores[dimension.key] ?? 0
        weightedSum += score * weight
        totalWeight += weight
      })

      latest[dimension.key] = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
    }

    return latest
  })

  /** 各维度趋势数据 */
  const dimensionTrends = computed<Record<SkillDimension, TrendPoint[]>>(() => {
    const trends: Record<SkillDimension, TrendPoint[]> = {
      technical: [],
      projectDesign: [],
      communication: [],
      problemSolving: [],
      businessSense: [],
      systemThinking: [],
    }

    const sorted = [...records.value].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )

    for (const record of sorted) {
      for (const dimension of SKILL_DIMENSIONS) {
        trends[dimension.key].push({
          timestamp: record.timestamp,
          score: record.scores[dimension.key] ?? 0,
        })
      }
    }

    return trends
  })

  /** 总分趋势 */
  const totalScoreTrend = computed<TrendPoint[]>(() => {
    return [...records.value]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(record => ({
        timestamp: record.timestamp,
        score: record.totalScore,
      }))
  })

  /** 薄弱维度（得分低于 60 的维度） */
  const weakDimensions = computed<SkillDimension[]>(() => {
    return SKILL_DIMENSIONS
      .filter(d => currentScores.value[d.key] < 60 && currentScores.value[d.key] > 0)
      .map(d => d.key)
  })

  /** 优势维度（得分高于 80 的维度） */
  const strongDimensions = computed<SkillDimension[]>(() => {
    return SKILL_DIMENSIONS
      .filter(d => currentScores.value[d.key] >= 80)
      .map(d => d.key)
  })

  /** 进步最大的维度 */
  const mostImprovedDimension = computed<SkillDimension | null>(() => {
    if (records.value.length < 2) return null

    let maxImprovement = 0
    let bestDimension: SkillDimension | null = null

    for (const dimension of SKILL_DIMENSIONS) {
      const trend = dimensionTrends.value[dimension.key]
      if (trend.length < 2) continue

      const first = trend[0]!.score
      const last = trend[trend.length - 1]!.score
      const improvement = last - first

      if (improvement > maxImprovement) {
        maxImprovement = improvement
        bestDimension = dimension.key
      }
    }

    return bestDimension
  })

  /** 添加评估记录 */
  function addRecord(record: Omit<ProgressRecord, 'id'>) {
    const id = `progress_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    records.value.push({ ...record, id })
    saveToStorage()
  }

  /** 从面试评分中提取维度得分 */
  function extractDimensionScores(
    scoreBreakdown: Record<string, number> | null | undefined,
    weaknesses: string[],
  ): Record<SkillDimension, number> {
    const scores: Record<SkillDimension, number> = {
      technical: 0,
      projectDesign: 0,
      communication: 0,
      problemSolving: 0,
      businessSense: 0,
      systemThinking: 0,
    }

    if (!scoreBreakdown) return scores

    // 映射面试评分维度到学习维度
    const mappings: Record<string, SkillDimension[]> = {
      '技术深度': ['technical'],
      '技术广度': ['technical', 'systemThinking'],
      '项目经验': ['projectDesign', 'businessSense'],
      '架构设计': ['projectDesign', 'systemThinking'],
      '沟通表达': ['communication'],
      '逻辑思维': ['problemSolving', 'communication'],
      '问题解决': ['problemSolving'],
      '业务理解': ['businessSense'],
      '系统设计': ['systemThinking', 'projectDesign'],
      '代码质量': ['technical'],
      '学习能力': ['problemSolving'],
      // ScoreBreakdown 字段映射
      projectScore: ['projectDesign', 'businessSense'],
      skillScore: ['technical', 'problemSolving'],
      workScore: ['communication', 'systemThinking'],
      educationScore: ['problemSolving'],
    }

    const dimensionScoreSums: Record<SkillDimension, number[]> = {
      technical: [],
      projectDesign: [],
      communication: [],
      problemSolving: [],
      businessSense: [],
      systemThinking: [],
    }

    for (const [key, score] of Object.entries(scoreBreakdown)) {
      const dimensions = mappings[key]
      if (!dimensions) continue
      for (const dim of dimensions) {
        dimensionScoreSums[dim].push(score)
      }
    }

    // 计算各维度平均分
    for (const dimension of SKILL_DIMENSIONS) {
      const values = dimensionScoreSums[dimension.key]
      if (values.length > 0) {
        scores[dimension.key] = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      }
    }

    // 根据弱点描述微调得分
    const weaknessKeywords: Record<SkillDimension, string[]> = {
      technical: ['技术', '原理', '底层', '源码', '实现'],
      projectDesign: ['架构', '设计', '方案', '选型'],
      communication: ['表达', '沟通', '描述', '逻辑'],
      problemSolving: ['解决', '分析', '排查', '定位'],
      businessSense: ['业务', '需求', '场景', '用户'],
      systemThinking: ['全局', '权衡', '取舍', '系统'],
    }

    for (const weakness of weaknesses) {
      for (const [dim, keywords] of Object.entries(weaknessKeywords)) {
        if (keywords.some(kw => weakness.includes(kw))) {
          const current = scores[dim as SkillDimension]
          if (current > 0) {
            scores[dim as SkillDimension] = Math.max(current - 5, 20)
          }
        }
      }
    }

    return scores
  }

  /** 生成针对薄弱维度的练习建议 */
  function generatePracticeRecommendations(): Array<{ dimension: SkillDimension; suggestion: string }> {
    const recommendations: Array<{ dimension: SkillDimension; suggestion: string }> = []

    const suggestionMap: Record<SkillDimension, string[]> = {
      technical: [
        '深入学习核心技术的底层原理，准备"为什么选择这个技术"的回答',
        '整理项目中使用的关键技术的实现细节和优化点',
      ],
      projectDesign: [
        '梳理项目的架构演进过程，准备"如果重新设计会怎么做"的回答',
        '总结技术选型的决策过程和权衡因素',
      ],
      communication: [
        '练习用 STAR 法则组织回答，确保逻辑清晰',
        '准备 30 秒、1 分钟、3 分钟三个版本的项目介绍',
      ],
      problemSolving: [
        '整理项目中遇到的典型问题和解决过程',
        '准备"遇到过最难的技术问题"的完整故事',
      ],
      businessSense: [
        '理解项目的业务背景和商业价值',
        '准备"这个功能为什么这样设计"的业务视角回答',
      ],
      systemThinking: [
        '思考项目中的技术决策对整体系统的影响',
        '准备"如何处理高并发/高可用"等系统级问题',
      ],
    }

    for (const dim of weakDimensions.value) {
      const suggestions = suggestionMap[dim]
      if (suggestions && suggestions.length > 0) {
        const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)]!
        recommendations.push({ dimension: dim, suggestion: randomSuggestion })
      }
    }

    return recommendations
  }

  // ── 持久化 ──

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records: records.value }))
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (Array.isArray(data.records)) {
        records.value = data.records
      }
    } catch {
      console.warn('[LearningProgress] 加载失败')
    }
  }

  loadFromStorage()

  watch(records, () => saveToStorage(), { deep: true })

  return {
    records,
    currentScores,
    dimensionTrends,
    totalScoreTrend,
    weakDimensions,
    strongDimensions,
    mostImprovedDimension,
    addRecord,
    extractDimensionScores,
    generatePracticeRecommendations,
  }
})
