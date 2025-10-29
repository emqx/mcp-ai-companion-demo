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

export interface VoiceChatConfig {
  AppId: string
  RoomId?: string
  TaskId: string
  AgentConfig: {
    TargetUserId: string[]
    WelcomeMessage?: string
    UserId: string
    EnableConversationStateCallback?: boolean
    [key: string]: unknown
  }
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
