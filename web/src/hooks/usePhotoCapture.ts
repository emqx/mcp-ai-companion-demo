import { useCallback } from 'react'
import { appLogger } from '@/utils/logger'
import { capturePhotoFromVideo } from '@/utils/photo-capture'
import type { PhotoCaptureResult } from '@/tools/types'

export function usePhotoCapture() {
  const captureFromLocalCamera = useCallback(async (quality: number = 0.9): Promise<PhotoCaptureResult> => {
    let tempLocalStream: MediaStream | null = null
    let tempVideoElement: HTMLVideoElement | null = null

    try {
      appLogger.info('📷 Starting local camera for photo capture...')

      // Start local camera stream temporarily
      tempLocalStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 }, // Higher resolution for photo
        audio: false,
      })

      // Create temporary video element
      tempVideoElement = document.createElement('video')
      tempVideoElement.srcObject = tempLocalStream
      tempVideoElement.autoplay = true
      tempVideoElement.playsInline = true

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        tempVideoElement!.onloadedmetadata = () => {
          tempVideoElement!
            .play()
            .then(() => resolve())
            .catch(reject)
        }
        tempVideoElement!.onerror = reject
        setTimeout(() => reject(new Error('Video load timeout')), 5000)
      })

      // Wait a bit more for the video to stabilize
      await new Promise((resolve) => setTimeout(resolve, 500))

      if (!tempVideoElement.videoWidth || !tempVideoElement.videoHeight) {
        throw new Error('Local camera not ready for capture')
      }

      appLogger.info(`📷 Local camera ready: ${tempVideoElement.videoWidth}x${tempVideoElement.videoHeight}`)

      // Capture photo from local stream
      const result = await capturePhotoFromVideo(tempVideoElement, 'local', {
        quality,
        upload: {
          url: '/api/upload',
          formFieldName: 'file',
        },
      })

      appLogger.info(`📸 Photo captured successfully from local camera: ${result.filename}`)
      return result
    } catch (error) {
      appLogger.error('📸 Failed to capture photo from local camera:', error)
      throw error
    } finally {
      // Cleanup temporary resources
      if (tempLocalStream) {
        tempLocalStream.getTracks().forEach((track) => track.stop())
        appLogger.info('📷 Local camera stream stopped after photo capture')
      }
      if (tempVideoElement) {
        tempVideoElement.remove()
      }
    }
  }, [])

  return {
    captureFromLocalCamera,
  }
}
