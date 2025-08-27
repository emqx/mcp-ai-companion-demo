import { Mic, Volume2, Camera } from 'lucide-react';
import { RiveAnimation } from './RiveAnimation';
import { EmotionSelector } from './EmotionSelector';

interface ChatInterfaceProps {
  selectedEmotion: string;
  onEmotionSelect: (emotion: string) => void;
}


export function ChatInterface({ selectedEmotion, onEmotionSelect }: ChatInterfaceProps) {
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

      {/* Chat Message */}
      <div className="mb-12 text-center">
        <p className="text-black text-lg">
          你好，我是XX，打开麦克风开始对话！
        </p>
      </div>

      {/* Fixed Bottom Controls */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="bg-white rounded-[48px] border border-[#EAEAEA] flex items-center gap-8 px-12 py-4" style={{boxShadow: '0 6px 12px 0 rgba(125, 125, 125, 0.15)'}}>
          <button className="w-12 h-12 rounded-[48px] bg-[#F3F4F9] flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors">
            <Mic className="w-6 h-6 text-[#343741]" />
          </button>
          
          <button className="w-12 h-12 rounded-[48px] bg-[#F3F4F9] flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors">
            <Volume2 className="w-6 h-6 text-[#343741]" />
          </button>
          
          <button className="w-12 h-12 rounded-[48px] bg-[#F3F4F9] flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors">
            <Camera className="w-6 h-6 text-[#343741]" />
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