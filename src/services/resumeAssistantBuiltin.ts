import type { ResumeAssistantExampleItem, ResumeFieldAiModuleKey } from './types/resumeAssistant'

const BUILTIN_EXAMPLES: ResumeAssistantExampleItem[] = [
  {
    id: 'builtin-work-1',
    moduleKey: 'workExperience',
    text: '负责核心业务模块迭代与性能优化，基于 Vue3 与 TypeScript 完成组件重构，推动页面首屏加载时间缩短 35%。',
    tags: ['Vue3', '性能优化', '前端'],
    source: 'builtin',
    tone: '结果导向',
    highlight: '性能提升',
  },
  {
    id: 'builtin-work-2',
    moduleKey: 'workExperience',
    text: '主导中后台系统关键页面开发与交互体验优化，沉淀通用组件方案，提升迭代效率并降低重复开发成本。',
    tags: ['中后台', '组件化', '效率提升'],
    source: 'builtin',
    tone: '专业',
    highlight: '组件复用',
  },
  {
    id: 'builtin-project-1',
    moduleKey: 'projectExperience',
    text: '基于 React 与 Redux 搭建电商活动页前端架构，实现动态模块渲染与按需加载，支撑高并发场景下的稳定展示。',
    tags: ['React', 'Redux', '活动页'],
    source: 'builtin',
    tone: '技术亮点',
    highlight: '架构搭建',
  },
  {
    id: 'builtin-project-2',
    moduleKey: 'projectExperience',
    text: '负责项目核心功能设计与落地，围绕业务目标完成接口联调、异常处理与用户体验优化，保障版本按期上线。',
    tags: ['项目推进', '交付', '协作'],
    source: 'builtin',
    tone: '交付导向',
    highlight: '按期上线',
  },
  {
    id: 'builtin-skills-1',
    moduleKey: 'skills',
    text: '熟悉 Vue3、React、TypeScript 等前端技术栈，具备中后台系统开发与组件化建设经验。',
    tags: ['Vue3', 'React', 'TypeScript'],
    source: 'builtin',
    tone: '简洁',
    highlight: '技术栈概览',
  },
  {
    id: 'builtin-self-1',
    moduleKey: 'selfIntro',
    text: '具备扎实的前端工程化能力与业务理解能力，能够围绕用户体验与性能目标持续推进产品迭代与技术优化。',
    tags: ['前端', '工程化', '业务理解'],
    source: 'builtin',
    tone: '总结型',
    highlight: '综合能力',
  },
  {
    id: 'builtin-edu-1',
    moduleKey: 'education',
    text: '在校期间系统学习计算机相关课程，积极参与项目实践与技术竞赛，具备较强的问题分析与学习能力。',
    tags: ['教育经历', '项目实践', '竞赛'],
    source: 'builtin',
    tone: '稳健',
    highlight: '学习能力',
  },
  {
    id: 'builtin-award-1',
    moduleKey: 'awards',
    text: '获得校级/行业奖项认可，体现了在专业能力、项目实践或综合表现方面的持续投入与成果产出。',
    tags: ['奖项', '认可', '综合能力'],
    source: 'builtin',
    tone: '概括型',
    highlight: '成果认可',
  },
]

export function getBuiltinResumeAssistantExamples(moduleKey: ResumeFieldAiModuleKey): ResumeAssistantExampleItem[] {
  return BUILTIN_EXAMPLES.filter((item) => item.moduleKey === moduleKey)
}
