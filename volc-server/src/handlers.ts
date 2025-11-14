import { Signer } from '@volcengine/openapi'
import { loadScenes, summarizeScenes, getScene, prepareSceneForRequest } from './scenes/loader'
import type { RuntimeEnv } from './env'
import type { SceneFile, SceneSummary } from './types'
import { serverLogger } from './logger'
import { runtimeConfig } from './config'

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null

type ProxyPayload = Record<string, unknown> & { SceneID?: string; LLMCustom?: unknown }

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

const stringifyCustomPayload = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    serverLogger.warn('Failed to serialize LLM custom payload', { error: cause })
    return undefined
  }
}

/**
 * Merge the cached scene definition with the incoming proxy payload
 * (notably `LLMCustom`) before calling StartVoiceChat.
 */
const buildStartVoiceChatPayload = (scene: SceneFile, payload?: ProxyPayload) => {
  const prepared = prepareSceneForRequest(scene)
  const voiceChat = clone(prepared.VoiceChat)

  const llmCustomRaw = payload?.LLMCustom
  const customPayload = stringifyCustomPayload(llmCustomRaw)
  if (customPayload) {
    const config = (voiceChat.Config ??= {}) as Record<string, unknown>
    const currentLlmConfig = (config['LLMConfig'] as Record<string, unknown> | undefined) ?? {}
    currentLlmConfig['Custom'] = customPayload
    config['LLMConfig'] = currentLlmConfig

    const customDeviceId = (() => {
      if (llmCustomRaw && typeof llmCustomRaw === 'object') {
        const deviceField = (llmCustomRaw as Record<string, unknown>).device_id
        return typeof deviceField === 'string' ? deviceField : undefined
      }
      if (typeof llmCustomRaw === 'string') {
        try {
          const parsed = JSON.parse(llmCustomRaw)
          if (parsed && typeof parsed === 'object' && typeof parsed.device_id === 'string') {
            return parsed.device_id as string
          }
        } catch (error) {
          // Ignore malformed JSON
        }
      }
      return undefined
    })()

    if (customDeviceId) {
      serverLogger.info('Voice chat using custom device_id', { deviceId: customDeviceId })
    }
  }

  serverLogger.info('Starting voice chat', { AppId: voiceChat.AppId, RoomId: voiceChat.RoomId, TaskId: voiceChat.TaskId })
  return voiceChat
}

/**
 * Produce the minimal StopVoiceChat payload for the given scene.
 */
const buildStopVoiceChatPayload = (scene: SceneFile) => {
  const prepared = prepareSceneForRequest(scene)
  const { AppId, RoomId, TaskId } = prepared.VoiceChat
  if (!AppId || !RoomId || !TaskId) {
    throw new Error('VoiceChat.AppId, VoiceChat.RoomId, and VoiceChat.TaskId are required to stop voice chat')
  }
  serverLogger.info('Stopping voice chat', { AppId, RoomId, TaskId })
  return {
    AppId,
    RoomId,
    TaskId,
  }
}

/**
 * Either honour the caller’s access-info overrides or fall back to
 * the scene’s VoiceChat defaults.
 */
const buildAccessInfoPayload = (scene: SceneFile, payload: ProxyPayload) => {
  const extras = { ...payload }
  delete extras.SceneID

  if (Object.keys(extras).length > 0) {
    serverLogger.debug('Access info requested with payload overrides', extras)
    return extras
  }

  const prepared = prepareSceneForRequest(scene)
  const config = prepared.VoiceChat.Config as Record<string, unknown> | undefined
  if (config && config.AccessInfo) {
    serverLogger.debug('Access info resolved from config', config.AccessInfo)
    return clone(config.AccessInfo)
  }

  const defaultAccessInfo = {
    AppId: prepared.VoiceChat.AppId,
    RoomId: prepared.VoiceChat.RoomId,
    TaskId: prepared.VoiceChat.TaskId,
  }
  serverLogger.debug('Access info fallback to defaults', defaultAccessInfo)
  return defaultAccessInfo
}

/**
 * Sign and forward a protected VolcEngine RTC API call using either
 * scene-specific credentials or the global env credentials.
 */
const callVolcApi = async (scene: SceneFile, env: RuntimeEnv, action: string, version: string, body: unknown) => {
  serverLogger.info(`Calling VolcEngine API: ${action}`, { version })

  const accessKeyId = scene.AccountConfig.accessKeyId || env.VOLC_ACCESS_KEY_ID
  const secretKey = scene.AccountConfig.secretKey || env.VOLC_SECRET_KEY
  if (!accessKeyId || !secretKey) {
    throw new Error('AccountConfig credentials are missing')
  }

  const openApiRequestData = {
    region: runtimeConfig.api.region,
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
  serverLogger.debug(`VolcEngine API response: ${action}`, { status: response.status })
  return {
    status: response.status,
    data,
  }
}

const makeSceneSummaries = (scenes: Map<string, SceneFile>): SceneSummary[] => summarizeScenes(scenes)

/**
 * Create the HTTP handler that powers /getScenes and /proxy.
 */
export const createRequestHandler = (env: RuntimeEnv) => {
  const scenes = loadScenes(env)
  serverLogger.info('Request handler initialized', {
    sceneCount: scenes.size,
    defaultScene: runtimeConfig.scene.defaultSceneId,
  })

  const resolveScene = (sceneId?: string): SceneFile => {
    const id = sceneId && sceneId.trim().length ? sceneId : runtimeConfig.scene.defaultSceneId
    serverLogger.debug('Resolving scene', { requestedSceneId: sceneId, resolvedId: id })
    const scene = getScene(scenes, id)
    if (!scene) {
      throw new Error(`Scene ${id} not found`)
    }
    return scene
  }

  const handleGetScenes = () => {
    serverLogger.info('Handling getScenes request')
    for (const scene of scenes.values()) {
      prepareSceneForRequest(scene)
    }
    const summaries = makeSceneSummaries(scenes)
    serverLogger.debug('Scenes ready to return', { sceneCount: summaries.length })
    return toJsonResponse({
      ResponseMetadata: {
        Action: 'getScenes',
      },
      Result: {
        scenes: summaries,
      },
    })
  }

  /**
   * Route /proxy requests to the corresponding VolcEngine action.
   */
  const handleProxy = async (req: Request) => {
    const url = new URL(req.url)
    const action = url.searchParams.get('Action')
    const version = url.searchParams.get('Version') ?? runtimeConfig.api.version

    serverLogger.info('Handling proxy request', { action, version })

    if (!action) {
      serverLogger.warn('Proxy request missing Action parameter')
      return toErrorResponse('proxy', 'Action query parameter is required')
    }

    const rawBody = (await req.json().catch(() => null)) as ProxyPayload | null
    if (!rawBody || typeof rawBody !== 'object') {
      serverLogger.warn('Proxy request has invalid body', { action })
      return toErrorResponse(action, 'Invalid request body', 400)
    }

    serverLogger.debug('Proxy request body received', { action, sceneId: rawBody.SceneID })

    let scene: SceneFile
    try {
      scene = resolveScene(rawBody.SceneID)
    } catch (error) {
      serverLogger.error('Failed to resolve scene', { action, sceneId: rawBody.SceneID, error })
      return toErrorResponse(action, (error as Error).message, 404)
    }

    let requestBody: unknown
    try {
      switch (action) {
        case 'StartVoiceChat':
          requestBody = buildStartVoiceChatPayload(scene, rawBody)
          break
        case 'StopVoiceChat':
          requestBody = buildStopVoiceChatPayload(scene)
          break
        case 'GetAccessInfo':
          requestBody = buildAccessInfoPayload(scene, rawBody)
          break
        default:
          serverLogger.warn('Unsupported action requested', { action })
          return toErrorResponse(action, `Unsupported Action: ${action}`, 400)
      }
    } catch (error) {
      serverLogger.error('Failed to build request payload', { action, error })
      return toErrorResponse(action, (error as Error).message, 500)
    }

    try {
      const result = await callVolcApi(scene, env, action, version, requestBody)
      serverLogger.info(`VolcEngine call completed: ${action}`, { status: result.status })
      return toJsonResponse(result.data, { status: result.status })
    } catch (error) {
      serverLogger.error('VolcEngine API call failed', { action, error })
      return toErrorResponse(action, `Failed to call VolcEngine API: ${(error as Error).message}`, 502)
    }
  }

  const handleRequest = async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url)
    const method = req.method

    serverLogger.info('Incoming request', { method, pathname })

    if (method === 'OPTIONS') {
      serverLogger.debug('Handling OPTIONS request', { pathname })
      return new Response(null, { status: 204, headers: RESPONSE_HEADERS })
    }

    if (method === 'POST' && pathname === '/getScenes') {
      return handleGetScenes()
    }

    if (method === 'POST' && pathname === '/proxy') {
      return handleProxy(req)
    }

    serverLogger.warn('Request not handled', { method, pathname })
    return new Response('Not Found', { status: 404, headers: RESPONSE_HEADERS })
  }

  return handleRequest
}
