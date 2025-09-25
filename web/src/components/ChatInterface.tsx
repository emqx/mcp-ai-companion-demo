import { Mic, Volume2, Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmotionAnimation } from './EmotionAnimation'
// import { EmotionSelector } from './EmotionSelector'
import { ChatMessages } from './ChatMessages'
import { Settings } from './Settings'
import { useAudioPlaying } from '@/hooks/useAudioPlaying'
import { useEffect, useRef, type RefObject } from 'react'
import type { MqttConfig } from '@/utils/storage'
import { appLogger, mqttLogger } from '@/utils/logger'

interface WebRTCState {
  remoteStream: MediaStream | null
  isConnecting: boolean
  isConnected: boolean
  error: Error | null
  isAudioEnabled: boolean
  isVideoEnabled: boolean
}

interface WebRTCActions {
  connect: () => void
  disconnect: () => void
  toggleAudio: (enabled?: boolean) => Promise<void>
  toggleVideo: (enabled?: boolean) => Promise<void>
}

interface ChatInterfaceProps {
  webrtc: WebRTCState & WebRTCActions
  isMqttConnected: boolean
  aiReplyText?: string
  llmLoading?: 'processing' | 'waiting' | null
  showVideo: boolean
  setShowVideo: (show: boolean) => void
  selectedEmotion: string
  setSelectedEmotion: (emotion: string) => void
  setIsMuted: (muted: boolean) => void
  videoRef: RefObject<HTMLVideoElement | null>
  audioRef: RefObject<HTMLAudioElement | null>
  volume: number
  isMuted: boolean
  mqttConfig: MqttConfig
  onMqttConfigChange: (config: MqttConfig) => void
  onSendMessage?: (message: string) => Promise<void>
  onVolumeControl?: (volume?: number, muted?: boolean) => void
}

export function ChatInterface({
  webrtc,
  isMqttConnected,
  aiReplyText,
  llmLoading,
  showVideo,
  setShowVideo,
  selectedEmotion,
  // setSelectedEmotion,
  setIsMuted,
  videoRef,
  audioRef,
  volume,
  isMuted,
  mqttConfig,
  onMqttConfigChange,
  onSendMessage,
}: ChatInterfaceProps) {
  const { t } = useTranslation()
  const isSpeaking = useAudioPlaying(audioRef, 1000)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sendAvatarInteraction = async (interactionType: 'encourage' | 'tap') => {
    if (!onSendMessage) {
      appLogger.error('onSendMessage callback not provided')
      return
    }
    const interactionMap = {
      encourage: t('chat.encourage'),
      tap: t('chat.tap'),
    }

    const message = JSON.stringify({
      type: 'message',
      payload: interactionMap[interactionType],
    })

    try {
      await onSendMessage(message)
    } catch (error) {
      mqttLogger.error('Failed to send avatar interaction message:', error)
    }
  }

  useEffect(() => {
    // Use remote stream for both audio and video display
    const currentStream = webrtc.remoteStream

    if (currentStream) {
      appLogger.info('🎥 Using remote WebRTC stream for media display')

      // Auto unmute when stream is available
      if (isMuted && webrtc.remoteStream) {
        setIsMuted(false)
        appLogger.info('🔊 Auto unmuted due to remote stream availability')
      }

      if (audioRef.current && webrtc.remoteStream) {
        // Use remote stream for audio
        audioRef.current.srcObject = webrtc.remoteStream
        audioRef.current.volume = volume
        audioRef.current.muted = false
        appLogger.info('🔊 Remote stream connected to audio element')
      }

      if (showVideo && videoRef?.current) {
        videoRef.current.srcObject = currentStream
        videoRef.current.volume = volume
        videoRef.current.muted = false
        appLogger.info('📺 Remote stream connected to video element')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webrtc.remoteStream, showVideo, volume])

  // Update volume and mute state when they change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.muted = isMuted
    }
    // Also update video element if it exists
    if (videoRef?.current) {
      videoRef.current.volume = volume
      videoRef.current.muted = isMuted
    }
  }, [volume, isMuted, audioRef, videoRef])

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 pt-8 relative">
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <Settings config={mqttConfig} onConfigChange={onMqttConfigChange} isConnected={isMqttConnected} />
        {/*<EmotionSelector
          selectedEmotion={selectedEmotion}
          onEmotionSelect={setSelectedEmotion}
        />*/}
      </div>

      <div
        className="mb-2 select-none cursor-pointer relative"
        onClick={() => {
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current)
            clickTimeoutRef.current = null
            appLogger.log('双击头像 - 鼓励')
            sendAvatarInteraction('encourage')
          } else {
            clickTimeoutRef.current = setTimeout(() => {
              appLogger.log('单击头像 - 敲打')
              sendAvatarInteraction('tap')
              clickTimeoutRef.current = null
            }, 300)
          }
        }}
      >
        <EmotionAnimation emotion={selectedEmotion} />
      </div>

      <ChatMessages
        isLoading={webrtc.isConnected && !isSpeaking}
        isSpeaking={isSpeaking}
        aiReplyText={aiReplyText}
        llmLoading={llmLoading}
      />

      <audio ref={audioRef} autoPlay playsInline muted={isMuted} className="hidden" />

      {showVideo && (
        <div className="mb-8 w-full max-w-xl">
          <div className="bg-gray-200 rounded-lg overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              controls={false}
              muted={isMuted}
              className="w-full h-80 object-cover"
            />
            {!webrtc.isConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
                <div className="text-white text-center">
                  <p className="mb-2">{webrtc.isConnecting ? t('common.connecting') : t('common.notConnected')}</p>
                  {webrtc.error && <p className="text-sm text-red-300">{webrtc.error.message}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div
          className="bg-white rounded-[48px] border border-[#EAEAEA] flex items-center gap-8 px-12 py-4"
          style={{ boxShadow: '0 6px 12px 0 rgba(125, 125, 125, 0.15)' }}
        >
          <button
            onClick={async () => {
              if (!webrtc.isConnected && !webrtc.isConnecting && isMqttConnected) {
                webrtc.connect()
                return
              }

              await webrtc.toggleAudio()
              console.log(webrtc.isAudioEnabled ? 'Muting audio' : 'Enabling audio')
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              webrtc.isConnecting
                ? 'bg-button-connecting'
                : webrtc.isConnected && webrtc.isAudioEnabled
                  ? 'bg-button-active'
                  : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={
              webrtc.isConnecting
                ? t('common.connecting')
                : !webrtc.isConnected
                  ? t('common.clickToConnect')
                  : webrtc.isAudioEnabled
                    ? t('audio.muteMic')
                    : t('audio.unmuteMic')
            }
          >
            <Mic
              className={`w-6 h-6 ${
                webrtc.isConnecting
                  ? 'text-button-connecting'
                  : webrtc.isConnected && webrtc.isAudioEnabled
                    ? 'text-button-active'
                    : 'text-[#343741]'
              }`}
            />
          </button>

          <button
            onClick={() => {
              // Toggle mute state for audio output
              const newMuteState = !isMuted
              setIsMuted(newMuteState)
              if (audioRef.current) {
                audioRef.current.muted = newMuteState
              }
              if (videoRef?.current) {
                videoRef.current.muted = newMuteState
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              !isMuted ? 'bg-button-active' : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={isMuted ? t('audio.unmute') : t('audio.mute')}
          >
            <Volume2 className={`w-6 h-6 ${!isMuted ? 'text-button-active' : 'text-[#343741]'}`} />
          </button>

          <button
            onClick={async () => {
              if (!showVideo) {
                setShowVideo(true)
                // Connect WebRTC if needed
                if (isMqttConnected && !webrtc.isConnected && !webrtc.isConnecting) {
                  webrtc.connect()
                }
              } else {
                setShowVideo(false)
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              showVideo ? 'bg-button-active' : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={showVideo ? t('video.turnOff') : t('video.turnOn')}
          >
            <Camera className={`w-6 h-6 ${showVideo ? 'text-button-active' : 'text-[#343741]'}`} />
          </button>
        </div>

        <div className="text-center mt-4">
          <p className="text-sm" style={{ color: '#707070' }}>
            {t('chat.instruction')}
          </p>
        </div>
      </div>
    </div>
  )
}
