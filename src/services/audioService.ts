import type { AiConfig } from '@/stores/aiConfig'
import { getBaseUrl } from '@/stores/aiConfig'

export interface AudioTranscriptionResult {
  text: string
  duration?: number
}

/**
 * 调用云端 API，将录音 Blob 转换为文本。
 */
export async function transcribeAudio(
  config: AiConfig,
  audioBlob: Blob,
  signal?: AbortSignal
): Promise<string> {
  const endpoint = `${getBaseUrl(config.apiUrl)}/audio/transcriptions`
  
  const formData = new FormData()
  // 必须指定一个附带扩展名的文件名，主流引擎通过扩展名判断封装格式
  formData.append('file', audioBlob, 'record.webm')
  formData.append('model', config.modelName || 'FunAudioLLM/SenseVoiceSmall')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
    },
    body: formData,
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 404) {
      throw new Error(`您当前配置的 AI 通道可能不支持语音识别(ASR)接口。请点击右上角配置，为“语音识别”单独配置支持的通道(如硅基流动、OpenAI等)。(${response.status})`)
    }
    throw new Error(`ASR 识别失败 (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  return result.text || ''
}

/**
 * 根据模型名称和音色名称，构建完整的 voice ID。
 * - fish-speech → fishaudio/fish-speech-1.5:{voice}
 * - CosyVoice  → FunAudioLLM/CosyVoice2-0.5B:{voice}
 * - 其他        → 直接用 voice（兼容 OpenAI 等）
 */
function buildVoiceId(modelName: string, voice: string): string {
  if (!voice) return 'default'
  if (modelName.includes('fish-speech')) return `fishaudio/fish-speech-1.5:${voice}`
  if (modelName.includes('CosyVoice')) return `FunAudioLLM/CosyVoice2-0.5B:${voice}`
  return voice
}

/**
 * 将 Hex 字符串转换为 Uint8Array
 */
function hexToUint8Array(hexString: string): Uint8Array {
  if (hexString.length % 2 !== 0) return new Uint8Array(0)
  const bytes = new Uint8Array(hexString.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * 调用云端 API，将文字合成为可播放的音频 Blob URL。
 */
export async function generateSpeechUrl(
  config: AiConfig,
  text: string,
  signal?: AbortSignal,
  voice?: string
): Promise<string> {
  const isMiniMax = config.providerId === 'minimax' || config.apiUrl.includes('minimax')
  
  let endpoint = `${getBaseUrl(config.apiUrl)}/audio/speech`
  const modelName = config.modelName || (isMiniMax ? 'speech-01-turbo' : 'fishaudio/fish-speech-1.5')
  const voiceId = voice ? buildVoiceId(modelName, voice) : 'default'

  let requestBody: any = {
    model: modelName,
    input: text,
    voice: voiceId,
    response_format: 'mp3'
  }

  // 针对 MiniMax Native 接口进行特殊适配
  if (isMiniMax) {
    // 适配 MiniMax T2A V2 接口
    // 注意：即便用户填的是 OpenAI 兼容地址，我们也尝试转换为 Native 路径
    const baseUrl = getBaseUrl(config.apiUrl).replace(/\/v1$/, '')
    endpoint = `${baseUrl}/v1/t2a_v2`
    
    requestBody = {
      model: modelName,
      text: text,
      stream: false,
      voice_setting: {
        voice_id: voiceId === 'default' ? 'male-qn-qingse' : voiceId,
        speed: 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      }
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiToken}`,
    },
    body: JSON.stringify(requestBody),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`TTS合成失败 (${response.status}): ${errorText}`)
  }

  if (isMiniMax) {
    const result = await response.json()
    if (result.base_resp?.status_code !== 0) {
      throw new Error(`MiniMax 合成错误: ${result.base_resp?.status_msg || '未知错误'}`)
    }
    const hex = result.data?.audio
    if (!hex) throw new Error('MiniMax 返回的音频数据为空')
    
    const bytes = hexToUint8Array(hex)
    const audioBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(audioBuffer).set(bytes)
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
    return URL.createObjectURL(blob)
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}
