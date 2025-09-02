import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { defaultMqttConfig } from '@/config/mqtt'
import { toast } from 'sonner'

interface MqttSettings {
  brokerUrl: string
  username: string
  password: string
}

interface SettingsDrawerProps {
  onSettingsUpdate?: (settings: MqttSettings) => void
}

export function SettingsDrawer({ onSettingsUpdate }: SettingsDrawerProps) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<MqttSettings>({
    brokerUrl: defaultMqttConfig.brokerUrl,
    username: defaultMqttConfig.username,
    password: defaultMqttConfig.password,
  })

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('mqttSettings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings(parsed)
      } catch (error) {
        console.error('Failed to parse saved settings:', error)
      }
    }
  }, [])

  const handleSave = () => {
    // Parse URL to validate format
    try {
      const url = new URL(settings.brokerUrl)
      if (!url.protocol.startsWith('ws') && !url.protocol.startsWith('mqtt')) {
        throw new Error('URL must use ws://, wss://, mqtt://, or mqtts:// protocol')
      }
    } catch (error) {
      toast.error('Invalid broker URL format')
      return
    }

    // Save to localStorage
    localStorage.setItem('mqttSettings', JSON.stringify(settings))
    
    // Update the default config (this will be used by new connections)
    Object.assign(defaultMqttConfig, {
      brokerUrl: settings.brokerUrl,
      username: settings.username,
      password: settings.password,
    })

    // Notify parent component
    onSettingsUpdate?.(settings)
    
    toast.success('MQTT settings updated successfully')
    setOpen(false)
  }

  const handleReset = () => {
    const defaultSettings = {
      brokerUrl: 'ws://broker.emqx.io:8083/mqtt',
      username: 'emqx-mcp-webrtc-web-ui',
      password: 'public',
    }
    setSettings(defaultSettings)
    toast.info('Reset to default settings')
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 rounded-full hover:bg-gray-100 cursor-pointer"
        >
          <Settings className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] flex flex-col h-full">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="text-xl font-semibold">MQTT Settings</SheetTitle>
          <SheetDescription className="text-sm text-gray-600">
            Configure your MQTT broker connection settings
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="brokerUrl" className="text-sm font-medium text-gray-700">
                Broker URL
              </Label>
              <Input
                id="brokerUrl"
                placeholder="ws://broker.emqx.io:8083/mqtt"
                value={settings.brokerUrl}
                onChange={(e) => setSettings({ ...settings, brokerUrl: e.target.value })}
                className="h-11 text-sm"
              />
              <p className="text-xs text-gray-500">
                WebSocket URL for MQTT broker (ws:// or wss://)
              </p>
            </div>
            
            <div className="space-y-3">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                Username
              </Label>
              <Input
                id="username"
                placeholder="Enter username"
                value={settings.username}
                onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                className="h-11 text-sm"
              />
            </div>
            
            <div className="space-y-3">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={settings.password}
                onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                className="h-11 text-sm"
              />
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="space-y-3">
            <Button 
              variant="outline" 
              onClick={handleReset}
              className="w-full h-11 text-sm"
            >
              Reset to Default
            </Button>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setOpen(false)}
                className="flex-1 h-11 text-sm"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="flex-1 h-11 text-sm bg-blue-600 hover:bg-blue-700 text-white"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}