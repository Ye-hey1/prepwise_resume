/**
 * 面试准备计划 Store
 * 系统化 4-8 周面试准备计划，按真实优先级编排
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/** 准备阶段 */
export type PreparationPhase =
  | 'project'        // 项目经历与简历深挖
  | 'core'           // Java核心/MySQL/Redis
  | 'framework'      // 框架应用
  | 'system'         // 系统设计与场景题
  | 'basic'          // 计算机基础
  | 'distributed'    // 分布式与高并发
  | 'jvm'            // JVM

/** 任务状态 */
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'skipped'

/** 准备任务 */
export interface PreparationTask {
  id: string
  phaseId: PreparationPhase
  title: string
  description: string
  resources: string[]  // 学习资源链接
  estimatedHours: number
  status: TaskStatus
  completedAt?: string
  notes?: string
}

/** 准备阶段信息 */
export interface PhaseInfo {
  id: PreparationPhase
  name: string
  description: string
  order: number
  estimatedWeeks: number
  icon: string
  color: string
}

/** 计划配置 */
export interface PlanConfig {
  targetCompanies: string[]  // 目标公司类型（大厂、中小厂）
  targetRole: string         // 目标岗位
  totalWeeks: number         // 总准备周期（周）
  startAt: string            // 计划开始时间
  endAt: string              // 计划结束时间
}

/** 阶段定义 */
export const PREPARATION_PHASES: PhaseInfo[] = [
  {
    id: 'project',
    name: '项目经历与简历深挖',
    description: '梳理项目经验、准备 STAR 法则、优化简历表达',
    order: 1,
    estimatedWeeks: 1,
    icon: '📋',
    color: '#3b82f6',
  },
  {
    id: 'core',
    name: '核心基础',
    description: 'Java 核心、MySQL、Redis 等面试高频考点',
    order: 2,
    estimatedWeeks: 2,
    icon: '📚',
    color: '#8b5cf6',
  },
  {
    id: 'framework',
    name: '框架应用',
    description: 'Spring 全家桶、MyBatis 等主流框架',
    order: 3,
    estimatedWeeks: 1,
    icon: '🔧',
    color: '#06b6d4',
  },
  {
    id: 'system',
    name: '系统设计',
    description: '高并发系统设计、场景题、架构能力',
    order: 4,
    estimatedWeeks: 1,
    icon: '🏗️',
    color: '#f59e0b',
  },
  {
    id: 'basic',
    name: '计算机基础',
    description: '操作系统、计算机网络、数据结构算法',
    order: 5,
    estimatedWeeks: 1,
    icon: '💻',
    color: '#10b981',
  },
  {
    id: 'distributed',
    name: '分布式与高并发',
    description: '按需准备，适合中大型厂面试',
    order: 6,
    estimatedWeeks: 1,
    icon: '🌐',
    color: '#ef4444',
  },
  {
    id: 'jvm',
    name: 'JVM 与调优',
    description: '按需准备，适合后端深度岗位',
    order: 7,
    estimatedWeeks: 0.5,
    icon: '⚙️',
    color: '#6366f1',
  },
]

/** 默认任务列表 */
const DEFAULT_TASKS: PreparationTask[] = [
  // 阶段 1: 项目经历与简历深挖
  {
    id: 'project-1',
    phaseId: 'project',
    title: '梳理项目经历清单',
    description: '列出所有参与的项目，按重要性排序，确保能清晰讲述项目背景、职责、成果',
    resources: ['https://javaguide.cn'],
    estimatedHours: 4,
    status: 'pending',
  },
  {
    id: 'project-2',
    phaseId: 'project',
    title: '准备 STAR 法则项目介绍',
    description: '为每个核心项目准备 Situation、Task、Action、Result 结构的回答',
    resources: ['https://javaguide.cn'],
    estimatedHours: 6,
    status: 'pending',
  },
  {
    id: 'project-3',
    phaseId: 'project',
    title: '优化简历项目描述',
    description: '确保项目经历包含具体技术栈、量化成果、个人贡献',
    resources: [],
    estimatedHours: 3,
    status: 'pending',
  },

  // 阶段 2: 核心基础
  {
    id: 'core-1',
    phaseId: 'core',
    title: 'Java 集合框架',
    description: 'HashMap、ArrayList、LinkedList 等常用集合的原理和使用场景',
    resources: ['https://javaguide.cn'],
    estimatedHours: 8,
    status: 'pending',
  },
  {
    id: 'core-2',
    phaseId: 'core',
    title: 'Java 并发编程',
    description: '线程池、锁机制、volatile、CAS 等并发基础知识',
    resources: ['https://javaguide.cn'],
    estimatedHours: 10,
    status: 'pending',
  },
  {
    id: 'core-3',
    phaseId: 'core',
    title: 'MySQL 核心知识点',
    description: '索引原理、事务隔离级别、SQL 优化、锁机制',
    resources: ['https://javaguide.cn'],
    estimatedHours: 8,
    status: 'pending',
  },
  {
    id: 'core-4',
    phaseId: 'core',
    title: 'Redis 数据结构与使用场景',
    description: 'String、Hash、List、ZSet、Set 的使用场景和底层实现',
    resources: ['https://javaguide.cn'],
    estimatedHours: 6,
    status: 'pending',
  },

  // 阶段 3: 框架应用
  {
    id: 'framework-1',
    phaseId: 'framework',
    title: 'Spring IOC/AOP 原理',
    description: '理解依赖注入、Bean 生命周期、AOP 实现原理',
    resources: ['https://javaguide.cn'],
    estimatedHours: 6,
    status: 'pending',
  },
  {
    id: 'framework-2',
    phaseId: 'framework',
    title: 'Spring MVC 请求流程',
    description: '理解 DispatcherServlet、HandlerMapping、HandlerAdapter 等组件',
    resources: ['https://javaguide.cn'],
    estimatedHours: 4,
    status: 'pending',
  },
  {
    id: 'framework-3',
    phaseId: 'framework',
    title: 'Spring Boot 自动配置',
    description: '理解 @SpringBootApplication、starter 原理、条件注解',
    resources: ['https://javaguide.cn'],
    estimatedHours: 4,
    status: 'pending',
  },
  {
    id: 'framework-4',
    phaseId: 'framework',
    title: 'MyBatis 缓存与动态代理',
    description: '一级缓存、二级缓存、Mapper 代理实现',
    resources: ['https://javaguide.cn'],
    estimatedHours: 3,
    status: 'pending',
  },

  // 阶段 4: 系统设计
  {
    id: 'system-1',
    phaseId: 'system',
    title: '常见系统设计场景',
    description: '短链接生成、秒杀系统、分布式 ID、消息队列等经典场景',
    resources: ['https://javaguide.cn'],
    estimatedHours: 10,
    status: 'pending',
  },
  {
    id: 'system-2',
    phaseId: 'system',
    title: '高并发系统设计原则',
    description: '缓存、限流、降级、熔断等高并发处理方案',
    resources: ['https://javaguide.cn'],
    estimatedHours: 8,
    status: 'pending',
  },

  // 阶段 5: 计算机基础
  {
    id: 'basic-1',
    phaseId: 'basic',
    title: '操作系统核心概念',
    description: '进程与线程、内存管理、文件系统、I/O 模型',
    resources: ['https://javaguide.cn'],
    estimatedHours: 6,
    status: 'pending',
  },
  {
    id: 'basic-2',
    phaseId: 'basic',
    title: '计算机网络核心协议',
    description: 'TCP/IP、HTTP/HTTPS、DNS、三次握手四次挥手',
    resources: ['https://javaguide.cn'],
    estimatedHours: 5,
    status: 'pending',
  },
  {
    id: 'basic-3',
    phaseId: 'basic',
    title: '数据结构与算法',
    description: '链表、树、哈希表、排序算法，重点刷 LeetCode 热题',
    resources: ['https://javaguide.cn'],
    estimatedHours: 12,
    status: 'pending',
  },

  // 阶段 6: 分布式（按需）
  {
    id: 'distributed-1',
    phaseId: 'distributed',
    title: '分布式事务',
    description: '2PC、3PC、TCC、本地消息表、Saga 等分布式事务方案',
    resources: ['https://javaguide.cn'],
    estimatedHours: 6,
    status: 'pending',
  },
  {
    id: 'distributed-2',
    phaseId: 'distributed',
    title: '分布式锁与缓存',
    description: 'Redis 分布式锁、缓存一致性、缓存穿透/击穿/雪崩',
    resources: ['https://javaguide.cn'],
    estimatedHours: 6,
    status: 'pending',
  },

  // 阶段 7: JVM（按需）
  {
    id: 'jvm-1',
    phaseId: 'jvm',
    title: 'JVM 内存结构',
    description: '堆、栈、方法区、程序计数器的作用和区别',
    resources: ['https://javaguide.cn'],
    estimatedHours: 4,
    status: 'pending',
  },
  {
    id: 'jvm-2',
    phaseId: 'jvm',
    title: '垃圾收集算法与 GC',
    description: '标记清除、复制、标记整理、分代收集，G1、CMS 收集器',
    resources: ['https://javaguide.cn'],
    estimatedHours: 5,
    status: 'pending',
  },
]

const STORAGE_KEY = 'prepwise-interview-plan'

export const useInterviewPlanStore = defineStore('interviewPlan', () => {
  const config = ref<PlanConfig>({
    targetCompanies: [],
    targetRole: 'Java后端开发',
    totalWeeks: 6,
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000).toISOString(),
  })

  const tasks = ref<PreparationTask[]>([])
  const currentPhase = ref<PreparationPhase | null>(null)

  /** 按阶段分组的任务 */
  const tasksByPhase = computed<Record<PreparationPhase, PreparationTask[]>>(() => {
    const grouped: Record<string, PreparationTask[]> = {}
    for (const phase of PREPARATION_PHASES) {
      grouped[phase.id] = tasks.value.filter(t => t.phaseId === phase.id)
    }
    return grouped as Record<PreparationPhase, PreparationTask[]>
  })

  /** 当前进度百分比 */
  const overallProgress = computed(() => {
    if (tasks.value.length === 0) return 0
    const completed = tasks.value.filter(t => t.status === 'completed').length
    return Math.round((completed / tasks.value.length) * 100)
  })

  /** 各阶段进度 */
  const phaseProgress = computed<Record<PreparationPhase, number>>(() => {
    const progress: Record<string, number> = {}
    for (const phase of PREPARATION_PHASES) {
      const phaseTasks = tasks.value.filter(t => t.phaseId === phase.id)
      const completed = phaseTasks.filter(t => t.status === 'completed').length
      progress[phase.id] = phaseTasks.length > 0 ? Math.round((completed / phaseTasks.length) * 100) : 0
    }
    return progress as Record<PreparationPhase, number>
  })

  /** 当前应关注的阶段 */
  const recommendedPhase = computed<PhaseInfo | null>(() => {
    // 找到第一个未完成的阶段
    for (const phase of PREPARATION_PHASES) {
      const progress = phaseProgress.value[phase.id]
      if (progress < 100) {
        return phase
      }
    }
    return PREPARATION_PHASES[0] || null
  })

  /** 待完成任务数量 */
  const pendingTasksCount = computed(() => {
    return tasks.value.filter(t => t.status === 'pending').length
  })

  /** 进行中任务数量 */
  const inProgressTasksCount = computed(() => {
    return tasks.value.filter(t => t.status === 'in-progress').length
  })

  /** 已完成任务数量 */
  const completedTasksCount = computed(() => {
    return tasks.value.filter(t => t.status === 'completed').length
  })

  /** 初始化计划 */
  function initializePlan(customConfig?: Partial<PlanConfig>) {
    if (customConfig) {
      Object.assign(config.value, customConfig)
    }
    tasks.value = JSON.parse(JSON.stringify(DEFAULT_TASKS))
    currentPhase.value = PREPARATION_PHASES[0]?.id || null
    saveToStorage()
  }

  /** 更新任务状态 */
  function updateTaskStatus(taskId: string, status: TaskStatus, notes?: string) {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    task.status = status
    if (notes) task.notes = notes

    if (status === 'completed') {
      task.completedAt = new Date().toISOString()
    }

    // 自动切换到下一阶段
    checkPhaseProgress()
    saveToStorage()
  }

  /** 检查阶段进度，自动切换 */
  function checkPhaseProgress() {
    for (const phase of PREPARATION_PHASES) {
      const phaseTasks = tasks.value.filter(t => t.phaseId === phase.id)
      const allCompleted = phaseTasks.every(t => t.status === 'completed' || t.status === 'skipped')
      const currentPhaseOrder = PREPARATION_PHASES.find(p => p.id === currentPhase.value)?.order ?? 0

      if (allCompleted && (!currentPhase.value || phase.order > currentPhaseOrder)) {
        const nextPhase = PREPARATION_PHASES.find(p => p.order > phase.order)
        if (nextPhase) {
          currentPhase.value = nextPhase.id
        }
      }
    }
  }

  /** 获取下一个待完成任务 */
  function getNextTask(): PreparationTask | null {
    // 优先返回当前阶段的第一个待完成任务
    if (currentPhase.value) {
      const currentPhaseTasks = tasks.value
        .filter(t => t.phaseId === currentPhase.value && t.status === 'pending')
        .sort((a, b) => DEFAULT_TASKS.findIndex(task => task.id === a.id) - DEFAULT_TASKS.findIndex(task => task.id === b.id))
      if (currentPhaseTasks.length > 0) {
        return currentPhaseTasks[0] ?? null
      }
    }

    // 如果当前阶段没有待办任务，返回所有任务中第一个待办的
    return tasks.value.find(t => t.status === 'pending') || null
  }

  /** 开始任务 */
  function startTask(taskId: string) {
    updateTaskStatus(taskId, 'in-progress')
  }

  /** 完成任务 */
  function completeTask(taskId: string, notes?: string) {
    updateTaskStatus(taskId, 'completed', notes)
  }

  /** 跳过任务 */
  function skipTask(taskId: string) {
    updateTaskStatus(taskId, 'skipped')
  }

  /** 重置计划 */
  function resetPlan() {
    tasks.value = []
    currentPhase.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  /** 持久化 */
  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      config: config.value,
      tasks: tasks.value,
      currentPhase: currentPhase.value,
    }))
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        initializePlan()
        return
      }
      const data = JSON.parse(raw)
      if (data.config) config.value = data.config
      if (Array.isArray(data.tasks)) tasks.value = data.tasks
      if (data.currentPhase) currentPhase.value = data.currentPhase
    } catch {
      console.warn('[InterviewPlan] 加载失败，使用默认配置')
      initializePlan()
    }
  }

  // 初始化时加载数据
  loadFromStorage()

  watch(tasks, () => saveToStorage(), { deep: true })
  watch(config, () => saveToStorage(), { deep: true })
  watch(currentPhase, () => saveToStorage())

  return {
    config,
    tasks,
    currentPhase,
    tasksByPhase,
    overallProgress,
    phaseProgress,
    recommendedPhase,
    pendingTasksCount,
    inProgressTasksCount,
    completedTasksCount,
    initializePlan,
    updateTaskStatus,
    startTask,
    completeTask,
    skipTask,
    resetPlan,
    getNextTask,
  }
})
