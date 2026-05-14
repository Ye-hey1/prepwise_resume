import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { normalizeResumeTemplateKey, type ResumeTemplateKey } from '@/templates/resume'

export interface BasicInfo {
  name: string
  phone: string
  email: string
  age: string
  gender: string
  location: string
  jobTitle: string
  educationLevel: string
  avatar: string
  workYears: string
  currentStatus: string
  expectedLocation: string
  expectedSalary: string
  website: string
  wechat: string
  currentCity: string
  github: string
  blog: string
}

export interface EducationEntry {
  id: string
  school: string
  college: string
  major: string
  degree: string
  startDate: string
  endDate: string
  gpa: string
  description: string
  type: string
  location: string
}

export interface WorkEntry {
  id: string
  company: string
  department: string
  position: string
  startDate: string
  endDate: string
  location: string
  description: string
}

export interface ProjectEntry {
  id: string
  name: string
  role: string
  startDate: string
  endDate: string
  link: string
  introduction: string
  mainWork: string
}

export interface AwardEntry {
  id: string
  name: string
  date: string
  description: string
}

export interface ModuleConfig {
  key: string
  label: string
  icon: string
  visible: boolean
}

export interface TemplateCustomization {
  primaryColor?: string
  accentColor?: string
  fontFamily?: string
  fontSize?: number
  sectionSpacing?: number
  pagePaddingX?: number
  pagePaddingY?: number
  titleMarginTop?: number
  titleMarginBottom?: number
  lineHeight?: number
  layoutAlign?: 'left' | 'center' | 'right' | 'space-between'
  metaDisplay?: 'text' | 'icon' | 'pure'
  avatarShape?: 'rounded' | 'circle' | 'hidden'
}

type MoveDirection = 'up' | 'down'
const DEFAULT_MODULE_ORDER = [
  'basicInfo',
  'education',
  'skills',
  'workExperience',
  'projectExperience',
  'awards',
  'selfIntro',
] as const

let _idCounter = 0
function genId(): string {
  return `item_${Date.now()}_${++_idCounter}`
}

export const useResumeStore = defineStore('resume', () => {
  const modules = reactive<ModuleConfig[]>([
    { key: 'basicInfo', label: '基本信息', icon: '👤', visible: true },
    { key: 'education', label: '教育经历', icon: '🎓', visible: true },
    { key: 'skills', label: '专业技能', icon: '⚡', visible: true },
    { key: 'workExperience', label: '工作经历', icon: '💼', visible: true },
    { key: 'projectExperience', label: '项目经历', icon: '📁', visible: true },
    { key: 'awards', label: '荣誉奖项', icon: '🏆', visible: false },
    { key: 'selfIntro', label: '个人简介', icon: '📝', visible: false },
  ])

  const basicInfo = reactive<BasicInfo>({
    name: '',
    phone: '',
    email: '',
    age: '',
    gender: '',
    location: '',
    jobTitle: '',
    educationLevel: '',
    avatar: '',
    workYears: '',
    currentStatus: '',
    expectedLocation: '',
    expectedSalary: '',
    website: '',
    wechat: '',
    currentCity: '',
    github: '',
    blog: '',
  })

  const educationList = reactive<EducationEntry[]>([
    {
      id: genId(),
      school: '',
      college: '',
      major: '',
      degree: '',
      startDate: '',
      endDate: '',
      gpa: '',
      description: '',
      type: '',
      location: '',
    },
  ])

  const skills = ref('')

  const workList = reactive<WorkEntry[]>([
    {
      id: genId(),
      company: '',
      department: '',
      position: '',
      startDate: '',
      endDate: '',
      location: '',
      description: '',
    },
  ])

  const projectList = reactive<ProjectEntry[]>([
    {
      id: genId(),
      name: '',
      role: '',
      startDate: '',
      endDate: '',
      link: '',
      introduction: '',
      mainWork: '',
    },
  ])

  const awardList = reactive<AwardEntry[]>([])
  const selfIntro = ref('')
  const showProjectSubtitles = ref(true)
  const selectedTemplateKey = ref<ResumeTemplateKey>('default')
  const templateCustomizations = reactive<Record<string, TemplateCustomization>>({})
  const nextAutoSaveAt = ref<number | null>(null)
  const lastSavedAt = ref<number | null>(null)
  const lastSaveMode = ref<'auto' | 'manual' | null>(null)
  const isSaving = ref(false)
  const importFeedbackText = ref('')
  const importFeedbackVisible = ref(false)

  function toggleModule(key: string) {
    const mod = modules.find((m) => m.key === key)
    if (mod) mod.visible = !mod.visible
  }

  function setTemplate(key: ResumeTemplateKey) {
    selectedTemplateKey.value = key
  }

  function canMoveModule(key: string, direction: MoveDirection): boolean {
    if (key === 'basicInfo') return false
    const idx = modules.findIndex((m) => m.key === key)
    if (idx < 0) return false
    const mod = modules[idx]
    if (!mod?.visible) return false
    if (direction === 'up') return idx > 1
    return idx < modules.length - 1
  }

  function moveModule(key: string, direction: MoveDirection) {
    if (!canMoveModule(key, direction)) return
    const idx = modules.findIndex((m) => m.key === key)
    if (idx < 0) return
    const target = direction === 'up' ? idx - 1 : idx + 1
    const current = modules[idx]
    const next = modules[target]
    if (!current || !next) return
    modules[idx] = next
    modules[target] = current
  }

  function reorderModule(sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey || sourceKey === 'basicInfo') return
    const sourceIndex = modules.findIndex((m) => m.key === sourceKey)
    const targetIndex = modules.findIndex((m) => m.key === targetKey)
    if (sourceIndex < 0 || targetIndex < 0) return

    const [sourceModule] = modules.splice(sourceIndex, 1)
    if (!sourceModule) return

    let nextIndex = targetKey === 'basicInfo' ? 1 : targetIndex
    if (sourceIndex < targetIndex) {
      nextIndex -= 1
    }
    nextIndex = Math.max(1, Math.min(nextIndex, modules.length))

    modules.splice(nextIndex, 0, sourceModule)
  }

  function isDefaultModuleOrder(): boolean {
    return modules.every((m, idx) => m.key === DEFAULT_MODULE_ORDER[idx])
  }

  function resetModuleOrder() {
    const indexMap = new Map<string, number>()
    DEFAULT_MODULE_ORDER.forEach((key, idx) => indexMap.set(key, idx))
    const sorted = [...modules].sort((a, b) => {
      const ai = indexMap.get(a.key)
      const bi = indexMap.get(b.key)
      if (ai === undefined && bi === undefined) return 0
      if (ai === undefined) return 1
      if (bi === undefined) return -1
      return ai - bi
    })
    modules.splice(0, modules.length, ...sorted)
  }

  function isModuleVisible(key: string): boolean {
    const mod = modules.find((m) => m.key === key)
    return mod ? mod.visible : false
  }

  function addEducation() {
    educationList.push({
      id: genId(),
      school: '',
      college: '',
      major: '',
      degree: '',
      startDate: '',
      endDate: '',
      gpa: '',
      description: '',
      type: '',
      location: '',
    })
  }

  function removeEducation(id: string) {
    const idx = educationList.findIndex((e) => e.id === id)
    if (idx > -1) educationList.splice(idx, 1)
  }

  function addWork() {
    workList.push({
      id: genId(),
      company: '',
      department: '',
      position: '',
      startDate: '',
      endDate: '',
      location: '',
      description: '',
    })
  }

  function removeWork(id: string) {
    const idx = workList.findIndex((e) => e.id === id)
    if (idx > -1) workList.splice(idx, 1)
  }

  function addProject() {
    projectList.push({
      id: genId(),
      name: '',
      role: '',
      startDate: '',
      endDate: '',
      link: '',
      introduction: '',
      mainWork: '',
    })
  }

  function removeProject(id: string) {
    const idx = projectList.findIndex((e) => e.id === id)
    if (idx > -1) projectList.splice(idx, 1)
  }

  function addAward() {
    awardList.push({
      id: genId(),
      name: '',
      date: '',
      description: '',
    })
  }

  function removeAward(id: string) {
    const idx = awardList.findIndex((e) => e.id === id)
    if (idx > -1) awardList.splice(idx, 1)
  }

  function getCustomization(templateKey: string): TemplateCustomization {
    return templateCustomizations[templateKey] ?? {}
  }

  function setCustomization(templateKey: string, custom: Partial<TemplateCustomization>) {
    const existing = templateCustomizations[templateKey] ?? {}
    templateCustomizations[templateKey] = { ...existing, ...custom }
  }

  function resetCustomization(templateKey: string) {
    delete templateCustomizations[templateKey]
  }

  // ── JD 分析结果跳转到编辑模块 ──
  const pendingScrollToModule = ref<string | null>(null)

  function requestScrollToModule(moduleKey: string) {
    pendingScrollToModule.value = moduleKey
  }

  function clearScrollToModule() {
    pendingScrollToModule.value = null
  }

  // ── JD 优化建议应用回写 ──
  type SuggestionSection = 'skills' | 'selfIntro' | 'basicInfo' | 'workExperience' | 'projectExperience'

  function applySuggestionToStore(section: string, suggestedText: string): boolean {
    if (!suggestedText.trim()) return false

    let updated = false
    const logPrefix = `[Apply Suggestion: ${section}]`

    try {
      switch (section as SuggestionSection) {
        case 'skills':
          skills.value = suggestedText
          updated = true
          break
        case 'selfIntro':
          selfIntro.value = suggestedText
          updated = true
          break
        case 'basicInfo': {
          // 智能分词：尝试提取 JobTitle
          const lines = suggestedText.split('\n').filter((l) => l.trim()) as string[] & { 0: string }
          if (lines.length === 1 && !lines[0].includes('：') && !lines[0].includes(':')) {
             basicInfo.jobTitle = lines[0].trim()
             updated = true
          } else {
            for (const line of lines) {
              const sep = line.includes(':') ? ':' : '：'
              const [rawKey, ...rest] = line.split(sep)
              const val = rest.join(sep).trim()
              const key = rawKey?.trim() ?? ''
              
              // 匹配中英文键名映射
              const keyMap: Record<string, keyof BasicInfo> = {
                '意向岗位': 'jobTitle', '目标岗位': 'jobTitle', 'jobTitle': 'jobTitle',
                '求职意向': 'jobTitle', '姓名': 'name', '电话': 'phone'
              }
              const targetKey = keyMap[key] || (key in basicInfo ? key as keyof BasicInfo : null)
              
              if (targetKey && val) {
                ;(basicInfo as any)[targetKey] = val
                updated = true
              }
            }
          }
          break
        }
        case 'workExperience': {
          // 应用至第一条（最相关的）经历
          if (workList.length === 0) {
            addWork()
          }
          const target = workList[0]
          if (target) {
            target.description = suggestedText
            updated = true
          }
          break
        }
        case 'projectExperience': {
          if (projectList.length === 0) {
            addProject()
          }
          const target = projectList[0]
          if (target) {
            target.mainWork = suggestedText
            updated = true
          }
          break
        }
        default:
          console.warn(`${logPrefix} Unsupported section`)
          return false
      }
    } catch (e) {
      console.error(`${logPrefix} Failed`, e)
      return false
    }

    if (updated) {
      saveToStorage('auto')
      showImportFeedback(`已成功应用至「${modules.find(m => m.key === section)?.label || section}」模块`)
    }
    return updated
  }

  function canApplySuggestion(section: string): boolean {
    return ['skills', 'selfIntro', 'basicInfo', 'workExperience', 'projectExperience'].includes(section)
  }

  const STORAGE_KEY = 'resume-builder-data'
  const AUTO_SAVE_DELAY_MS = 500
  const SAVE_LOADING_MIN_MS = 900

  let saveLoadingTimer: ReturnType<typeof setTimeout> | null = null

  function markSavingState() {
    isSaving.value = true
    if (saveLoadingTimer) clearTimeout(saveLoadingTimer)
    saveLoadingTimer = setTimeout(() => {
      isSaving.value = false
      saveLoadingTimer = null
    }, SAVE_LOADING_MIN_MS)
  }

  let importFeedbackTimer: ReturnType<typeof setTimeout> | null = null

  function showImportFeedback(message: string, duration = 2600) {
    importFeedbackText.value = message
    importFeedbackVisible.value = true
    if (importFeedbackTimer) clearTimeout(importFeedbackTimer)
    importFeedbackTimer = setTimeout(() => {
      importFeedbackVisible.value = false
      importFeedbackText.value = ''
      importFeedbackTimer = null
    }, duration)
  }

  function clearImportFeedback() {
    if (importFeedbackTimer) {
      clearTimeout(importFeedbackTimer)
      importFeedbackTimer = null
    }
    importFeedbackVisible.value = false
    importFeedbackText.value = ''
  }

  function saveToStorage(mode: 'auto' | 'manual' = 'manual') {
    if (mode === 'manual' && saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    markSavingState()
    const data = {
      modules: modules.map((m) => ({ ...m })),
      selectedTemplateKey: selectedTemplateKey.value,
      basicInfo: { ...basicInfo },
      educationList: educationList.map((e) => ({ ...e })),
      skills: skills.value,
      workList: workList.map((w) => ({ ...w })),
      projectList: projectList.map((p) => ({ ...p })),
      awardList: awardList.map((a) => ({ ...a })),
      selfIntro: selfIntro.value,
      templateCustomizations: { ...templateCustomizations },
      showProjectSubtitles: showProjectSubtitles.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    nextAutoSaveAt.value = null
    lastSavedAt.value = Date.now()
    lastSaveMode.value = mode
  }

  function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const data = JSON.parse(raw)
      if (data.modules) {
        const byKey = new Map<string, ModuleConfig>()
        ;(data.modules as ModuleConfig[]).forEach((m) => {
          if (m?.key) byKey.set(m.key, m)
        })

        const orderedKeys = [
          'basicInfo',
          ...(data.modules as ModuleConfig[]).map((m) => m.key).filter((key) => key && key !== 'basicInfo'),
        ]

        const seen = new Set<string>()
        const nextModules: ModuleConfig[] = []

        orderedKeys.forEach((key) => {
          if (seen.has(key)) return
          seen.add(key)
          const fallback = modules.find((m) => m.key === key)
          if (!fallback) return
          nextModules.push({ ...fallback, ...byKey.get(key) })
        })

        modules.forEach((m) => {
          if (seen.has(m.key)) return
          nextModules.push({ ...m, ...byKey.get(m.key) })
        })

        modules.splice(0, modules.length, ...nextModules)
      }
      selectedTemplateKey.value = normalizeResumeTemplateKey(data.selectedTemplateKey ?? data.selectedTemplateId)
      if (data.basicInfo) Object.assign(basicInfo, data.basicInfo)
      if (data.educationList) {
        educationList.splice(0, educationList.length, ...data.educationList)
      }
      if (data.skills !== undefined) skills.value = data.skills
      if (data.workList) {
        workList.splice(0, workList.length, ...data.workList)
      }
      if (data.projectList) {
        projectList.splice(0, projectList.length, ...data.projectList)
      }
      if (data.awardList) {
        awardList.splice(0, awardList.length, ...data.awardList)
      }
      if (data.selfIntro !== undefined) selfIntro.value = data.selfIntro
      if (data.showProjectSubtitles !== undefined) showProjectSubtitles.value = data.showProjectSubtitles
      if (data.templateCustomizations) {
        Object.keys(data.templateCustomizations).forEach((key) => {
          templateCustomizations[key] = data.templateCustomizations[key]
        })
      }
    } catch (e) {
      console.warn('Failed to load resume data from localStorage', e)
    }
  }

  loadFromStorage()

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [
      () => JSON.stringify(basicInfo),
      () => JSON.stringify(educationList),
      skills,
      () => JSON.stringify(workList),
      () => JSON.stringify(projectList),
      () => JSON.stringify(awardList),
      selfIntro,
      showProjectSubtitles,
      selectedTemplateKey,
      () => JSON.stringify(modules),
      () => JSON.stringify(templateCustomizations),
    ],
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      nextAutoSaveAt.value = Date.now() + AUTO_SAVE_DELAY_MS
      saveTimer = setTimeout(() => {
        saveTimer = null
        saveToStorage('auto')
      }, AUTO_SAVE_DELAY_MS)
    },
    { deep: true }
  )

  // 导入数据 — 参考 loadFromStorage 的数据恢复模式
  function importData(data: {
    basicInfo?: Partial<BasicInfo>
    educationList?: EducationEntry[]
    skills?: string
    workList?: WorkEntry[]
    projectList?: ProjectEntry[]
    awardList?: AwardEntry[]
    selfIntro?: string
  }): void {
    if (data.basicInfo) Object.assign(basicInfo, data.basicInfo)
    if (data.educationList)
      educationList.splice(
        0,
        educationList.length,
        ...data.educationList.map((e) => ({ ...e, id: e.id || genId() })),
      )
    if (data.skills !== undefined) skills.value = data.skills
    if (data.workList)
      workList.splice(
        0,
        workList.length,
        ...data.workList.map((w) => ({ ...w, id: w.id || genId() })),
      )
    if (data.projectList)
      projectList.splice(
        0,
        projectList.length,
        ...data.projectList.map((p) => ({ ...p, id: p.id || genId() })),
      )
    if (data.awardList)
      awardList.splice(
        0,
        awardList.length,
        ...data.awardList.map((a) => ({ ...a, id: a.id || genId() })),
      )
    if (data.selfIntro !== undefined) selfIntro.value = data.selfIntro
  }

  // 清空所有数据 — 用于导入前重置
  function clearAllData(): void {
    const defaultBasicInfo: BasicInfo = {
      name: '',
      phone: '',
      email: '',
      age: '',
      gender: '',
      location: '',
      jobTitle: '',
      educationLevel: '',
      avatar: '',
      workYears: '',
      currentStatus: '',
      expectedLocation: '',
      expectedSalary: '',
      website: '',
      wechat: '',
      currentCity: '',
      github: '',
      blog: '',
    }
    Object.assign(basicInfo, defaultBasicInfo)
    educationList.splice(0, educationList.length, { id: genId(), school: '', college: '', major: '', degree: '', startDate: '', endDate: '', gpa: '', description: '', type: '', location: '' })
    skills.value = ''
    workList.splice(0, workList.length, { id: genId(), company: '', department: '', position: '', startDate: '', endDate: '', location: '', description: '' })
    projectList.splice(0, projectList.length, { id: genId(), name: '', role: '', startDate: '', endDate: '', link: '', introduction: '', mainWork: '' })
    awardList.splice(0, awardList.length)
    selfIntro.value = ''
  }

  // 导出为 JSON 兼容的纯对象
  function exportToJSON(): Record<string, unknown> {
    return {
      basicInfo: { ...basicInfo },
      educationList: educationList.map((e) => ({ ...e })),
      skills: skills.value,
      workList: workList.map((w) => ({ ...w })),
      projectList: projectList.map((p) => ({ ...p })),
      awardList: awardList.map((a) => ({ ...a })),
      selfIntro: selfIntro.value,
      showProjectSubtitles: showProjectSubtitles.value,
      modules: modules.map((m) => ({ ...m })),
      selectedTemplateKey: selectedTemplateKey.value,
      templateCustomizations: { ...templateCustomizations },
    }
  }

  return {
    modules,
    selectedTemplateKey,
    templateCustomizations,
    basicInfo,
    educationList,
    skills,
    workList,
    projectList,
    awardList,
    selfIntro,
    showProjectSubtitles,
    importFeedbackText,
    importFeedbackVisible,
    importData,
    clearAllData,
    exportToJSON,
    toggleModule,
    setTemplate,
    canMoveModule,
    moveModule,
    reorderModule,
    isDefaultModuleOrder,
    resetModuleOrder,
    isModuleVisible,
    addEducation,
    removeEducation,
    addWork,
    removeWork,
    addProject,
    removeProject,
    addAward,
    removeAward,
    getCustomization,
    setCustomization,
    resetCustomization,
    showImportFeedback,
    clearImportFeedback,
    saveToStorage,
    autoSaveDelayMs: AUTO_SAVE_DELAY_MS,
    nextAutoSaveAt,
    lastSavedAt,
    lastSaveMode,
    isSaving,
    pendingScrollToModule,
    requestScrollToModule,
    clearScrollToModule,
    applySuggestionToStore,
    canApplySuggestion,
  }
})
