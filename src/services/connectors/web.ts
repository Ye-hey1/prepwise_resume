/**
 * 通用网页 Connector
 * 从知乎、CSDN 等公开网页获取面经
 */

import type { Connector, SearchResult, RawPost } from './base'

interface WebConfig {
  urls: string[]
}

// 简单的内存缓存
const cache = new Map<string, { data: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30分钟

export class WebConnector implements Connector {
  name = 'web'
  private config: WebConfig

  constructor(config: WebConfig) {
    this.config = config
  }

  async search(queries: string[]): Promise<SearchResult> {
    try {
      const posts: RawPost[] = []
      
      for (const url of this.config.urls) {
        try {
          const html = await this.fetchWithCache(url)
          const post = this.parsePost(html, url)
          
          if (post && this.isRelevant(post.content, queries)) {
            posts.push(post)
          }
        } catch (err) {
          console.warn(`[WebConnector] Failed to fetch ${url}:`, err)
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
        message: `网页采集失败: ${err instanceof Error ? err.message : '未知错误'}`,
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
    // 提取域名
    const domain = new URL(url).hostname
    
    // 根据不同网站使用不同的解析策略
    let content = ''
    let postedAt: string | undefined
    
    if (domain.includes('zhihu.com')) {
      content = this.parseZhihu(html)
      postedAt = this.extractDate(html)
    } else if (domain.includes('csdn.net')) {
      content = this.parseCsdn(html)
      postedAt = this.extractDate(html)
    } else {
      // 通用解析
      content = this.parseGeneric(html)
      postedAt = this.extractDate(html)
    }
    
    if (!content || content.length < 50) return null
    
    return {
      source: `web:${domain}`,
      url,
      content,
      postedAt,
    }
  }

  private parseZhihu(html: string): string {
    const match = html.match(/<div class="RichContent-inner"[^>]*>([\s\S]*?)<\/div>/i)
    if (!match) return ''
    return this.stripHtml(match[1] ?? '')
  }

  private parseCsdn(html: string): string {
    const match = html.match(/<div class="article_content"[^>]*>([\s\S]*?)<\/div>/i)
    if (!match) return ''
    return this.stripHtml(match[1] ?? '')
  }

  private parseGeneric(html: string): string {
    // 尝试提取主要内容
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div class="content"[^>]*>([\s\S]*?)<\/div>/i,
      /<div class="post"[^>]*>([\s\S]*?)<\/div>/i,
    ]
    
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        return this.stripHtml(match[1] ?? '')
      }
    }
    
    // 回退：提取所有段落
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi)
    if (paragraphs) {
      return paragraphs.map(p => this.stripHtml(p)).join('\n')
    }
    
    return ''
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private extractDate(html: string): string | undefined {
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{4}\/\d{2}\/\d{2})/,
      /(\d{4}年\d{1,2}月\d{1,2}日)/,
    ]
    
    for (const pattern of datePatterns) {
      const match = html.match(pattern)
      if (match?.[1]) {
        try {
          const date = new Date(match[1])
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0] ?? undefined
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
    
    return undefined
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
