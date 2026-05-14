import type { ResumeAssistantExampleItem, ResumeFieldAiModuleKey } from './types/resumeAssistant'
import { useResumeStore } from '@/stores/resume'

/**
 * 根据用户简历内容动态生成内置例句
 * 不再使用硬编码的前端开发例句，而是基于用户实际填写的信息生成相关提示
 */
export function getBuiltinResumeAssistantExamples(moduleKey: ResumeFieldAiModuleKey): ResumeAssistantExampleItem[] {
  const store = useResumeStore()
  const jobTitle = store.basicInfo.jobTitle?.trim() || ''
  const skills = store.skills?.replace(/<[^>]+>/g, '').trim() || ''

  // 提取用户的技术关键词
  const userKeywords = extractKeywords(skills, jobTitle)

  switch (moduleKey) {
    case 'workExperience':
      return generateWorkExamples(jobTitle, userKeywords)
    case 'projectExperience':
      return generateProjectExamples(jobTitle, userKeywords)
    case 'skills':
      return generateSkillsExamples(jobTitle, userKeywords)
    case 'selfIntro':
      return generateSelfIntroExamples(jobTitle, userKeywords)
    case 'education':
      return generateEducationExamples()
    case 'awards':
      return generateAwardsExamples()
    default:
      return []
  }
}

function extractKeywords(skills: string, jobTitle: string): string[] {
  const combined = `${skills} ${jobTitle}`
  // 提取中英文关键词
  const matches = combined.match(/[A-Za-z][A-Za-z0-9+#.]*(?:\s[A-Za-z][A-Za-z0-9+#.]*)?|[\u4e00-\u9fa5]{2,6}/g) || []
  return [...new Set(matches)].slice(0, 8)
}

function generateWorkExamples(jobTitle: string, keywords: string[]): ResumeAssistantExampleItem[] {
  const role = jobTitle || '目标岗位'
  const techHint = keywords.length > 0 ? keywords.slice(0, 3).join('、') : '核心技术'

  return [
    {
      id: 'dynamic-work-1',
      moduleKey: 'workExperience',
      text: `负责${role}相关核心业务模块的设计与落地，基于${techHint}完成系统迭代，推动关键指标提升。`,
      tags: [role, '结果导向'],
      source: 'builtin',
      tone: '结果导向',
      highlight: '指标提升',
    },
    {
      id: 'dynamic-work-2',
      moduleKey: 'workExperience',
      text: `主导跨部门协作项目推进，从需求分析到方案设计再到交付验收，确保项目按期高质量上线。`,
      tags: ['项目管理', '跨部门', '交付'],
      source: 'builtin',
      tone: '专业',
      highlight: '项目交付',
    },
    {
      id: 'dynamic-work-3',
      moduleKey: 'workExperience',
      text: `深入业务场景分析用户痛点，提出并落地优化方案，有效提升用户体验和业务转化效率。`,
      tags: ['用户体验', '业务分析', '优化'],
      source: 'builtin',
      tone: '业务导向',
      highlight: '用户价值',
    },
  ]
}

function generateProjectExamples(jobTitle: string, keywords: string[]): ResumeAssistantExampleItem[] {
  const techHint = keywords.length > 0 ? keywords.slice(0, 3).join('、') : '相关技术'

  return [
    {
      id: 'dynamic-proj-1',
      moduleKey: 'projectExperience',
      text: `基于${techHint}设计并实现核心功能模块，从方案设计到上线运营全程负责，系统稳定性达 99.9%。`,
      tags: keywords.slice(0, 3),
      source: 'builtin',
      tone: '技术亮点',
      highlight: '架构设计',
    },
    {
      id: 'dynamic-proj-2',
      moduleKey: 'projectExperience',
      text: `围绕业务目标完成功能规划与技术选型，协调多方资源推进落地，项目按期交付并获得正向业务反馈。`,
      tags: ['规划', '选型', '落地'],
      source: 'builtin',
      tone: '交付导向',
      highlight: '按期交付',
    },
    {
      id: 'dynamic-proj-3',
      moduleKey: 'projectExperience',
      text: `针对系统性能瓶颈进行深度分析与优化，通过架构调整和算法改进，将核心流程耗时降低 50% 以上。`,
      tags: ['性能优化', '架构', '量化'],
      source: 'builtin',
      tone: '数据驱动',
      highlight: '性能提升',
    },
  ]
}

function generateSkillsExamples(jobTitle: string, keywords: string[]): ResumeAssistantExampleItem[] {
  const role = jobTitle || '相关领域'
  const techList = keywords.length > 0 ? keywords.slice(0, 4).join('、') : '核心技术栈'

  return [
    {
      id: 'dynamic-skills-1',
      moduleKey: 'skills',
      text: `熟悉${techList}等技术，具备${role}相关的系统设计与落地能力。`,
      tags: keywords.slice(0, 3),
      source: 'builtin',
      tone: '简洁',
      highlight: '技术栈',
    },
    {
      id: 'dynamic-skills-2',
      moduleKey: 'skills',
      text: `具备良好的问题分析与解决能力，能够独立完成从需求理解到方案设计再到落地验证的完整闭环。`,
      tags: ['问题解决', '独立', '闭环'],
      source: 'builtin',
      tone: '能力型',
      highlight: '综合能力',
    },
  ]
}

function generateSelfIntroExamples(jobTitle: string, keywords: string[]): ResumeAssistantExampleItem[] {
  const role = jobTitle || '目标方向'

  return [
    {
      id: 'dynamic-self-1',
      moduleKey: 'selfIntro',
      text: `在${role}领域有丰富的实践经验，擅长将复杂问题拆解为可执行方案，注重结果导向和持续改进。`,
      tags: [role, '实践', '结果导向'],
      source: 'builtin',
      tone: '总结型',
      highlight: '经验沉淀',
    },
    {
      id: 'dynamic-self-2',
      moduleKey: 'selfIntro',
      text: `具备较强的学习能力和跨领域协作意识，能够快速适应新环境并产出有效成果。`,
      tags: ['学习能力', '协作', '适应力'],
      source: 'builtin',
      tone: '成长型',
      highlight: '适应力',
    },
  ]
}

function generateEducationExamples(): ResumeAssistantExampleItem[] {
  return [
    {
      id: 'dynamic-edu-1',
      moduleKey: 'education',
      text: '在校期间系统学习专业核心课程，积极参与项目实践，培养了扎实的理论基础和动手能力。',
      tags: ['课程', '实践', '基础'],
      source: 'builtin',
      tone: '稳健',
      highlight: '学习能力',
    },
  ]
}

function generateAwardsExamples(): ResumeAssistantExampleItem[] {
  return [
    {
      id: 'dynamic-award-1',
      moduleKey: 'awards',
      text: '获得行业/校级奖项认可，体现了在专业能力和项目实践方面的持续投入与突出表现。',
      tags: ['奖项', '认可'],
      source: 'builtin',
      tone: '概括型',
      highlight: '成果认可',
    },
  ]
}
