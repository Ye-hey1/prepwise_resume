/**
 * VRM 模型注册表
 * 定义面试中可用的所有 3D 虚拟形象
 */

export interface VrmModelInfo {
  /** 唯一 ID */
  id: string
  /** 角色名 */
  name: string
  /** 性别 */
  gender: 'male' | 'female'
  /** 角色类型 */
  role: 'interviewer' | 'candidate'
  /** 角色描述标签 */
  tag: string
  /** 模型文件路径（相对于 public/） */
  url: string
  /** 是否需要场景 Y 轴 180° 翻转（默认 true，即需要翻转） */
  needsSceneFlip?: boolean
  /** 骨骼局部轴是否翻转，需要补偿（默认 false） */
  flippedSkeleton?: boolean
  /** TTS 语音音色名称（如 claire、charles），配合 TTS 模型自动拼接完整 voice ID */
  ttsVoice?: string
}

/**
 * 面试官模型（2 个）
 */
export const INTERVIEWER_MODELS: VrmModelInfo[] = [
  {
    id: 'interviewer-fangran',
    name: '方然',
    gender: 'female',
    role: 'interviewer',
    tag: '资深面试官',
    url: '/vrm/女面试官方然.vrm',
    ttsVoice: 'claire',
  },
  {
    id: 'interviewer-luxing',
    name: '陆星',
    gender: 'male',
    role: 'interviewer',
    tag: '技术总监',
    url: '/vrm/男面试官陆星.vrm',
    ttsVoice: 'charles',
  },
]

/**
 * 候选人模型（5 个）
 */
export const CANDIDATE_MODELS: VrmModelInfo[] = [
  {
    id: 'candidate-asuka',
    name: '明日香',
    gender: 'female',
    role: 'candidate',
    tag: '前端工程师',
    url: '/vrm/（女）明日香.vrm',
    ttsVoice: 'anna',
  },
  {
    id: 'candidate-mia',
    name: '米娅',
    gender: 'female',
    role: 'candidate',
    tag: '产品设计师',
    url: '/vrm/（女）米娅.vrm',
    ttsVoice: 'bella',
  },
  {
    id: 'candidate-rayka',
    name: 'Rayka',
    gender: 'male',
    role: 'candidate',
    tag: '全栈开发者',
    url: '/vrm/（男）Rayka.vrm',
    needsSceneFlip: false,
    flippedSkeleton: true,
    ttsVoice: 'david',
  },
  {
    id: 'candidate-john',
    name: '约翰·克',
    gender: 'male',
    role: 'candidate',
    tag: '数据工程师',
    url: '/vrm/（男）约翰.克.vrm',
    needsSceneFlip: false,
    flippedSkeleton: true,
    ttsVoice: 'benjamin',
  },
  {
    id: 'candidate-sergey',
    name: '谢尔盖',
    gender: 'male',
    role: 'candidate',
    tag: '后端架构师',
    url: '/vrm/（男）谢尔盖.vrm',
    needsSceneFlip: false,
    flippedSkeleton: true,
    ttsVoice: 'alex',
  },
]

/** 所有模型 */
export const ALL_VRM_MODELS: VrmModelInfo[] = [...INTERVIEWER_MODELS, ...CANDIDATE_MODELS]

/** 根据 ID 查找模型 */
export function getModelById(id: string): VrmModelInfo | undefined {
  return ALL_VRM_MODELS.find(m => m.id === id)
}

/** 根据角色获取模型列表 */
export function getModelsByRole(role: 'interviewer' | 'candidate'): VrmModelInfo[] {
  return role === 'interviewer' ? INTERVIEWER_MODELS : CANDIDATE_MODELS
}
