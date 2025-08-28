import { useState, useEffect } from 'react'

export function useAudioPlaying(audioRef: React.RefObject<HTMLAudioElement | null>, interval: number = 100) {
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const checkInterval = setInterval(() => {
      const audio = audioRef.current
      if (audio) {
        const playing = !audio.paused && !audio.ended && audio.currentTime > 0 && audio.readyState > 2
        console.log('Audio playing:', playing)
        setIsPlaying(playing)
      }
    }, interval)

    return () => clearInterval(checkInterval)
  }, [audioRef, interval])

  return isPlaying
}