/**
 * AI 辅助面试题识别服务
 * 使用 AI 进行语义识别和分类
 */

import type { ExtractedQuestion } from './collector'

export interface AIExtractedQuestion {
  content: string
  category: string
  difficulty: number
  tags: string[]
  confidence: number
}

export interface AIExtractorConfig {
  enabled: boolean
  apiUrl?: string
  apiKey?: string
  model?: string
}

export class AIExtractor {
  private config: AIExtractorConfig

  constructor(config: AIExtractorConfig) {
    this.config = config
  }

  /**
   * 使用 AI 识别面试题
   */
  async extractQuestions(text: string): Promise<AIExtractedQuestion[]> {
    if (!this.config.enabled) {
      return []
    }

    try {
      const prompt = this.buildPrompt(text)
      const response = await this.callAI(prompt)
      return this.parseResponse(response)
    } catch (err) {
      console.warn('[AIExtractor] AI extraction failed:', err)
      return []
    }
  }

  /**
   * 使用 AI 对面试题进行分类
   */
  async classifyQuestion(question: string): Promise<{
    category: string
    difficulty: number
    tags: string[]
  }> {
    if (!this.config.enabled) {
      return { category: '未分类', difficulty: 3, tags: [] }
    }

    try {
      const prompt = `请对以下面试题进行分类：

题目：${question}

请返回 JSON 格式：
{
  "category": "技术/行为/系统设计/算法",
  "difficulty": 1-5,
  "tags": ["标签1", "标签2"]
}

只返回 JSON，不要其他内容。`

      const response = await this.callAI(prompt)
      return JSON.parse(response)
    } catch (err) {
      console.warn('[AIExtractor] Classification failed:', err)
      return { category: '未分类', difficulty: 3, tags: [] }
    }
  }

  /**
   * 使用 AI 评估面试题质量
   */
  async evaluateQuestion(question: string): Promise<{
    isInterviewQuestion: boolean
    confidence: number
    reason: string
  }> {
    if (!this.config.enabled) {
      return { isInterviewQuestion: false, confidence: 0, reason: 'AI 未启用' }
    }

    try {
      const prompt = `请判断以下内容是否是面试题：

内容：${question}

请返回 JSON 格式：
{
  "isInterviewQuestion": true/false,
  "confidence": 0-1,
  "reason": "判断理由"
}

只返回 JSON，不要其他内容。`

      const response = await this.callAI(prompt)
      return JSON.parse(response)
    } catch (err) {
      console.warn('[AIExtractor] Evaluation failed:', err)
      return { isInterviewQuestion: false, confidence: 0, reason: 'AI 评估失败' }
    }
  }

  private buildPrompt(text: string): string {
    return `请从以下文本中提取面试题。

文本内容：
${text}

要求：
1. 只提取真正的面试题，不要提取答案、说明或其他内容
2. 每个面试题应该是完整的问题
3. 返回 JSON 数组格式

请返回 JSON 格式：
[
  {
    "content": "面试题内容",
    "category": "技术/行为/系统设计/算法",
    "difficulty": 1-5,
    "tags": ["标签1", "标签2"],
    "confidence": 0-1
  }
]

只返回 JSON，不要其他内容。`
  }

  private async callAI(prompt: string): Promise<string> {
    if (!this.config.apiUrl || !this.config.apiKey) {
      throw new Error('AI API 配置缺失')
    }

    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '你是一个面试题识别专家，擅长从文本中提取和分类面试题。请严格按照要求返回 JSON 格式。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      throw new Error(`AI API 请求失败: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  private parseResponse(response: string): AIExtractedQuestion[] {
    try {
      // 尝试提取 JSON 部分
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        return []
      }

      const questions = JSON.parse(jsonMatch[0])
      return Array.isArray(questions) ? questions : []
    } catch (err) {
      console.warn('[AIExtractor] Failed to parse response:', err)
      return []
    }
  }
}

/**
 * 混合提取器：结合正则表达式和 AI 识别
 */
export class HybridExtractor {
  private aiExtractor: AIExtractor

  constructor(aiConfig: AIExtractorConfig) {
    this.aiExtractor = new AIExtractor(aiConfig)
  }

  /**
   * 混合提取面试题
   */
  async extractWithAI(
    text: string,
    regexQuestions: ExtractedQuestion[]
  ): Promise<ExtractedQuestion[]> {
    // 如果 AI 未启用，直接返回正则结果
    if (!this.aiExtractor['config'].enabled) {
      return regexQuestions
    }

    try {
      // 使用 AI 识别
      const aiQuestions = await this.aiExtractor.extractQuestions(text)
      
      // 合并结果，去重
      const merged = this.mergeQuestions(regexQuestions, aiQuestions)
      
      return merged
    } catch (err) {
      console.warn('[HybridExtractor] AI extraction failed, using regex only:', err)
      return regexQuestions
    }
  }

  /**
   * 使用 AI 增强正则识别结果
   */
  async enhanceQuestions(
    questions: ExtractedQuestion[]
  ): Promise<ExtractedQuestion[]> {
    if (!this.aiExtractor['config'].enabled) {
      return questions
    }

    const enhanced: ExtractedQuestion[] = []

    for (const question of questions) {
      try {
        // 使用 AI 评估是否是真正的面试题
        const evaluation = await this.aiExtractor.evaluateQuestion(question.content)
        
        if (evaluation.isInterviewQuestion && evaluation.confidence > 0.6) {
          // 使用 AI 分类
          const classification = await this.aiExtractor.classifyQuestion(question.content)
          
          enhanced.push({
            ...question,
            // 可以在这里添加分类信息到 metadata
          })
        }
      } catch (err) {
        // 如果 AI 评估失败，保留原题目
        enhanced.push(question)
      }
    }

    return enhanced
  }

  private mergeQuestions(
    regexQuestions: ExtractedQuestion[],
    aiQuestions: AIExtractedQuestion[]
  ): ExtractedQuestion[] {
    const merged: ExtractedQuestion[] = [...regexQuestions]
    const existingContents = new Set(regexQuestions.map(q => q.content.toLowerCase().trim()))

    for (const aiQ of aiQuestions) {
      const normalized = aiQ.content.toLowerCase().trim()
      
      // 检查是否已存在
      if (!existingContents.has(normalized)) {
        merged.push({
          content: aiQ.content,
          sourceUrl: 'ai_extracted',
          sourceType: 'real_experience',
          frequencyScore: aiQ.confidence,
          recencyScore: 1,
          isGrounded: true,
        })
        existingContents.add(normalized)
      }
    }

    return merged
  }
}