/**
 * Shared runtime configuration that is safe to commit.
 * Fields follow the structure of the Volc StartVoiceChat payload
 * (ASRConfig / TTSConfig / LLMConfig, etc.) for easier copy-and-paste.
 */
import type { RuntimeConfig } from './types'
import { semanticInterruptKeywords } from './constants/semanticInterruptKeywords'

const semanticHotwordContext = JSON.stringify({
  hotwords: semanticInterruptKeywords.map((word) => ({ word })),
})

export const runtimeConfig: RuntimeConfig = {
  scene: {
    taskId: 'emq-aigc-task-001',
    icon: 'https://lf3-rtc-demo.volccdn.com/obj/rtc-aigc-assets/DoubaoAvatar.png',
    name: 'EMQ 陪伴助手',
    defaultSceneId: 'emq-mcp-ai-companion',
  },
  agent: {
    userId: 'emq-ai-bot',
    welcomeMessage: '嗨～我是 EMQ，很高兴见到你！',
    enableConversationStateCallback: true,
    ansMode: 3,
    voiceprintMode: 1,
  },
  interrupts: {
    mode: 0,
    speechDuration: 400,
    silenceTime: 600,
    volumeGain: 0.5,
    keywords: [...semanticInterruptKeywords],
  },
  asrConfig: {
    Provider: 'volcano',
    ProviderParams: {
      Mode: 'smallmodel',
      Cluster: 'volcengine_streaming_common',
      context: semanticHotwordContext,
    },
    VADConfig: {
      SilenceTime: 600,
    },
    VolumeGain: 0.5,
    TurnDetectionMode: 0,
  },
  ttsConfig: {
    Provider: 'volcano',
    Cluster: 'volcano_tts',
    Mode: 'standard',
    VoiceType: 'BV033_streaming',
    SpeedRatio: 1.2,
    PitchRatio: 1.1,
    VolumeRatio: 1,
    SpeechRatio: 0.8,
    PitchRate: 0,
    SpeechRate: 0.4,
    Emotion: 'happy',
    EmotionIntensity: 0.8,
    IgnoreBracketText: [],
    DisableMarkdownFilter: false,
    EnableLatexTn: false,
  },
  llmConfig: {
    Mode: 'CustomLLM',
    EndpointId: '',
    SystemMessage: '',
    VisionEnable: false,
    ModelName: 'qwen-flash',
    Temperature: 0.5,
    TopP: 0.9,
    MaxTokens: 256,
    HistoryLength: 15,
    EnableRoundId: true,
    UserPrompts: [
      { Role: 'assistant', Content: '嗨～我是 EMQ，很高兴见到你！' },
      { Role: 'user', Content: '你好' },
    ],
    StreamOptions: { include_usage: true },
    ExtraHeaders: undefined,
  },
  api: {
    region: 'cn-north-1',
    version: '2024-12-01',
  },
}
