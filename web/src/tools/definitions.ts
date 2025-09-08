import type { ToolDefinition } from './types'
import { SUPPORTED_EMOTIONS } from './types'

/**
 * Registry of all MCP tool definitions
 * Each tool has a unique name as key and its definition as value
 */
export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  control_camera: {
    name: 'control_camera',
    description: 'Control the camera video feed. Usage: Call with enabled=true to turn on camera, enabled=false to turn off',
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
    description: 'MANDATORY TOOL: Change the avatar emotion/animation. MUST be called with emotion parameter. Usage: change_emotion(emotion="happy") where emotion must be one of: happy, sad, angry, surprised, thinking, playful, relaxed, serious, shy, tired, disappointed, laugh. NEVER call without emotion parameter!',
    inputSchema: {
      type: 'object',
      properties: {
        emotion: {
          type: 'string',
          description: 'REQUIRED: The emotion to display. Must be one of the supported emotions. Cannot be empty or undefined.',
          enum: SUPPORTED_EMOTIONS as unknown as string[],
        },
      },
      required: ['emotion'],
    },
  },

  take_photo: {
    name: 'take_photo',
    description: 'Capture a photo from the video stream. Usage: Call without parameters or with source="remote" to take photo, returns photo URL',
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
    description: 'Control audio volume. Usage: Call with muted=true/false to mute/unmute, or volume=0-100 to set volume level',
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
