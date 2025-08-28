interface ChatMessagesProps {
  isLoading?: boolean;
  isSpeaking?: boolean;
}

export function ChatMessages({ isLoading = false, isSpeaking = false }: ChatMessagesProps) {
  const getAnimation = () => {
    if (!isLoading && !isSpeaking) return null;
    
    return (
      <div className="flex items-end space-x-1.5">
        {[1, 0.8, 1.2, 0.9, 1.1].map((scale, i) => (
          <div
            key={i}
            className="w-1.5 bg-gradient-to-t from-blue-500 to-blue-400 rounded-full"
            style={{
              height: `${16 * scale}px`,
              animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite alternate`
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="mb-8 px-4 flex justify-center">
      <div className="px-6 py-4 flex items-center justify-center rounded-3xl bg-blue-50 min-h-[60px]">
        {getAnimation() || <span className="text-gray-500 text-base">你好，我是 EMQ 机器人，打开麦克风开始对话！</span>}
      </div>
    </div>
  );
}