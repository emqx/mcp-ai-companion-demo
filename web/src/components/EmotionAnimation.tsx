import { useRive, useStateMachineInput, Layout, Fit, Alignment } from '@rive-app/react-canvas'
import { useEffect } from 'react'

interface EmotionAnimationProps {
  emotion: string;
  type?: 'rive' | 'gif'
}

const createAssetUrl = (filename: string) => new URL(`../assets/animations/${filename}`, import.meta.url).href

const emotionFileMap: { [key: string]: string } = {
  'happy': createAssetUrl('happy 1.gif'),
  'laug': createAssetUrl('laug 2.gif'),
  'surprised': createAssetUrl('surprised 3.gif'),
  'tired': createAssetUrl('tired 4.gif'),
  'disappointed': createAssetUrl('disappointed 5.gif'),
  'shy': createAssetUrl('shy6.gif'),
  'thinking': createAssetUrl('thinking 7.gif'),
  'playful': createAssetUrl('playful 8.gif'),
  'sad': createAssetUrl('sad 9.gif'),
  'relaxed': createAssetUrl('relaxed 10.gif'),
  'serious': createAssetUrl('serious 11.gif'),
  'angry': createAssetUrl('anggry 12.gif')
}

function GifAnimation({ emotion }: { emotion: string }) {
  const gifSrc = emotionFileMap[emotion] || emotionFileMap['happy']
  
  return (
    <img 
      src={gifSrc}
      alt={`${emotion} animation`}
      className="w-[180px] h-[180px] block object-contain"
    />
  )
}

function RiveAnimationInner({ emotion }: { emotion: string }) {
  const { rive, RiveComponent } = useRive({
    src: new URL('../assets/animations/expression_04_状态机_2.riv', import.meta.url).href,
    stateMachines: 'State Machine 1',
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center
    }),
    onLoad: (instance: any) => {
      console.log(instance)
      console.log(`[RiveAnimation] animation loaded successfully!`)
      setTimeout(() => {
        if (rive) {
          console.log('[RiveAnimation] State machines:', rive.stateMachineNames)
          if (rive.stateMachineNames && rive.stateMachineNames.length > 0) {
            const smName = rive.stateMachineNames[0]
            const inputs = rive.stateMachineInputs(smName)
            console.log(`[RiveAnimation] Inputs for "${smName}":`, inputs ? Object.keys(inputs) : 'none')
          }
        }
      }, 100)
    },
    onLoadError: (error) => {
      console.error(`[RiveAnimation] Failed to load ${emotion} animation:`, error)
    },
  })

  const emotionInput = useStateMachineInput(rive, 'State Machine 1', 'Number 1')

  useEffect(() => {
    console.log(`[RiveAnimation] emotionInput:`, emotionInput, 'for emotion:', emotion)
    console.log(emotionInput)
    
    if (rive && !emotionInput) {
      console.log('[RiveAnimation] Available state machines:', rive.stateMachineNames)
      if (rive.stateMachineNames && rive.stateMachineNames.length > 0) {
        const smName = rive.stateMachineNames[0]
        const inputs = rive.stateMachineInputs(smName)
        console.log(`[RiveAnimation] Available inputs for "${smName}":`, inputs ? Object.keys(inputs) : 'none')
        if (inputs) {
          console.log(`[RiveAnimation] Input details:`, inputs)
        }
      }
    }
    
    if (emotionInput) {
      const emotionMap: { [key: string]: number } = {
        'happy': 1,
        'laug': 2,
        'surprised': 3,
        'tired': 4,
        'disappointed': 5,
        'shy': 6,
        'thinking': 7,
        'playful': 8,
        'sad': 9,
        'hesitate': 10,
        'relaxed': 10,
        'serious': 11,
        'angry': 12
      }
      
      const emotionValue = emotionMap[emotion]
      console.log(`${emotion} ${emotionValue}`)
      if (emotionValue !== undefined) {
        emotionInput.value = emotionValue
        console.log(`[RiveAnimation] Set emotion to ${emotionValue} (${emotion})`)
      }
    }
  }, [emotionInput, emotion, rive])

  return (
    <RiveComponent 
      style={{ 
        width: '180px', 
        height: '180px', 
        display: 'block'
      }} 
    />
  )
}

export function EmotionAnimation({ emotion, type = 'gif' }: EmotionAnimationProps) {
  if (type === 'rive') {
    return <RiveAnimationInner emotion={emotion} />
  }
  
  return <GifAnimation emotion={emotion} />
}