import { tlvToString } from '@/utils/tlv'

export const MESSAGE_TYPE = {
  BRIEF: 'conv',
  SUBTITLE: 'subv',
  FUNCTION_CALL: 'tool',
} as const

export const AGENT_BRIEF_CODE = {
  UNKNOWN: 0,
  LISTENING: 1,
  THINKING: 2,
  SPEAKING: 3,
  INTERRUPTED: 4,
  FINISHED: 5,
} as const

export type AgentBriefCode = (typeof AGENT_BRIEF_CODE)[keyof typeof AGENT_BRIEF_CODE]

export interface SubtitleData {
  text?: string
  userId?: string
  paragraph?: boolean
  definite?: boolean
  role?: string
}

export interface SubtitleMessage {
  data?: SubtitleData[]
}

export interface BriefStage {
  Code?: number
  Description?: string
}

export interface BriefMessage {
  Stage?: BriefStage
  ErrorInfo?: Record<string, unknown>
}

export interface FunctionCallFunction {
  name?: string
  arguments?: unknown
}

export interface FunctionCallEntry {
  id?: string
  type?: string
  function?: FunctionCallFunction
  name?: string
  arguments?: unknown
  params?: unknown
  payload?: unknown
}

export interface FunctionCallMessage {
  tool_calls?: FunctionCallEntry[]
  calls?: FunctionCallEntry[]
  tools?: FunctionCallEntry[]
  actions?: FunctionCallEntry[]
}

export type ParsedAigcMessage =
  | { type: typeof MESSAGE_TYPE.BRIEF; payload: BriefMessage }
  | { type: typeof MESSAGE_TYPE.SUBTITLE; payload: SubtitleMessage }
  | { type: typeof MESSAGE_TYPE.FUNCTION_CALL; payload: FunctionCallMessage }

export const parseAigcBinaryMessage = (buffer: ArrayBufferLike): ParsedAigcMessage | null => {
  try {
    const { type, value } = tlvToString(buffer)
    const parsed = JSON.parse(value) as BriefMessage | SubtitleMessage | FunctionCallMessage

    switch (type) {
      case MESSAGE_TYPE.BRIEF:
        return { type: MESSAGE_TYPE.BRIEF, payload: parsed as BriefMessage }
      case MESSAGE_TYPE.SUBTITLE:
        return { type: MESSAGE_TYPE.SUBTITLE, payload: parsed as SubtitleMessage }
      case MESSAGE_TYPE.FUNCTION_CALL:
        return { type: MESSAGE_TYPE.FUNCTION_CALL, payload: parsed as FunctionCallMessage }
      default:
        return null
    }
  } catch (error) {
    console.warn('[aigcMessages] Failed to parse binary message', error)
    return null
  }
}
