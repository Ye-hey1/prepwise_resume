export interface ExaSearchResult {
  title?: string
  url?: string
  text?: string
  summary?: string
  score?: number
  publishedDate?: string
}

export interface ExaSearchResponse {
  results?: ExaSearchResult[]
}

export async function exaSearch(
  apiKey: string,
  query: string,
  options?: { maxResults?: number },
  signal?: AbortSignal,
): Promise<ExaSearchResponse> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: options?.maxResults ?? 3,
      type: 'auto',
      text: {
        maxCharacters: 1200,
      },
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) {
      throw new Error('Exa API Key 无效，请检查后重试。')
    }
    if (response.status === 429) {
      throw new Error('Exa 请求过于频繁，请稍后重试。')
    }
    throw new Error(`Exa 搜索失败 (${response.status}): ${errorText || response.statusText}`)
  }

  return await response.json() as ExaSearchResponse
}
