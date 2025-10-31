import { z } from 'zod'

const DEFAULT_INTERRUPT_KEYWORDS = [
  '谢谢',
  '谢谢你',
  '我知道了',
  '好的我知道了',
  '好的',
  '停',
  '暂停',
  '可以了',
  '别说了',
  'Stop',
  'Thank you',
  'Got it',
  "I'm good",
  'Okay',
  'Enough',
  'Pause',
]

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseKeywords = (value: string | undefined): string[] => {
  if (!value) return [...DEFAULT_INTERRUPT_KEYWORDS]
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.length ? parsed : [...DEFAULT_INTERRUPT_KEYWORDS]
    }
  } catch (error) {
    // Ignore JSON parsing errors and fall back to comma-separated values
  }
  const keywords = value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
  return keywords.length ? keywords : [...DEFAULT_INTERRUPT_KEYWORDS]
}

const parseNumberArray = (value: string | undefined): number[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
    }
  } catch (error) {
    // Ignore JSON parsing errors and fall back to comma-separated values
  }
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
}

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return fallback
}

const envSchema = z.object({
  // VolcEngine credentials
  VOLC_ACCESS_KEY_ID: z.string().min(1, 'VOLC_ACCESS_KEY_ID is required'),
  VOLC_SECRET_KEY: z.string().min(1, 'VOLC_SECRET_KEY is required'),

  // RTC configuration
  VOLC_RTC_APP_ID: z.string().min(1, 'VOLC_RTC_APP_ID is required'),
  VOLC_RTC_APP_KEY: z.string().min(1, 'VOLC_RTC_APP_KEY is required'),

  // ASR/TTS configuration
  VOLC_ASR_APP_ID: z.string().optional(),
  VOLC_TTS_APP_ID: z.string().optional(),
  VOLC_ASR_CLUSTER: z.string().default('volcengine_streaming_common'),
  VOLC_TTS_CLUSTER: z.string().default('volcano_tts'),

  // Voice configuration
  VOLC_TTS_VOICE_TYPE: z.string().default('BV001_streaming'),
  VOLC_TTS_PROVIDER: z.string().default('volcano'),
  VOLC_TTS_MODE: z.enum(['standard', 'bigtts', 'bidirection']).default('standard'),
  VOLC_TTS_SPEED_RATIO: z.number().default(1),
  VOLC_TTS_PITCH_RATIO: z.number().default(1),
  VOLC_TTS_VOLUME_RATIO: z.number().default(1),
  VOLC_TTS_SPEECH_RATIO: z.number().default(1),
  VOLC_TTS_PITCH_RATE: z.number().default(0),
  VOLC_TTS_SPEECH_RATE: z.number().default(0),
  VOLC_TTS_APP_TOKEN: z.string().optional(),
  VOLC_TTS_RESOURCE_ID: z.string().optional(),
  VOLC_TTS_IGNORE_BRACKET_TEXT: z.array(z.number()).default([]),
  VOLC_TTS_EMOTION: z.string().optional(),
  VOLC_TTS_EMOTION_INTENSITY: z.number().default(0),
  VOLC_TTS_DISABLE_MARKDOWN_FILTER: z.boolean().default(false),
  VOLC_TTS_ENABLE_LATEX_TN: z.boolean().default(false),

  // LLM configuration
  VOLC_LLM_MODE: z.string().default('ArkV3'),
  VOLC_LLM_ENDPOINT_ID: z.string().optional(),
  VOLC_LLM_SYSTEM_MESSAGE: z.string().default('你是 EMQ，性格幽默又善解人意。你在表达时需简明扼要，有自己的观点。'),
  VOLC_LLM_VISION_ENABLE: z.boolean().default(false),

  // Agent configuration
  VOLC_AGENT_USER_ID: z.string().default('emq-ai-bot'),
  VOLC_AGENT_WELCOME_MESSAGE: z.string().default('你好，我是 EMQ，有什么需要帮忙的吗？'),
  VOLC_AGENT_ENABLE_CONVERSATION_CALLBACK: z.boolean().default(true),
  VOLC_AGENT_ANS_MODE: z.number().default(2),
  VOLC_AGENT_VOICEPRINT_MODE: z.number().default(1),

  // Task configuration
  VOLC_TASK_ID: z.string().default('emq-aigc-task-001'),

  // Scene configuration
  VOLC_SCENE_ICON: z.string().default('https://lf3-rtc-demo.volccdn.com/obj/rtc-aigc-assets/DoubaoAvatar.png'),
  VOLC_SCENE_NAME: z.string().default('EMQ 陪伴助手'),
  VOLC_SCENE_DEFAULT: z.string().min(1).default('emq-mcp-ai-companion'),

  // Avatar configuration
  VOLC_AVATAR_ENABLED: z.boolean().default(false),
  VOLC_AVATAR_TYPE: z.string().default('3min'),
  VOLC_AVATAR_ROLE: z.string().default('250623-zhibo-linyunzhi'),
  VOLC_AVATAR_BACKGROUND_URL: z.string().default(''),
  VOLC_AVATAR_VIDEO_BITRATE: z.number().default(2000),

  // API configuration
  VOLC_API_REGION: z.string().min(1).default('cn-north-1'),
  VOLC_API_VERSION: z.string().min(1).default('2024-12-01'),
  VOLC_INTERRUPT_MODE: z.number().default(0),
  VOLC_INTERRUPT_SPEECH_DURATION: z.number().min(0).max(3000).default(600),
  VOLC_INTERRUPT_SILENCE_TIME: z.number().min(0).max(5000).default(1000),
  VOLC_INTERRUPT_VOLUME_GAIN: z.number().min(0).max(5).default(0.6),
  VOLC_INTERRUPT_KEYWORDS: z.array(z.string()).default(DEFAULT_INTERRUPT_KEYWORDS),
})

export type RuntimeEnv = z.infer<typeof envSchema>

export const getEnv = (): RuntimeEnv => {
  // Convert string environment variables to appropriate types
  const processedEnv = {
    ...Bun.env,
    VOLC_TTS_PROVIDER: Bun.env.VOLC_TTS_PROVIDER || undefined,
    VOLC_TTS_MODE: Bun.env.VOLC_TTS_MODE ? Bun.env.VOLC_TTS_MODE.toLowerCase() : undefined,
    VOLC_TTS_APP_TOKEN: Bun.env.VOLC_TTS_APP_TOKEN || undefined,
    VOLC_TTS_RESOURCE_ID: Bun.env.VOLC_TTS_RESOURCE_ID || undefined,
    VOLC_TTS_SPEED_RATIO: parseNumber(Bun.env.VOLC_TTS_SPEED_RATIO, 1),
    VOLC_TTS_PITCH_RATIO: parseNumber(Bun.env.VOLC_TTS_PITCH_RATIO, 1),
    VOLC_TTS_VOLUME_RATIO: parseNumber(Bun.env.VOLC_TTS_VOLUME_RATIO, 1),
    VOLC_TTS_SPEECH_RATIO: parseNumber(Bun.env.VOLC_TTS_SPEECH_RATIO, 1),
    VOLC_TTS_PITCH_RATE: parseNumber(Bun.env.VOLC_TTS_PITCH_RATE, 0),
    VOLC_TTS_SPEECH_RATE: parseNumber(Bun.env.VOLC_TTS_SPEECH_RATE, 0),
    VOLC_TTS_IGNORE_BRACKET_TEXT: parseNumberArray(Bun.env.VOLC_TTS_IGNORE_BRACKET_TEXT),
    VOLC_TTS_EMOTION: Bun.env.VOLC_TTS_EMOTION || undefined,
    VOLC_TTS_EMOTION_INTENSITY: parseNumber(Bun.env.VOLC_TTS_EMOTION_INTENSITY, 0),
    VOLC_LLM_VISION_ENABLE: Bun.env.VOLC_LLM_VISION_ENABLE === 'true',
    VOLC_AGENT_ENABLE_CONVERSATION_CALLBACK: Bun.env.VOLC_AGENT_ENABLE_CONVERSATION_CALLBACK !== 'false',
    VOLC_AGENT_ANS_MODE: parseNumber(Bun.env.VOLC_AGENT_ANS_MODE, 2),
    VOLC_AGENT_VOICEPRINT_MODE: parseNumber(Bun.env.VOLC_AGENT_VOICEPRINT_MODE, 1),
    VOLC_AVATAR_ENABLED: Bun.env.VOLC_AVATAR_ENABLED === 'true',
    VOLC_AVATAR_VIDEO_BITRATE: parseNumber(Bun.env.VOLC_AVATAR_VIDEO_BITRATE, 2000),
    VOLC_INTERRUPT_MODE: parseNumber(Bun.env.VOLC_INTERRUPT_MODE, 0),
    VOLC_INTERRUPT_SPEECH_DURATION: parseNumber(Bun.env.VOLC_INTERRUPT_SPEECH_DURATION, 600),
    VOLC_INTERRUPT_SILENCE_TIME: parseNumber(Bun.env.VOLC_INTERRUPT_SILENCE_TIME, 1000),
    VOLC_INTERRUPT_VOLUME_GAIN: parseNumber(Bun.env.VOLC_INTERRUPT_VOLUME_GAIN, 0.6),
    VOLC_INTERRUPT_KEYWORDS: parseKeywords(Bun.env.VOLC_INTERRUPT_KEYWORDS),
    VOLC_TTS_DISABLE_MARKDOWN_FILTER: parseBoolean(Bun.env.VOLC_TTS_DISABLE_MARKDOWN_FILTER),
    VOLC_TTS_ENABLE_LATEX_TN: parseBoolean(Bun.env.VOLC_TTS_ENABLE_LATEX_TN),
  }

  const result = envSchema.safeParse(processedEnv)
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).filter(Boolean)
    throw new Error(messages.length ? messages.join('; ') : 'Environment variables validation failed')
  }
  return result.data
}
