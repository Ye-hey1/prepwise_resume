import { computed } from 'vue'
import { useResumeStore } from '@/stores/resume'
import type { MetaIconKey } from './metaIcons'
import { toHref } from './metaIcons'

export function useResumeTemplateData() {
  const store = useResumeStore()

  const hasBasicInfo = computed(() => {
    const b = store.basicInfo
    return Boolean(b.name || b.phone || b.email || b.jobTitle || b.wechat || b.currentCity || b.website || b.github || b.blog)
  })

  const hasAnyContent = computed(
    () =>
      hasBasicInfo.value ||
      store.educationList.some((e) => e.school) ||
      Boolean(store.skills) ||
      store.workList.some((w) => w.company) ||
      store.projectList.some((p) => p.name) ||
      store.awardList.some((a) => a.name) ||
      Boolean(store.selfIntro)
  )

  const lineOneMeta = computed(() => [
    { key: 'phone', label: '电话', icon: 'phone' as MetaIconKey, text: store.basicInfo.phone || '13400009999' },
    { key: 'mail', label: '邮箱', icon: 'mail' as MetaIconKey, text: store.basicInfo.email || 'example@qq.com' },
    { key: 'user', label: '年龄', icon: 'user' as MetaIconKey, text: store.basicInfo.age || '26岁' },
    { key: 'gender', label: '性别', icon: 'gender' as MetaIconKey, text: store.basicInfo.gender || '男' },
    { key: 'workYears', label: '经验', icon: 'workYears' as MetaIconKey, text: store.basicInfo.workYears || '4年' },
  ])

  const lineTwoMeta = computed(() => [
    { key: 'status', label: '状态', icon: 'status' as MetaIconKey, text: store.basicInfo.currentStatus || '离职-随时到岗' },
    { key: 'job', label: '岗位', icon: 'job' as MetaIconKey, text: store.basicInfo.jobTitle || '全栈开发工程师' },
    { key: 'location', label: '城市', icon: 'location' as MetaIconKey, text: store.basicInfo.expectedLocation || '深圳' },
    { key: 'salary', label: '薪水', icon: 'salary' as MetaIconKey, text: store.basicInfo.expectedSalary || '面议' },
    { key: 'education', label: '学历', icon: 'education' as MetaIconKey, text: store.basicInfo.educationLevel || '本科' },
  ])

  const simpleContactMeta = computed(() => [
    { key: 'phone', label: '电话', icon: 'phone' as MetaIconKey, text: store.basicInfo.phone || '13400009999' },
    { key: 'mail', label: '邮箱', icon: 'mail' as MetaIconKey, text: store.basicInfo.email || 'example@qq.com' },
  ])

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

  return {
    store,
    hasAnyContent,
    lineOneMeta,
    lineTwoMeta,
    simpleContactMeta,
    lineThreeMeta,
    moduleOrderStyle,
  }
}
