import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { AccessToken } from '../lib/token'
import type { RuntimeEnv } from '../env'
import type { SceneFile, SceneSummary, VoiceChatConfig } from '../types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scenesDir = join(__dirname)

const cloneScene = (scene: SceneFile): SceneFile => JSON.parse(JSON.stringify(scene))

const ensureTargetUser = (voiceChat: VoiceChatConfig) => {
  const targets = voiceChat.AgentConfig?.TargetUserId || []
  if (!targets.length || !targets[0]) {
    voiceChat.AgentConfig.TargetUserId = [randomUUID()]
  }
}

const ensureRoom = (rtc: SceneFile['RTCConfig'], voiceChat: VoiceChatConfig) => {
  if (!rtc.RoomId) {
    const roomId = randomUUID()
    rtc.RoomId = roomId
    voiceChat.RoomId = roomId
  } else if (!voiceChat.RoomId) {
    voiceChat.RoomId = rtc.RoomId
  }
}

const ensureAppId = (rtc: SceneFile['RTCConfig'], voiceChat: VoiceChatConfig, appId: string) => {
  if (!rtc.AppId) {
    rtc.AppId = appId
  }
  if (!voiceChat.AppId) {
    voiceChat.AppId = rtc.AppId
  }
}

const ensureUser = (rtc: SceneFile['RTCConfig'], voiceChat: VoiceChatConfig) => {
  if (!rtc.UserId) {
    const uuid = randomUUID()
    rtc.UserId = uuid
    ensureTargetUser(voiceChat)
    voiceChat.AgentConfig.TargetUserId[0] = uuid
  } else {
    ensureTargetUser(voiceChat)
    if (!voiceChat.AgentConfig.TargetUserId[0]) {
      voiceChat.AgentConfig.TargetUserId[0] = rtc.UserId
    }
  }
}

const buildToken = (rtc: SceneFile['RTCConfig'], appKey: string) => {
  const { AppId, RoomId, UserId } = rtc
  if (!AppId) {
    throw new Error('RTCConfig.AppId is required to build token')
  }
  if (!RoomId) {
    throw new Error('RTCConfig.RoomId is required to build token')
  }
  if (!UserId) {
    throw new Error('RTCConfig.UserId is required to build token')
  }
  if (!appKey) {
    throw new Error('AppKey is required to build token')
  }

  const token = new AccessToken(AppId, appKey, RoomId, UserId)
  const expireAt = Math.floor(Date.now() / 1000) + 24 * 3600
  token.addPrivilege('PrivPublishStream', expireAt)
  token.addPrivilege('PrivSubscribeStream', expireAt)
  token.expireTime(expireAt)
  rtc.Token = token.serialize()
}

const deriveSceneConfig = (scene: SceneFile): SceneSummary => {
  const { SceneConfig, RTCConfig, VoiceChat } = scene
  SceneConfig.id = SceneConfig.id || scene.SceneConfig.name || ''
  SceneConfig.botName = VoiceChat.AgentConfig?.UserId
  const config = VoiceChat.Config as Record<string, any> | undefined
  SceneConfig.isInterruptMode = config?.InterruptMode === 0
  SceneConfig.isVision = Boolean(config?.LLMConfig?.VisionConfig?.Enable)
  SceneConfig.isScreenMode = config?.LLMConfig?.VisionConfig?.SnapshotConfig?.StreamType === 1
  SceneConfig.isAvatarScene = Boolean(config?.AvatarConfig?.Enabled)
  SceneConfig.avatarBgUrl = config?.AvatarConfig?.BackgroundUrl
  delete RTCConfig.AppKey
  return {
    scene: SceneConfig,
    rtc: RTCConfig,
  }
}

export const loadScenes = (env: RuntimeEnv) => {
  const entries = readdirSync(scenesDir).filter((file) => file.endsWith('.json'))
  if (!entries.length) {
    throw new Error(`No scene configuration found in ${scenesDir}`)
  }

  const scenes = new Map<string, SceneFile>()

  for (const file of entries) {
    const name = file.replace(/\.json$/i, '')
    const raw = readFileSync(join(scenesDir, file), 'utf-8')
    const parsed = JSON.parse(raw) as SceneFile
    const scene = cloneScene(parsed)

    scene.SceneConfig.id = name
    scene.AccountConfig.accessKeyId = env.VOLC_ACCESS_KEY_ID
    scene.AccountConfig.secretKey = env.VOLC_SECRET_KEY

    const appId = scene.RTCConfig.AppId || env.VOLC_RTC_APP_ID
    const appKey = scene.RTCConfig.AppKey || env.VOLC_RTC_APP_KEY
    ensureAppId(scene.RTCConfig, scene.VoiceChat, appId)
    scene.RTCConfig.AppKey = appKey
    ensureRoom(scene.RTCConfig, scene.VoiceChat)
    ensureUser(scene.RTCConfig, scene.VoiceChat)
    buildToken(scene.RTCConfig, appKey)

    scenes.set(name, scene)
  }

  return scenes
}

export const summarizeScenes = (scenes: Map<string, SceneFile>) => {
  return Array.from(scenes.values()).map((scene) => {
    const cloned = cloneScene(scene)
    return deriveSceneConfig(cloned)
  })
}

export const getScene = (scenes: Map<string, SceneFile>, sceneId: string) => {
  return scenes.get(sceneId)
}

export const prepareSceneForRequest = (scene: SceneFile) => {
  const appKey = scene.RTCConfig.AppKey
  if (!appKey) {
    throw new Error('RTCConfig.AppKey is required for scene')
  }
  ensureTargetUser(scene.VoiceChat)
  ensureRoom(scene.RTCConfig, scene.VoiceChat)
  ensureUser(scene.RTCConfig, scene.VoiceChat)
  buildToken(scene.RTCConfig, appKey)
  return scene
}
