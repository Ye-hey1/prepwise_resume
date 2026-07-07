/**
 * GitHub Connector
 * 从 GitHub 面经仓库获取面试题
 */

import type { Connector, SearchResult, RawPost } from './base'
import { fetchTextWithCache } from './base'

interface GithubConfig {
  repoRawUrls: string[]
  relevanceHints: string[]
}

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
          const content = await fetchTextWithCache(repoUrl)
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
}
