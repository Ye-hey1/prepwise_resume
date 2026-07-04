/**
 * 数据采集器
 * 协调多个 Connector 进行数据采集
 */

import type { Connector, SearchResult, RawPost } from '../connectors/base'
import { filterRecent, deduplicate, recencyWeight } from '../connectors/base'
import { GithubConnector } from '../connectors/github'
import { NowcoderConnector } from '../connectors/nowcoder'
import { WebConnector } from '../connectors/web'
import { HybridExtractor, type AIExtractorConfig } from './aiExtractor'

export interface CollectorConfig {
  github?: {
    repoRawUrls: string[]
    relevanceHints: string[]
  }
  nowcoder?: {
    postUrls: string[]
  }
  web?: {
    urls: string[]
  }
  ai?: AIExtractorConfig
}

export interface CollectorResult {
  posts: RawPost[]
  stats: {
    total: number
    bySource: Record<string, number>
    degraded: string[]
  }
}

export interface CollectionProgress {
  stage: 'connecting' | 'fetching' | 'parsing' | 'filtering' | 'complete'
  progress: number // 0-100
  message: string
  currentSource?: string
}

export type ProgressCallback = (progress: CollectionProgress) => void

// 缓存管理器
class CacheManager {
  private cache = new Map<string, { data: unknown; timestamp: number }>()
  private ttl = 24 * 60 * 60 * 1000 // 24小时

  get<T>(key: string): T | null {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    return item.data as T
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  clear(): void {
    this.cache.clear()
  }
}

// 错误重试工具函数
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn()
    } catch (err) {
      if (i === maxRetries - 1) throw err
      await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
    }
  }
  throw new Error('Max retries exceeded')
}

export class CorpusCollector {
  private connectors: Connector[] = []
  private cache = new CacheManager()
  private onProgress?: ProgressCallback
  private hybridExtractor?: HybridExtractor

  constructor(config: CollectorConfig, onProgress?: ProgressCallback) {
    this.onProgress = onProgress
    
    if (config.github) {
      this.connectors.push(new GithubConnector(config.github))
    }
    if (config.nowcoder) {
      this.connectors.push(new NowcoderConnector(config.nowcoder))
    }
    if (config.web) {
      this.connectors.push(new WebConnector(config.web))
    }
    
    // 初始化 AI 提取器
    if (config.ai?.enabled) {
      this.hybridExtractor = new HybridExtractor(config.ai)
    }
  }

  private reportProgress(progress: CollectionProgress) {
    this.onProgress?.(progress)
  }

  async collect(queries: string[]): Promise<CollectorResult> {
    const cacheKey = queries.join('|')
    
    // 检查缓存
    const cached = this.cache.get<CollectorResult>(cacheKey)
    if (cached) {
      this.reportProgress({
        stage: 'complete',
        progress: 100,
        message: '使用缓存数据',
      })
      return cached
    }

    this.reportProgress({
      stage: 'connecting',
      progress: 0,
      message: '正在连接数据源...',
    })

    const allPosts: RawPost[] = []
    const degraded: string[] = []
    const bySource: Record<string, number> = {}
    const totalConnectors = this.connectors.length

    // 并行采集，带进度反馈和错误重试
    const results = await Promise.allSettled(
      this.connectors.map(async (connector, index) => {
        this.reportProgress({
          stage: 'fetching',
          progress: Math.round((index / totalConnectors) * 60),
          message: `正在从 ${connector.name} 采集...`,
          currentSource: connector.name,
        })

        return fetchWithRetry(() => connector.search(queries))
      })
    )

    this.reportProgress({
      stage: 'parsing',
      progress: 70,
      message: '正在解析数据...',
    })

    for (const [i, result] of results.entries()) {
      const connector = this.connectors[i]
      if (!connector) continue

      if (result.status === 'fulfilled') {
        const searchResult = result.value
        allPosts.push(...searchResult.posts)
        
        // 统计来源
        for (const post of searchResult.posts) {
          bySource[post.source] = (bySource[post.source] || 0) + 1
        }
        
        if (searchResult.status === 'degraded') {
          degraded.push(connector.name)
        }
      } else {
        degraded.push(connector.name)
        console.warn(`[CorpusCollector] ${connector.name} failed:`, result.reason)
      }
    }

    this.reportProgress({
      stage: 'filtering',
      progress: 85,
      message: '正在过滤和去重...',
    })

    // 去重
    const uniquePosts = deduplicate(allPosts)
    
    // 时效过滤
    const recentPosts = filterRecent(uniquePosts)

    const result: CollectorResult = {
      posts: recentPosts,
      stats: {
        total: recentPosts.length,
        bySource,
        degraded,
      },
    }

    // 缓存结果
    this.cache.set(cacheKey, result)

    this.reportProgress({
      stage: 'complete',
      progress: 100,
      message: `采集完成，共 ${recentPosts.length} 条数据`,
    })

    return result
  }

  /**
   * 从帖子中提取面试题
   */
  async extractQuestions(posts: RawPost[]): Promise<ExtractedQuestion[]> {
    this.reportProgress({
      stage: 'parsing',
      progress: 75,
      message: '正在提取面试题...',
    })

    const questions: ExtractedQuestion[] = []
    
    // 分批处理，避免阻塞主线程
    const batchSize = 50
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize)
      for (const post of batch) {
        const extracted = this.extractFromPost(post)
        questions.push(...extracted)
      }
      
      // 更新进度
      const progress = 75 + Math.round((i / posts.length) * 15)
      this.reportProgress({
        stage: 'parsing',
        progress,
        message: `正在提取面试题... (${i + batch.length}/${posts.length})`,
      })
    }

    // 使用 AI 增强识别
    if (this.hybridExtractor) {
      this.reportProgress({
        stage: 'parsing',
        progress: 90,
        message: '正在使用 AI 增强识别...',
      })

      try {
        const enhanced = await this.hybridExtractor.enhanceQuestions(questions)
        return enhanced
      } catch (err) {
        console.warn('[CorpusCollector] AI enhancement failed, using regex results:', err)
      }
    }
    
    return questions
  }

  private extractFromPost(post: RawPost): ExtractedQuestion[] {
    const questions: ExtractedQuestion[] = []
    const lines = post.content.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (this.isQuestion(trimmed)) {
        questions.push({
          content: trimmed,
          sourceUrl: post.url,
          sourceType: 'real_experience',
          postedAt: post.postedAt,
          frequencyScore: 1,
          recencyScore: recencyWeight(post.postedAt),
          isGrounded: true,
        })
      }
    }
    
    return questions
  }

  private isQuestion(text: string): boolean {
    // 优化的面试题识别逻辑
    if (text.length < 8 || text.length > 500) return false
    
    // 排除明显不是题目的内容
    const excludePatterns = [
      /^[-=*#]+$/, // 分隔符
      /^\d+\.\s*$/, // 纯序号
      /^[\s]*$/, // 空白行
      /^(注意|说明|备注|提示)[：:]/, // 说明性文字
    ]
    
    if (excludePatterns.some(pattern => pattern.test(text))) {
      return false
    }
    
    // 面试题特征模式
    const questionPatterns = [
      // 直接问句
      /[？?]$/,
      // 疑问词开头
      /^(请|如何|怎么|什么是|为什么|解释|描述|设计|实现|说明|分析|比较|列举|阐述)/,
      // 技术相关关键词
      /(原理|机制|区别|优缺点|应用场景|最佳实践|实现方式|工作流程)/,
      // 面试常见句式
      /(谈谈|说说|讲讲|介绍一下|分享一下)/,
      // 编程相关
      /(算法|数据结构|框架|库|API|接口|数据库|缓存|并发|多线程)/,
    ]
    
    return questionPatterns.some(pattern => pattern.test(text))
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
  }
}

export interface ExtractedQuestion {
  content: string
  sourceUrl: string
  sourceType: 'real_experience'
  postedAt?: string
  frequencyScore: number
  recencyScore: number
  isGrounded: boolean
}
