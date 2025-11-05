import { randomUUID } from 'node:crypto'
import { AccessToken } from '../lib/token'
import type { RuntimeEnv } from '../env'
import type { SceneFile, SceneSummary, VoiceChatConfig } from '../types'

const cloneScene = (scene: SceneFile): SceneFile => JSON.parse(JSON.stringify(scene))

const asOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const toJsonObject = (value?: string): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined
  }
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch (error) {
    // Ignore JSON parsing errors and fall back to undefined
  }
  return undefined
}

const toJsonArray = (value?: string): unknown[] | undefined => {
  if (!value) {
    return undefined
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : undefined
  } catch (error) {
    // Ignore JSON parsing errors and fall back to undefined
  }
  return undefined
}

// Create scene configuration directly from environment variables
const createSceneFromEnv = (env: RuntimeEnv): SceneFile => {
  const roomId = randomUUID()
  const userId = randomUUID()

  const agentConfig: VoiceChatConfig['AgentConfig'] = {
    TargetUserId: [userId],
    WelcomeMessage: env.VOLC_AGENT_WELCOME_MESSAGE,
    UserId: env.VOLC_AGENT_USER_ID,
    EnableConversationStateCallback: env.VOLC_AGENT_ENABLE_CONVERSATION_CALLBACK,
    AnsMode: env.VOLC_AGENT_ANS_MODE,
  }

  if (env.VOLC_AGENT_VOICEPRINT_MODE > 0) {
    agentConfig.VoicePrint = {
      Mode: env.VOLC_AGENT_VOICEPRINT_MODE,
    }
  }

  const interruptConfig: Record<string, unknown> = {}
  if (env.VOLC_INTERRUPT_SPEECH_DURATION > 0) {
    interruptConfig.InterruptSpeechDuration = env.VOLC_INTERRUPT_SPEECH_DURATION
  }
  if (env.VOLC_INTERRUPT_KEYWORDS.length > 0) {
    interruptConfig.InterruptKeywords = env.VOLC_INTERRUPT_KEYWORDS
  }

  const asrConfig: Record<string, unknown> = {
    Provider: 'volcano',
    ProviderParams: {
      Mode: 'smallmodel',
      AppId: env.VOLC_ASR_APP_ID || '',
      Cluster: env.VOLC_ASR_CLUSTER,
    },
    VADConfig: {
      SilenceTime: env.VOLC_INTERRUPT_SILENCE_TIME,
    },
    VolumeGain: env.VOLC_INTERRUPT_VOLUME_GAIN,
  }

  if (Object.keys(interruptConfig).length > 0) {
    asrConfig.InterruptConfig = interruptConfig
  }

  const ttsAudioConfig: Record<string, unknown> = {
    voice_type: env.VOLC_TTS_VOICE_TYPE,
  }

  switch (env.VOLC_TTS_MODE) {
    case 'bigtts':
      ttsAudioConfig.speech_ratio = env.VOLC_TTS_SPEECH_RATIO
      ttsAudioConfig.pitch_rate = env.VOLC_TTS_PITCH_RATE
      ttsAudioConfig.volume_ratio = env.VOLC_TTS_VOLUME_RATIO
      break
    case 'bidirection':
      ttsAudioConfig.speech_rate = env.VOLC_TTS_SPEECH_RATE
      ttsAudioConfig.volume_ratio = env.VOLC_TTS_VOLUME_RATIO
      ttsAudioConfig.pitch_ratio = env.VOLC_TTS_PITCH_RATIO
      break
    default:
      ttsAudioConfig.speed_ratio = env.VOLC_TTS_SPEED_RATIO
      ttsAudioConfig.pitch_ratio = env.VOLC_TTS_PITCH_RATIO
      ttsAudioConfig.volume_ratio = env.VOLC_TTS_VOLUME_RATIO
      break
  }

  if (env.VOLC_TTS_EMOTION) {
    ttsAudioConfig.emotion = env.VOLC_TTS_EMOTION
    if (env.VOLC_TTS_EMOTION_INTENSITY) {
      ttsAudioConfig.emotion_strength = env.VOLC_TTS_EMOTION_INTENSITY
    }
  }

  const ttsProviderParams: Record<string, unknown> = {
    app: {
      appid: env.VOLC_TTS_APP_ID || '',
    },
    audio: ttsAudioConfig,
  }

  if (env.VOLC_TTS_PROVIDER === 'volcano') {
    ttsProviderParams.app = {
      ...(ttsProviderParams.app as Record<string, unknown>),
      cluster: env.VOLC_TTS_CLUSTER,
    }
  }

  if (env.VOLC_TTS_APP_TOKEN) {
    ;(ttsProviderParams.app as Record<string, unknown>).token = env.VOLC_TTS_APP_TOKEN
  }

  if (env.VOLC_TTS_RESOURCE_ID) {
    ttsProviderParams.ResourceId = env.VOLC_TTS_RESOURCE_ID
  }

  if (env.VOLC_TTS_MODE === 'bidirection') {
    const additions: Record<string, unknown> = {}
    if (env.VOLC_TTS_DISABLE_MARKDOWN_FILTER) {
      additions.disable_markdown_filter = true
    }
    if (env.VOLC_TTS_ENABLE_LATEX_TN) {
      additions.enable_latex_tn = true
    }
    if (Object.keys(additions).length > 0) {
      ttsProviderParams.Additions = additions
    }
  }

  const ttsConfig: Record<string, unknown> = {
    Provider: env.VOLC_TTS_PROVIDER,
    ProviderParams: ttsProviderParams,
  }

  if (env.VOLC_TTS_IGNORE_BRACKET_TEXT.length > 0) {
    ttsConfig.IgnoreBracketText = env.VOLC_TTS_IGNORE_BRACKET_TEXT
  }

  const llmConfig: Record<string, unknown> = {
    Mode: env.VOLC_LLM_MODE,
    VisionConfig: {
      Enable: env.VOLC_LLM_VISION_ENABLE,
    },
  }

  const systemMessage = asOptionalString(env.VOLC_LLM_SYSTEM_MESSAGE)
  if (systemMessage) {
    llmConfig.SystemMessages = [systemMessage]
  }

  if (env.VOLC_LLM_ENDPOINT_ID) {
    llmConfig.EndPointId = env.VOLC_LLM_ENDPOINT_ID
  }

  if (env.VOLC_LLM_MODEL_NAME) {
    llmConfig.ModelName = env.VOLC_LLM_MODEL_NAME
  }

  if (env.VOLC_LLM_HISTORY_LENGTH !== undefined) {
    llmConfig.HistoryLength = env.VOLC_LLM_HISTORY_LENGTH
  }

  if (env.VOLC_LLM_ENABLE_ROUND_ID) {
    llmConfig.EnableRoundId = true
  }

  const setNumericConfig = (key: string, value: number | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      llmConfig[key] = value
    }
  }

  setNumericConfig('Temperature', env.VOLC_LLM_TEMPERATURE)
  setNumericConfig('TopP', env.VOLC_LLM_TOP_P)
  setNumericConfig('MaxTokens', env.VOLC_LLM_MAX_TOKENS)

  const extraHeaders = toJsonObject(env.VOLC_LLM_EXTRA_HEADERS)
  if (extraHeaders) {
    llmConfig.ExtraHeader = extraHeaders
  }

  const userPrompts = toJsonArray(env.VOLC_LLM_USER_PROMPTS)
  if (userPrompts) {
    llmConfig.UserPrompts = userPrompts
  }

  const streamOptions = toJsonObject(env.VOLC_LLM_STREAM_OPTIONS)
  if (streamOptions) {
    llmConfig.StreamOptions = streamOptions
  }

  if (env.VOLC_LLM_MODE === 'CustomLLM') {
    if (!env.VOLC_LLM_URL) {
      throw new Error('VOLC_LLM_URL is required when VOLC_LLM_MODE=CustomLLM')
    }
    llmConfig.Url = env.VOLC_LLM_URL

    if (env.VOLC_LLM_API_KEY) {
      llmConfig.APIKey = env.VOLC_LLM_API_KEY
    }
  }

  const scene: SceneFile = {
    SceneConfig: {
      icon: env.VOLC_SCENE_ICON,
      name: env.VOLC_SCENE_NAME,
      id: 'emq-mcp-ai-companion',
      botName: env.VOLC_AGENT_USER_ID,
      isInterruptMode: env.VOLC_INTERRUPT_MODE === 0,
      isVision: env.VOLC_LLM_VISION_ENABLE,
      isScreenMode: false,
      isAvatarScene: env.VOLC_AVATAR_ENABLED,
      avatarBgUrl: env.VOLC_AVATAR_BACKGROUND_URL,
    },
    AccountConfig: {
      accessKeyId: env.VOLC_ACCESS_KEY_ID,
      secretKey: env.VOLC_SECRET_KEY,
    },
    RTCConfig: {
      AppId: env.VOLC_RTC_APP_ID,
      AppKey: env.VOLC_RTC_APP_KEY,
      RoomId: roomId,
      UserId: userId,
      Token: '', // Will be generated by buildToken
    },
    VoiceChat: {
      AppId: env.VOLC_RTC_APP_ID,
      RoomId: roomId,
      TaskId: env.VOLC_TASK_ID,
      AgentConfig: agentConfig,
      Config: {
        ASRConfig: asrConfig,
        TTSConfig: ttsConfig,
        LLMConfig: llmConfig,
        AvatarConfig: {
          Enabled: env.VOLC_AVATAR_ENABLED,
          AvatarType: env.VOLC_AVATAR_TYPE,
          AvatarRole: env.VOLC_AVATAR_ROLE,
          BackgroundUrl: env.VOLC_AVATAR_BACKGROUND_URL,
          VideoBitrate: env.VOLC_AVATAR_VIDEO_BITRATE,
          AvatarAppID: '',
          AvatarToken: '',
        },
        InterruptMode: env.VOLC_INTERRUPT_MODE,
      },
    },
  }

  return scene
}

const buildToken = (rtc: SceneFile['RTCConfig'], appKey: string) => {
  const { AppId, RoomId, UserId } = rtc
  if (!AppId) {
    throw new Error('RTCConfig.AppId is required to build token')
  }
  if (!RoomId) {
    throw new Error('RTCConfig.RoomId is required to build token')
  }
  if (!UserId) {
    throw new Error('RTCConfig.UserId is required to build token')
  }
  if (!appKey) {
    throw new Error('AppKey is required to build token')
  }

  const token = new AccessToken(AppId, appKey, RoomId, UserId)
  const expireAt = Math.floor(Date.now() / 1000) + 24 * 3600
  token.addPrivilege('PrivPublishStream', expireAt)
  token.addPrivilege('PrivSubscribeStream', expireAt)
  token.expireTime(expireAt)
  rtc.Token = token.serialize()
}

const deriveSceneConfig = (scene: SceneFile): SceneSummary => {
  const { SceneConfig, RTCConfig, VoiceChat } = scene
  SceneConfig.id = SceneConfig.id || scene.SceneConfig.name || ''
  SceneConfig.botName = VoiceChat.AgentConfig?.UserId
  const config = VoiceChat.Config as Record<string, any> | undefined
  SceneConfig.isInterruptMode = config?.InterruptMode === 0
  SceneConfig.isVision = Boolean(config?.LLMConfig?.VisionConfig?.Enable)
  SceneConfig.isScreenMode = config?.LLMConfig?.VisionConfig?.SnapshotConfig?.StreamType === 1
  SceneConfig.isAvatarScene = Boolean(config?.AvatarConfig?.Enabled)
  SceneConfig.avatarBgUrl = config?.AvatarConfig?.BackgroundUrl
  delete RTCConfig.AppKey
  return {
    scene: SceneConfig,
    rtc: RTCConfig,
  }
}

export const loadScenes = (env: RuntimeEnv) => {
  const scenes = new Map<string, SceneFile>()

  // Create the emq-mcp-ai-companion scene directly from environment variables
  const scene = createSceneFromEnv(env)

  // Generate RTC token
  buildToken(scene.RTCConfig, env.VOLC_RTC_APP_KEY)

  scenes.set('emq-mcp-ai-companion', scene)

  return scenes
}

export const summarizeScenes = (scenes: Map<string, SceneFile>) => {
  return Array.from(scenes.values()).map((scene) => {
    const cloned = cloneScene(scene)
    return deriveSceneConfig(cloned)
  })
}

export const getScene = (scenes: Map<string, SceneFile>, sceneId: string) => {
  return scenes.get(sceneId)
}

export const prepareSceneForRequest = (scene: SceneFile) => {
  const appKey = scene.RTCConfig.AppKey
  if (!appKey) {
    throw new Error('RTCConfig.AppKey is required for scene')
  }

  // Regenerate token for fresh request
  buildToken(scene.RTCConfig, appKey)
  return scene
}
