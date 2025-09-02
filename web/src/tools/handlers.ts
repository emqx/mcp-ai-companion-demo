import type { ToolHandler, ToolHandlerContext, ToolExecutionResult } from './types'
import { mcpLogger } from '@/utils/logger'

/**
 * Handler for controlling camera on/off state
 * @param args - Tool arguments containing 'enabled' boolean field
 * @param context - Execution context with callback functions
 * @returns Execution result with success status and message
 */
export const controlCameraHandler: ToolHandler = (
  args: Record<string, any>,
  context: ToolHandlerContext
): ToolExecutionResult => {
  const { enabled } = args
  
  mcpLogger.info(`📷 Camera ${enabled ? 'ON' : 'OFF'}`)
  
  // Call the camera control callback if available
  if (context.onCameraControl) {
    context.onCameraControl(enabled)
    return {
      success: true,
      message: `Camera ${enabled ? 'enabled' : 'disabled'} successfully`
    }
  }
  
  return {
    success: false,
    message: 'Camera control callback not available'
  }
}

/**
 * Handler for changing avatar emotion/animation
 * @param args - Tool arguments containing 'emotion' string field
 * @param context - Execution context with callback functions
 * @returns Execution result with success status and message
 */
export const changeEmotionHandler: ToolHandler = (
  args: Record<string, any>,
  context: ToolHandlerContext
): ToolExecutionResult => {
  const { emotion } = args
  
  mcpLogger.info(`😊 Emotion: ${emotion}`)
  
  // Call the emotion change callback if available
  if (context.onEmotionChange) {
    context.onEmotionChange(emotion)
    return {
      success: true,
      message: `Emotion changed to ${emotion} successfully`
    }
  }
  
  return {
    success: false,
    message: 'Emotion change callback not available'
  }
}

/**
 * Registry of all available tool handlers
 * Maps tool names to their corresponding handler functions
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  control_camera: controlCameraHandler,
  change_emotion: changeEmotionHandler
}

/**
 * Get a tool handler by name
 * @param toolName - Name of the tool
 * @returns Tool handler function or undefined if not found
 */
export function getToolHandler(toolName: string): ToolHandler | undefined {
  return TOOL_HANDLERS[toolName]
}

/**
 * Execute a tool call with validation and error handling
 * @param toolName - Name of the tool to execute
 * @param args - Arguments to pass to the tool
 * @param context - Execution context with callback functions
 * @returns Promise with execution result
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  context: ToolHandlerContext
): Promise<ToolExecutionResult> {
  const handler = getToolHandler(toolName)
  
  if (!handler) {
    return {
      success: false,
      message: `No handler found for tool: ${toolName}`
    }
  }
  
  try {
    const result = await handler(args, context)
    return result
  } catch (error) {
    mcpLogger.error(`Tool execution failed for ${toolName}:`, error)
    return {
      success: false,
      message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}