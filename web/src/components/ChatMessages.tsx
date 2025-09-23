import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingIndicator } from './LoadingIndicator'
import { WaveAnimation } from './WaveAnimation'

interface ChatMessagesProps {
  isLoading?: boolean
  isSpeaking?: boolean
  aiReplyText?: string
  llmLoading?: 'processing' | 'waiting' | null
}

export function ChatMessages({
  isLoading = false,
  isSpeaking = false,
  aiReplyText = '',
  llmLoading = null,
}: ChatMessagesProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Auto scroll when content updates
  useEffect(() => {
    if (scrollRef.current && aiReplyText) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [aiReplyText])

  // Get loading text based on llmLoading status
  const getLoadingText = () => {
    if (llmLoading === 'processing') return t('chat.processing')
    if (llmLoading === 'waiting') return t('chat.waiting')
    return t('chat.listening')
  }

  // If not connected/loading, show welcome message
  if (!isLoading && !isSpeaking && !aiReplyText && !llmLoading) {
    return (
      <div className="mb-8 px-4 flex justify-center">
        <div className="px-6 py-4 flex items-center justify-center rounded-3xl bg-blue-50 min-h-[60px]">
          <span className="text-gray-500 text-base">{t('chat.greeting')}</span>
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
        {/* Show loading indicator for llmLoading states */}
        {llmLoading && (
          <div className="flex-shrink-0 mr-3 mt-1 relative">
            <LoadingIndicator status={llmLoading} />
          </div>
        )}

        {/* Show wave animation only when not in llmLoading and no AI reply */}
        {!aiReplyText && !llmLoading && (
          <div className="flex-shrink-0 mt-1">
            <WaveAnimation />
          </div>
        )}

        <span className="text-gray-600 text-base leading-relaxed flex-1">{aiReplyText || getLoadingText()}</span>
      </div>
    </div>
  )
}
