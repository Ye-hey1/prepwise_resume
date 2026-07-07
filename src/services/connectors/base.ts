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

// ponytail: 3 个 connector 原各有一份逐字相同的 fetchWithCache/fetchWithRetry + 独立 cache，已合并为共享实现。
const textCache = new Map<string, { data: string; timestamp: number }>()
const TEXT_CACHE_TTL = 30 * 60 * 1000 // 30 分钟

/** 带内存缓存和指数退避重试的文本抓取（github/nowcoder/web connector 共用） */
export async function fetchTextWithCache(url: string): Promise<string> {
  const cached = textCache.get(url)
  if (cached && Date.now() - cached.timestamp < TEXT_CACHE_TTL) {
    return cached.data
  }

  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const content = await response.text()
      textCache.set(url, { data: content, timestamp: Date.now() })
      return content
    } catch (err) {
      if (i === 2) throw err
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
  throw new Error('Max retries exceeded')
}