/**
 * 去重排序服务
 * 基于频次和时效进行排序
 */

import type { ExtractedQuestion } from './collector'

interface RankedQuestion extends ExtractedQuestion {
  score: number
  rank: number
}

/**
 * 去重并排序面试题
 */
export function dedupeAndRank(questions: ExtractedQuestion[]): RankedQuestion[] {
  // 去重：基于内容相似度
  const unique = deduplicateByContent(questions)
  
  // 计算综合分数
  const scored = unique.map(q => ({
    ...q,
    score: calculateScore(q),
  }))
  
  // 按分数降序排序
  scored.sort((a, b) => b.score - a.score)
  
  // 添加排名
  return scored.map((q, index) => ({
    ...q,
    rank: index + 1,
  }))
}

/**
 * 基于内容相似度去重
 */
function deduplicateByContent(questions: ExtractedQuestion[]): ExtractedQuestion[] {
  const unique: ExtractedQuestion[] = []
  const seen = new Set<string>()
  
  for (const question of questions) {
    const normalized = normalizeContent(question.content)
    if (seen.has(normalized)) continue
    
    seen.add(normalized)
    unique.push(question)
  }
  
  return unique
}

/**
 * 标准化内容用于去重比较
 */
function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, '') // 只保留字母、数字、中文
    .replace(/\s+/g, '')
    .trim()
}

/**
 * 计算综合分数
 * 分数 = 频次分数 × 时效分数
 */
function calculateScore(question: ExtractedQuestion): number {
  const frequencyWeight = 0.6
  const recencyWeight = 0.4
  
  return (
    question.frequencyScore * frequencyWeight +
    question.recencyScore * recencyWeight
  )
}

/**
 * 合并重复题目，累加频次
 */
export function mergeDuplicates(questions: ExtractedQuestion[]): ExtractedQuestion[] {
  const merged = new Map<string, ExtractedQuestion>()
  
  for (const question of questions) {
    const normalized = normalizeContent(question.content)
    const existing = merged.get(normalized)
    
    if (existing) {
      // 累加频次
      existing.frequencyScore += 1
      // 保留最新的发布时间
      if (question.postedAt && existing.postedAt) {
        if (new Date(question.postedAt) > new Date(existing.postedAt)) {
          existing.postedAt = question.postedAt
          existing.recencyScore = question.recencyScore
        }
      }
      // 保留所有源链接
      if (!existing.sourceUrl.includes(question.sourceUrl)) {
        existing.sourceUrl += `, ${question.sourceUrl}`
      }
    } else {
      merged.set(normalized, { ...question })
    }
  }
  
  return Array.from(merged.values())
}