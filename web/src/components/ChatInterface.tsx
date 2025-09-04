import { Mic, Volume2, Camera } from 'lucide-react'
import { EmotionAnimation } from './EmotionAnimation'
// import { EmotionSelector } from './EmotionSelector'
import { ChatMessages } from './ChatMessages'
import { MqttSettings } from './MqttSettings'
import { useAudioPlaying } from '@/hooks/useAudioPlaying'
import { useEffect, useRef, type RefObject } from 'react'
import type { MqttConfig } from '@/utils/storage'
import { appLogger, mqttLogger } from '@/utils/logger'

interface WebRTCState {
  remoteStream: MediaStream | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: Error | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

interface WebRTCActions {
  connect: () => void;
  disconnect: () => void;
  toggleAudio: (enabled?: boolean) => Promise<void>
  toggleVideo: (enabled?: boolean) => Promise<void>
}

interface ChatInterfaceProps {
  webrtc: WebRTCState & WebRTCActions;
  isMqttConnected: boolean;
  aiReplyText?: string;
  showVideo: boolean;
  setShowVideo: (show: boolean) => void;
  selectedEmotion: string;
  setSelectedEmotion: (emotion: string) => void;
  setIsMuted: (muted: boolean) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  volume: number;
  isMuted: boolean;
  mqttConfig: MqttConfig;
  onMqttConfigChange: (config: MqttConfig) => void;
  onSendMessage?: (message: string) => Promise<void>;
  onVolumeControl?: (volume?: number, muted?: boolean) => void;
}

export function ChatInterface({ 
  webrtc,
  isMqttConnected,
  aiReplyText,
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
  onSendMessage
}: ChatInterfaceProps) {
  console.log('ChatInterface render - aiReplyText:', aiReplyText)
  
  const isSpeaking = useAudioPlaying(audioRef, 1000)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sendAvatarInteraction = async (interactionType: 'encourage' | 'tap') => {
    if (!onSendMessage) {
      appLogger.error('onSendMessage callback not provided')
      return
    }
    const interactionMap = {
      encourage: '鼓励了你一下，加油！！',
      tap: '敲打了你一下'
    }
    
    const message = JSON.stringify({
      type: 'message',
      payload: interactionMap[interactionType]
    })

    try {
      await onSendMessage(message)
    } catch (error) {
      mqttLogger.error('Failed to send avatar interaction message:', error)
    }
  }

  useEffect(() => {
    if (webrtc.remoteStream) {
      // Auto unmute when RTC connection is established
      if (isMuted) {
        setIsMuted(false)
      }
      
      if (audioRef.current) {
        audioRef.current.srcObject = webrtc.remoteStream
        // Apply volume and mute state to audio element
        audioRef.current.volume = volume
        audioRef.current.muted = false // Auto unmute for RTC stream
      }
      
      if (showVideo && videoRef?.current) {
        videoRef.current.srcObject = webrtc.remoteStream
        // Also apply volume and mute state to video element
        videoRef.current.volume = volume
        videoRef.current.muted = false // Auto unmute for RTC stream
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
        <MqttSettings 
          config={mqttConfig}
          onConfigChange={onMqttConfigChange}
          isConnected={isMqttConnected}
        />
        {/*<EmotionSelector 
          selectedEmotion={selectedEmotion}
          onEmotionSelect={setSelectedEmotion}
        />*/}
      </div>

      <div 
        className="mb-2 select-none cursor-pointer"
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
      />

      <audio
        ref={audioRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="hidden"
      />
      
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
                  <p className="mb-2">{webrtc.isConnecting ? '连接中...' : '未连接'}</p>
                  {webrtc.error && <p className="text-sm text-red-300">{webrtc.error.message}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="bg-white rounded-[48px] border border-[#EAEAEA] flex items-center gap-8 px-12 py-4" style={{boxShadow: '0 6px 12px 0 rgba(125, 125, 125, 0.15)'}}>
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
            title={webrtc.isConnecting ? "连接中..." : !webrtc.isConnected ? "点击连接" : webrtc.isAudioEnabled ? "关闭麦克风" : "开启麦克风"}
          >
            <Mic className={`w-6 h-6 ${
              webrtc.isConnecting 
                ? 'text-button-connecting' 
                : webrtc.isConnected && webrtc.isAudioEnabled
                ? 'text-button-active'
                : 'text-[#343741]'
            }`} />
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
              !isMuted 
                ? 'bg-button-active' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={isMuted ? "开启扬声器" : "关闭扬声器"}
          >
            <Volume2 
              className={`w-6 h-6 ${
                !isMuted ? 'text-button-active' : 'text-[#343741]'
              }`}
            />
          </button>
          
          <button 
            onClick={() => {
              if (!showVideo) {
                setShowVideo(true)
                if (isMqttConnected && !webrtc.isConnected && !webrtc.isConnecting) {
                  webrtc.connect()
                }
              } else {
                setShowVideo(false)
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              showVideo 
                ? 'bg-button-active' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={showVideo ? "关闭视频聊天" : "开启视频聊天"}
          >
            <Camera 
              className={`w-6 h-6 ${
                showVideo ? 'text-button-active' : 'text-[#343741]'
              }`} 
            />
          </button>
        </div>

        <div className="text-center mt-4">
          <p className="text-sm" style={{ color: '#707070' }}>
            双击头像表示鼓励，单击头像表示敲打
          </p>
        </div>
      </div>
    </div>
  )
}