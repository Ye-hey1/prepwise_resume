/**
 * IndexedDB 存储层
 * 替代 localStorage 作为主存储，支持大容量数据持久化
 * 提供版本管理和数据校验机制
 */

const DB_NAME = 'prepwise-db'
const DB_VERSION = 1

/** 存储表定义 */
const STORES = {
  resumes: 'resumes',           // 多简历版本管理
  snapshots: 'snapshots',       // 简历快照（历史版本）
  jdAnalysis: 'jdAnalysis',     // JD 分析历史
  interviews: 'interviews',     // 面试记录
  config: 'config',             // 轻量配置
} as const

export type StoreName = typeof STORES[keyof typeof STORES]

/** 数据包装结构，包含版本号和校验 */
export interface StorageEnvelope<T = unknown> {
  id: string
  data: T
  version: number
  checksum: string
  createdAt: string
  updatedAt: string
}

/** 简历快照 */
export interface ResumeSnapshot {
  id: string
  resumeId: string
  label: string
  data: unknown
  createdAt: string
}

let dbInstance: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null

/** 计算简单校验和 */
export function computeChecksum(data: unknown): string {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

/** 打开数据库连接 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 创建对象存储
      if (!db.objectStoreNames.contains(STORES.resumes)) {
        db.createObjectStore(STORES.resumes, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.snapshots)) {
        const store = db.createObjectStore(STORES.snapshots, { keyPath: 'id' })
        store.createIndex('resumeId', 'resumeId', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.jdAnalysis)) {
        db.createObjectStore(STORES.jdAnalysis, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.interviews)) {
        const store = db.createObjectStore(STORES.interviews, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: 'id' })
      }
    }

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result
      dbInstance.onclose = () => {
        dbInstance = null
        dbPromise = null
      }
      resolve(dbInstance)
    }

    request.onerror = () => {
      dbPromise = null
      reject(new Error(`IndexedDB 打开失败: ${request.error?.message ?? '未知错误'}`))
    }
  })

  return dbPromise
}

/** 检查 IndexedDB 是否可用 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

/** 通用读取 */
export async function dbGet<T>(storeName: StoreName, key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result as StorageEnvelope<T> | undefined
        resolve(result?.data ?? null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn(`[Storage] dbGet 失败 (${storeName}/${key}):`, error)
    return null
  }
}

/** 通用写入 */
export async function dbPut<T>(storeName: StoreName, key: string, data: T, version = 1): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const now = new Date().toISOString()

      const envelope: StorageEnvelope<T> = {
        id: key,
        data,
        version,
        checksum: computeChecksum(data),
        createdAt: now,
        updatedAt: now,
      }

      const request = store.put(envelope)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn(`[Storage] dbPut 失败 (${storeName}/${key}):`, error)
  }
}

/** 通用删除 */
export async function dbDelete(storeName: StoreName, key: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn(`[Storage] dbDelete 失败 (${storeName}/${key}):`, error)
  }
}

/** 获取存储中所有记录 */
export async function dbGetAll<T>(storeName: StoreName): Promise<T[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = (request.result as StorageEnvelope<T>[]) ?? []
        resolve(results.map(r => r.data))
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn(`[Storage] dbGetAll 失败 (${storeName}):`, error)
    return []
  }
}

/** 按索引查询 */
export async function dbGetByIndex<T>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const request = index.getAll(value)

      request.onsuccess = () => {
        const results = (request.result as StorageEnvelope<T>[]) ?? []
        resolve(results.map(r => r.data))
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn(`[Storage] dbGetByIndex 失败 (${storeName}/${indexName}):`, error)
    return []
  }
}

/** 获取记录数量 */
export async function dbCount(storeName: StoreName): Promise<number> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn(`[Storage] dbCount 失败 (${storeName}):`, error)
    return 0
  }
}

/** 清空指定存储 */
export async function dbClear(storeName: StoreName): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.warn(`[Storage] dbClear 失败 (${storeName}):`, error)
  }
}

/** 导出所有数据（用于备份） */
export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {}
  for (const storeName of Object.values(STORES)) {
    result[storeName] = await dbGetAll(storeName)
  }
  return result
}

/** 导入数据（用于恢复） */
export async function importAllData(data: Record<string, unknown[]>): Promise<void> {
  const db = await openDB()

  for (const [storeName, items] of Object.entries(data)) {
    if (!Object.values(STORES).includes(storeName as StoreName)) continue
    if (!Array.isArray(items)) continue

    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)

    for (const item of items) {
      if (item && typeof item === 'object' && 'id' in (item as Record<string, unknown>)) {
        const now = new Date().toISOString()
        const envelope: StorageEnvelope = {
          id: (item as Record<string, unknown>).id as string,
          data: item,
          version: 1,
          checksum: computeChecksum(item),
          createdAt: now,
          updatedAt: now,
        }
        store.put(envelope)
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

/** 从 localStorage 迁移数据到 IndexedDB */
export async function migrateFromLocalStorage(): Promise<{ migrated: boolean; keys: string[] }> {
  if (!isIndexedDBAvailable()) {
    return { migrated: false, keys: [] }
  }

  const migratedKeys: string[] = []

  // 检查是否已迁移
  const migrationFlag = localStorage.getItem('prepwise-idb-migrated')
  if (migrationFlag === 'true') {
    return { migrated: false, keys: [] }
  }

  try {
    // 迁移简历数据
    const resumeRaw = localStorage.getItem('resume-builder-data')
    if (resumeRaw) {
      const resumeData = JSON.parse(resumeRaw)
      await dbPut('resumes', 'default', resumeData)
      migratedKeys.push('resume-builder-data')
    }

    // 迁移 JD 分析数据
    const jdRaw = localStorage.getItem('resume-builder-jd-analysis')
    if (jdRaw) {
      const jdData = JSON.parse(jdRaw)
      await dbPut('jdAnalysis', 'current', jdData)
      migratedKeys.push('resume-builder-jd-analysis')
    }

    // 迁移面试历史
    const interviewRaw = localStorage.getItem('prepwise_interview_history')
    if (interviewRaw) {
      const interviewData = JSON.parse(interviewRaw)
      await dbPut('interviews', 'history', interviewData)
      migratedKeys.push('prepwise_interview_history')
    }

    // 标记迁移完成（不删除 localStorage 数据作为备份）
    localStorage.setItem('prepwise-idb-migrated', 'true')

    return { migrated: migratedKeys.length > 0, keys: migratedKeys }
  } catch (error) {
    console.warn('[Storage] localStorage 迁移失败:', error)
    return { migrated: false, keys: [] }
  }
}

export { STORES }
