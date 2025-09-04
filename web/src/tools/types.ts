import type { McpTool } from '@/types/mqtt'

/**
 * Extended tool definition with optional handler reference
 */
export interface ToolDefinition extends McpTool {
  handler?: string
}

/**
 * Result of a photo capture operation
 */
export interface PhotoCaptureResult {
  /** Base64 encoded image data */
  dataUrl: string
  /** Blob of the image */
  blob: Blob
  /** Filename for the captured photo */
  filename: string
  /** Source of the capture (local or remote) */
  source: 'local' | 'remote'
  /** Download URL for the uploaded photo (optional) */
  downloadUrl?: string
}

/**
 * Context object passed to tool handlers containing callback functions
 */
export interface ToolHandlerContext {
  /** Callback for camera control operations */
  onCameraControl?: (enabled: boolean) => void
  /** Callback for emotion/animation changes */
  onEmotionChange?: (emotion: string) => void
  /** Callback for photo capture operations */
  onTakePhoto?: (source: 'local' | 'remote', quality: number) => Promise<PhotoCaptureResult>
  /** Callback for volume control operations */
  onVolumeControl?: (volume?: number, muted?: boolean) => void
}

/**
 * Result returned by tool execution
 */
export interface ToolExecutionResult {
  /** Whether the tool execution was successful */
  success: boolean
  /** Human-readable message about the execution result */
  message: string
  /** Optional additional data returned by the tool */
  data?: any
}

/**
 * Function signature for tool handlers
 */
export type ToolHandler = (
  args: Record<string, any>,
  context: ToolHandlerContext,
) => ToolExecutionResult | Promise<ToolExecutionResult>

/**
 * Registry structure for tools and their handlers
 */
export interface ToolRegistry {
  [toolName: string]: {
    definition: ToolDefinition
    handler: ToolHandler
  }
}

/**
 * List of supported emotion types for the avatar
 */
export const SUPPORTED_EMOTIONS = [
  'happy',
  'sad',
  'angry',
  'surprised',
  'thinking',
  'playful',
  'relaxed',
  'serious',
  'shy',
  'tired',
  'disappointed',
  'laugh',
] as const

/**
 * Type union of all supported emotions
 */
export type EmotionType = (typeof SUPPORTED_EMOTIONS)[number]
