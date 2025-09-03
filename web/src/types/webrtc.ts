export interface WebRTCConfig {
  iceServers: RTCIceServer[]
  signalingUrl: string
  signalingId?: string
}

export interface MediaConstraints {
  video: boolean | MediaTrackConstraints
  audio: boolean | MediaTrackConstraints
}

// Phoenix signaling message formats
export interface SDPData {
  type: string
  sdp: string
}

export interface ICECandidateData {
  candidate: string
  sdpMLineIndex: number | null
  sdpMid: string | null
}

export interface SignalingMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate'
   
  data: SDPData | ICECandidateData | any // Phoenix signaling expects specific JSON format
}

export interface PhoenixChannelPayload {
  type: string
   
  data: any
}

export interface VoiceType {
  id: string
  name: string
  icon: string
}

export type ConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'closed'

// Message types from backend
export interface ASRResponse {
  type: 'asr_response'
  results: string
}

export type ConversationMessage = ASRResponse

export interface WebRTCCallbacks {
  onConnectionStateChange?: (state: ConnectionState) => void
  onLocalStream?: (stream: MediaStream) => void
  onRemoteStream?: (stream: MediaStream) => void
  onError?: (error: Error) => void
  onASRResponse?: (results: string) => void
  onTTSText?: (text: string) => void
}

export interface UseWebRTCOptions {
  signalingId: string
  config?: Partial<WebRTCConfig>
  mediaConstraints?: Partial<MediaConstraints>
  autoConnect?: boolean
  onASRResponse?: (results: string) => void
  onTTSText?: (text: string) => void
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: ConnectionState
  isConnecting: boolean
  isConnected: boolean
  error: Error | null
  connect: () => Promise<void>
  disconnect: () => void
  toggleAudio: (enabled?: boolean) => Promise<void>
  toggleVideo: (enabled?: boolean) => Promise<void>
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  cleanup?: () => void  // Optional cleanup function
}