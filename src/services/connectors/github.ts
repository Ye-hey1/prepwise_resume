/**
 * GitHub Connector
 * 从 GitHub 面经仓库获取面试题
 */

import type { Connector, SearchResult, RawPost } from './base'

interface GithubConfig {
  repoRawUrls: string[]
  relevanceHints: string[]
}

// 简单的内存缓存
const cache = new Map<string, { data: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30分钟

export class GithubConnector implements Connector {
  name = 'github'
  private config: GithubConfig

  constructor(config: GithubConfig) {
    this.config = config
  }

  async search(queries: string[]): Promise<SearchResult> {
    try {
      const posts: RawPost[] = []
      
      for (const repoUrl of this.config.repoRawUrls) {
        try {
          const content = await this.fetchWithCache(repoUrl)
          const relevantContent = this.extractRelevantContent(content, queries)
          
          if (relevantContent) {
            posts.push({
              source: 'github',
              url: repoUrl,
              content: relevantContent,
              metadata: {
                repo: repoUrl.split('/').slice(0, 5).join('/'),
              },
            })
          }
        } catch (err) {
          console.warn(`[GithubConnector] Failed to fetch ${repoUrl}:`, err)
        }
      }

      return {
        status: 'ok',
        posts,
      }
    } catch (err) {
      return {
        status: 'degraded',
        posts: [],
        message: `GitHub 采集失败: ${err instanceof Error ? err.message : '未知错误'}`,
      }
    }
  }

  private async fetchWithCache(url: string): Promise<string> {
    // 检查缓存
    const cached = cache.get(url)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data
    }

    // 带重试的请求
    const content = await this.fetchWithRetry(url)
    
    // 缓存结果
    cache.set(url, { data: content, timestamp: Date.now() })
    
    return content
  }

  private async fetchWithRetry(url: string, maxRetries = 3): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return await response.text()
      } catch (err) {
        if (i === maxRetries - 1) throw err
        // 指数退避
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
    throw new Error('Max retries exceeded')
  }

  private extractRelevantContent(content: string, queries: string[]): string | null {
    const lines = content.split('\n')
    const relevantLines: string[] = []
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      const isRelevant = this.config.relevanceHints.some(hint => 
        lowerLine.includes(hint.toLowerCase())
      ) || queries.some(query => 
        lowerLine.includes(query.toLowerCase())
      )
      
      if (isRelevant && line.trim().length > 10) {
        relevantLines.push(line.trim())
      }
    }
    
    return relevantLines.length > 0 ? relevantLines.join('\n') : null
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    cache.clear()
  }
}