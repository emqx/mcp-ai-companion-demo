import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas'

interface RiveAnimationProps {
  emotion: string
}

function RiveAnimationInner({ emotion }: { emotion: string }) {
  const { RiveComponent } = useRive({
    src: `/src/assets/animations/${emotion}.riv`,
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center
    }),
    onLoad: () => {
      console.log(`[RiveAnimation] ${emotion} animation loaded successfully!`)
    },
    onLoadError: (error) => {
      console.error(`[RiveAnimation] Failed to load ${emotion} animation:`, error)
    },
  })

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

export function RiveAnimation({ emotion }: RiveAnimationProps) {
  return (
    <RiveAnimationInner key={emotion} emotion={emotion} />
  )
}