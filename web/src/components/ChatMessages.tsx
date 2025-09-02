import { useEffect, useRef } from 'react'

interface ChatMessagesProps {
  isLoading?: boolean;
  isSpeaking?: boolean;
  aiReplyText?: string;
}

export function ChatMessages({ isLoading = false, isSpeaking = false, aiReplyText = '' }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  console.log('ChatMessages render - aiReplyText:', aiReplyText, 'isLoading:', isLoading, 'isSpeaking:', isSpeaking)
  
  // Auto scroll when content updates
  useEffect(() => {
    if (scrollRef.current && aiReplyText) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [aiReplyText])
  
  const getAnimation = () => {
    return (
      <div className="flex items-center space-x-1 mr-3 flex-shrink-0">
        {[1, 0.8, 1.2, 0.9, 1.1].map((scale, i) => (
          <div
            key={i}
            className="w-2 bg-gradient-to-t from-blue-500 to-blue-400 rounded-full"
            style={{
              height: `${12 * scale}px`,
              animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite alternate`
            }}
          />
        ))}
      </div>
    )
  }

  // If not connected/loading, show welcome message
  if (!isLoading && !isSpeaking && !aiReplyText) {
    return (
      <div className="mb-8 px-4 flex justify-center">
        <div className="px-6 py-4 flex items-center justify-center rounded-3xl bg-blue-50 min-h-[60px]">
          <span className="text-gray-500 text-base">你好，我是 EMQ 机器人，打开麦克风开始对话！</span>
        </div>
      </div>
    )
  }

  // Connected state: show animation + text
  return (
    <div className="mb-8 px-4 flex justify-center">
      <div 
        ref={scrollRef}
        className="px-6 py-4 flex items-start rounded-3xl bg-blue-50 min-h-[60px] max-w-2xl max-h-48 overflow-y-auto scroll-smooth"
      >
        {!aiReplyText && (
          <div className="flex-shrink-0 mt-1">
            {getAnimation()}
          </div>
        )}
        <span className="text-gray-600 text-base leading-relaxed flex-1">
          {aiReplyText || '我在听...'}
        </span>
      </div>
    </div>
  )
}