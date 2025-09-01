import { Mic, Volume2, Camera } from 'lucide-react';
import { EmotionAnimation } from './EmotionAnimation';
import { EmotionSelector } from './EmotionSelector';
import { ChatMessages } from './ChatMessages';
import { useAudioPlaying } from '@/hooks/useAudioPlaying';
import { useEffect, useRef, useState } from 'react';

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
}

export function ChatInterface({ 
  webrtc,
  isMqttConnected
}: ChatInterfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [selectedEmotion, setSelectedEmotion] = useState('happy');
  const [showVideo, setShowVideo] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const isSpeaking = useAudioPlaying(audioRef, 1000);

  useEffect(() => {
    if (webrtc.remoteStream) {
      if (audioRef.current) {
        audioRef.current.srcObject = webrtc.remoteStream;
      }
      
      if (showVideo && videoRef.current) {
        videoRef.current.srcObject = webrtc.remoteStream;
      }
    }
  }, [webrtc.remoteStream, showVideo]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 pt-8 relative">
      <div className="fixed top-4 right-4">
        <EmotionSelector 
          selectedEmotion={selectedEmotion}
          onEmotionSelect={setSelectedEmotion}
        />
      </div>

      <div className="mb-2">
        <EmotionAnimation emotion={selectedEmotion} />
      </div>

      <ChatMessages
        isLoading={webrtc.isConnected && !isSpeaking}
        isSpeaking={isSpeaking}
      />

      <audio
        ref={audioRef}
        autoPlay
        playsInline
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
          {/* <div className="mt-2 text-center text-sm text-gray-500">
            <div>连接状态: {connectionState}</div>
            <div className="text-xs">ID: {signalingId}</div>
          </div> */}
        </div>
      )}

      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="bg-white rounded-[48px] border border-[#EAEAEA] flex items-center gap-8 px-12 py-4" style={{boxShadow: '0 6px 12px 0 rgba(125, 125, 125, 0.15)'}}>
          <button 
            onClick={async () => {
              if (!webrtc.isConnected && !webrtc.isConnecting && isMqttConnected) {
                webrtc.connect();
                return;
              }

              if (isRecording) {
                setIsRecording(false);
                await webrtc.toggleAudio(false);
                console.log('Stop recording');
              } else {
                setIsRecording(true);
                await webrtc.toggleAudio(true);
                console.log('Start recording');
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 shadow-lg scale-110' 
                : webrtc.isConnecting
                ? 'bg-yellow-500 animate-pulse'
                : webrtc.isConnected && webrtc.isAudioEnabled
                ? 'bg-blue-500 hover:bg-blue-600 shadow-md' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={isRecording ? "停止录音" : webrtc.isConnecting ? "连接中..." : !webrtc.isConnected ? "点击连接" : "开始录音"}
          >
            <Mic className={`w-6 h-6 ${isRecording || webrtc.isConnecting || (webrtc.isConnected && webrtc.isAudioEnabled) ? 'text-white' : 'text-[#343741]'}`} />
          </button>
          
          <button 
            onClick={async () => {
              if (webrtc.isConnected) {
                await webrtc.toggleVideo();
              } else {
                await webrtc.toggleVideo(true);
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              webrtc.isConnected && webrtc.isVideoEnabled 
                ? 'bg-orange-500 hover:bg-orange-600 shadow-md' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title="扬声器控制"
          >
            <Volume2 className={`w-6 h-6 ${webrtc.isConnected && webrtc.isVideoEnabled ? 'text-white' : 'text-[#343741]'}`} />
          </button>
          
          <button 
            onClick={() => {
              if (!showVideo) {
                setShowVideo(true);
                if (isMqttConnected && !webrtc.isConnected && !webrtc.isConnecting) {
                  webrtc.connect();
                }
              } else {
                setShowVideo(false);
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              showVideo 
                ? 'bg-purple-500 hover:bg-purple-600 shadow-md' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={showVideo ? "关闭视频聊天" : "开启视频聊天"}
          >
            <Camera className={`w-6 h-6 ${showVideo ? 'text-white' : 'text-[#343741]'}`} />
          </button>
        </div>
        
        {/* Status Text */}
        {/* <div className="text-center mt-4">
          <p className="text-gray-500 text-sm">
            双击XX头像可录制，单击XX头像可录音
          </p>
        </div> */}
      </div>
    </div>
  );
}