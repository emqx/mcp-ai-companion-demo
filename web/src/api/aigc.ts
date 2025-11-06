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

export const startVoiceChat = async (
  sceneId: string,
  llmCustom?: Record<string, unknown>,
): Promise<ApiResult<StartVoiceChatResult>> => {
  const body: Record<string, unknown> = {
    SceneID: sceneId,
  }

  if (llmCustom && Object.keys(llmCustom).length > 0) {
    body.LLMCustom = llmCustom
  }

  return request<StartVoiceChatResult>('/proxy', {
    query: {
      Action: 'StartVoiceChat',
    },
    body,
  })
}

export const stopVoiceChat = async (
  sceneId: string,
): Promise<ApiResult<StopVoiceChatResult>> => {
  return request<StopVoiceChatResult>('/proxy', {
    query: {
      Action: 'StopVoiceChat',
    },
    body: {
      SceneID: sceneId,
    },
  })
}
