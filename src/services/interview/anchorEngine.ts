/**
 * 项目锚定引擎
 * 将面试题与简历项目关联，生成个性化追问链
 */

import type { SavedQuestion } from '@/stores/questionBank'

export interface ResumeProject {
  name: string
  role: string
  technologies: string[]
  description: string
}

export interface ResumeSkill {
  name: string
  level: string
  category: string
}

export interface AnchorResult {
  question: string
  resumeAnchor: string
  followUpChain: string[]
  isGrounded: boolean
}

/**
 * 分析简历中的项目和技术栈
 */
export function analyzeResume(resumeText: string): {
  projects: ResumeProject[]
  skills: ResumeSkill[]
} {
  const projects: ResumeProject[] = []
  const skills: ResumeSkill[] = []
  
  // 简单的项目提取逻辑
  const projectPatterns = [
    /项目[：:]\s*(.+?)(?:\n|$)/g,
    /负责[：:]\s*(.+?)(?:\n|$)/g,
    /开发了[：:]\s*(.+?)(?:\n|$)/g,
  ]
  
  for (const pattern of projectPatterns) {
    let match
    while ((match = pattern.exec(resumeText)) !== null) {
      const projectName = match[1].trim()
      if (projectName.length > 2 && projectName.length < 100) {
        projects.push({
          name: projectName,
          role: '开发',
          technologies: extractTechnologies(projectName),
          description: projectName,
        })
      }
    }
  }
  
  // 技能提取
  const skillPatterns = [
    /熟悉[：:]?\s*(.+?)(?:\n|。|；)/g,
    /掌握[：:]?\s*(.+?)(?:\n|。|；)/g,
    /精通[：:]?\s*(.+?)(?:\n|。|；)/g,
    /了解[：:]?\s*(.+?)(?:\n|。|；)/g,
  ]
  
  for (const pattern of skillPatterns) {
    let match
    while ((match = pattern.exec(resumeText)) !== null) {
      const skillText = match[1].trim()
      const skillNames = skillText.split(/[,，、]/).map(s => s.trim())
      
      for (const name of skillNames) {
        if (name.length > 1 && name.length < 30) {
          skills.push({
            name,
            level: '熟悉',
            category: '技术',
          })
        }
      }
    }
  }
  
  return { projects, skills }
}

/**
 * 从文本中提取技术栈
 */
function extractTechnologies(text: string): string[] {
  const techKeywords = [
    'Vue', 'React', 'Angular', 'TypeScript', 'JavaScript',
    'Node.js', 'Python', 'Java', 'Go', 'Rust',
    'MySQL', 'PostgreSQL', 'MongoDB', 'Redis',
    'Docker', 'Kubernetes', 'AWS', 'Azure',
    'Git', 'CI/CD', 'REST', 'GraphQL',
    '微服务', '分布式', '高并发', '大数据',
  ]
  
  return techKeywords.filter(tech => 
    text.toLowerCase().includes(tech.toLowerCase())
  )
}

/**
 * 为面试题生成项目锚定
 */
export function anchorQuestion(
  question: SavedQuestion,
  projects: ResumeProject[],
  skills: ResumeSkill[]
): AnchorResult {
  const questionLower = question.content.toLowerCase()
  
  // 尝试匹配项目
  for (const project of projects) {
    const projectLower = project.name.toLowerCase()
    const techLower = project.technologies.map(t => t.toLowerCase()).join(' ')
    
    if (
      questionLower.includes(projectLower) ||
      project.technologies.some(tech => questionLower.includes(tech.toLowerCase()))
    ) {
      return {
        question: question.content,
        resumeAnchor: project.name,
        followUpChain: generateFollowUpChain(question.content, project),
        isGrounded: true,
      }
    }
  }
  
  // 尝试匹配技能
  for (const skill of skills) {
    if (questionLower.includes(skill.name.toLowerCase())) {
      return {
        question: question.content,
        resumeAnchor: skill.name,
        followUpChain: generateSkillFollowUpChain(question.content, skill),
        isGrounded: true,
      }
    }
  }
  
  // 无法匹配
  return {
    question: question.content,
    resumeAnchor: '',
    followUpChain: [],
    isGrounded: false,
  }
}

/**
 * 生成项目相关的追问链
 */
function generateFollowUpChain(
  question: string,
  project: ResumeProject
): string[] {
  const chains: string[] = []
  
  // 基于项目生成追问
  chains.push(`你在${project.name}项目中具体负责了哪些部分？`)
  chains.push(`这个项目中遇到的最大技术挑战是什么？你是如何解决的？`)
  chains.push(`如果重新做这个项目，你会有哪些改进？`)
  
  // 基于技术栈生成追问
  if (project.technologies.length > 0) {
    chains.push(`为什么选择${project.technologies[0]}技术栈？有什么优势？`)
  }
  
  // 基于问题生成追问
  if (question.includes('设计')) {
    chains.push(`请详细描述你的设计思路和架构选择。`)
  }
  if (question.includes('优化')) {
    chains.push(`优化前后的性能指标对比如何？`)
  }
  
  return chains.slice(0, 5) // 最多5个追问
}

/**
 * 生成技能相关的追问链
 */
function generateSkillFollowUpChain(
  question: string,
  skill: ResumeSkill
): string[] {
  return [
    `你对${skill.name}的掌握程度如何？`,
    `在项目中是如何应用${skill.name}的？`,
    `${skill.name}的最佳实践有哪些？`,
    `遇到过${skill.name}相关的问题吗？如何解决的？`,
    `你认为${skill.name}的未来发展趋势是什么？`,
  ]
}

/**
 * 批量处理面试题的项目锚定
 */
export function batchAnchor(
  questions: SavedQuestion[],
  resumeText: string
): AnchorResult[] {
  const { projects, skills } = analyzeResume(resumeText)
  
  return questions.map(q => anchorQuestion(q, projects, skills))
}