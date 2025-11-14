/**
 * Shared runtime configuration that is safe to commit.
 * Fields follow the structure of the Volc StartVoiceChat payload
 * (ASRConfig / TTSConfig / LLMConfig, etc.) for easier copy-and-paste.
 */

export interface SceneSettings {
  taskId: string
  icon: string
  name: string
  defaultSceneId: string
}

export interface AgentSettings {
  userId: string
  welcomeMessage: string
  enableConversationStateCallback: boolean
  ansMode: number
  voiceprintMode: number
}

export interface InterruptSettings {
  mode: number
  speechDuration: number
  silenceTime: number
  volumeGain: number
  keywords: string[]
}

export interface AsrConfig {
  Provider: string
  ProviderParams: {
    Mode: 'smallmodel' | 'bigmodel'
    Cluster?: string
    AccessToken?: string
    ApiResourceId?: string
    StreamMode?: number
  }
  VADConfig?: {
    SilenceTime?: number
    PrefixTime?: number
    SuffixTime?: number
    AIVAD?: boolean
  }
  VolumeGain?: number
  TurnDetectionMode?: number
}

export interface TtsConfig {
  Provider: string
  Cluster?: string
  Mode: 'standard' | 'bigtts' | 'bidirection'
  VoiceType: string
  SpeedRatio?: number
  PitchRatio?: number
  VolumeRatio?: number
  SpeechRatio?: number
  PitchRate?: number
  SpeechRate?: number
  Emotion?: string
  EmotionIntensity?: number
  IgnoreBracketText?: number[]
  DisableMarkdownFilter?: boolean
  EnableLatexTn?: boolean
}

export interface LlmConfig {
  Mode: 'ArkV3' | 'CustomLLM'
  EndpointId?: string
  SystemMessage?: string
  VisionEnable?: boolean
  ModelName?: string
  Temperature?: number
  TopP?: number
  MaxTokens?: number
  HistoryLength?: number
  EnableRoundId?: boolean
  UserPrompts?: Array<Record<string, unknown>>
  StreamOptions?: Record<string, unknown>
  ExtraHeaders?: Record<string, unknown>
}

export interface AvatarSettings {
  enabled: boolean
  type: string
  role: string
  backgroundUrl: string
  videoBitrate: number
}

export interface ApiSettings {
  region: string
  version: string
}

export interface RuntimeConfig {
  scene: SceneSettings
  agent: AgentSettings
  interrupts: InterruptSettings
  asrConfig: AsrConfig
  ttsConfig: TtsConfig
  llmConfig: LlmConfig
  avatar?: AvatarSettings
  api: ApiSettings
}

export const runtimeConfig: RuntimeConfig = {
  scene: {
    taskId: 'emq-aigc-task-001',
    icon: 'https://lf3-rtc-demo.volccdn.com/obj/rtc-aigc-assets/DoubaoAvatar.png',
    name: 'EMQ 陪伴助手',
    defaultSceneId: 'emq-mcp-ai-companion',
  },
  agent: {
    userId: 'emq-ai-bot',
    welcomeMessage: '嗨～我是 EMQ，很高兴见到你！',
    enableConversationStateCallback: true,
    ansMode: 2,
    voiceprintMode: 1,
  },
  interrupts: {
    mode: 2,
    speechDuration: 400,
    silenceTime: 600,
    volumeGain: 0.5,
    keywords: [
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
    ],
  },
  asrConfig: {
    Provider: 'volcano',
    ProviderParams: {
      Mode: 'smallmodel',
      Cluster: 'volcengine_streaming_common',
    },
    VADConfig: {
      SilenceTime: 600,
    },
    VolumeGain: 0.5,
    TurnDetectionMode: 0,
  },
  ttsConfig: {
    Provider: 'volcano',
    Cluster: 'volcano_tts',
    Mode: 'standard',
    VoiceType: 'BV033_streaming',
    SpeedRatio: 1.2,
    PitchRatio: 1.1,
    VolumeRatio: 1,
    SpeechRatio: 0.8,
    PitchRate: 0,
    SpeechRate: 0.4,
    Emotion: 'happy',
    EmotionIntensity: 0.8,
    IgnoreBracketText: [],
    DisableMarkdownFilter: false,
    EnableLatexTn: false,
  },
  llmConfig: {
    Mode: 'CustomLLM',
    EndpointId: '',
    SystemMessage: '',
    VisionEnable: false,
    ModelName: 'qwen-flash',
    Temperature: 0.5,
    TopP: 0.9,
    MaxTokens: 256,
    HistoryLength: 15,
    EnableRoundId: true,
    UserPrompts: [
      { Role: 'assistant', Content: '嗨～我是 EMQ，很高兴见到你！' },
      { Role: 'user', Content: '你好' },
    ],
    StreamOptions: { include_usage: true },
    ExtraHeaders: undefined,
  },
  // avatar: {
  //   enabled: false,
  //   type: '3min',
  //   role: '250623-zhibo-linyunzhi',
  //   backgroundUrl: '',
  //   videoBitrate: 2000,
  // },
  api: {
    region: 'cn-north-1',
    version: '2024-12-01',
  },
}
