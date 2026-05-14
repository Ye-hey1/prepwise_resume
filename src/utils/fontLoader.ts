const loadedFonts = new Set<string>()

const SYSTEM_FONTS = [
  "'Noto Sans SC', sans-serif",
  "'Microsoft YaHei', sans-serif",
  "'SimSun', serif",
  "'KaiTi', serif",
  "'PingFang SC', sans-serif",
  "'Helvetica Neue', sans-serif",
]

const GOOGLE_FONT_MAP: Record<string, string> = {
  "'LXGW WenKai', cursive": 'LXGW+WenKai',
  "'Source Han Sans SC', sans-serif": 'Source+Han+Sans+SC',
  "'Noto Serif SC', serif": 'Noto+Serif+SC:wght@400;700',
  "'ZCOOL XiaoWei', serif": 'ZCOOL+XiaoWei',
  "'Ma Shan Zheng', cursive": 'Ma+Shan+Zheng',
}

export function getAvailableFonts() {
  return [
    { label: '默认 (Noto Sans SC)', value: '' },
    { label: '微软雅黑', value: "'Microsoft YaHei', sans-serif" },
    { label: '宋体', value: "'SimSun', serif" },
    { label: '楷体', value: "'KaiTi', serif" },
    { label: '苹方', value: "'PingFang SC', sans-serif" },
    { label: 'Helvetica', value: "'Helvetica Neue', sans-serif" },
    { label: '霞鹜文楷', value: "'LXGW WenKai', cursive" },
    { label: '思源宋体', value: "'Noto Serif SC', serif" },
    { label: '站酷小薇', value: "'ZCOOL XiaoWei', serif" },
    { label: '马善政', value: "'Ma Shan Zheng', cursive" },
  ]
}

export function loadFont(fontFamily: string) {
  if (!fontFamily || SYSTEM_FONTS.includes(fontFamily) || loadedFonts.has(fontFamily)) return

  const googleFamily = GOOGLE_FONT_MAP[fontFamily]
  if (!googleFamily) return

  const id = `google-font-${fontFamily.replace(/[^a-zA-Z]/g, '')}`
  if (document.getElementById(id)) {
    loadedFonts.add(fontFamily)
    return
  }

  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${googleFamily}&display=swap`
  document.head.appendChild(link)
  loadedFonts.add(fontFamily)
}
