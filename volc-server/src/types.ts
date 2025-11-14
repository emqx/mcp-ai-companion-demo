export interface SceneConfig {
  id?: string
  icon: string
  name: string
  botName?: string
  isInterruptMode?: boolean
  isVision?: boolean
  isScreenMode?: boolean
  isAvatarScene?: boolean
  avatarBgUrl?: string
}

export interface AccountConfig {
  accessKeyId?: string
  secretKey?: string
}

export interface RTCConfig {
  AppId: string
  AppKey?: string
  RoomId?: string
  UserId?: string
  Token?: string
}

export interface VoicePrintConfig {
  Mode: number
  IdList?: string[]
}

export interface VoiceChatAgentConfig {
  TargetUserId: string[]
  WelcomeMessage?: string
  UserId: string
  EnableConversationStateCallback?: boolean
  AnsMode?: number
  VoicePrint?: VoicePrintConfig
  [key: string]: unknown
}

export interface VoiceChatConfig {
  AppId: string
  RoomId?: string
  TaskId: string
  AgentConfig: VoiceChatAgentConfig
  Config: Record<string, unknown>
}

export interface SceneFile {
  SceneConfig: SceneConfig
  AccountConfig: AccountConfig
  RTCConfig: RTCConfig
  VoiceChat: VoiceChatConfig
}

export interface SceneSummary {
  scene: SceneConfig
  rtc: RTCConfig
}

export interface ApiResponse<T> {
  ResponseMetadata: {
    Action: string
    Error?: {
      Code: number | string
      Message: string
    }
  }
  Result?: T
}

// ----- Runtime config typings -----

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
    context?: string
    boosting_table_id?: string
    boosting_table_name?: string
    correct_table_id?: string
    correct_table_name?: string
  }
  VADConfig?: {
    SilenceTime?: number
    SpeechTime?: number
    PrefixTime?: number
    SuffixTime?: number
    Sensitivity?: number
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
