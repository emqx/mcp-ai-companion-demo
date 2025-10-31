import { Mic, Volume2, Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmotionAnimation } from './EmotionAnimation'
// import { EmotionSelector } from './EmotionSelector'
import { ChatMessages } from './ChatMessages'
import { useAudioPlaying } from '@/hooks/useAudioPlaying'
import { useEffect, useRef, type RefObject, type ReactNode } from 'react'
import { appLogger } from '@/utils/logger'

interface WebRTCState {
  localStream: MediaStream | null
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
  aiReplyText?: string
  llmLoading?: 'processing' | 'waiting' | 'listening' | null
  showVideo: boolean
  setShowVideo: (show: boolean) => void
  selectedEmotion: string
  setSelectedEmotion: (emotion: string) => void
  setIsMuted: (muted: boolean) => void
  videoRef: RefObject<HTMLVideoElement | null>
  audioRef: RefObject<HTMLAudioElement | null>
  volume: number
  isMuted: boolean
  onVolumeControl?: (volume?: number, muted?: boolean) => void
  settingsSlot?: ReactNode
}

export function ChatInterface({
  webrtc,
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
  settingsSlot,
}: ChatInterfaceProps) {
  const { t } = useTranslation()
  const isSpeaking = useAudioPlaying(audioRef, 1000)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const remoteStream = webrtc.remoteStream

    if (remoteStream && audioRef.current) {
      if (isMuted) {
        setIsMuted(false)
        appLogger.info('🔊 Auto unmuted due to remote stream availability')
      }
      if (audioRef.current.srcObject !== remoteStream) {
        audioRef.current.srcObject = remoteStream
        appLogger.info('🔊 Remote stream connected to audio element')
      }
      audioRef.current.volume = volume
      audioRef.current.muted = false
    } else if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.srcObject = null
    }
  }, [audioRef, volume, webrtc.remoteStream, isMuted, setIsMuted])

  useEffect(() => {
    const videoElement = videoRef?.current
    if (!videoElement) return

    if (!showVideo) {
      videoElement.pause()
      videoElement.srcObject = null
      return
    }

    const stream = webrtc.localStream ?? webrtc.remoteStream
    if (!stream) {
      videoElement.pause()
      videoElement.srcObject = null
      return
    }

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream
      appLogger.info(
        webrtc.localStream
          ? '📷 Local camera stream connected to video element'
          : '📺 Remote stream connected to video element',
      )
    }

    videoElement.muted = true
    videoElement.playsInline = true

    const playPromise = videoElement.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch((error) => {
        appLogger.warn('📺 Video playback failed', error)
      })
    }
  }, [showVideo, videoRef, webrtc.localStream, webrtc.remoteStream])

  // Update volume and mute state when they change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.muted = isMuted
    }
  }, [volume, isMuted, audioRef])

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 pt-8 relative">
      <div className="fixed top-4 right-4 flex items-center gap-2 z-40">{settingsSlot}</div>

      <div
        className="mb-2 select-none cursor-pointer relative"
        onClick={() => {
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current)
            clickTimeoutRef.current = null
            appLogger.log('双击头像 - 鼓励')
          } else {
            clickTimeoutRef.current = setTimeout(() => {
              appLogger.log('单击头像 - 敲打')
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
              muted
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
              if (!webrtc.isConnected && !webrtc.isConnecting) {
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
              const targetState = !webrtc.isVideoEnabled
              try {
                await webrtc.toggleVideo(targetState)
                setShowVideo(targetState)
              } catch (error) {
                appLogger.error('🎥 Failed to toggle video', error)
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              webrtc.isVideoEnabled ? 'bg-button-active' : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={webrtc.isVideoEnabled ? t('video.turnOff') : t('video.turnOn')}
          >
            <Camera className={`w-6 h-6 ${webrtc.isVideoEnabled ? 'text-button-active' : 'text-[#343741]'}`} />
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
