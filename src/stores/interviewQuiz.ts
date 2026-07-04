/**
 * 面试技术自测题库 Store
 * 模拟真实面试场景，提供按阶段/难度/标签筛选的题库和自测功能
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** 题目难度 */
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

/** 题目类型 */
export type QuestionType = 'multiple-choice' | 'true-false' | 'short-answer'

/** 题目标签 */
export type QuestionTag =
  | 'java-core'
  | 'java-concurrent'
  | 'jvm'
  | 'spring'
  | 'mysql'
  | 'redis'
  | 'distributed'
  | 'algorithm'
  | 'network'
  | 'os'
  | 'system-design'

/** 题目状态 */
export type QuestionStatus = 'correct' | 'wrong' | 'skipped'

/** 单个选择题选项 */
export interface ChoiceOption {
  id: string
  text: string
  isCorrect: boolean
}

/** 面试题目 */
export interface QuizQuestion {
  id: string
  type: QuestionType
  difficulty: QuestionDifficulty
  tags: QuestionTag[]
  phaseId: string  // 对应准备计划的阶段
  question: string
  options?: ChoiceOption[]  // 选择题选项
  answer: string  // 正确答案或答案要点
  explanation: string  // 详细解析
  resources?: string[]  // 扩展学习资源
}

/** 用户答题记录 */
export interface AnswerRecord {
  questionId: string
  userAnswer: string | string[]
  isCorrect: boolean
  status: QuestionStatus
  answeredAt: string
  timeSpent: number  // 秒
}

/** 自测会话 */
export interface QuizSession {
  id: string
  name: string
  questions: QuizQuestion[]
  answers: Map<string, AnswerRecord>
  startedAt: string
  completedAt?: string
  config: QuizSessionConfig
}

type SerializedQuizSession = Omit<QuizSession, 'answers'> & {
  answers: [string, AnswerRecord][]
}

/** 自测会话配置 */
export interface QuizSessionConfig {
  phaseId?: string  // 筛选阶段
  tags?: QuestionTag[]  // 筛选标签
  difficulty?: QuestionDifficulty[]  // 筛选难度
  questionCount: number  // 题目数量
  randomOrder: boolean  // 随机顺序
  showAnswer: boolean  // 答题后显示答案
}

/** 统计数据 */
export interface QuizStatistics {
  totalAnswered: number
  correctCount: number
  wrongCount: number
  skippedCount: number
  accuracy: number
  avgTimeSpent: number
  weakTags: QuestionTag[]  // 薄弱知识点
  strongTags: QuestionTag[]  // 优势知识点
}

/** 题目标签信息 */
export const QUESTION_TAG_INFO: Record<QuestionTag, { name: string; color: string; icon: string }> = {
  'java-core': { name: 'Java核心', color: '#3b82f6', icon: '☕' },
  'java-concurrent': { name: '并发编程', color: '#8b5cf6', icon: '🔀' },
  'jvm': { name: 'JVM', color: '#6366f1', icon: '⚙️' },
  'spring': { name: 'Spring', color: '#06b6d4', icon: '🍃' },
  'mysql': { name: 'MySQL', color: '#10b981', icon: '🗄️' },
  'redis': { name: 'Redis', color: '#ef4444', icon: '⚡' },
  'distributed': { name: '分布式', color: '#f59e0b', icon: '🌐' },
  'algorithm': { name: '算法', color: '#ec4899', icon: '🧮' },
  'network': { name: '网络', color: '#14b8a6', icon: '🌐' },
  'os': { name: '操作系统', color: '#84cc16', icon: '💻' },
  'system-design': { name: '系统设计', color: '#f97316', icon: '🏗️' },
}

/** 题库数据 */
const QUESTION_BANK: QuizQuestion[] = [
  // Java Core
  {
    id: 'jc-1',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['java-core'],
    phaseId: 'core',
    question: 'HashMap 在 Java 8 中的实现有什么重大变化？',
    options: [
      { id: 'a', text: '使用红黑树代替链表解决冲突', isCorrect: true },
      { id: 'b', text: '使用跳表代替链表', isCorrect: false },
      { id: 'c', text: '使用 B+ 树索引', isCorrect: false },
      { id: 'd', text: '移除了 hash 碰撞检测', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'Java 8 中，HashMap 在链表长度超过阈值（默认8）时，会将链表转换为红黑树，提高查询效率从 O(n) 到 O(log n)。转换条件：链表长度 >= 8 且数组长度 >= 64。',
    resources: ['https://javaguide.cn/java/collection/hashmap-source-code.html'],
  },
  {
    id: 'jc-2',
    type: 'multiple-choice',
    difficulty: 'easy',
    tags: ['java-core'],
    phaseId: 'core',
    question: 'ArrayList 和 LinkedList 的主要区别是什么？',
    options: [
      { id: 'a', text: 'ArrayList 查询快，LinkedList 增删快', isCorrect: true },
      { id: 'b', text: 'LinkedList 查询快，ArrayList 增删快', isCorrect: false },
      { id: 'c', text: '两者性能完全相同', isCorrect: false },
      { id: 'd', text: 'ArrayList 是线程安全的', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'ArrayList 基于动态数组，随机访问 O(1)，增删需要移动元素 O(n)；LinkedList 基于双向链表，随机访问 O(n)，增删只需修改指针 O(1)。',
  },
  {
    id: 'jc-3',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['java-core'],
    phaseId: 'core',
    question: 'String、StringBuilder、StringBuffer 的区别？',
    options: [
      { id: 'a', text: 'String 不可变，StringBuilder 可变且非线程安全，StringBuffer 可变且线程安全', isCorrect: true },
      { id: 'b', text: '三者都可变，性能相同', isCorrect: false },
      { id: 'c', text: 'StringBuilder 线程安全，StringBuffer 非线程安全', isCorrect: false },
      { id: 'd', text: 'String 性能最好', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'String 是 final 类，不可变；StringBuilder 和 StringBuffer 可变。StringBuilder 方法无 synchronized，性能更好；StringBuffer 所有方法都 synchronized，线程安全。',
  },

  // 并发编程
  {
    id: 'conc-1',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['java-concurrent'],
    phaseId: 'core',
    question: 'volatile 关键字的作用是什么？',
    options: [
      { id: 'a', text: '保证可见性和有序性，不保证原子性', isCorrect: true },
      { id: 'b', text: '保证原子性和可见性', isCorrect: false },
      { id: 'c', text: '仅保证有序性', isCorrect: false },
      { id: 'd', text: '等同于 synchronized', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'volatile 保证：1) 可见性（写操作立即刷回主存，读操作从主存读取）；2) 有序性（禁止指令重排）。不保证原子性，如 count++ 操作需要 synchronized 或 Atomic 类。',
  },
  {
    id: 'conc-2',
    type: 'multiple-choice',
    difficulty: 'hard',
    tags: ['java-concurrent'],
    phaseId: 'core',
    question: 'synchronized 锁升级过程是什么？',
    options: [
      { id: 'a', text: '无锁 -> 偏向锁 -> 轻量级锁 -> 重量级锁', isCorrect: true },
      { id: 'b', text: '无锁 -> 轻量级锁 -> 重量级锁 -> 偏向锁', isCorrect: false },
      { id: 'c', text: '直接升级到重量级锁', isCorrect: false },
      { id: 'd', text: '只有轻量级和重量级两种', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'JDK 1.6 后 synchronized 优化：偏向锁（一段同步代码一直被一个线程访问）-> 轻量级锁（其他线程竞争，升级为 CAS 自旋）-> 重量级锁（自旋超过次数或 CPU 核心数，升级为系统互斥量）。',
  },
  {
    id: 'conc-3',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['java-concurrent'],
    phaseId: 'core',
    question: 'ThreadPoolExecutor 的核心参数有哪些？',
    options: [
      { id: 'a', text: 'corePoolSize、maximumPoolSize、keepAliveTime、workQueue、threadFactory、handler', isCorrect: true },
      { id: 'b', text: '仅核心线程数和最大线程数', isCorrect: false },
      { id: 'c', text: '只有任务队列和拒绝策略', isCorrect: false },
      { id: 'd', text: '线程名称和优先级', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'ThreadPoolExecutor 7 个参数：1) corePoolSize 核心线程数；2) maximumPoolSize 最大线程数；3) keepAliveTime 非核心线程存活时间；4) unit 时间单位；5) workQueue 任务队列；6) threadFactory 线程工厂；7) handler 拒绝策略。',
  },

  // JVM
  {
    id: 'jvm-1',
    type: 'multiple-choice',
    difficulty: 'easy',
    tags: ['jvm'],
    phaseId: 'jvm',
    question: 'JVM 内存结构中哪些区域是线程共享的？',
    options: [
      { id: 'a', text: '堆和方法区', isCorrect: true },
      { id: 'b', text: '程序计数器和栈', isCorrect: false },
      { id: 'c', text: '本地方法栈', isCorrect: false },
      { id: 'd', text: '所有区域都是共享的', isCorrect: false },
    ],
    answer: 'a',
    explanation: '线程共享：堆（对象实例）、方法区（类信息、常量、静态变量）；线程私有：程序计数器（当前字节码行号）、虚拟机栈（方法调用、局部变量）、本地方法栈（native 方法）。',
  },
  {
    id: 'jvm-2',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['jvm'],
    phaseId: 'jvm',
    question: 'CMS 和 G1 收集器的区别？',
    options: [
      { id: 'a', text: 'CMS 是老年代收集器，G1 是 Region 化的全堆收集器', isCorrect: true },
      { id: 'b', text: 'G1 只收集新生代', isCorrect: false },
      { id: 'c', text: 'CMS 性能一定优于 G1', isCorrect: false },
      { id: 'd', text: '两者完全相同', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'CMS：标记-清除算法，关注低延迟，产生内存碎片；G1：Region 化堆，标记-整理 + 复制算法，可预测停顿时间，适合大内存堆（>6G），JDK 9 后成为默认。',
  },
  {
    id: 'jvm-3',
    type: 'multiple-choice',
    difficulty: 'hard',
    tags: ['jvm'],
    phaseId: 'jvm',
    question: '判断对象是否存活的各种算法及其优缺点？',
    options: [
      { id: 'a', text: '引用计数（循环回收问题）可达性分析（GC Root）', isCorrect: true },
      { id: 'b', text: '只有可达性分析', isCorrect: false },
      { id: 'c', text: '哈希表查找', isCorrect: false },
      { id: 'd', text: '对象年龄计数', isCorrect: false },
    ],
    answer: 'a',
    explanation: '1) 引用计数：简单但有循环引用问题；2) 可达性分析：从 GC Root（栈变量、静态变量、常量）出发，不可达即回收，解决循环引用，主流 JVM 采用。',
  },

  // Spring
  {
    id: 'spring-1',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['spring'],
    phaseId: 'framework',
    question: 'Spring Bean 的生命周期包含哪些主要阶段？',
    options: [
      { id: 'a', text: '实例化 -> 属性赋值 -> 初始化 -> 销毁', isCorrect: true },
      { id: 'b', text: '仅创建和销毁', isCorrect: false },
      { id: 'c', text: '直接可用，无需初始化', isCorrect: false },
      { id: 'd', text: '初始化在实例化之前', isCorrect: false },
    ],
    answer: 'a',
    explanation: '完整流程：1) 实例化（构造器）；2) 属性赋值（setter/注入）；3) BeanNameAware/BeanFactoryAware 等回调；4) BeanPostProcessor.before；5) InitializingBean.afterPropertiesSet/init-method；6) BeanPostProcessor.after；7) 使用；8) DisposableBean.destroy/destroy-method。',
  },
  {
    id: 'spring-2',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['spring'],
    phaseId: 'framework',
    question: 'Spring 事务的传播机制有哪些？',
    options: [
      { id: 'a', text: 'REQUIRED、REQUIRES_NEW、NESTED 等 7 种', isCorrect: true },
      { id: 'b', text: '只有 REQUIRED 一种', isCorrect: false },
      { id: 'c', text: '不支持事务传播', isCorrect: false },
      { id: 'd', text: '由数据库决定', isCorrect: false },
    ],
    answer: 'a',
    explanation: '7 种传播级别：REQUIRED（默认，有则加入，无则创建）；REQUIRES_NEW（总是创建新事务）；NESTED（嵌套事务，回滚点）；SUPPORTS（有则加入，无则非事务）；NOT_SUPPORTED（非事务执行）；MANDATORY（必须在事务中）；NEVER（不能在事务中）。',
  },
  {
    id: 'spring-3',
    type: 'multiple-choice',
    difficulty: 'easy',
    tags: ['spring'],
    phaseId: 'framework',
    question: '@Autowired 和 @Resource 的区别？',
    options: [
      { id: 'a', text: '@Autowired 按 byType，@Resource 按 byName', isCorrect: true },
      { id: 'b', text: '两者完全相同', isCorrect: false },
      { id: 'c', text: '@Resource 功能更强', isCorrect: false },
      { id: 'd', text: '@Autowired 是 JSR 注解', isCorrect: false },
    ],
    answer: 'a',
    explanation: '@Autowired：Spring 注解，按类型注入（byType），多个同类型时按 @Qualifier 名称；@Resource：JDK/JSR 注解，按名称注入（byName），无名称时按类型。',
  },

  // MySQL
  {
    id: 'mysql-1',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['mysql'],
    phaseId: 'core',
    question: 'InnoDB 的索引实现和数据存储方式？',
    options: [
      { id: 'a', text: '聚簇索引（主键索引）叶子节点存储完整数据行', isCorrect: true },
      { id: 'b', text: '所有索引都只存储主键', isCorrect: false },
      { id: 'c', text: '使用哈希索引', isCorrect: false },
      { id: 'd', text: '索引和数据分离存储', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'InnoDB 聚簇索引：主键索引的 B+ 树叶子节点存储完整数据行，辅助索引叶子节点存储主键值。回表：通过辅助索引查到主键，再通过主键索引查完整数据。',
  },
  {
    id: 'mysql-2',
    type: 'multiple-choice',
    difficulty: 'hard',
    tags: ['mysql'],
    phaseId: 'core',
    question: 'MySQL 事务隔离级别和 MVCC 实现原理？',
    options: [
      { id: 'a', text: 'Read Committed/Repeatable Read 通过 Read View + Undo Log 实现', isCorrect: true },
      { id: 'b', text: '仅靠锁机制实现', isCorrect: false },
      { id: 'c', text: 'MySQL 不支持 MVCC', isCorrect: false },
      { id: 'd', text: '所有隔离级别都相同', isCorrect: false },
    ],
    answer: 'a',
    explanation: '隔离级别：RU（读未提交）、RC（读已提交）、RR（可重复读，默认）、Serial（串行化）。RC/RR 通过 Read View + Undo Log 实现 MVCC：Read View 保存事务可见性快照，Undo Log 存储历史版本，实现非锁定读。',
  },
  {
    id: 'mysql-3',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['mysql'],
    phaseId: 'core',
    question: '什么是覆盖索引？',
    options: [
      { id: 'a', text: '索引包含查询所需的所有字段，无需回表', isCorrect: true },
      { id: 'b', text: '索引太多导致性能下降', isCorrect: false },
      { id: 'c', text: '主键索引', isCorrect: false },
      { id: 'd', text: '联合索引', isCorrect: false },
    ],
    answer: 'a',
    explanation: '覆盖索引：查询的 SELECT 字段都在索引中，辅助索引即可满足查询，避免回表。如：INDEX(col_a, col_b)，SELECT col_b WHERE col_a = ? 覆盖索引。',
  },

  // Redis
  {
    id: 'redis-1',
    type: 'multiple-choice',
    difficulty: 'easy',
    tags: ['redis'],
    phaseId: 'core',
    question: 'Redis 的 5 种基本数据结构及其使用场景？',
    options: [
      { id: 'a', text: 'String、Hash、List、Set、ZSet', isCorrect: true },
      { id: 'b', text: '仅 String 和 Hash', isCorrect: false },
      { id: 'c', text: 'Map、List、Queue', isCorrect: false },
      { id: 'd', text: '只有字符串', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'String：缓存、计数器、分布式锁；Hash：对象存储（购物车）；List：消息队列、最新列表；Set：去重、交集/并集（共同关注）；ZSet：排行榜、延迟队列。',
  },
  {
    id: 'redis-2',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['redis'],
    phaseId: 'core',
    question: 'Redis 持久化机制 RDB 和 AOF 的区别？',
    options: [
      { id: 'a', text: 'RDB 是快照，AOF 是追加日志', isCorrect: true },
      { id: 'b', text: '两者完全相同', isCorrect: false },
      { id: 'c', text: 'RDB 实时性更好', isCorrect: false },
      { id: 'd', text: 'AOF 性能优于 RDB', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'RDB：fork 子进程，定时快照，文件紧凑，恢复快，可能丢失数据；AOF：记录每个写命令，Append-only，数据完整性高，文件大，恢复慢。可混合使用：RDB 做备份，AOF 做实时持久化。',
  },
  {
    id: 'redis-3',
    type: 'multiple-choice',
    difficulty: 'hard',
    tags: ['redis'],
    phaseId: 'distributed',
    question: 'Redis 缓存穿透、击穿、雪崩的区别和解决方案？',
    options: [
      { id: 'a', text: '穿透：查不存在的数据（布隆过滤器）；击穿：热点 Key 过期（互斥锁）；雪崩：大量 Key 同时过期（随机过期）', isCorrect: true },
      { id: 'b', text: '三者是同一问题', isCorrect: false },
      { id: 'c', text: '只能通过限流解决', isCorrect: false },
      { id: 'd', text: 'Redis 本身不支持这些场景', isCorrect: false },
    ],
    answer: 'a',
    explanation: '穿透：查询不存在的数据，缓存无数据，DB 压力大，解决：布隆过滤器、缓存空值；击穿：热点 Key 过期，大量请求打 DB，解决：互斥锁、热点永不过期；雪崩：大量 Key 同时过期，解决：随机 TTL、缓存预热、限流降级。',
  },

  // 分布式
  {
    id: 'dist-1',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['distributed'],
    phaseId: 'distributed',
    question: '分布式事务的常见解决方案？',
    options: [
      { id: 'a', text: '2PC/3PC、TCC、本地消息表、Saga、Seata', isCorrect: true },
      { id: 'b', text: '只有 JDBC 事务', isCorrect: false },
      { id: 'c', text: '无法实现分布式事务', isCorrect: false },
      { id: 'd', text: '仅依赖数据库锁', isCorrect: false },
    ],
    answer: 'a',
    explanation: '2PC/3PC：强一致，性能差，阻塞；TCC：Try-Confirm-Cancel，业务侵入；本地消息表：最终一致，可靠消息；Saga：长事务拆分，补偿机制；Seata：AT 模式（无侵入自动补偿）、TCC 模式、SAGA 模式。',
  },
  {
    id: 'dist-2',
    type: 'multiple-choice',
    difficulty: 'hard',
    tags: ['distributed'],
    phaseId: 'distributed',
    question: '如何实现分布式锁？',
    options: [
      { id: 'a', text: 'Redis SETNX、Zookeeper、数据库唯一索引', isCorrect: true },
      { id: 'b', text: 'synchronized 关键字', isCorrect: false },
      { id: 'c', text: 'volatile 变量', isCorrect: false },
      { id: 'd', text: '只能用消息队列', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'Redis：SET key value NX EX timeout，注意续期（Redlock）；Zookeeper：临时顺序节点，Watch 机制；DB：唯一索引 + 状态字段，缺点是性能差。选择：Redis 高性能，Zookeeper 高可靠，DB 简单但性能差。',
  },
  {
    id: 'dist-3',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['distributed'],
    phaseId: 'distributed',
    question: '分布式 ID 生成方案？',
    options: [
      { id: 'a', text: 'UUID、Snowflake、数据库自增、Redis incr', isCorrect: true },
      { id: 'b', text: '只能用数据库自增', isCorrect: false },
      { id: 'c', text: '随机数', isCorrect: false },
      { id: 'd', text: '时间戳', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'UUID：无序，索引性能差，无业务含义；Snowflake（Twitter）：41 位时间 + 10 位机器 + 12 位序列，趋势递增，性能好，依赖时钟；DB 自增：简单，分库分表困难；Redis incr：原子递增，IO 成本；美团 Leaf：Snowflake 号段模式。',
  },

  // 算法
  {
    id: 'algo-1',
    type: 'multiple-choice',
    difficulty: 'easy',
    tags: ['algorithm'],
    phaseId: 'basic',
    question: '时间复杂度从快到慢的排序？',
    options: [
      { id: 'a', text: 'O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ)', isCorrect: true },
      { id: 'b', text: 'O(n) 最快', isCorrect: false },
      { id: 'c', text: 'O(2ⁿ) 最快', isCorrect: false },
      { id: 'd', text: 'O(n²) 比 O(n log n) 快', isCorrect: false },
    ],
    answer: 'a',
    explanation: '常见复杂度：O(1) 常数 < O(log n) 对数 < O(n) 线性 < O(n log n) 线性对数 < O(n²) 平方 < O(2ⁿ) 指数 < O(n!) 阶乘。',
  },
  {
    id: 'algo-2',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['algorithm'],
    phaseId: 'basic',
    question: '快速排序的平均时间复杂度和最坏情况？',
    options: [
      { id: 'a', text: '平均 O(n log n)，最坏 O(n²)', isCorrect: true },
      { id: 'b', text: '始终 O(n log n)', isCorrect: false },
      { id: 'c', text: '始终 O(n²)', isCorrect: false },
      { id: 'd', text: '平均 O(n²)', isCorrect: false },
    ],
    answer: 'a',
    explanation: '快排平均 O(n log n)，最坏（已排序/选最大最小为 pivot）O(n²)。优化：随机 pivot、三路快排、小数组插入排序、Introsort（快排 + 堆排序）。',
  },
  {
    id: 'algo-3',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['algorithm'],
    phaseId: 'basic',
    question: '哈希表解决冲突的方法？',
    options: [
      { id: 'a', text: '链地址法、开放定址法、再哈希', isCorrect: true },
      { id: 'b', text: '只支持链地址法', isCorrect: false },
      { id: 'c', text: '哈希表不会冲突', isCorrect: false },
      { id: 'd', text: '冲突时直接报错', isCorrect: false },
    ],
    answer: 'a',
    explanation: '链地址法（HashMap 采用）：冲突节点链成链表/树；开放定址法（ThreadLocal 采用）：线性探测/二次探测/双重哈希寻找下一个空位；再哈希：多个哈希函数直到找到空位。',
  },

  // 网络
  {
    id: 'net-1',
    type: 'multiple-choice',
    difficulty: 'easy',
    tags: ['network'],
    phaseId: 'basic',
    question: 'TCP 三次握手的过程？',
    options: [
      { id: 'a', text: 'SYN -> SYN+ACK -> ACK', isCorrect: true },
      { id: 'b', text: 'SYN -> ACK -> FIN', isCorrect: false },
      { id: 'c', text: 'ACK -> SYN -> ACK', isCorrect: false },
      { id: 'd', text: '直接建立连接', isCorrect: false },
    ],
    answer: 'a',
    explanation: '三次握手：1) Client 发 SYN=1, seq=x；2) Server 收 SYN，回 SYN=1, ACK=1, seq=y, ack=x+1；3) Client 收 SYN+ACK，回 ACK=1, seq=x+1, ack=y+1。确保双方收发能力正常，防止失效连接请求。',
  },
  {
    id: 'net-2',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['network'],
    phaseId: 'basic',
    question: 'HTTP 和 HTTPS 的区别？',
    options: [
      { id: 'a', text: 'HTTPS 在 HTTP 之上加 TLS/SSL 加密', isCorrect: true },
      { id: 'b', text: '只是端口号不同', isCorrect: false },
      { id: 'c', text: 'HTTPS 性能更好', isCorrect: false },
      { id: 'd', text: 'HTTP 更安全', isCorrect: false },
    ],
    answer: 'a',
    explanation: 'HTTPS = HTTP + TLS/SSL：数据加密（防窃听）、身份验证（CA 证书）、数据完整性（防篡改）。缺点：握手增加延迟、证书成本、CPU 加密开销。HTTP：80 端口，HTTPS：443 端口。',
  },
  {
    id: 'net-3',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['network'],
    phaseId: 'basic',
    question: '从输入 URL 到页面展示的完整过程？',
    options: [
      { id: 'a', text: 'DNS 解析 -> TCP 握手 -> TLS 握手 -> HTTP 请求 -> 响应 -> 渲染', isCorrect: true },
      { id: 'b', text: '直接请求 HTML', isCorrect: false },
      { id: 'c', text: '浏览器缓存后直接显示', isCorrect: false },
      { id: 'd', text: '不需要 DNS', isCorrect: false },
    ],
    answer: 'a',
    explanation: '1) DNS 解析域名；2) TCP 三次握手；3) TLS 四次握手（HTTPS）；4) 发送 HTTP 请求；5) 服务器处理并响应；6) 浏览器解析渲染（HTML/CSS/JS）；7) 继续请求资源。优化：DNS 缓存、HTTP/2、HTTP/3（QUIC）、CDN。',
  },

  // 操作系统
  {
    id: 'os-1',
    type: 'multiple-choice',
    difficulty: 'easy',
    tags: ['os'],
    phaseId: 'basic',
    question: '进程和线程的区别？',
    options: [
      { id: 'a', text: '进程是资源分配单位，线程是 CPU 调度单位', isCorrect: true },
      { id: 'b', text: '两者完全相同', isCorrect: false },
      { id: 'c', text: '线程是资源分配单位', isCorrect: false },
      { id: 'd', text: '进程更轻量', isCorrect: false },
    ],
    answer: 'a',
    explanation: '进程：独立地址空间、文件句柄、资源，进程间通信（IPC）复杂（管道、消息队列、共享内存、Socket）；线程：共享进程资源，轻量，通信简单（共享内存），但需同步。Java 中进程 = JVM，线程 = Thread。',
  },
  {
    id: 'os-2',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['os'],
    phaseId: 'basic',
    question: '进程间通信（IPC）的方式有哪些？',
    options: [
      { id: 'a', text: '管道、消息队列、共享内存、信号量、Socket、信号', isCorrect: true },
      { id: 'b', text: '只能用共享内存', isCorrect: false },
      { id: 'c', text: '进程间无法通信', isCorrect: false },
      { id: 'd', text: '只能用 Socket', isCorrect: false },
    ],
    answer: 'a',
    explanation: '管道（匿名管道、命名管道）：半双工，父子进程；消息队列：解耦，有大小限制；共享内存：最快，需同步；信号量：同步，计数器；Socket：跨网络，不同机器；信号：异步通知。',
  },
  {
    id: 'os-3',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['os'],
    phaseId: 'basic',
    question: 'I/O 模型：阻塞/非阻塞、同步/异步的区别？',
    options: [
      { id: 'a', text: '阻塞/非阻塞：等待 I/O 时是否挂起；同步/异步：I/O 完成后谁通知', isCorrect: true },
      { id: 'b', text: '两者是同一概念', isCorrect: false },
      { id: 'c', text: '同步就是阻塞', isCorrect: false },
      { id: 'd', text: '异步就是非阻塞', isCorrect: false },
    ],
    answer: 'a',
    explanation: '组合：1) 同步阻塞：传统 IO read；2) 同步非阻塞：NIO，轮询；3) IO 多路复用：select/poll/epoll，单线程管理多连接；4) 异步阻塞：不存在；5) 异步非阻塞（AIO）：系统回调。Netty/Redis 基于 IO 多路复用。',
  },

  // 系统设计
  {
    id: 'sd-1',
    type: 'multiple-choice',
    difficulty: 'hard',
    tags: ['system-design'],
    phaseId: 'system',
    question: '设计一个秒杀系统，关键点有哪些？',
    options: [
      { id: 'a', text: 'Redis 预减库存、MQ 削峰、限流、防刷、隔离', isCorrect: true },
      { id: 'b', text: '仅依赖数据库事务', isCorrect: false },
      { id: 'c', text: '前端控制即可', isCorrect: false },
      { id: 'd', text: '加大服务器数量', isCorrect: false },
    ],
    answer: 'a',
    explanation: '秒杀三阶段：1) 秒杀前：Redis 预热库存、静态资源 CDN、禁止重复购买；2) 秒杀中：Redis 扣库存（原子递减）、限流（令牌桶/漏桶）、防刷（验证码/滑块）、MQ 削峰下单；3) 秒杀后：MQ 消费订单、DB 最终一致性、异常监控。',
  },
  {
    id: 'sd-2',
    type: 'multiple-choice',
    difficulty: 'medium',
    tags: ['system-design'],
    phaseId: 'system',
    question: '如何设计短链接生成服务（如 bit.ly）？',
    options: [
      { id: 'a', text: '发号器（Snowflake/ID 生成器）+ Base62 编码 + 缓存', isCorrect: true },
      { id: 'b', text: '直接存储长 URL', isCorrect: false },
      { id: 'c', text: '随机数拼接', isCorrect: false },
      { id: 'd', text: '时间戳', isCorrect: false },
    ],
    answer: 'a',
    explanation: '生成：1) 自增 ID + Base62（0-9a-zA-Z）编码；2) Snowflake ID + Base62；存储：Long URL -> Short Code（KV）。访问：Short Code -> Redis 缓存 -> DB 查 Long URL -> 301 重定向。优化：布隆过滤器防生成重复、预分段发号。',
  },
  {
    id: 'sd-3',
    type: 'multiple-choice',
    difficulty: 'hard',
    tags: ['system-design'],
    phaseId: 'system',
    question: '高并发系统常见优化手段？',
    options: [
      { id: 'a', text: '缓存、异步、分库分表、读写分离、CDN', isCorrect: true },
      { id: 'b', text: '仅优化 SQL', isCorrect: false },
      { id: 'c', text: '增加服务器硬件', isCorrect: false },
      { id: 'd', text: '限制用户访问', isCorrect: false },
    ],
    answer: 'a',
    explanation: '空间换时间：多级缓存（浏览器、CDN、Nginx、应用、Redis）、缓存预热；时间换空间：懒加载、分页；异步化：CompletableFuture、MQ、事件驱动；垂直扩展：提升单机性能；水平扩展：负载均衡、分库分表；降级熔断：Hystrix/Sentinel。',
  },
]

const STORAGE_KEY = 'prepwise-interview-quiz'
const SESSIONS_STORAGE_KEY = 'prepwise-quiz-sessions'

export const useInterviewQuizStore = defineStore('interviewQuiz', () => {
  const currentSession = ref<QuizSession | null>(null)
  const sessions = ref<QuizSession[]>([])
  const currentQuestionIndex = ref(0)
  const showExplanation = ref(false)

  /** 所有题目 */
  const allQuestions = computed(() => QUESTION_BANK)

  /** 按标签分组的题目 */
  const questionsByTag = computed<Record<QuestionTag, QuizQuestion[]>>(() => {
    const grouped: Record<string, QuizQuestion[]> = {}
    for (const tag of Object.keys(QUESTION_TAG_INFO) as QuestionTag[]) {
      grouped[tag] = QUESTION_BANK.filter(q => q.tags.includes(tag))
    }
    return grouped as Record<QuestionTag, QuizQuestion[]>
  })

  /** 按阶段分组的题目 */
  const questionsByPhase = computed<Record<string, QuizQuestion[]>>(() => {
    const grouped: Record<string, QuizQuestion[]> = {}
    for (const question of QUESTION_BANK) {
      if (!grouped[question.phaseId]) {
        grouped[question.phaseId] = []
      }
      grouped[question.phaseId]?.push(question)
    }
    return grouped
  })

  /** 当前会话进度 */
  const sessionProgress = computed(() => {
    if (!currentSession.value) return 0
    const total = currentSession.value.questions.length
    const answered = currentSession.value.answers.size
    return total > 0 ? Math.round((answered / total) * 100) : 0
  })

  /** 当前会话统计 */
  const sessionStats = computed(() => {
    if (!currentSession.value) return null

    const answers = Array.from(currentSession.value.answers.values())
    const correct = answers.filter(a => a.isCorrect).length
    const wrong = answers.filter(a => !a.isCorrect && a.status !== 'skipped').length
    const skipped = answers.filter(a => a.status === 'skipped').length
    const totalTime = answers.reduce((sum, a) => sum + a.timeSpent, 0)
    const avgTime = answers.length > 0 ? Math.round(totalTime / answers.length) : 0

    return {
      total: answers.length,
      correct,
      wrong,
      skipped,
      accuracy: answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0,
      avgTime,
    }
  })

  /** 全局统计（所有会话） */
  const globalStats = computed<QuizStatistics>(() => {
    const allAnswers = sessions.value.flatMap(s => Array.from(s.answers.values()))

    const totalAnswered = allAnswers.length
    const correctCount = allAnswers.filter(a => a.isCorrect).length
    const wrongCount = allAnswers.filter(a => !a.isCorrect && a.status !== 'skipped').length
    const skippedCount = allAnswers.filter(a => a.status === 'skipped').length
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0
    const avgTimeSpent = totalAnswered > 0
      ? Math.round(allAnswers.reduce((sum, a) => sum + a.timeSpent, 0) / totalAnswered)
      : 0

    // 按标签统计正确率
    const tagStats: Partial<Record<QuestionTag, { correct: number; total: number }>> = {}
    for (const answer of allAnswers) {
      const question = QUESTION_BANK.find(q => q.id === answer.questionId)
      if (!question) continue
      for (const tag of question.tags) {
        const stats = tagStats[tag] ?? { correct: 0, total: 0 }
        tagStats[tag] = stats
        stats.total++
        if (answer.isCorrect) stats.correct++
      }
    }

    const weakTags: QuestionTag[] = []
    const strongTags: QuestionTag[] = []
    for (const [tag, stats] of Object.entries(tagStats)) {
      const rate = stats.correct / stats.total
      if (stats.total >= 3) {  // 至少回答 3 题才计入
        if (rate < 0.6) weakTags.push(tag as QuestionTag)
        else if (rate > 0.8) strongTags.push(tag as QuestionTag)
      }
    }

    return {
      totalAnswered,
      correctCount,
      wrongCount,
      skippedCount,
      accuracy,
      avgTimeSpent,
      weakTags,
      strongTags,
    }
  })

  /** 获取题目 */
  function getQuestion(id: string): QuizQuestion | undefined {
    return QUESTION_BANK.find(q => q.id === id)
  }

  /** 按条件筛选题目 */
  function filterQuestions(config: QuizSessionConfig): QuizQuestion[] {
    let filtered = [...QUESTION_BANK]

    // 按阶段筛选
    if (config.phaseId) {
      filtered = filtered.filter(q => q.phaseId === config.phaseId)
    }

    // 按标签筛选
    if (config.tags && config.tags.length > 0) {
      filtered = filtered.filter(q => q.tags.some(t => config.tags!.includes(t)))
    }

    // 按难度筛选
    if (config.difficulty && config.difficulty.length > 0) {
      filtered = filtered.filter(q => config.difficulty!.includes(q.difficulty))
    }

    // 随机打乱
    if (config.randomOrder) {
      filtered = filtered.sort(() => Math.random() - 0.5)
    }

    // 限制数量
    return filtered.slice(0, config.questionCount)
  }

  /** 创建新的自测会话 */
  function createSession(config: QuizSessionConfig, name?: string): QuizSession {
    const questions = filterQuestions(config)

    const session: QuizSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name || generateSessionName(config),
      questions,
      answers: new Map(),
      startedAt: new Date().toISOString(),
      config,
    }

    currentSession.value = session
    currentQuestionIndex.value = 0
    showExplanation.value = false

    sessions.value.push(session)
    saveSessions()

    return session
  }

  /** 生成会话名称 */
  function generateSessionName(config: QuizSessionConfig): string {
    const parts: string[] = []

    if (config.phaseId) {
      parts.push(`${config.phaseId}阶段`)
    }

    if (config.tags && config.tags.length) {
      const tagNames = config.tags.map(t => QUESTION_TAG_INFO[t]?.name || t).join('、')
      parts.push(tagNames)
    }

    if (config.difficulty && config.difficulty.length) {
      const diffNames: Record<QuestionDifficulty, string> = {
        easy: '简单',
        medium: '中等',
        hard: '困难'
      }
      parts.push(config.difficulty.map(d => diffNames[d]).join('、'))
    }

    parts.push(`${config.questionCount}题`)

    return parts.join(' - ') || '自定义自测'
  }

  /** 提交答案 */
  function submitAnswer(questionId: string, userAnswer: string | string[], timeSpent: number): void {
    if (!currentSession.value) return

    const question = getQuestion(questionId)
    if (!question) return

    // 判断正确性
    let isCorrect = false
    if (question.type === 'multiple-choice') {
      isCorrect = userAnswer === question.answer
    } else if (question.type === 'true-false') {
      isCorrect = userAnswer === question.answer
    } else {
      // 简答题：简单判断（实际应该更复杂或由用户自评）
      isCorrect = String(userAnswer).trim().toLowerCase().includes(question.answer.toLowerCase())
    }

    const record: AnswerRecord = {
      questionId,
      userAnswer,
      isCorrect,
      status: isCorrect ? 'correct' : 'wrong',
      answeredAt: new Date().toISOString(),
      timeSpent,
    }

    currentSession.value.answers.set(questionId, record)
    saveSessions()

    // 自动显示答案
    if (currentSession.value.config.showAnswer) {
      showExplanation.value = true
    }
  }

  /** 跳过题目 */
  function skipQuestion(questionId: string): void {
    if (!currentSession.value) return

    const record: AnswerRecord = {
      questionId,
      userAnswer: '',
      isCorrect: false,
      status: 'skipped',
      answeredAt: new Date().toISOString(),
      timeSpent: 0,
    }

    currentSession.value.answers.set(questionId, record)
    saveSessions()
  }

  /** 下一题 */
  function nextQuestion(): void {
    if (!currentSession.value) return
    if (currentQuestionIndex.value < currentSession.value.questions.length - 1) {
      currentQuestionIndex.value++
      showExplanation.value = false
    }
  }

  /** 上一题 */
  function previousQuestion(): void {
    if (currentQuestionIndex.value > 0) {
      currentQuestionIndex.value--
    }
  }

  /** 完成会话 */
  function completeSession(): void {
    if (!currentSession.value) return
    currentSession.value.completedAt = new Date().toISOString()
    saveSessions()
  }

  /** 删除会话 */
  function deleteSession(sessionId: string): void {
    const index = sessions.value.findIndex(s => s.id === sessionId)
    if (index > -1) {
      sessions.value.splice(index, 1)
      if (currentSession.value?.id === sessionId) {
        currentSession.value = null
      }
      saveSessions()
    }
  }

  /** 加载会话 */
  function loadSession(sessionId: string): void {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      currentSession.value = session
      currentQuestionIndex.value = session.answers.size
      showExplanation.value = false
    }
  }

  /** 重新开始会话 */
  function restartSession(sessionId: string): void {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      const newSession = createSession(session.config, session.name + ' (重试)')
      newSession.questions = session.questions
    }
  }

  /** 持久化 */
  function saveSessions() {
    const serializable = sessions.value.map(s => ({
      ...s,
      answers: Array.from(s.answers.entries()),
    }))
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(serializable))
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as SerializedQuizSession[]
        sessions.value = parsed.map((s) => ({
          ...s,
          answers: new Map(s.answers),
        }))
      }
    } catch {
      console.warn('[InterviewQuiz] 加载会话失败')
    }
  }

  // 初始化
  loadSessions()

  return {
    // State
    currentSession,
    sessions,
    currentQuestionIndex,
    showExplanation,

    // Computed
    allQuestions,
    questionsByTag,
    questionsByPhase,
    sessionProgress,
    sessionStats,
    globalStats,

    // Actions
    getQuestion,
    filterQuestions,
    createSession,
    submitAnswer,
    skipQuestion,
    nextQuestion,
    previousQuestion,
    completeSession,
    deleteSession,
    loadSession,
    restartSession,
  }
})
