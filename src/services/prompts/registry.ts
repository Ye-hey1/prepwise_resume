/** Prompt 类别 —— 各 AI 任务的分类标识。
 *  ponytail: 原为 278 行的版本注册表 + localStorage 偏好持久化，
 *  但每类只注册一个 default 版本、切换 API 零外部调用，属投机抽象，已删。
 *  需要版本切换/A-B 测试时再恢复注册机制。 */
export type PromptCategory =
  | 'resume-optimize'
  | 'resume-review'
  | 'project-sop'
  | 'jd-extract'
  | 'jd-match'
  | 'jd-overview'
  | 'jd-prep'
  | 'jd-company-intel'
  | 'jd-interview-bank'
  | 'jd-optimize'
  | 'interview-candidate'
  | 'interview-interviewer'
  | 'interview-hint'
  | 'interview-drill'
  | 'interview-evaluation'
  | 'interview-coaching'
  | 'resume-import'
