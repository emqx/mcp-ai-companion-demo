import { z } from 'zod'

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
  VOLC_TTS_SPEED_RATIO: z.number().default(1),
  VOLC_TTS_PITCH_RATIO: z.number().default(1),
  VOLC_TTS_VOLUME_RATIO: z.number().default(1),

  // LLM configuration
  VOLC_LLM_MODE: z.string().default('ArkV3'),
  VOLC_LLM_ENDPOINT_ID: z.string().optional(),
  VOLC_LLM_SYSTEM_MESSAGE: z.string().default('你是 EMQ，性格幽默又善解人意。你在表达时需简明扼要，有自己的观点。'),
  VOLC_LLM_VISION_ENABLE: z.boolean().default(false),

  // Agent configuration
  VOLC_AGENT_USER_ID: z.string().default('emq-ai-bot'),
  VOLC_AGENT_WELCOME_MESSAGE: z.string().default('你好，我是 EMQ，有什么需要帮忙的吗？'),
  VOLC_AGENT_ENABLE_CONVERSATION_CALLBACK: z.boolean().default(true),

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
})

export type RuntimeEnv = z.infer<typeof envSchema>

export const getEnv = (): RuntimeEnv => {
  // Convert string environment variables to appropriate types
  const processedEnv = {
    ...Bun.env,
    VOLC_TTS_SPEED_RATIO: Bun.env.VOLC_TTS_SPEED_RATIO ? Number(Bun.env.VOLC_TTS_SPEED_RATIO) : 1,
    VOLC_TTS_PITCH_RATIO: Bun.env.VOLC_TTS_PITCH_RATIO ? Number(Bun.env.VOLC_TTS_PITCH_RATIO) : 1,
    VOLC_TTS_VOLUME_RATIO: Bun.env.VOLC_TTS_VOLUME_RATIO ? Number(Bun.env.VOLC_TTS_VOLUME_RATIO) : 1,
    VOLC_LLM_VISION_ENABLE: Bun.env.VOLC_LLM_VISION_ENABLE === 'true',
    VOLC_AGENT_ENABLE_CONVERSATION_CALLBACK: Bun.env.VOLC_AGENT_ENABLE_CONVERSATION_CALLBACK !== 'false',
    VOLC_AVATAR_ENABLED: Bun.env.VOLC_AVATAR_ENABLED === 'true',
    VOLC_AVATAR_VIDEO_BITRATE: Bun.env.VOLC_AVATAR_VIDEO_BITRATE ? Number(Bun.env.VOLC_AVATAR_VIDEO_BITRATE) : 2000,
    VOLC_INTERRUPT_MODE: Bun.env.VOLC_INTERRUPT_MODE ? Number(Bun.env.VOLC_INTERRUPT_MODE) : 0,
  }

  const result = envSchema.safeParse(processedEnv)
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).filter(Boolean)
    throw new Error(messages.length ? messages.join('; ') : 'Environment variables validation failed')
  }
  return result.data
}
