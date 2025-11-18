import type { ToolDefinition } from './types'
import { SUPPORTED_EMOTIONS } from './types'

/**
 * Registry of all MCP tool definitions
 * Each tool has a unique name as key and its definition as value
 */
export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  control_camera: {
    name: 'control_camera',
    description:
      '控制玩偶摄像头预览。用户说“打开摄像头/帮我看看/拍照前先开”等就设置 enabled=true；听到“关掉摄像头/不用看了”则用 enabled=false 立即关闭。若用户需要查看或拍照，先 control_camera(enabled=true)，再调用 explain_photo 或 take_photo。',
    inputSchema: {
      type: 'object',
      
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Whether to enable or disable the camera',
        },
      },
      required: ['enabled'],
    },
  },

  change_emotion: {
    name: 'change_emotion',
    description:
      '根据对话内容切换头像表情/动画。可选值：happy, sad, angry, surprised, thinking, playful, relaxed, serious, shy, tired, disappointed, laugh。每次调用必须提供 emotion 参数，例如 change_emotion(emotion="happy")。',
    inputSchema: {
      type: 'object',
      properties: {
        emotion: {
          type: 'string',
          description: 'The emotion to display. Must be one of the supported emotions.',
          enum: SUPPORTED_EMOTIONS as unknown as string[],
        },
      },
      required: ['emotion'],
    },
  },

  take_photo: {
    name: 'take_photo',
    description:
      '用户想查看穿搭、物品或场景时拍摄一张静态照片。通常与 control_camera(enabled=true) 搭配：先打开摄像头，再 take_photo（source 默认为 "remote"）。完成后如有需要再关闭摄像头。',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Which video stream to capture from',
          enum: ['local', 'remote'],
          default: 'remote',
        },
        quality: {
          type: 'number',
          description: 'Image quality (0-1, where 1 is highest quality)',
          minimum: 0,
          maximum: 1,
          default: 0.9,
        },
      },
      required: [],
    },
  },

  control_volume: {
    name: 'control_volume',
    description:
      '只要听到“声音/音量/大点/小点/静音/mute”等就调整扬声器音量。volume 0-100 表示百分比（如“大声点”≈80，“小声点”≈30，默认 50），muted=true/false 用于静音或取消静音。如果用户连续多次要求调整，每次都需要重新调用工具并确认。',
    inputSchema: {
      type: 'object',
      properties: {
        volume: {
          type: 'number',
          description: 'Volume level as percentage (0-100)',
          minimum: 0,
          maximum: 100,
        },
        muted: {
          type: 'boolean',
          description: 'Whether to mute or unmute the audio',
        },
      },
      required: [],
    },
  },
}

/**
 * Get list of all available tool definitions
 * @returns Array of tool definitions
 */
export function getToolsList(): ToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS)
}

/**
 * Get a specific tool definition by name
 * @param name - Name of the tool
 * @returns Tool definition or undefined if not found
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS[name]
}

/**
 * Check if a tool name is valid (exists in registry)
 * @param name - Name to check
 * @returns True if tool exists, false otherwise
 */
export function isValidToolName(name: string): boolean {
  return name in TOOL_DEFINITIONS
}

/**
 * Validate tool arguments against its schema
 * @param toolName - Name of the tool
 * @param args - Arguments to validate
 * @returns Validation result with success status and optional errors
 */
export function validateToolArguments(
  toolName: string,
  args: Record<string, any>,
): { valid: boolean; errors?: string[] } {
  const tool = TOOL_DEFINITIONS[toolName]
  if (!tool) {
    return { valid: false, errors: [`Unknown tool: ${toolName}`] }
  }

  const errors: string[] = []
  const schema = tool.inputSchema

  if (!schema) {
    return { valid: true }
  }

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in args)) {
        errors.push(`Missing required field: ${field}`)
      }
    }
  }

  // Validate field types
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (field in args) {
        const value = args[field]
        const expectedType = (fieldSchema as any).type

        if (expectedType === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field ${field} must be a boolean`)
        } else if (expectedType === 'string' && typeof value !== 'string') {
          errors.push(`Field ${field} must be a string`)
        }

        // Check enum values
        const enumValues = (fieldSchema as any).enum
        if (enumValues && !enumValues.includes(value)) {
          errors.push(`Field ${field} must be one of: ${enumValues.join(', ')}`)
        }
      }
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true }
}
