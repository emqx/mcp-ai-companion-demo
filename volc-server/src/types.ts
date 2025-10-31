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
