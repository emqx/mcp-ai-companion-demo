import { randomUUID } from 'node:crypto'
import { AccessToken } from '../lib/token'
import { runtimeConfig } from '../config'
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

/**
 * Create the in-memory scene representation by combining secrets from .env
 * with the shareable defaults defined in runtimeConfig.
 */
const createSceneFromEnv = (env: RuntimeEnv): SceneFile => {
  const roomId = randomUUID()
  const userId = randomUUID()

  const agentConfig: VoiceChatConfig['AgentConfig'] = {
    TargetUserId: [userId],
    WelcomeMessage: runtimeConfig.agent.welcomeMessage,
    UserId: runtimeConfig.agent.userId,
    EnableConversationStateCallback: runtimeConfig.agent.enableConversationStateCallback,
    AnsMode: runtimeConfig.agent.ansMode,
  }

  if (runtimeConfig.agent.voiceprintMode > 0) {
    agentConfig.VoicePrint = {
      Mode: runtimeConfig.agent.voiceprintMode,
    }
  }

  const interruptConfig: Record<string, unknown> = {}
  if (runtimeConfig.interrupts.speechDuration > 0) {
    interruptConfig.InterruptSpeechDuration = runtimeConfig.interrupts.speechDuration
  }
  if (runtimeConfig.interrupts.keywords.length > 0) {
    interruptConfig.InterruptKeywords = runtimeConfig.interrupts.keywords
  }

  const asrProviderParams: Record<string, unknown> = {
    ...runtimeConfig.asrConfig.ProviderParams,
    AppId: env.VOLC_ASR_APP_ID || '',
  }

  const asrConfig: Record<string, unknown> = {
    Provider: runtimeConfig.asrConfig.Provider,
    ProviderParams: asrProviderParams,
  }

  const vadConfig: Record<string, unknown> = { ...(runtimeConfig.asrConfig.VADConfig ?? {}) }
  if (vadConfig.SilenceTime === undefined) {
    vadConfig.SilenceTime = runtimeConfig.interrupts.silenceTime
  }
  if (Object.keys(vadConfig).length > 0) {
    asrConfig.VADConfig = vadConfig
  }

  if (runtimeConfig.asrConfig.VolumeGain !== undefined) {
    asrConfig.VolumeGain = runtimeConfig.asrConfig.VolumeGain
  } else {
    asrConfig.VolumeGain = runtimeConfig.interrupts.volumeGain
  }

  if (runtimeConfig.asrConfig.TurnDetectionMode !== undefined) {
    asrConfig.TurnDetectionMode = runtimeConfig.asrConfig.TurnDetectionMode
  }

  if (Object.keys(interruptConfig).length > 0) {
    asrConfig.InterruptConfig = interruptConfig
  }

  const ttsAudioConfig: Record<string, unknown> = {
    voice_type: runtimeConfig.ttsConfig.VoiceType,
  }

  switch (runtimeConfig.ttsConfig.Mode) {
    case 'bigtts':
      ttsAudioConfig.speech_ratio = runtimeConfig.ttsConfig.SpeechRatio
      ttsAudioConfig.pitch_rate = runtimeConfig.ttsConfig.PitchRate
      ttsAudioConfig.volume_ratio = runtimeConfig.ttsConfig.VolumeRatio
      break
    case 'bidirection':
      ttsAudioConfig.speech_rate = runtimeConfig.ttsConfig.SpeechRate
      ttsAudioConfig.volume_ratio = runtimeConfig.ttsConfig.VolumeRatio
      ttsAudioConfig.pitch_ratio = runtimeConfig.ttsConfig.PitchRatio
      break
    default:
      ttsAudioConfig.speed_ratio = runtimeConfig.ttsConfig.SpeedRatio
      ttsAudioConfig.pitch_ratio = runtimeConfig.ttsConfig.PitchRatio
      ttsAudioConfig.volume_ratio = runtimeConfig.ttsConfig.VolumeRatio
      break
  }

  if (runtimeConfig.ttsConfig.Emotion) {
    ttsAudioConfig.emotion = runtimeConfig.ttsConfig.Emotion
    if (runtimeConfig.ttsConfig.EmotionIntensity) {
      ttsAudioConfig.emotion_strength = runtimeConfig.ttsConfig.EmotionIntensity
    }
  }

  const ttsProviderParams: Record<string, unknown> = {
    app: {
      appid: env.VOLC_TTS_APP_ID || '',
    },
    audio: ttsAudioConfig,
  }

  if (runtimeConfig.ttsConfig.Provider === 'volcano' && runtimeConfig.ttsConfig.Cluster) {
    ttsProviderParams.app = {
      ...(ttsProviderParams.app as Record<string, unknown>),
      cluster: runtimeConfig.ttsConfig.Cluster,
    }
  }

  if (env.VOLC_TTS_APP_TOKEN) {
    ;(ttsProviderParams.app as Record<string, unknown>).token = env.VOLC_TTS_APP_TOKEN
  }

  if (env.VOLC_TTS_RESOURCE_ID) {
    ttsProviderParams.ResourceId = env.VOLC_TTS_RESOURCE_ID
  }

  if (runtimeConfig.ttsConfig.Mode === 'bidirection') {
    const additions: Record<string, unknown> = {}
    if (runtimeConfig.ttsConfig.DisableMarkdownFilter) {
      additions.disable_markdown_filter = true
    }
    if (runtimeConfig.ttsConfig.EnableLatexTn) {
      additions.enable_latex_tn = true
    }
    if (Object.keys(additions).length > 0) {
      ttsProviderParams.Additions = additions
    }
  }

  const ttsConfig: Record<string, unknown> = {
    Provider: runtimeConfig.ttsConfig.Provider,
    ProviderParams: ttsProviderParams,
  }

  if (runtimeConfig.ttsConfig.IgnoreBracketText && runtimeConfig.ttsConfig.IgnoreBracketText.length > 0) {
    ttsConfig.IgnoreBracketText = runtimeConfig.ttsConfig.IgnoreBracketText
  }

  const llmConfig: Record<string, unknown> = {
    Mode: runtimeConfig.llmConfig.Mode,
    VisionConfig: {
      Enable: Boolean(runtimeConfig.llmConfig.VisionEnable),
    },
  }

  const systemMessage = asOptionalString(runtimeConfig.llmConfig.SystemMessage)
  if (systemMessage) {
    llmConfig.SystemMessages = [systemMessage]
  }

  if (runtimeConfig.llmConfig.EndpointId) {
    llmConfig.EndPointId = runtimeConfig.llmConfig.EndpointId
  }

  if (runtimeConfig.llmConfig.ModelName) {
    llmConfig.ModelName = runtimeConfig.llmConfig.ModelName
  }

  if (runtimeConfig.llmConfig.HistoryLength !== undefined) {
    llmConfig.HistoryLength = runtimeConfig.llmConfig.HistoryLength
  }

  if (runtimeConfig.llmConfig.EnableRoundId) {
    llmConfig.EnableRoundId = true
  }

  const setNumericConfig = (key: string, value: number | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      llmConfig[key] = value
    }
  }

  setNumericConfig('Temperature', runtimeConfig.llmConfig.Temperature)
  setNumericConfig('TopP', runtimeConfig.llmConfig.TopP)
  setNumericConfig('MaxTokens', runtimeConfig.llmConfig.MaxTokens)

  if (runtimeConfig.llmConfig.ExtraHeaders) {
    llmConfig.ExtraHeader = runtimeConfig.llmConfig.ExtraHeaders
  }

  if (runtimeConfig.llmConfig.UserPrompts && runtimeConfig.llmConfig.UserPrompts.length > 0) {
    llmConfig.UserPrompts = runtimeConfig.llmConfig.UserPrompts
  }

  if (runtimeConfig.llmConfig.StreamOptions) {
    llmConfig.StreamOptions = runtimeConfig.llmConfig.StreamOptions
  }

  if (runtimeConfig.llmConfig.Mode === 'CustomLLM') {
    if (!env.VOLC_LLM_URL) {
      throw new Error('VOLC_LLM_URL is required when llmConfig.Mode=CustomLLM')
    }
    llmConfig.Url = env.VOLC_LLM_URL

    if (env.VOLC_LLM_API_KEY) {
      llmConfig.APIKey = env.VOLC_LLM_API_KEY
    }
  }

  const sceneFile: SceneFile = {
    SceneConfig: {
      icon: runtimeConfig.scene.icon,
      name: runtimeConfig.scene.name,
      id: runtimeConfig.scene.defaultSceneId,
      botName: runtimeConfig.agent.userId,
      isInterruptMode: runtimeConfig.interrupts.mode === 0,
      isVision: Boolean(runtimeConfig.llmConfig.VisionEnable),
      isScreenMode: false,
      isAvatarScene: false,
      avatarBgUrl: '',
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
      Token: '',
    },
    VoiceChat: {
      AppId: env.VOLC_RTC_APP_ID,
      RoomId: roomId,
      TaskId: runtimeConfig.scene.taskId,
      AgentConfig: agentConfig,
      Config: {
        ASRConfig: asrConfig,
        TTSConfig: ttsConfig,
        LLMConfig: llmConfig,
        InterruptMode: runtimeConfig.interrupts.mode,
      },
    },
  }

  return sceneFile
}

/**
 * Generate a 24h RTC token for the provided RTCConfig in-place.
 */
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

/**
 * Strip sensitive fields and produce the scene summary returned to the web client.
 */
const deriveSceneConfig = (scene: SceneFile): SceneSummary => {
  const { SceneConfig, RTCConfig, VoiceChat } = scene
  SceneConfig.id = SceneConfig.id || scene.SceneConfig.name || ''
  SceneConfig.botName = VoiceChat.AgentConfig?.UserId
  const config = VoiceChat.Config as Record<string, any> | undefined
  SceneConfig.isInterruptMode = config?.InterruptMode === 0
  SceneConfig.isVision = Boolean(config?.LLMConfig?.VisionConfig?.Enable)
  SceneConfig.isScreenMode = config?.LLMConfig?.VisionConfig?.SnapshotConfig?.StreamType === 1
  SceneConfig.isAvatarScene = false
  SceneConfig.avatarBgUrl = ''
  delete RTCConfig.AppKey
  return {
    scene: SceneConfig,
    rtc: RTCConfig,
  }
}

/**
 * Build the scene map from environment variables (currently single-scene).
 */
export const loadScenes = (env: RuntimeEnv) => {
  const scenes = new Map<string, SceneFile>()

  // Create the emq-mcp-ai-companion scene directly from environment variables
  const scene = createSceneFromEnv(env)

  // Generate RTC token
  buildToken(scene.RTCConfig, env.VOLC_RTC_APP_KEY)

  scenes.set(runtimeConfig.scene.defaultSceneId, scene)

  return scenes
}

/**
 * Create the `/getScenes` response payload from the cached scenes.
 */
export const summarizeScenes = (scenes: Map<string, SceneFile>) => {
  return Array.from(scenes.values()).map((scene) => {
    const cloned = cloneScene(scene)
    return deriveSceneConfig(cloned)
  })
}

export const getScene = (scenes: Map<string, SceneFile>, sceneId: string) => {
  return scenes.get(sceneId)
}

/**
 * Refresh the RTC token just before calling VolcEngine.
 */
export const prepareSceneForRequest = (scene: SceneFile) => {
  const appKey = scene.RTCConfig.AppKey
  if (!appKey) {
    throw new Error('RTCConfig.AppKey is required for scene')
  }

  // Regenerate token for fresh request
  buildToken(scene.RTCConfig, appKey)
  return scene
}
