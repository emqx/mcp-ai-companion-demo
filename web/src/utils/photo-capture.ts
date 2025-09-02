import type { PhotoCaptureResult } from '@/tools/types'

/**
 * Configuration for photo upload
 */
export interface UploadConfig {
  /** Upload endpoint URL */
  url?: string
  /** Additional headers for the upload request */
  headers?: Record<string, string>
  /** Form field name for the image file */
  formFieldName?: string
}

/**
 * Configuration for photo capture
 */
export interface PhotoCaptureConfig {
  /** Image quality (0-1, where 1 is highest quality) */
  quality?: number
  /** Image format (default: 'image/jpeg') */
  format?: string
  /** Upload configuration (optional) */
  upload?: UploadConfig
}

/**
 * Capture a photo from a video element
 * @param videoElement - The video element to capture from
 * @param source - Source identifier ('local' or 'remote')
 * @param config - Capture configuration options
 * @returns Promise with photo capture result
 */
export async function capturePhotoFromVideo(
  videoElement: HTMLVideoElement,
  source: 'local' | 'remote',
  config: PhotoCaptureConfig = {}
): Promise<PhotoCaptureResult> {
  const {
    quality = 0.9,
    format = 'image/jpeg',
    upload
  } = config

  // Create canvas element
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context')
  }

  // Set canvas dimensions to match video
  canvas.width = videoElement.videoWidth
  canvas.height = videoElement.videoHeight

  // Draw current video frame to canvas
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

  // Convert canvas to blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      },
      format,
      quality
    )
  })

  // Generate data URL
  const dataUrl = canvas.toDataURL(format, quality)
  
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const extension = format.split('/')[1] || 'jpg'
  const filename = `photo_${source}_${timestamp}.${extension}`

  const result: PhotoCaptureResult = {
    dataUrl,
    blob,
    filename,
    source
  }

  // Auto-download the image
  downloadPhoto(result)

  // Upload if configuration is provided
  if (upload?.url) {
    try {
      await uploadPhoto(result, upload)
      console.log('Photo uploaded successfully:', filename)
    } catch (error) {
      console.warn('Photo upload failed:', error)
      // Don't throw error, downloading locally is still successful
    }
  }

  return result
}

/**
 * Download a photo to the user's local device
 * @param photo - Photo capture result
 */
export function downloadPhoto(photo: PhotoCaptureResult): void {
  const link = document.createElement('a')
  link.href = photo.dataUrl
  link.download = photo.filename
  
  // Temporarily add to DOM and trigger download
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Upload a photo to a server endpoint
 * @param photo - Photo capture result
 * @param config - Upload configuration
 * @returns Promise that resolves when upload completes
 */
export async function uploadPhoto(
  photo: PhotoCaptureResult,
  config: UploadConfig
): Promise<void> {
  if (!config.url) {
    throw new Error('Upload URL is required')
  }

  const formData = new FormData()
  const fieldName = config.formFieldName || 'image'
  formData.append(fieldName, photo.blob, photo.filename)

  const headers = {
    ...config.headers,
    // Don't set Content-Type, let browser set it with boundary for FormData
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: formData
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
  }
}

/**
 * Get video element dimensions for capture validation
 * @param videoElement - Video element to check
 * @returns Object with width and height, or null if invalid
 */
export function getVideoCaptureDimensions(videoElement: HTMLVideoElement): {
  width: number
  height: number
} | null {
  if (!videoElement.videoWidth || !videoElement.videoHeight) {
    return null
  }
  
  return {
    width: videoElement.videoWidth,
    height: videoElement.videoHeight
  }
}

/**
 * Validate if a video element is ready for photo capture
 * @param videoElement - Video element to validate
 * @returns True if ready for capture, false otherwise
 */
export function isVideoReadyForCapture(videoElement: HTMLVideoElement | null): boolean {
  if (!videoElement) {
    return false
  }

  // Check if video has loaded and has valid dimensions
  return (
    videoElement.readyState >= videoElement.HAVE_CURRENT_DATA &&
    videoElement.videoWidth > 0 &&
    videoElement.videoHeight > 0 &&
    !videoElement.paused
  )
}