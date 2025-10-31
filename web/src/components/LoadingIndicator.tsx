interface LoadingIndicatorProps {
  status: 'processing' | 'waiting' | 'listening' | null
}

export function LoadingIndicator({ status }: LoadingIndicatorProps) {
  if (!status) return null

  const animationClass =
    status === 'listening'
      ? 'animate-pulse'
      : 'animate-spin'

  return (
    <div
      className={`p-0.5 ${animationClass} drop-shadow-lg bg-gradient-to-bl from-pink-400 via-purple-400 to-indigo-600 w-5 h-5 aspect-square rounded-full`}
    >
      <div className="rounded-full h-full w-full bg-slate-100 dark:bg-zinc-900"></div>
    </div>
  )
}
