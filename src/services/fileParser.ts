/**
 * 文件解析服务 — 将上传的简历文件提取为纯文本或视觉图片
 * 支持 PDF、DOCX、TXT、MD、JPG、PNG、WEBP 格式
 */
import mammoth from 'mammoth'

// PDF.js worker 配置：使用 CDN 加载 worker 避免 Vite 打包问题
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const TEXT_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'md']
const PDF_TEXT_MIN_LENGTH = 40
const PDF_VISION_PAGE_LIMIT = 3

export interface PdfTextExtractionResult {
  text: string
  hasText: boolean
  pageCount: number
}

function getFileExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

export function isPdfFile(file: File): boolean {
  return getFileExtension(file) === 'pdf'
}

export function isImageFile(file: File): boolean {
  return IMAGE_EXTENSIONS.includes(getFileExtension(file))
}

export function isTextExtractableFile(file: File): boolean {
  return TEXT_EXTENSIONS.includes(getFileExtension(file))
}

export function supportsResumeParseFile(file: File): boolean {
  return isTextExtractableFile(file) || isImageFile(file)
}

/**
 * 从 PDF 文件提取文本（保留换行结构）
 */
export async function extractTextFromPdf(file: File): Promise<PdfTextExtractionResult> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const textParts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // 利用 TextItem 的 transform[5](Y坐标) 来还原换行
    let lastY: number | null = null
    const lineBreakThreshold = 2 // Y 坐标变化超过此值视为换行
    const parts: string[] = []

    for (const item of content.items) {
      if (!('str' in item)) continue
      const text = item.str
      if (!text) continue

      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > lineBreakThreshold) {
        // Y 坐标变化较大 → 新段落/换行
        parts.push('\n')
      } else if (lastY !== null && parts.length > 0) {
        // 同一行内用空格连接
        parts.push(' ')
      }

      parts.push(text)
      lastY = y
    }

    const pageText = parts.join('').trim()
    if (pageText) {
      textParts.push(pageText)
    }
  }

  const text = textParts.join('\n\n').trim()
  return {
    text,
    hasText: text.replace(/\s+/g, '').length >= PDF_TEXT_MIN_LENGTH,
    pageCount: pdf.numPages,
  }
}

/**
 * 从 DOCX 文件提取文本
 */
async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })

  if (!result.value.trim()) {
    throw new Error('DOCX 文件中未检测到文本内容')
  }

  return result.value
}

/**
 * 从 TXT/MD 文件提取文本
 */
async function extractTextFromTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'UTF-8')
  })
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export async function renderPdfPagesToImages(file: File, maxPages = PDF_VISION_PAGE_LIMIT): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []
  const pageCount = Math.min(pdf.numPages, maxPages)

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.2 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建 PDF 渲染画布')
    }

    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    await page.render({ canvas, canvasContext: context, viewport }).promise
    // 使用 JPEG 并在 0.8 质量下，文件大小通常只有 PNG 的 1/10 左右，且不影响 OCR
    images.push(canvas.toDataURL('image/jpeg', 0.8))
  }

  if (images.length === 0) {
    throw new Error('无法从 PDF 生成预览图像')
  }

  return images
}

export async function extractVisionImagesFromFile(file: File): Promise<string[]> {
  if (isImageFile(file)) {
    return [await readFileAsDataUrl(file)]
  }

  if (isPdfFile(file)) {
    return renderPdfPagesToImages(file)
  }

  throw new Error('当前文件类型不支持视觉解析，请上传 PDF 或图片文件')
}

/**
 * 统一入口：根据文件扩展名自动选择解析方式
 * @throws 不支持的格式会抛出错误
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = getFileExtension(file)

  if (ext === 'pdf') {
    const result = await extractTextFromPdf(file)
    if (!result.text) {
      throw new Error('PDF 文件中未检测到文本内容')
    }
    return result.text
  }
  if (ext === 'docx' || ext === 'doc') return extractTextFromDocx(file)
  if (ext === 'txt' || ext === 'md') return extractTextFromTxt(file)

  throw new Error(`不支持的文件格式: .${ext}，请上传 PDF、DOCX、TXT、MD 或图片文件`)
}

export { PDF_TEXT_MIN_LENGTH }

/** OCR 进度回调 */
export interface OcrProgressCallback {
  (progress: number, status: string): void
}

/**
 * 本地 OCR：使用 Tesseract.js 在浏览器端提取图片中的文字
 * 支持中英文混合识别，首次使用时需下载 ~20MB 语言包（浏览器会缓存）
 */
export async function extractTextWithLocalOCR(
  imageSource: File | string,
  onProgress?: OcrProgressCallback,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')

  onProgress?.(5, '正在初始化 OCR 引擎...')

  const worker = await createWorker('chi_sim+eng', undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(20 + Math.floor(m.progress * 70), '正在识别文字...')
      } else if (m.status === 'loading language traineddata') {
        onProgress?.(5 + Math.floor(m.progress * 15), '正在下载中文语言包...')
      }
    },
  })

  try {
    const { data: { text } } = await worker.recognize(imageSource)
    onProgress?.(95, '文字识别完成')
    return text.trim()
  } finally {
    await worker.terminate()
  }
}

/**
 * 本地 OCR：批量处理多张图片（用于多页 PDF）
 */
export async function extractTextFromImagesWithOCR(
  imageUrls: string[],
  onProgress?: OcrProgressCallback,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')

  onProgress?.(3, '正在初始化 OCR 引擎...')

  const worker = await createWorker('chi_sim+eng', undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'loading language traineddata') {
        onProgress?.(3 + Math.floor(m.progress * 12), '正在下载中文语言包...')
      }
    },
  })

  const textParts: string[] = []
  const perPage = 80 / Math.max(imageUrls.length, 1)

  try {
    for (let i = 0; i < imageUrls.length; i++) {
      const baseProgress = 15 + Math.floor(i * perPage)
      onProgress?.(baseProgress, `正在识别第 ${i + 1}/${imageUrls.length} 页...`)
      const { data: { text } } = await worker.recognize(imageUrls[i]!)
      if (text.trim()) textParts.push(text.trim())
    }
    onProgress?.(95, '全部页面识别完成')
  } finally {
    await worker.terminate()
  }

  return textParts.join('\n\n')
}
