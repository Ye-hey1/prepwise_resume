/**
 * 备考包生成器
 * 生成个性化的面试备考包
 */

import type { SavedQuestion } from '@/stores/questionBank'
import type { AnchorResult } from '../interview/anchorEngine'

export interface PrepPackage {
  title: string
  generatedAt: string
  targetPosition: string
  candidateProfile: CandidateProfile
  gapAnalysis: GapAnalysis[]
  topQuestions: TopQuestion[]
  followUpChains: FollowUpChain[]
  sprintPlan: SprintPlan
  sourceList: SourceList
}

export interface CandidateProfile {
  summary: string
  topEvidence: Evidence[]
}

export interface Evidence {
  project: string
  points: string[]
  suitableFor: string
}

export interface GapAnalysis {
  dimension: string
  current: string
  risk: string
  suggestion: string
}

export interface TopQuestion {
  rank: number
  question: string
  sources: string[]
  answerPoints: string[]
  resumeAnchor: string
}

export interface FollowUpChain {
  theme: string
  resumeProject: string
  seedQuestion: string
  followUps: string[]
  preparationTips: string[]
}

export interface SprintPlan {
  days: SprintDay[]
}

export interface SprintDay {
  day: number
  theme: string
  tasks: string[]
}

export interface SourceList {
  xiaohongshu: SourceItem[]
  nowcoder: SourceItem[]
  github: SourceItem[]
  web: SourceItem[]
}

export interface SourceItem {
  url: string
  description: string
}

/**
 * 生成备考包
 */
export function generatePrepPackage(
  questions: SavedQuestion[],
  anchors: AnchorResult[],
  targetPosition: string,
  resumeText: string
): PrepPackage {
  const now = new Date()
  
  // 生成候选人定位
  const candidateProfile = generateCandidateProfile(resumeText, anchors)
  
  // 生成 Gap 分析
  const gapAnalysis = generateGapAnalysis(resumeText, targetPosition)
  
  // 生成高频题 Top N
  const topQuestions = generateTopQuestions(questions, anchors)
  
  // 生成追问链
  const followUpChains = generateFollowUpChains(anchors)
  
  // 生成冲刺计划
  const sprintPlan = generateSprintPlan(gapAnalysis)
  
  // 生成来源列表
  const sourceList = generateSourceList(questions)
  
  return {
    title: `${targetPosition}岗位备考包`,
    generatedAt: now.toISOString().split('T')[0],
    targetPosition,
    candidateProfile,
    gapAnalysis,
    topQuestions,
    followUpChains,
    sprintPlan,
    sourceList,
  }
}

/**
 * 生成候选人定位
 */
function generateCandidateProfile(
  resumeText: string,
  anchors: AnchorResult[]
): CandidateProfile {
  const summary = `基于简历分析，候选人具备扎实的技术基础和项目经验，特别在${getTopTechnologies(anchors).join('、')}方面有深入实践。`
  
  const topEvidence = anchors.slice(0, 3).map(anchor => ({
    project: anchor.resumeAnchor || '项目经验',
    points: anchor.followUpChain.slice(0, 2),
    suitableFor: anchor.question,
  }))
  
  return { summary, topEvidence }
}

/**
 * 获取高频技术栈
 */
function getTopTechnologies(anchors: AnchorResult[]): string[] {
  const techCount = new Map<string, number>()
  
  for (const anchor of anchors) {
    if (anchor.resumeAnchor) {
      techCount.set(anchor.resumeAnchor, (techCount.get(anchor.resumeAnchor) || 0) + 1)
    }
  }
  
  return Array.from(techCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tech]) => tech)
}

/**
 * 生成 Gap 分析
 */
function generateGapAnalysis(
  resumeText: string,
  targetPosition: string
): GapAnalysis[] {
  const dimensions = [
    {
      dimension: '技术理解',
      current: '具备基础技术栈',
      risk: '可能被追问底层原理',
      suggestion: '深入学习核心技术原理',
    },
    {
      dimension: '项目经验',
      current: '有实际项目经验',
      risk: '项目细节可能被深挖',
      suggestion: '准备项目架构图和关键决策点',
    },
    {
      dimension: '系统设计',
      current: '了解基本设计模式',
      risk: '高并发场景可能不熟悉',
      suggestion: '学习分布式系统设计',
    },
    {
      dimension: '算法能力',
      current: '基础算法掌握',
      risk: '复杂算法题可能卡壳',
      suggestion: '刷 LeetCode 中等难度题',
    },
  ]
  
  return dimensions
}

/**
 * 生成高频题
 */
function generateTopQuestions(
  questions: SavedQuestion[],
  anchors: AnchorResult[]
): TopQuestion[] {
  return questions.slice(0, 10).map((q, index) => {
    const anchor = anchors.find(a => a.question === q.content)
    
    return {
      rank: index + 1,
      question: q.content,
      sources: q.source_url ? [q.source_url] : ['AI 生成'],
      answerPoints: generateAnswerPoints(q.content),
      resumeAnchor: anchor?.resumeAnchor || '',
    }
  })
}

/**
 * 生成答题要点
 */
function generateAnswerPoints(question: string): string[] {
  const points: string[] = []
  
  if (question.includes('设计')) {
    points.push('明确需求和约束条件')
    points.push('提出多种设计方案')
    points.push('分析各方案优缺点')
    points.push('选择最适合的方案并说明理由')
  } else if (question.includes('优化')) {
    points.push('分析当前瓶颈')
    points.push('提出优化方案')
    points.push('量化优化效果')
    points.push('考虑权衡和副作用')
  } else {
    points.push('清晰阐述核心概念')
    points.push('结合实际项目经验')
    points.push('说明技术选型理由')
    points.push('总结经验教训')
  }
  
  return points
}

/**
 * 生成追问链
 */
function generateFollowUpChains(anchors: AnchorResult[]): FollowUpChain[] {
  return anchors
    .filter(a => a.isGrounded)
    .slice(0, 5)
    .map(anchor => ({
      theme: anchor.question,
      resumeProject: anchor.resumeAnchor,
      seedQuestion: anchor.question,
      followUps: anchor.followUpChain,
      preparationTips: [
        '准备具体的技术细节和数据',
        '思考项目中的关键决策点',
        '准备失败案例和改进方案',
      ],
    }))
}

/**
 * 生成冲刺计划
 */
function generateSprintPlan(gapAnalysis: GapAnalysis[]): SprintPlan {
  const days: SprintDay[] = [
    {
      day: 1,
      theme: '技术基础巩固',
      tasks: [
        '复习核心技术概念',
        '准备技术原理的回答框架',
      ],
    },
    {
      day: 2,
      theme: '项目经验梳理',
      tasks: [
        '整理项目架构图',
        '准备关键决策点的解释',
      ],
    },
    {
      day: 3,
      theme: '系统设计练习',
      tasks: [
        '练习常见系统设计题',
        '准备设计思路的表达',
      ],
    },
    {
      day: 4,
      theme: '算法题练习',
      tasks: [
        '刷中等难度算法题',
        '总结解题模板',
      ],
    },
    {
      day: 5,
      theme: '模拟面试',
      tasks: [
        '进行全流程模拟',
        '复盘表现和改进点',
      ],
    },
    {
      day: 6,
      theme: '查漏补缺',
      tasks: [
        '针对薄弱环节强化',
        '准备常见问题答案',
      ],
    },
    {
      day: 7,
      theme: '心态调整',
      tasks: [
        '放松心情，保持状态',
        '准备面试必备物品',
      ],
    },
  ]
  
  return { days }
}

/**
 * 生成来源列表
 */
function generateSourceList(questions: SavedQuestion[]): SourceList {
  const sourceList: SourceList = {
    xiaohongshu: [],
    nowcoder: [],
    github: [],
    web: [],
  }
  
  for (const q of questions) {
    if (!q.source_url) continue
    
    const item: SourceItem = {
      url: q.source_url,
      description: q.content.substring(0, 50) + '...',
    }
    
    if (q.source_url.includes('xiaohongshu')) {
      sourceList.xiaohongshu.push(item)
    } else if (q.source_url.includes('nowcoder')) {
      sourceList.nowcoder.push(item)
    } else if (q.source_url.includes('github')) {
      sourceList.github.push(item)
    } else {
      sourceList.web.push(item)
    }
  }
  
  return sourceList
}

/**
 * 将备考包导出为 Markdown
 */
export function exportToMarkdown(prepPackage: PrepPackage): string {
  let md = `# ${prepPackage.title}\n\n`
  md += `生成日期：${prepPackage.generatedAt}\n`
  md += `目标岗位：${prepPackage.targetPosition}\n\n`
  
  // 候选人定位
  md += `## 1. 你的候选人定位\n\n`
  md += `> ${prepPackage.candidateProfile.summary}\n\n`
  md += `简历里最强的三个证据：\n\n`
  for (const evidence of prepPackage.candidateProfile.topEvidence) {
    md += `### ${evidence.project}\n`
    for (const point of evidence.points) {
      md += `- ${point}\n`
    }
    md += `- 适合回答：${evidence.suitableFor}\n\n`
  }
  
  // Gap 分析
  md += `## 2. 岗位 Gap 分析\n\n`
  md += `| 维度 | 当前简历表现 | 面试风险 | 准备建议 |\n`
  md += `|---|---|---|---|\n`
  for (const gap of prepPackage.gapAnalysis) {
    md += `| ${gap.dimension} | ${gap.current} | ${gap.risk} | ${gap.suggestion} |\n`
  }
  md += `\n`
  
  // 高频题
  md += `## 3. 高频题 Top ${prepPackage.topQuestions.length}\n\n`
  for (const q of prepPackage.topQuestions) {
    md += `### ${q.rank}. ${q.question}\n\n`
    md += `来源：${q.sources.join(', ')}\n\n`
    md += `回答要点：\n`
    for (const point of q.answerPoints) {
      md += `- ${point}\n`
    }
    if (q.resumeAnchor) {
      md += `\n可挂简历锚点：${q.resumeAnchor}\n`
    }
    md += `\n`
  }
  
  // 追问链
  md += `## 4. 个性化项目追问链\n\n`
  for (let i = 0; i < prepPackage.followUpChains.length; i++) {
    const chain = prepPackage.followUpChains[i]
    md += `### 链 ${i + 1}：${chain.theme} → ${chain.resumeProject}\n\n`
    md += `种子题：${chain.seedQuestion}\n\n`
    md += `追问：\n`
    for (let j = 0; j < chain.followUps.length; j++) {
      md += `${j + 1}. ${chain.followUps[j]}\n`
    }
    md += `\n准备重点：\n`
    for (const tip of chain.preparationTips) {
      md += `- ${tip}\n`
    }
    md += `\n`
  }
  
  // 冲刺计划
  md += `## 5. 一周冲刺计划\n\n`
  for (const day of prepPackage.sprintPlan.days) {
    md += `### Day ${day.day}：${day.theme}\n\n`
    for (const task of day.tasks) {
      md += `- ${task}\n`
    }
    md += `\n`
  }
  
  // 来源列表
  md += `## 6. 来源列表\n\n`
  if (prepPackage.sourceList.xiaohongshu.length > 0) {
    md += `小红书：\n`
    for (const source of prepPackage.sourceList.xiaohongshu) {
      md += `- \`${source.url}\` — ${source.description}\n`
    }
    md += `\n`
  }
  if (prepPackage.sourceList.nowcoder.length > 0) {
    md += `牛客：\n`
    for (const source of prepPackage.sourceList.nowcoder) {
      md += `- \`${source.url}\` — ${source.description}\n`
    }
    md += `\n`
  }
  if (prepPackage.sourceList.github.length > 0) {
    md += `GitHub：\n`
    for (const source of prepPackage.sourceList.github) {
      md += `- \`${source.url}\` — ${source.description}\n`
    }
    md += `\n`
  }
  if (prepPackage.sourceList.web.length > 0) {
    md += `网页：\n`
    for (const source of prepPackage.sourceList.web) {
      md += `- \`${source.url}\` — ${source.description}\n`
    }
    md += `\n`
  }
  
  return md
}