import { ref, onUnmounted } from 'vue'

/**
 * 语音输入 composable
 *
 * 管理浏览器语音识别（Web Speech API 优先）和 MediaRecorder 降级方案
 */
export function useInterviewVoice() {
  const isListening = ref(false)
  const errorMsg = ref('')

  type SpeechRecognitionLike = {
    continuous: boolean
    interimResults: boolean
    lang: string
    onstart: (() => void) | null
    onresult: ((event: unknown) => void) | null
    onerror: ((event: unknown) => void) | null
    onend: (() => void) | null
    start: () => void
    stop: () => void
  }

  let browserRecognizer: SpeechRecognitionLike | null = null
  let isUsingNativeAsr = false
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let speechStream: MediaStream | null = null

  let onTranscript: ((text: string) => void) | null = null
  let onError: ((msg: string) => void) | null = null

  /**
   * 设置回调
   */
  function setCallbacks(callbacks: {
    onTranscript?: (text: string) => void
    onError?: (msg: string) => void
  }) {
    onTranscript = callbacks.onTranscript ?? null
    onError = callbacks.onError ?? null
  }

  function stopRecording() {
    if (isUsingNativeAsr && browserRecognizer) {
      try { browserRecognizer.stop() } catch (_) { /* ignore */ }
      isUsingNativeAsr = false
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    if (speechStream) {
      speechStream.getTracks().forEach((track) => track.stop())
      speechStream = null
    }
    isListening.value = false
  }

  async function startRecording() {
    errorMsg.value = ''

    // 1. 优先尝试浏览器内置的 Web Speech API
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRec) {
      try {
        if (!browserRecognizer) {
          browserRecognizer = new SpeechRec()
          browserRecognizer!.continuous = true
          browserRecognizer!.interimResults = true
          browserRecognizer!.lang = 'zh-CN'

          browserRecognizer!.onresult = (event: any) => {
            let currentFinal = ''
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                currentFinal += event.results[i][0].transcript
              }
            }
            if (currentFinal && onTranscript) {
              onTranscript(currentFinal)
            }
          }

          browserRecognizer!.onerror = (event: any) => {
            console.warn('Native ASR Error:', event.error)
            if (event.error !== 'no-speech') {
              const msg = `内置语音识别中断: ${event.error}`
              errorMsg.value = msg
              onError?.(msg)
              isListening.value = false
            }
          }

          browserRecognizer!.onend = () => {
            isListening.value = false
            isUsingNativeAsr = false
          }
        }

        browserRecognizer!.start()
        isListening.value = true
        isUsingNativeAsr = true
        return // 成功开启原生引擎
      } catch (e) {
        console.warn('内置引擎启动失败，降级为云端录音方案', e)
        isUsingNativeAsr = false
      }
    }

    // 2. 降级方案：MediaRecorder + 云端 ASR
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      speechStream = stream
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunks = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        isListening.value = false
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
        if (speechStream) {
          speechStream.getTracks().forEach((track) => track.stop())
          speechStream = null
        }

        if (audioBlob.size < 100) return

        try {
          const { transcribeAudio } = await import('@/services/audioService')
          const config = (await import('@/stores/aiConfig')).useAiConfigStore().getConfigForFeature('asr')
          const text = await transcribeAudio(config, audioBlob)
          if (text && onTranscript) {
            onTranscript(text)
          }
        } catch (e: any) {
          const msg = e.message || '语音识别失败'
          errorMsg.value = msg
          onError?.(msg)
        }
      }

      mediaRecorder.start()
      isListening.value = true
    } catch (e) {
      console.error('Failed to start recording', e)
      errorMsg.value = '无法访问麦克风，请检查系统权限。'
      isListening.value = false
    }
  }

  function toggleVoice() {
    if (isListening.value) {
      stopRecording()
    } else {
      void startRecording()
    }
  }

  onUnmounted(() => {
    stopRecording()
  })

  return {
    // state
    isListening,
    errorMsg,
    // actions
    setCallbacks,
    startRecording,
    stopRecording,
    toggleVoice,
  }
}
