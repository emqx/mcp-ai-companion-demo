import { Signer } from '@volcengine/openapi'
import { getEnv } from './env'
import { loadScenes, summarizeScenes, getScene, prepareSceneForRequest } from './scenes/loader'
import type { SceneFile } from './types'

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const env = getEnv()
const scenes = loadScenes(env)
const defaultSceneId = env.VOLC_SCENE_DEFAULT

const toJsonResponse = (data: JsonValue, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      ...JSON_HEADERS,
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

const handleOptions = () => new Response(null, { status: 204, headers: JSON_HEADERS })

const resolveScene = (sceneId?: string): SceneFile => {
  const id = sceneId && sceneId.trim().length ? sceneId : defaultSceneId
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
  const summary = summarizeScenes(scenes)
  return toJsonResponse({
    ResponseMetadata: {
      Action: 'getScenes',
    },
    Result: {
      scenes: summary,
    },
  })
}

const startVoiceChatPayload = (scene: SceneFile) => {
  const prepared = prepareSceneForRequest(scene)
  return structuredClone(prepared.VoiceChat)
}

const stopVoiceChatPayload = (scene: SceneFile) => {
  const prepared = prepareSceneForRequest(scene)
  const payload = structuredClone(prepared.VoiceChat)
  return {
    AppId: payload.AppId,
    RoomId: payload.RoomId,
    TaskId: payload.TaskId,
  }
}

const callVolcApi = async ({
  action,
  version,
  scene,
  body,
}: {
  action: string
  version: string
  scene: SceneFile
  body: unknown
}) => {
  const { AccountConfig } = scene
  if (!AccountConfig.accessKeyId || !AccountConfig.secretKey) {
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
  signer.addAuthorization({
    accessKeyId: AccountConfig.accessKeyId,
    secretKey: AccountConfig.secretKey,
  })

  const response = await fetch(`https://rtc.volcengineapi.com?Action=${action}&Version=${version}`, {
    method: 'POST',
    headers: openApiRequestData.headers,
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return {
    status: response.status,
    data,
  }
}

const handleProxy = async (req: Request) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('Action')
  const version = url.searchParams.get('Version') ?? env.VOLC_API_VERSION

  if (!action) {
    return toErrorResponse('proxy', 'Action query parameter is required')
  }

  const scenePayload = await req.json().catch(() => null)
  if (!scenePayload || typeof scenePayload !== 'object') {
    return toErrorResponse(action, 'Invalid request body', 400)
  }

  const sceneId = (scenePayload as Record<string, string>).SceneID
  if (!sceneId) {
    return toErrorResponse(action, 'SceneID is required in request body')
  }

  let scene: SceneFile
  try {
    scene = resolveScene(sceneId)
  } catch (error) {
    return toErrorResponse(action, (error as Error).message, 404)
  }

  let requestBody: unknown
  try {
    switch (action) {
      case 'StartVoiceChat':
        requestBody = startVoiceChatPayload(scene)
        break
      case 'StopVoiceChat':
        requestBody = stopVoiceChatPayload(scene)
        break
      default:
        return toErrorResponse(action, `Unsupported Action: ${action}`, 400)
    }
  } catch (error) {
    return toErrorResponse(action, (error as Error).message, 500)
  }

  try {
    const result = await callVolcApi({
      action,
      version,
      scene,
      body: requestBody,
    })
    return toJsonResponse(result.data, { status: result.status })
  } catch (error) {
    return toErrorResponse(action, `Failed to call VolcEngine API: ${(error as Error).message}`, 502)
  }
}

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3001),
  fetch: async (req) => {
    if (req.method === 'OPTIONS') {
      return handleOptions()
    }

    const { pathname } = new URL(req.url)

    if (req.method === 'POST' && pathname === '/getScenes') {
      return handleGetScenes()
    }

    if (req.method === 'POST' && pathname === '/proxy') {
      return handleProxy(req)
    }

    return new Response('Not Found', {
      status: 404,
      headers: JSON_HEADERS,
    })
  },
})

console.log(`Volc server is running at http://localhost:${server.port}`)
