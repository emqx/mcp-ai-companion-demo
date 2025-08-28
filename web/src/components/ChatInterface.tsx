import { Mic, Volume2, Camera } from 'lucide-react';
import { RiveAnimation } from './RiveAnimation';
import { EmotionSelector } from './EmotionSelector';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useEffect, useRef, useState } from 'react';

interface ChatInterfaceProps {
  selectedEmotion: string;
  onEmotionSelect: (emotion: string) => void;
}


export function ChatInterface({ selectedEmotion, onEmotionSelect }: ChatInterfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [signalingId] = useState('abcd');
  const [showVideo, setShowVideo] = useState(false);
  
  const {
    remoteStream,
    connectionState,
    isConnecting,
    isConnected,
    error,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled
  } = useWebRTC({
    signalingId,
  });

  useEffect(() => {
    if (remoteStream && videoRef.current) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 pt-16 relative">
      {/* Emotion Select - Top Right */}
      <div className="fixed top-4 right-4">
        <EmotionSelector 
          selectedEmotion={selectedEmotion}
          onEmotionSelect={onEmotionSelect}
        />
      </div>

      {/* Robot Avatar */}
      <div className="mb-2">
        <RiveAnimation emotion={selectedEmotion} />
      </div>

      {/* Video Area */}
      {showVideo && (
        <div className="mb-4 w-full max-w-md">
          <div className="bg-gray-200 rounded-lg overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              controls={false}
              className="w-full h-64 object-cover"
            />
            {!isConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
                <div className="text-white text-center">
                  <p className="mb-2">{isConnecting ? '连接中...' : '未连接'}</p>
                  {error && <p className="text-sm text-red-300">{error.message}</p>}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 text-center text-sm text-gray-500">
            <div>连接状态: {connectionState}</div>
            <div className="text-xs">ID: {signalingId}</div>
          </div>
        </div>
      )}

      {/* Chat Message */}
      <div className="mb-12 text-center">
        <p className="text-black text-lg">
          你好，我是XX，打开麦克风开始对话！
        </p>
      </div>

      {/* Fixed Bottom Controls */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="bg-white rounded-[48px] border border-[#EAEAEA] flex items-center gap-8 px-12 py-4" style={{boxShadow: '0 6px 12px 0 rgba(125, 125, 125, 0.15)'}}>
          <button 
            onClick={() => {
              if (isConnected) {
                toggleAudio();
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-colors ${
              isConnected && isAudioEnabled 
                ? 'bg-green-500 hover:bg-green-600' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title="麦克风控制"
          >
            <Mic className="w-6 h-6 text-[#343741]" />
          </button>
          
          <button 
            onClick={() => {
              if (isConnected) {
                toggleVideo();
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-colors ${
              isConnected && isVideoEnabled 
                ? 'bg-green-500 hover:bg-green-600' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title="扬声器控制"
          >
            <Volume2 className="w-6 h-6 text-[#343741]" />
          </button>
          
          <button 
            onClick={() => {
              if (!showVideo) {
                setShowVideo(true);
                if (!isConnected && !isConnecting) {
                  connect();
                }
              } else {
                if (isConnected) {
                  disconnect();
                }
                setShowVideo(false);
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-colors ${
              showVideo 
                ? 'bg-blue-500 hover:bg-blue-600' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={showVideo ? "关闭视频聊天" : "开启视频聊天"}
          >
            <Camera className={`w-6 h-6 ${showVideo ? 'text-white' : 'text-[#343741]'}`} />
          </button>
        </div>
        
        {/* Status Text */}
        <div className="text-center mt-4">
          <p className="text-gray-500 text-sm">
            双击XX头像可录制，单击XX头像可录音
          </p>
        </div>
      </div>
    </div>
  );
}