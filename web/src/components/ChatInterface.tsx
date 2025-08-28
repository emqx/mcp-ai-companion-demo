import { Mic, Volume2, Camera } from 'lucide-react';
import { RiveAnimation } from './RiveAnimation';
import { EmotionSelector } from './EmotionSelector';
import { ChatMessages } from './ChatMessages';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAudioPlaying } from '@/hooks/useAudioPlaying';
import { useEffect, useRef, useState, useCallback } from 'react';

interface ChatInterfaceProps {
  selectedEmotion: string;
  onEmotionSelect: (emotion: string) => void;
}

export function ChatInterface({ selectedEmotion, onEmotionSelect }: ChatInterfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [signalingId] = useState('abcd');
  const [showVideo, setShowVideo] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isSpeaking = useAudioPlaying(audioRef, 1000);
  const handleASRResponse = useCallback((results: string) => {
    console.log('ASR Response received:', results);
    console.log('ASR Response type:', typeof results);
    setIsRecording(false);
  }, []);
  
  const {
    remoteStream,
    isConnecting,
    isConnected,
    error,
    connect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled
  } = useWebRTC({
    signalingId,
    onASRResponse: handleASRResponse
  });

  useEffect(() => {
    if (remoteStream) {
      if (audioRef.current) {
        audioRef.current.srcObject = remoteStream;
      }
      
      if (showVideo && videoRef.current) {
        videoRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, showVideo]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 pt-8 relative">
      <div className="fixed top-4 right-4">
        <EmotionSelector 
          selectedEmotion={selectedEmotion}
          onEmotionSelect={onEmotionSelect}
        />
      </div>

      <div className="mb-2">
        <RiveAnimation emotion={selectedEmotion} />
      </div>

      <ChatMessages
        isLoading={isConnected && !isSpeaking}
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
            {!isConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
                <div className="text-white text-center">
                  <p className="mb-2">{isConnecting ? '连接中...' : '未连接'}</p>
                  {error && <p className="text-sm text-red-300">{error.message}</p>}
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
            onClick={() => {
              if (!isConnected) {
                connect();
                return;
              }
              
              if (isRecording) {
                setIsRecording(false);
                toggleAudio(false);
                console.log('Stop recording');
              } else {
                setIsRecording(true);
                toggleAudio(true);
                console.log('Start recording');
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 shadow-lg scale-110' 
                : isConnecting
                ? 'bg-yellow-500 animate-pulse'
                : isConnected && isAudioEnabled
                ? 'bg-blue-500 hover:bg-blue-600 shadow-md' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title={isRecording ? "停止录音" : isConnecting ? "连接中..." : isConnected ? "开始录音" : "点击连接"}
          >
            <Mic className={`w-6 h-6 ${isRecording || isConnecting || (isConnected && isAudioEnabled) ? 'text-white' : 'text-[#343741]'}`} />
          </button>
          
          <button 
            onClick={() => {
              if (isConnected) {
                toggleVideo();
              }
            }}
            className={`w-12 h-12 rounded-[48px] flex items-center justify-center cursor-pointer transition-all duration-200 ${
              isConnected && isVideoEnabled 
                ? 'bg-orange-500 hover:bg-orange-600 shadow-md' 
                : 'bg-[#F3F4F9] hover:bg-gray-200'
            }`}
            title="扬声器控制"
          >
            <Volume2 className={`w-6 h-6 ${isConnected && isVideoEnabled ? 'text-white' : 'text-[#343741]'}`} />
          </button>
          
          <button 
            onClick={() => {
              if (!showVideo) {
                setShowVideo(true);
                if (!isConnected && !isConnecting) {
                  connect();
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