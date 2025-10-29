import { request } from '@/api/client'
import type {
  ApiResult,
  GetScenesResult,
  StartVoiceChatResult,
  StopVoiceChatResult,
} from '@/types/aigc'

export const fetchScenes = async (): Promise<ApiResult<GetScenesResult>> => {
  return request<GetScenesResult>('/getScenes')
}

export const startVoiceChat = async (sceneId: string): Promise<ApiResult<StartVoiceChatResult>> => {
  return request<StartVoiceChatResult>('/proxy', {
    query: {
      Action: 'StartVoiceChat',
    },
    body: {
      SceneID: sceneId,
    },
  })
}

export const stopVoiceChat = async (sceneId: string): Promise<ApiResult<StopVoiceChatResult>> => {
  return request<StopVoiceChatResult>('/proxy', {
    query: {
      Action: 'StopVoiceChat',
    },
    body: {
      SceneID: sceneId,
    },
  })
}
