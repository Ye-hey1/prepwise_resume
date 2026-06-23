import { computed, watch } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { loadFont } from '@/utils/fontLoader'

export function useTemplateCustomization() {
  const store = useResumeStore()
  const currentCustomization = computed(() => store.getCustomization(store.selectedTemplateKey))

  watch(
    () => currentCustomization.value.fontFamily,
    (fontFamily) => {
      if (fontFamily) loadFont(fontFamily)
    },
    { immediate: true }
  )

  const cssVars = computed(() => {
    const custom = currentCustomization.value
    const vars: Record<string, string> = {}
    const fontSize = custom.fontSize ?? 14
    const metaSize = Math.max(10, fontSize - 1)
    const smallSize = Math.max(9, fontSize - 2)
    const tagSize = Math.max(9, fontSize - 3)
    const entryTitleSize = fontSize + 2
    const sectionTitleSize = fontSize + 4
    const nameSize = Math.min(40, Math.max(24, Math.round(fontSize * 2.1)))

    vars['--tpl-font-size'] = `${fontSize}px`
    vars['--tpl-body-size'] = `${fontSize}px`
    vars['--tpl-meta-size'] = `${metaSize}px`
    vars['--tpl-small-size'] = `${smallSize}px`
    vars['--tpl-tag-size'] = `${tagSize}px`
    vars['--tpl-entry-title-size'] = `${entryTitleSize}px`
    vars['--tpl-section-title-size'] = `${sectionTitleSize}px`
    vars['--tpl-name-size'] = `${nameSize}px`

    if (custom.primaryColor) vars['--tpl-primary'] = custom.primaryColor
    if (custom.accentColor) vars['--tpl-accent'] = custom.accentColor
    if (custom.fontFamily) vars['--tpl-font'] = custom.fontFamily
    if (custom.sectionSpacing) vars['--tpl-section-gap'] = `${custom.sectionSpacing}px`
    if (custom.pagePaddingX !== undefined) vars['--tpl-page-padding-x'] = `${custom.pagePaddingX}px`
    if (custom.pagePaddingY !== undefined) vars['--tpl-page-padding-y'] = `${custom.pagePaddingY}px`
    if (custom.titleMarginTop !== undefined) vars['--tpl-title-gap-top'] = `${custom.titleMarginTop}px`
    if (custom.titleMarginBottom !== undefined) vars['--tpl-title-gap-bottom'] = `${custom.titleMarginBottom}px`
    if (custom.lineHeight !== undefined) vars['--tpl-line-height'] = `${custom.lineHeight}`

    // 排版与布局参数
    if (custom.layoutAlign) {
      if (custom.layoutAlign === 'left') {
        vars['--tpl-header-justify'] = 'flex-start'
        vars['--tpl-header-align'] = 'flex-start'
        vars['--tpl-header-dir'] = 'row'
        vars['--tpl-header-align-items'] = 'flex-start'
        vars['--tpl-text-align'] = 'left'
        vars['--tpl-avatar-margin'] = '0 0 0 24px'
      } else if (custom.layoutAlign === 'right') {
        vars['--tpl-header-justify'] = 'space-between'
        vars['--tpl-header-align'] = 'flex-end'
        vars['--tpl-header-dir'] = 'row-reverse'
        vars['--tpl-header-align-items'] = 'flex-start'
        vars['--tpl-text-align'] = 'right'
        vars['--tpl-avatar-margin'] = '0 24px 0 0'
      } else if (custom.layoutAlign === 'center') {
        vars['--tpl-header-justify'] = 'center'
        vars['--tpl-header-align'] = 'center'
        vars['--tpl-header-dir'] = 'column-reverse'
        vars['--tpl-header-align-items'] = 'center'
        vars['--tpl-text-align'] = 'center'
        vars['--tpl-avatar-margin'] = '0 0 16px 0'
      } else { // 'space-between'
        vars['--tpl-header-justify'] = 'space-between'
        vars['--tpl-header-align'] = 'flex-start'
        vars['--tpl-header-dir'] = 'row'
        vars['--tpl-header-align-items'] = 'flex-start'
        vars['--tpl-text-align'] = 'left'
        vars['--tpl-avatar-margin'] = '0 0 0 24px'
      }
    }
    
    // 图标与标签显隐
    if (custom.metaDisplay) {
      vars['--tpl-meta-icon-display'] = (custom.metaDisplay === 'text' || custom.metaDisplay === 'pure') ? 'none' : 'inline-flex'
      vars['--tpl-meta-label-display'] = (custom.metaDisplay === 'icon' || custom.metaDisplay === 'pure') ? 'none' : 'inline'
    }

    // 头像开关与圆角
    if (custom.avatarShape) {
      if (custom.avatarShape === 'hidden') {
        vars['--tpl-avatar-display'] = 'none'
      } else {
        vars['--tpl-avatar-display'] = 'block'
        vars['--tpl-avatar-radius'] = custom.avatarShape === 'circle' ? '50%' : '12px'
      }
    }
    return vars
  })

  return { cssVars }
}
