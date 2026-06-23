/**
 * 牛客 Connector
 * 从牛客网获取真实面经
 */

import type { Connector, SearchResult, RawPost } from './base'

interface NowcoderConfig {
  postUrls: string[]
}

// 简单的内存缓存
const cache = new Map<string, { data: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30分钟

export class NowcoderConnector implements Connector {
  name = 'nowcoder'
  private config: NowcoderConfig

  constructor(config: NowcoderConfig) {
    this.config = config
  }

  async search(queries: string[]): Promise<SearchResult> {
    try {
      const posts: RawPost[] = []
      
      for (const postUrl of this.config.postUrls) {
        try {
          const html = await this.fetchWithCache(postUrl)
          const post = this.parsePost(html, postUrl)
          
          if (post && this.isRelevant(post.content, queries)) {
            posts.push(post)
          }
        } catch (err) {
          console.warn(`[NowcoderConnector] Failed to fetch ${postUrl}:`, err)
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
        message: `牛客采集失败: ${err instanceof Error ? err.message : '未知错误'}`,
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

  private parsePost(html: string, url: string): RawPost | null {
    // 简单的 HTML 解析，提取帖子内容
    const contentMatch = html.match(/<div class="discuss-main"[^>]*>([\s\S]*?)<\/div>/i)
    const timeMatch = html.match(/<span class="time"[^>]*>(.*?)<\/span>/i)
    
    if (!contentMatch) return null
    
    const content = contentMatch[1]
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    
    return {
      source: 'nowcoder',
      url,
      content,
      postedAt: timeMatch ? this.parseDate(timeMatch[1]) : undefined,
    }
  }

  private parseDate(dateStr: string): string | undefined {
    try {
      const date = new Date(dateStr)
      return isNaN(date.getTime()) ? undefined : date.toISOString().split('T')[0]
    } catch {
      return undefined
    }
  }

  private isRelevant(content: string, queries: string[]): boolean {
    const lowerContent = content.toLowerCase()
    return queries.some(query => 
      lowerContent.includes(query.toLowerCase())
    )
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    cache.clear()
  }
}