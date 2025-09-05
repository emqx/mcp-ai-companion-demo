export function WaveAnimation() {
  return (
    <div className="gap-x-1.5 flex items-center mr-3 flex-shrink-0 mt-1">
      <div 
        className="w-3 bg-[#d991c2] h-3 rounded-full"
        style={{
          animation: 'bounce 1s ease-in-out 0s infinite alternate, pulse 1.5s ease-in-out infinite'
        }}
      ></div>
      <div 
        className="w-3 h-3 bg-[#9869b8] rounded-full"
        style={{
          animation: 'bounce 1s ease-in-out 0.15s infinite alternate, pulse 1.5s ease-in-out 0.2s infinite'
        }}
      ></div>
      <div 
        className="w-3 h-3 bg-[#6756cc] rounded-full"
        style={{
          animation: 'bounce 1s ease-in-out 0.3s infinite alternate, pulse 1.5s ease-in-out 0.4s infinite'
        }}
      ></div>
    </div>
  )
}