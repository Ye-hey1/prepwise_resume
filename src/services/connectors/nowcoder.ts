/**
 * 牛客 Connector
 * 从牛客网获取真实面经
 */

import type { Connector, SearchResult, RawPost } from './base'
import { fetchTextWithCache } from './base'

interface NowcoderConfig {
  postUrls: string[]
}

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
          const html = await fetchTextWithCache(postUrl)
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

  private parsePost(html: string, url: string): RawPost | null {
    // 简单的 HTML 解析，提取帖子内容
    const contentMatch = html.match(/<div class="discuss-main"[^>]*>([\s\S]*?)<\/div>/i)
    const timeMatch = html.match(/<span class="time"[^>]*>(.*?)<\/span>/i)

    if (!contentMatch) return null

    const content = (contentMatch[1] ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      source: 'nowcoder',
      url,
      content,
      postedAt: timeMatch?.[1] ? this.parseDate(timeMatch[1]) : undefined,
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
}
