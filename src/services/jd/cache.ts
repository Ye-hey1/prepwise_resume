/**
 * JD 分析请求缓存层
 * 基于输入签名缓存 AI 调用结果，防止相同输入重复调用 AI
 */

interface CacheEntry<T> {
  result: T
  timestamp: number
  inputSignature: string
}

interface CacheConfig {
  /** 最大缓存条目数，默认 20 */
  maxEntries?: number
  /** 缓存过期时间（毫秒），默认 30 分钟 */
  ttlMs?: number
}

const DEFAULT_CONFIG: Required<CacheConfig> = {
  maxEntries: 20,
  ttlMs: 30 * 60 * 1000, // 30 分钟
}

/**
 * 基于 Map 的 LRU 缓存
 * 使用简单的 Map 有序特性实现最近使用优先
 */
export class JdRequestCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private config: Required<CacheConfig>

  constructor(config?: CacheConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** 生成缓存 key */
  static buildKey(operation: string, ...inputs: string[]): string {
    // 简单 hash：拼接 operation + 各输入的截断值
    const combined = `${operation}:${inputs.join('|')}`
    return simpleHash(combined)
  }

  /** 查询缓存 */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // 检查过期
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key)
      return null
    }

    // LRU: 重新插入到末尾
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.result as T
  }

  /** 写入缓存 */
  set<T>(key: string, result: T): void {
    // 淘汰最旧的条目
    while (this.cache.size >= this.config.maxEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) {
        this.cache.delete(oldest)
      }
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      inputSignature: key,
    })
  }

  /** 检查缓存是否存在且未过期 */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /** 清除所有缓存 */
  clear(): void {
    this.cache.clear()
  }

  /** 清除指定操作的缓存（当前实现为全量清除） */
  clearByPrefix(_operation: string): void {
    // 由于 key 是 hash，无法直接按前缀删除
    // 改为全量清除（简单实现）
    this.cache.clear()
  }

  /** 当前缓存条目数 */
  get size(): number {
    return this.cache.size
  }
}

/** 简单 DJB2 哈希 */
function simpleHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

/** 全局单例缓存实例 */
export const jdCache = new JdRequestCache()
