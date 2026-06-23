/**
 * InterviewRadar Connector 基础接口
 * 定义数据源连接器的标准接口
 */

export interface RawPost {
  source: string
  url: string
  content: string
  postedAt?: string
  metadata?: Record<string, unknown>
}

export interface SearchResult {
  status: 'ok' | 'degraded'
  posts: RawPost[]
  message?: string
}

export interface Connector {
  name: string
  search(queries: string[]): Promise<SearchResult>
}

/**
 * 时效过滤：只保留指定天数内的帖子
 */
export function filterRecent(posts: RawPost[], windowDays = 730): RawPost[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)
  
  return posts.filter(post => {
    if (!post.postedAt) return true // 无日期保留
    return new Date(post.postedAt) >= cutoff
  })
}

/**
 * 去重：基于 URL 去重
 */
export function deduplicate(posts: RawPost[]): RawPost[] {
  const seen = new Set<string>()
  return posts.filter(post => {
    if (seen.has(post.url)) return false
    seen.add(post.url)
    return true
  })
}

/**
 * 计算时效分数：基于发布时间的衰减权重
 */
export function recencyWeight(postedAt?: string): number {
  if (!postedAt) return 0.2 // 无日期降权
  const days = (Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0.1, 1 - days / 730) // 线性衰减
}