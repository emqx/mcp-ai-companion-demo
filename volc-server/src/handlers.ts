import { Signer } from '@volcengine/openapi'
import { loadScenes, summarizeScenes, getScene, prepareSceneForRequest } from './scenes/loader'
import type { RuntimeEnv } from './env'
import type { SceneFile, SceneSummary } from './types'

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null

type ProxyPayload = Record<string, unknown> & { SceneID?: string }

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const toJsonResponse = (data: JsonValue, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      ...RESPONSE_HEADERS,
      ...(init.headers as Record<string, string> | undefined),
    },
  })

const toErrorResponse = (action: string, message: string, status = 400) =>
  toJsonResponse(
    {
      ResponseMetadata: {
        Action: action,
        Error: {
          Code: -1,
          Message: message,
        },
      },
    },
    { status },
  )

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const buildStartVoiceChatPayload = (scene: SceneFile) => {
  const prepared = prepareSceneForRequest(scene)
  const voiceChat = clone(prepared.VoiceChat)
  console.debug('[volc-server] VoiceChat config before start:', JSON.stringify(voiceChat, null, 2))
  return voiceChat
}

const buildStopVoiceChatPayload = (scene: SceneFile) => {
  const prepared = prepareSceneForRequest(scene)
  const { AppId, RoomId, TaskId } = prepared.VoiceChat
  if (!AppId || !RoomId || !TaskId) {
    throw new Error('VoiceChat.AppId, VoiceChat.RoomId, and VoiceChat.TaskId are required to stop voice chat')
  }
  return {
    AppId,
    RoomId,
    TaskId,
  }
}

const buildAccessInfoPayload = (scene: SceneFile, payload: ProxyPayload) => {
  const extras = { ...payload }
  delete extras.SceneID

  if (Object.keys(extras).length > 0) {
    return extras
  }

  const prepared = prepareSceneForRequest(scene)
  const config = prepared.VoiceChat.Config as Record<string, unknown> | undefined
  if (config && config.AccessInfo) {
    return clone(config.AccessInfo)
  }

  return {
    AppId: prepared.VoiceChat.AppId,
    RoomId: prepared.VoiceChat.RoomId,
    TaskId: prepared.VoiceChat.TaskId,
  }
}

const callVolcApi = async (scene: SceneFile, env: RuntimeEnv, action: string, version: string, body: unknown) => {
  const accessKeyId = scene.AccountConfig.accessKeyId || env.VOLC_ACCESS_KEY_ID
  const secretKey = scene.AccountConfig.secretKey || env.VOLC_SECRET_KEY
  if (!accessKeyId || !secretKey) {
    throw new Error('AccountConfig credentials are missing')
  }

  const openApiRequestData = {
    region: env.VOLC_API_REGION,
    method: 'POST',
    params: {
      Action: action,
      Version: version,
    },
    headers: {
      Host: 'rtc.volcengineapi.com',
      'Content-type': 'application/json',
    },
    body,
  }

  const signer = new Signer(openApiRequestData, 'rtc')
  signer.addAuthorization({ accessKeyId, secretKey })

  const response = await fetch(`https://rtc.volcengineapi.com?Action=${action}&Version=${version}`, {
    method: 'POST',
    headers: openApiRequestData.headers,
    body: JSON.stringify(body),
  })

  const data = (await response.json()) as JsonValue
  return {
    status: response.status,
    data,
  }
}

const makeSceneSummaries = (scenes: Map<string, SceneFile>): SceneSummary[] => summarizeScenes(scenes)

export const createRequestHandler = (env: RuntimeEnv) => {
  const scenes = loadScenes(env)
  const resolveScene = (sceneId?: string): SceneFile => {
    const id = sceneId && sceneId.trim().length ? sceneId : env.VOLC_SCENE_DEFAULT
    const scene = getScene(scenes, id)
    if (!scene) {
      throw new Error(`Scene ${id} not found`)
    }
    return scene
  }

  const handleGetScenes = () => {
    for (const scene of scenes.values()) {
      prepareSceneForRequest(scene)
    }
    const summaries = makeSceneSummaries(scenes)
    return toJsonResponse({
      ResponseMetadata: {
        Action: 'getScenes',
      },
      Result: {
        scenes: summaries,
      },
    })
  }

  const handleProxy = async (req: Request) => {
    const url = new URL(req.url)
    const action = url.searchParams.get('Action')
    const version = url.searchParams.get('Version') ?? env.VOLC_API_VERSION

    if (!action) {
      return toErrorResponse('proxy', 'Action query parameter is required')
    }

    const rawBody = (await req.json().catch(() => null)) as ProxyPayload | null
    if (!rawBody || typeof rawBody !== 'object') {
      return toErrorResponse(action, 'Invalid request body', 400)
    }

    let scene: SceneFile
    try {
      scene = resolveScene(rawBody.SceneID)
    } catch (error) {
      return toErrorResponse(action, (error as Error).message, 404)
    }

    let requestBody: unknown
    try {
      switch (action) {
        case 'StartVoiceChat':
          requestBody = buildStartVoiceChatPayload(scene)
          break
        case 'StopVoiceChat':
          requestBody = buildStopVoiceChatPayload(scene)
          break
        case 'GetAccessInfo':
          requestBody = buildAccessInfoPayload(scene, rawBody)
          break
        default:
          return toErrorResponse(action, `Unsupported Action: ${action}`, 400)
      }
    } catch (error) {
      return toErrorResponse(action, (error as Error).message, 500)
    }

    try {
      const result = await callVolcApi(scene, env, action, version, requestBody)
      return toJsonResponse(result.data, { status: result.status })
    } catch (error) {
      return toErrorResponse(action, `Failed to call VolcEngine API: ${(error as Error).message}`, 502)
    }
  }

  const handleRequest = async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: RESPONSE_HEADERS })
    }

    const { pathname } = new URL(req.url)

    if (req.method === 'POST' && pathname === '/getScenes') {
      return handleGetScenes()
    }

    if (req.method === 'POST' && pathname === '/proxy') {
      return handleProxy(req)
    }

    return new Response('Not Found', { status: 404, headers: RESPONSE_HEADERS })
  }

  return handleRequest
}
