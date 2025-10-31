import VERTC, {
  type IRTCEngine,
  type LocalAudioPropertiesInfo,
  type LocalStreamStats,
  type MediaType,
  type RemoteAudioPropertiesInfo,
  type RemoteStreamStats,
  type StreamRemoveReason,
  type onUserJoinedEvent,
  type onUserLeaveEvent,
  RoomProfileType,
  StreamIndex,
} from '@volcengine/rtc'
import RTCAIAnsExtension, { AnsMode, EventTypes } from '@volcengine/rtc/extension-ainr'

export interface BasicInfo {
  appId: string
  roomId: string
  userId: string
  token: string
}

export interface RtcEventListeners {
  onError?: (event: { errorCode: string; [key: string]: unknown }) => void
  onUserJoin?: (event: onUserJoinedEvent) => void
  onUserLeave?: (event: onUserLeaveEvent) => void
  onUserPublishStream?: (event: UserPublishStreamEvent) => void
  onUserUnpublishStream?: (event: UserUnpublishStreamEvent) => void
  onUserPublishScreen?: (event: UserPublishStreamEvent) => void
  onUserUnpublishScreen?: (event: UserUnpublishStreamEvent) => void
  onRemoteStreamStats?: (event: RemoteStreamStats) => void
  onLocalStreamStats?: (event: LocalStreamStats) => void
  onLocalAudioPropertiesReport?: (event: LocalAudioPropertiesInfo[]) => void
  onRemoteAudioPropertiesReport?: (event: RemoteAudioPropertiesInfo[]) => void
  onRoomBinaryMessage?: (event: { userId: string; message: ArrayBuffer }) => void
  onStreamRemoved?: (event: { userId: string; mediaType: MediaType; reason: StreamRemoveReason }) => void
}

export type EnableDevicesResult = {
  audio: boolean
  video: boolean
}

export interface UserPublishStreamEvent {
  userId: string
  mediaType: MediaType
}

export interface UserUnpublishStreamEvent extends UserPublishStreamEvent {
  reason: StreamRemoveReason
}

class RtcClient {
  private engine: IRTCEngine | null = null

  private basicInfo: BasicInfo | null = null

  private listeners: RtcEventListeners = {}

  private registered = false

  private aiAnsExtension: RTCAIAnsExtension | null = null

  private aiAnsSupported: boolean | null = null

  private aiAnsEnabled = false

  private aiAnsMode: AnsMode = AnsMode.MEDIUM

  private aiAnsEventsBound = false

  private aiAnsManuallyDisabled = false

  private readonly aiAnsConstraint: Record<string, string | number> = {}

  setListeners(listeners: RtcEventListeners) {
    this.listeners = { ...listeners }
    if (this.engine && !this.registered) {
      this.registerEventHandlers(this.engine)
    }
  }

  private registerEventHandlers(engine: IRTCEngine) {
    if (this.registered) return

    engine.on(VERTC.events.onError, this.handleError)
    engine.on(VERTC.events.onUserJoined, this.handleUserJoin)
    engine.on(VERTC.events.onUserLeave, this.handleUserLeave)
    engine.on(VERTC.events.onUserPublishStream, this.handleUserPublishStream)
    engine.on(VERTC.events.onUserUnpublishStream, this.handleUserUnpublishStream)
    engine.on(VERTC.events.onUserPublishScreen, this.handleUserPublishScreen)
    engine.on(VERTC.events.onUserUnpublishScreen, this.handleUserUnpublishScreen)
    engine.on(VERTC.events.onRemoteStreamStats, this.handleRemoteStreamStats)
    engine.on(VERTC.events.onLocalStreamStats, this.handleLocalStreamStats)
    engine.on(VERTC.events.onLocalAudioPropertiesReport, this.handleLocalAudioPropertiesReport)
    engine.on(VERTC.events.onRemoteAudioPropertiesReport, this.handleRemoteAudioPropertiesReport)
    engine.on(VERTC.events.onRoomBinaryMessageReceived, this.handleRoomBinaryMessage)

    this.registered = true
  }

  private bindAiAnsEvents(extension: RTCAIAnsExtension) {
    if (this.aiAnsEventsBound) {
      return
    }
    extension.on(EventTypes.onUnsupported, this.handleAiAnsUnsupported)
    extension.on(EventTypes.onOverload, this.handleAiAnsOverload)
    extension.on(EventTypes.onError, this.handleAiAnsError)
    this.aiAnsEventsBound = true
  }

  private async setupAiAnsExtension(extension: RTCAIAnsExtension) {
    this.aiAnsExtension = extension
    this.bindAiAnsEvents(extension)
    try {
      const supported = await extension.isSupported().catch(() => false)
      this.aiAnsSupported = supported
      if (!supported) {
        console.warn('[rtcClient] AI noise reduction unsupported in current environment')
        return
      }
      await this.applyAiAnsMode()
      this.enableAiAns()
    } catch (error) {
      this.aiAnsSupported = false
      console.warn('[rtcClient] Failed to initialize AI noise reduction:', (error as Error).message)
    }
  }

  private async applyAiAnsMode() {
    if (!this.aiAnsExtension) return
    try {
      await this.aiAnsExtension.setAnsMode(this.aiAnsMode)
    } catch (error) {
      console.warn('[rtcClient] Failed to set AI noise reduction mode:', (error as Error).message)
    }
  }

  private enableAiAns() {
    if (
      !this.aiAnsExtension ||
      this.aiAnsEnabled ||
      this.aiAnsSupported === false ||
      this.aiAnsManuallyDisabled
    ) {
      return
    }
    try {
      this.aiAnsExtension.enable(this.aiAnsConstraint as never)
      this.aiAnsEnabled = true
      console.info('[rtcClient] AI noise reduction enabled', { mode: this.aiAnsMode })
    } catch (error) {
      console.warn('[rtcClient] Failed to enable AI noise reduction:', (error as Error).message)
    }
  }

  private disableAiAns(reason?: string) {
    if (!this.aiAnsExtension || !this.aiAnsEnabled) {
      return
    }
    try {
      this.aiAnsExtension.disable(this.aiAnsConstraint as never)
      console.info('[rtcClient] AI noise reduction disabled', { reason })
    } catch (error) {
      console.warn('[rtcClient] Failed to disable AI noise reduction:', (error as Error).message)
    } finally {
      this.aiAnsEnabled = false
    }
  }

  setAiAnsMode(mode: AnsMode) {
    this.aiAnsMode = mode
    void (async () => {
      await this.applyAiAnsMode()
      this.enableAiAns()
    })()
  }

  private handleAiAnsUnsupported = () => {
    this.aiAnsSupported = false
    this.disableAiAns('unsupported')
  }

  private handleAiAnsOverload = () => {
    this.disableAiAns('overload')
  }

  private handleAiAnsError = (event?: { message?: string }) => {
    const message = event?.message || 'unknown error'
    console.warn('[rtcClient] AI noise reduction error:', message)
    this.disableAiAns('error')
  }

  setAiAnsEnabled(enabled: boolean) {
    this.aiAnsManuallyDisabled = !enabled
    if (!enabled) {
      this.disableAiAns('manual-toggle')
      return
    }
    if (this.aiAnsSupported === false) {
      return
    }
    this.enableAiAns()
  }

  isAiAnsEnabled() {
    return this.aiAnsEnabled && !this.aiAnsManuallyDisabled
  }

  isAiAnsSupported() {
    return this.aiAnsSupported === true
  }

  private ensureEngine(appId: string) {
    if (this.engine) {
      return this.engine
    }

    const engine = VERTC.createEngine(appId)
    this.aiAnsExtension = null
    this.aiAnsEventsBound = false
    this.aiAnsSupported = null
    this.aiAnsEnabled = false

    const extension = new RTCAIAnsExtension()
    try {
      const finalizeRegistration = () => {
        this.aiAnsExtension = extension
        void this.setupAiAnsExtension(extension)
      }

      const result = engine.registerExtension(extension)
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).then(finalizeRegistration).catch((error) => {
          console.warn('[rtcClient] Failed to register AI noise reduction extension:', (error as Error).message)
        })
      } else {
        finalizeRegistration()
      }
    } catch (error) {
      console.warn('[rtcClient] AI noise reduction not available:', (error as Error).message)
    }
    this.engine = engine
    if (this.listeners && !this.registered) {
      this.registerEventHandlers(engine)
    }

    return engine
  }

  setBasicInfo(info: BasicInfo) {
    this.basicInfo = info
  }

  async joinRoom(info?: BasicInfo) {
    const basic = info ?? this.basicInfo
    if (!basic) {
      throw new Error('RTC basic info is missing')
    }

    const engine = this.ensureEngine(basic.appId)
    this.basicInfo = basic

    await engine.joinRoom(
      basic.token,
      basic.roomId,
      {
        userId: basic.userId,
        extraInfo: JSON.stringify({
          call_scene: 'RTC-AIGC',
          user_name: basic.userId,
        }),
      },
      {
        isAutoPublish: false,
        isAutoSubscribeAudio: false,
        roomProfileType: RoomProfileType.chat,
      },
    )
  }

  async leaveRoom() {
    if (!this.engine) return

    try {
      this.disableAiAns()
      await this.engine.leaveRoom()
    } finally {
      VERTC.destroyEngine(this.engine)
      this.engine = null
      this.registered = false
    }
  }

  async startAudioCapture(deviceId?: string) {
    if (!this.engine) return
    await this.engine.startAudioCapture(deviceId)
  }

  async stopAudioCapture() {
    if (!this.engine) return
    await this.engine.stopAudioCapture()
  }

  async startVideoCapture(deviceId?: string) {
    if (!this.engine) return
    await this.engine.startVideoCapture(deviceId)
  }

  async stopVideoCapture() {
    if (!this.engine) return
    await this.engine.stopVideoCapture()
  }

  async publishStream(mediaType: MediaType) {
    if (!this.engine) return
    await this.engine.publishStream(mediaType)
  }

  async unpublishStream(mediaType: MediaType) {
    if (!this.engine) return
    await this.engine.unpublishStream(mediaType)
  }

  async subscribeStream(userId: string, mediaType: MediaType) {
    if (!this.engine) return
    await this.engine.subscribeStream(userId, mediaType)
  }

  async unsubscribeStream(userId: string, mediaType: MediaType) {
    if (!this.engine) return
    await this.engine.unsubscribeStream(userId, mediaType)
  }

  async subscribeScreen(userId: string, mediaType: MediaType) {
    if (!this.engine) return
    await this.engine.subscribeScreen(userId, mediaType)
  }

  getLocalMediaStream(): MediaStream | null {
    if (!this.engine) return null

    const stream = new MediaStream()
    const audioTrack = this.engine.getLocalStreamTrack(StreamIndex.STREAM_INDEX_MAIN, 'audio')
    const videoTrack = this.engine.getLocalStreamTrack(StreamIndex.STREAM_INDEX_MAIN, 'video')

    if (audioTrack) {
      stream.addTrack(audioTrack)
    }
    if (videoTrack) {
      stream.addTrack(videoTrack)
    }

    if (stream.getTracks().length === 0) {
      return null
    }
    return stream
  }

  async unsubscribeScreen(userId: string, mediaType: MediaType) {
    if (!this.engine) return
    await this.engine.unsubscribeScreen(userId, mediaType)
  }

  async checkPermission(): Promise<EnableDevicesResult> {
    return VERTC.enableDevices({ audio: true, video: true })
  }

  async enumerateAudioInputs(): Promise<MediaDeviceInfo[]> {
    return VERTC.enumerateAudioCaptureDevices()
  }

  async enumerateVideoInputs(): Promise<MediaDeviceInfo[]> {
    return VERTC.enumerateVideoCaptureDevices()
  }

  async setAudioCaptureDevice(deviceId: string) {
    if (!this.engine) return
    await this.engine.setAudioCaptureDevice(deviceId)
  }

  async setVideoCaptureDevice(deviceId: string) {
    if (!this.engine) return
    await this.engine.setVideoCaptureDevice(deviceId)
  }

  async setLocalVideoPlayer(userId: string, renderDom?: HTMLElement | string) {
    if (!this.engine) return
    await this.engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
      userId,
      renderDom,
    })
  }

  async setRemoteVideoPlayer(userId: string, renderDom?: HTMLElement | string) {
    if (!this.engine) return
    await this.engine.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
      userId,
      renderDom,
    })
  }

  getRemoteMediaStream(userId: string): MediaStream | null {
    if (!this.engine) return null
    const stream = new MediaStream()
    const mainAudioTrack = this.engine.getRemoteStreamTrack(userId, StreamIndex.STREAM_INDEX_MAIN, 'audio')
    const mainVideoTrack = this.engine.getRemoteStreamTrack(userId, StreamIndex.STREAM_INDEX_MAIN, 'video')
    const screenAudioTrack = this.engine.getRemoteStreamTrack(userId, StreamIndex.STREAM_INDEX_SCREEN, 'audio')
    const screenVideoTrack = this.engine.getRemoteStreamTrack(userId, StreamIndex.STREAM_INDEX_SCREEN, 'video')

    if (mainAudioTrack) {
      stream.addTrack(mainAudioTrack)
    }
    if (mainVideoTrack) {
      stream.addTrack(mainVideoTrack)
    }
    if (screenAudioTrack) {
      stream.addTrack(screenAudioTrack)
    }
    if (screenVideoTrack) {
      stream.addTrack(screenVideoTrack)
    }

    if (stream.getTracks().length === 0) {
      return null
    }
    return stream
  }

  private handleError = (event: { errorCode: string }) => {
    this.listeners.onError?.(event)
  }

  private handleUserJoin = (event: onUserJoinedEvent) => {
    this.listeners.onUserJoin?.(event)
  }

  private handleUserLeave = (event: onUserLeaveEvent) => {
    this.listeners.onUserLeave?.(event)
  }

  private handleUserPublishStream = (event: UserPublishStreamEvent) => {
    this.listeners.onUserPublishStream?.(event)
  }

  private handleUserUnpublishStream = (event: UserUnpublishStreamEvent) => {
    this.listeners.onUserUnpublishStream?.(event)
    if (event && this.listeners.onStreamRemoved) {
      this.listeners.onStreamRemoved({
        userId: event.userId,
        mediaType: event.mediaType,
        reason: event.reason,
      })
    }
  }

  private handleUserPublishScreen = (event: UserPublishStreamEvent) => {
    this.listeners.onUserPublishScreen?.(event)
  }

  private handleUserUnpublishScreen = (event: UserUnpublishStreamEvent) => {
    this.listeners.onUserUnpublishScreen?.(event)
    if (event && this.listeners.onStreamRemoved) {
      this.listeners.onStreamRemoved({
        userId: event.userId,
        mediaType: event.mediaType,
        reason: event.reason,
      })
    }
  }

  private handleRemoteStreamStats = (event: RemoteStreamStats) => {
    this.listeners.onRemoteStreamStats?.(event)
  }

  private handleLocalStreamStats = (event: LocalStreamStats) => {
    this.listeners.onLocalStreamStats?.(event)
  }

  private handleLocalAudioPropertiesReport = (event: LocalAudioPropertiesInfo[]) => {
    this.listeners.onLocalAudioPropertiesReport?.(event)
  }

  private handleRemoteAudioPropertiesReport = (event: RemoteAudioPropertiesInfo[]) => {
    this.listeners.onRemoteAudioPropertiesReport?.(event)
  }

  private handleRoomBinaryMessage = (event: { userId: string; message: ArrayBuffer }) => {
    this.listeners.onRoomBinaryMessage?.(event)
  }
}

export const rtcClient = new RtcClient()

export { AnsMode } from '@volcengine/rtc/extension-ainr'
