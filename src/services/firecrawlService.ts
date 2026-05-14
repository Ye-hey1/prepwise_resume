export interface FirecrawlSearchResult {
  title?: string
  url?: string
  description?: string
  markdown?: string
  content?: string
}

export interface FirecrawlSearchResponse {
  success?: boolean
  data?: FirecrawlSearchResult[]
}

export async function firecrawlSearch(
  apiKey: string,
  query: string,
  options?: { maxResults?: number },
  signal?: AbortSignal,
): Promise<FirecrawlSearchResponse> {
  const response = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: options?.maxResults ?? 3,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) {
      throw new Error('Firecrawl API Key 无效，请检查后重试。')
    }
    if (response.status === 429) {
      throw new Error('Firecrawl 请求过于频繁，请稍后重试。')
    }
    throw new Error(`Firecrawl 搜索失败 (${response.status}): ${errorText || response.statusText}`)
  }

  return await response.json() as FirecrawlSearchResponse
}
