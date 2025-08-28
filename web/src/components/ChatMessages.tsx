interface ChatMessagesProps {
  botText: string;
  isLoading?: boolean;
}

export function ChatMessages({ botText, isLoading = false }: ChatMessagesProps) {
  return (
    <div className="w-full max-w-lg mb-8 px-4">
      <div className="p-4 overflow-hidden text-ellipsis text-gray-500 text-base leading-8 rounded-3xl bg-blue-50">
        {isLoading ? '正在听...' : botText || '你好，我是XX，打开麦克风开始对话！'}
      </div>
    </div>
  );
}