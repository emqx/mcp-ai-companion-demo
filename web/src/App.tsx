import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">Hello World</h1>
      
      <div className="space-y-4">
        <Button>Click me</Button>
        <Button variant="outline">Outline Button</Button>
        <Button variant="secondary">Secondary Button</Button>
      </div>
    </div>
  )
}

export default App
