import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Emotion {
  name: string
  labelKey: string
}

interface EmotionSelectorProps {
  onEmotionSelect: (emotion: string) => void
  selectedEmotion: string
}

const emotions: Emotion[] = [
  { name: 'happy', labelKey: 'emotion.happy' },
  { name: 'sad', labelKey: 'emotion.sad' },
  { name: 'angry', labelKey: 'emotion.angry' },
  { name: 'surprised', labelKey: 'emotion.surprised' },
  { name: 'thinking', labelKey: 'emotion.thinking' },
  { name: 'shy', labelKey: 'emotion.shy' },
  { name: 'relaxed', labelKey: 'emotion.relaxed' },
  { name: 'playful', labelKey: 'emotion.playful' },
  { name: 'tired', labelKey: 'emotion.tired' },
  { name: 'serious', labelKey: 'emotion.serious' },
  { name: 'disappointed', labelKey: 'emotion.disappointed' },
  { name: 'laughing', labelKey: 'emotion.laughing' },
]

export function EmotionSelector({ onEmotionSelect, selectedEmotion }: EmotionSelectorProps) {
  const { t } = useTranslation()

  return (
    <Select value={selectedEmotion} onValueChange={onEmotionSelect}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder={t('emotion.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {emotions.map((emotion) => (
          <SelectItem key={emotion.name} value={emotion.name}>
            {t(emotion.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
