export interface ApiErrorMetadata {
  Code: number | string
  Message: string
}

export interface ApiResponseMetadata {
  Action: string
  RequestId?: string
  Service?: string
  Version?: string
  Region?: string
  Error?: ApiErrorMetadata
}

export interface ApiResponse<T> {
  ResponseMetadata: ApiResponseMetadata
  Result?: T
}

export interface ApiResult<T> {
  metadata: ApiResponseMetadata
  result: T
  raw: ApiResponse<T>
}

export interface SceneConfig {
  id: string
  icon: string
  name: string
  botName?: string
  isInterruptMode?: boolean
  isVision?: boolean
  isScreenMode?: boolean
  isAvatarScene?: boolean
  avatarBgUrl?: string
}

export interface RTCConfig {
  AppId: string
  RoomId: string
  UserId: string
  Token: string
}

export interface SceneSummary {
  scene: SceneConfig
  rtc: RTCConfig
}

export interface GetScenesResult {
  scenes: SceneSummary[]
}

export type StartVoiceChatResult = string | Record<string, unknown>
export type StopVoiceChatResult = string | Record<string, unknown>
