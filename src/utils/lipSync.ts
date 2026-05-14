/**
 * 口型同步引擎 (Lip Sync Engine)
 * 将文字流映射为 VRM 口型序列，驱动 3D 虚拟形象的嘴部动画
 *
 * VRM 支持 5 个元音口型：aa / ih / ou / ee / oh
 * 以及预设表情：happy / angry / sad / surprised / relaxed / neutral
 */

// ═══ 类型定义 ═══

/** VRM 元音口型 */
export type Viseme = 'aa' | 'ih' | 'ou' | 'ee' | 'oh'

/** VRM 预设表情 */
export type ExpressionPreset = 'happy' | 'angry' | 'sad' | 'surprised' | 'relaxed' | 'neutral'

/** 单帧口型数据 */
export interface LipSyncFrame {
  /** 目标口型 */
  viseme: Viseme | 'neutral'
  /** 口型权重 (0~1) */
  weight: number
  /** 持续时间 (ms) */
  duration: number
}

/** 口型同步播放器状态 */
export type LipSyncState = 'idle' | 'playing' | 'paused'

/** 口型同步回调 */
export interface LipSyncCallbacks {
  /** 口型变化时触发 */
  onVisemeChange: (viseme: Viseme | 'neutral', weight: number) => void
  /** 播放结束时触发 */
  onComplete: () => void
}

// ═══ 字符 → 口型映射表 ═══

const VISEME_MAP: Record<string, Viseme> = {
  // 拼音 a 系
  a: 'aa', '啊': 'aa', '阿': 'aa', '安': 'aa', '爱': 'aa', '奥': 'aa',
  // 拼音 e 系
  e: 'ee', '额': 'ee', '俄': 'ee', '恩': 'ee', '哎': 'ee',
  // 拼音 i 系
  i: 'ih', '衣': 'ih', '一': 'ih', '意': 'ih', '因': 'ih', '伊': 'ih',
  // 拼音 o 系
  o: 'oh', '哦': 'oh', '噢': 'oh', '欧': 'oh', '翁': 'oh',
  // 拼音 u 系
  u: 'ou', '呜': 'ou', '无': 'ou', '五': 'ou', '乌': 'ou',
  // 唇音 → 闭嘴后张嘴
  b: 'aa', m: 'aa', p: 'aa',
  // 齿龈音
  n: 'ee', l: 'ee', t: 'ee', d: 'ee',
  // 咝音
  s: 'ih', z: 'ih', c: 'ih',
  // 唇齿音
  f: 'ou', v: 'ou', w: 'ou',
  // 软腭音
  r: 'oh', g: 'oh', k: 'oh',
  // 其他常见辅音
  h: 'oh', j: 'ih', q: 'ih', x: 'ih',
  // 英语元音
  á: 'aa', é: 'ee', í: 'ih', ó: 'oh', ú: 'ou',
}

// ═══ 文字 → 口型帧序列 ═══

/**
 * 将文字转换为口型帧序列
 * @param text 输入文字
 * @param options 配置选项
 * @returns 口型帧数组
 */
export function textToVisemes(
  text: string,
  options?: { speed?: number; baseWeight?: number },
): LipSyncFrame[] {
  const speed = options?.speed ?? 1
  const baseWeight = options?.baseWeight ?? 0.65
  const frames: LipSyncFrame[] = []
  const chars = text.toLowerCase().split('')

  for (const ch of chars) {
    // 空白/标点 → 闭嘴间隔
    if (/\s|[，。！？、；：""''…—,.!?;:\-()（）【】\[\]]/.test(ch)) {
      frames.push({ viseme: 'neutral', weight: 0, duration: 60 / speed })
      continue
    }

    // 数字 → 简单映射到 aa
    if (/\d/.test(ch)) {
      frames.push({
        viseme: 'aa',
        weight: baseWeight + Math.random() * 0.2,
        duration: 50 / speed,
      })
      continue
    }

    // 查表获取口型
    const viseme = VISEME_MAP[ch]
    if (viseme) {
      frames.push({
        viseme,
        weight: baseWeight + Math.random() * 0.25,
        duration: (55 + Math.random() * 35) / speed,
      })
    } else {
      // 未匹配字符 → 默认轻微张嘴
      frames.push({
        viseme: 'aa',
        weight: 0.3 + Math.random() * 0.15,
        duration: (45 + Math.random() * 25) / speed,
      })
    }
  }

  return frames
}

// ═══ 文本情感分析 → 表情 ═══

/**
 * 根据文本内容推断合适的表情
 * 简单的关键词匹配方案，后续可替换为 NLP 模型
 */
export function inferExpression(text: string): ExpressionPreset {
  const t = text.toLowerCase()

  if (/不错|很好|优秀|厉害|赞|perfect|great|excellent|good|well/i.test(t)) {
    return 'happy'
  }
  if (/问题|为什么|如何|怎么|请说明|请解释|what|why|how|explain|describe/i.test(t)) {
    return 'neutral'
  }
  if (/注意|但是|不过|遗憾|可惜|遗憾|不足|however|but|unfortunately/i.test(t)) {
    return 'sad'
  }
  if (/惊讶|没想到|出乎|surpris|wow|amazing/i.test(t)) {
    return 'surprised'
  }
  if (/冷静|放松|没关系|relax|calm|okay/i.test(t)) {
    return 'relaxed'
  }

  return 'neutral'
}

// ═══ 口型同步播放器 ═══

export class LipSyncPlayer {
  private queue: LipSyncFrame[] = []
  private currentIndex = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private state: LipSyncState = 'idle'
  private callbacks: LipSyncCallbacks

  constructor(callbacks: LipSyncCallbacks) {
    this.callbacks = callbacks
  }

  /** 当前状态 */
  getState(): LipSyncState {
    return this.state
  }

  /** 是否正在播放 */
  get isPlaying(): boolean {
    return this.state === 'playing'
  }

  /** 播放一段文字的口型 */
  play(text: string, options?: { speed?: number }): void {
    this.stop()
    this.queue = textToVisemes(text, options)
    this.currentIndex = 0
    this.state = 'playing'
    this.tick()
  }

  /** 直接播放预计算的帧序列 */
  playFrames(frames: LipSyncFrame[]): void {
    this.stop()
    this.queue = frames
    this.currentIndex = 0
    this.state = 'playing'
    this.tick()
  }

  /** 停止播放并重置 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.queue = []
    this.currentIndex = 0
    this.state = 'idle'
    this.callbacks.onVisemeChange('neutral', 0)
  }

  /** 逐帧驱动 */
  private tick(): void {
    if (this.currentIndex >= this.queue.length) {
      this.state = 'idle'
      this.callbacks.onVisemeChange('neutral', 0)
      this.callbacks.onComplete()
      return
    }

    const frame = this.queue[this.currentIndex]
    if (!frame) {
      this.state = 'idle'
      this.callbacks.onVisemeChange('neutral', 0)
      this.callbacks.onComplete()
      return
    }
    this.callbacks.onVisemeChange(frame.viseme, frame.weight)
    this.currentIndex++

    this.timer = setTimeout(() => this.tick(), frame.duration)
  }

  /** 销毁播放器 */
  destroy(): void {
    this.stop()
  }
}
