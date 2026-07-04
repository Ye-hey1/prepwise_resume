import { computed } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { formatResumeDate, formatResumeDateRange } from '@/utils/resumeDate'
import type { MetaIconKey } from './metaIcons'
import { toHref } from './metaIcons'

export function useResumeTemplateData() {
  const store = useResumeStore()

  const hasBasicInfo = computed(() => {
    const b = store.basicInfo
    return Object.values(b).some((value) => value.trim())
  })

  const hasAnyContent = computed(
    () =>
      hasBasicInfo.value ||
      store.educationList.some((e) => e.school) ||
      Boolean(store.skills) ||
      store.workList.some((w) => w.company) ||
      store.projectList.some((p) => p.name) ||
      store.personalWorkList.some(hasPersonalWorkContent) ||
      store.trainingList.some(hasTrainingContent) ||
      store.customSectionList.some(hasCustomSectionContent) ||
      store.awardList.some((a) => a.name) ||
      Boolean(store.selfIntro)
  )

  const lineOneMeta = computed(() =>
    [
      { key: 'phone', label: '电话', icon: 'phone' as MetaIconKey, text: store.basicInfo.phone.trim() },
      { key: 'mail', label: '邮箱', icon: 'mail' as MetaIconKey, text: store.basicInfo.email.trim() },
      { key: 'user', label: '年龄', icon: 'user' as MetaIconKey, text: store.basicInfo.age.trim() },
      { key: 'gender', label: '性别', icon: 'gender' as MetaIconKey, text: store.basicInfo.gender.trim() },
      { key: 'workYears', label: '经验', icon: 'workYears' as MetaIconKey, text: store.basicInfo.workYears.trim() },
    ].filter((item) => item.text)
  )

  const lineTwoMeta = computed(() =>
    [
      { key: 'status', label: '状态', icon: 'status' as MetaIconKey, text: store.basicInfo.currentStatus.trim() },
      { key: 'job', label: '岗位', icon: 'job' as MetaIconKey, text: store.basicInfo.jobTitle.trim() },
      { key: 'location', label: '城市', icon: 'location' as MetaIconKey, text: store.basicInfo.expectedLocation.trim() },
      { key: 'salary', label: '薪水', icon: 'salary' as MetaIconKey, text: store.basicInfo.expectedSalary.trim() },
      { key: 'education', label: '学历', icon: 'education' as MetaIconKey, text: store.basicInfo.educationLevel.trim() },
    ].filter((item) => item.text)
  )

  const simpleContactMeta = computed(() =>
    [
      { key: 'phone', label: '电话', icon: 'phone' as MetaIconKey, text: store.basicInfo.phone.trim() },
      { key: 'mail', label: '邮箱', icon: 'mail' as MetaIconKey, text: store.basicInfo.email.trim() },
    ].filter((item) => item.text)
  )

  const lineThreeMeta = computed(() => {
    const items = [
      { key: 'wechat', label: '微信', icon: 'wechat' as MetaIconKey, text: store.basicInfo.wechat || '', isLink: false },
      { key: 'currentCity', label: '当前', icon: 'currentCity' as MetaIconKey, text: store.basicInfo.currentCity || '', isLink: false },
      { key: 'website', label: '主页', icon: 'website' as MetaIconKey, text: store.basicInfo.website || '', isLink: true },
      { key: 'github', label: '开源', icon: 'github' as MetaIconKey, text: store.basicInfo.github || '', isLink: true },
      { key: 'blog', label: '博客', icon: 'blog' as MetaIconKey, text: store.basicInfo.blog || '', isLink: true },
    ]

    return items
      .filter((item) => item.text.trim())
      .map((item) => ({
        ...item,
        href: item.isLink ? toHref(item.text) : '',
      }))
  })

  const moduleOrderMap = computed(() => {
    const map: Record<string, number> = {}
    let order = 1
    store.modules.forEach((mod) => {
      if (mod.key === 'basicInfo') return
      map[mod.key] = order
      order += 1
    })
    return map
  })

  function moduleOrderStyle(key: string): { order: number } {
    return { order: moduleOrderMap.value[key] ?? 99 }
  }

  function educationTitleParts(edu: { major?: string; college?: string; degree?: string }): string[] {
    return [edu.major, edu.college, edu.degree]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean)
  }

  function educationTags(edu: { tags?: string[]; type?: string }): string[] {
    const tags = Array.isArray(edu.tags) ? edu.tags : []
    return tags.map((value) => value.trim()).filter(Boolean)
  }

  function workTitleParts(work: { department?: string; position?: string; location?: string }): string[] {
    return [work.department, work.position]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean)
  }

  function workSideParts(work: { location?: string; startDate?: string; endDate?: string }): string[] {
    return [work.location?.trim() ?? '', dateRangeText(work.startDate ?? '', work.endDate ?? '')]
      .filter(Boolean)
  }

  function hasPersonalWorkContent(work: {
    name?: string
    type?: string
    link?: string
    description?: string
    contribution?: string
    techStack?: string
    outcome?: string
  }): boolean {
    return [
      work.name,
      work.type,
      work.link,
      work.description,
      work.contribution,
      work.techStack,
      work.outcome,
    ].some((value) => value?.trim())
  }

  function personalWorkMetaParts(work: { type?: string; techStack?: string; outcome?: string }): string[] {
    return [work.type, work.techStack, work.outcome]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean)
  }

  function hasTrainingContent(training: {
    institution?: string
    course?: string
    credential?: string
    startDate?: string
    endDate?: string
    location?: string
    description?: string
    outcome?: string
  }): boolean {
    return [
      training.institution,
      training.course,
      training.credential,
      training.startDate,
      training.endDate,
      training.location,
      training.description,
      training.outcome,
    ].some((value) => value?.trim())
  }

  function trainingMetaParts(training: {
    credential?: string
    location?: string
    startDate?: string
    endDate?: string
  }): string[] {
    return [
      training.credential,
      training.location,
      dateRangeText(training.startDate ?? '', training.endDate ?? ''),
    ]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean)
  }

  function hasCustomSectionItemContent(item: {
    title?: string
    subtitle?: string
    date?: string
    link?: string
    description?: string
  }): boolean {
    return [
      item.title,
      item.subtitle,
      item.date,
      item.link,
      item.description,
    ].some((value) => value?.trim())
  }

  function hasCustomSectionContent(section: {
    title?: string
    items?: Array<{
      title?: string
      subtitle?: string
      date?: string
      link?: string
      description?: string
    }>
  }): boolean {
    return Boolean(section.items?.some(hasCustomSectionItemContent))
  }

  function customItemMetaParts(item: { subtitle?: string; date?: string }): string[] {
    return [item.subtitle, dateText(item.date ?? '')]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean)
  }

  function linkHref(value: string): string {
    return toHref(value)
  }

  function dateText(value: string): string {
    return formatResumeDate(value)
  }

  function dateRangeText(start: string, end: string): string {
    return formatResumeDateRange(start, end)
  }

  return {
    store,
    hasAnyContent,
    lineOneMeta,
    lineTwoMeta,
    simpleContactMeta,
    lineThreeMeta,
    moduleOrderStyle,
    educationTitleParts,
    educationTags,
    workTitleParts,
    workSideParts,
    hasPersonalWorkContent,
    personalWorkMetaParts,
    hasTrainingContent,
    trainingMetaParts,
    hasCustomSectionContent,
    hasCustomSectionItemContent,
    customItemMetaParts,
    linkHref,
    dateText,
    dateRangeText,
  }
}
