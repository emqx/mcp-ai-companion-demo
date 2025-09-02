import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Emotion {
  name: string;
  label: string;
}

interface EmotionSelectorProps {
  onEmotionSelect: (emotion: string) => void;
  selectedEmotion: string;
}

const emotions: Emotion[] = [
  { name: "happy", label: "开心 Happy" },
  { name: "sad", label: "难过 Sad" },
  { name: "angry", label: "生气 Angry" },
  { name: "surprised", label: "惊讶 Surprised" },
  { name: "thinking", label: "思考 Thinking" },
  { name: "shy", label: "害羞 Shy" },
  { name: "relaxed", label: "放松 Relaxed" },
  { name: "playful", label: "调皮 Playful" },
  { name: "tired", label: "疲倦 Tired" },
  { name: "serious", label: "严肃 Serious" },
  { name: "disappointed", label: "失望 Disappointed" },
  { name: "laug", label: "大笑 Laughing" }
]

export function EmotionSelector({ onEmotionSelect, selectedEmotion }: EmotionSelectorProps) {
  return (
    <Select value={selectedEmotion} onValueChange={onEmotionSelect}>
      <SelectTrigger className="w-48 cursor-pointer">
        <SelectValue placeholder="选择表情" />
      </SelectTrigger>
      <SelectContent>
        {emotions.map((emotion) => (
          <SelectItem key={emotion.name} value={emotion.name}>
            {emotion.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}