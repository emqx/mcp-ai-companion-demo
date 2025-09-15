import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { MqttConfig, IceServersConfig } from '@/utils/storage'
import { clearMqttConfig, saveIceServersConfig, loadIceServersConfig, clearIceServersConfig } from '@/utils/storage'
import { defaultMqttConfig } from '@/config/mqtt'
import { getDefaultIceServersConfig } from '@/utils/ice-servers'

interface NetworkSettingsProps {
  config: MqttConfig
  onConfigChange: (config: MqttConfig) => void
  isConnected: boolean
}

export function NetworkSettings({ config, onConfigChange }: NetworkSettingsProps) {
  const [tempConfig, setTempConfig] = useState<MqttConfig>(
    config || {
      brokerUrl: '',
      username: '',
      password: '',
      connectTimeout: 4000,
      reconnectPeriod: 1000,
    },
  )
  const [iceServersConfig, setIceServersConfig] = useState<IceServersConfig>(() => {
    const saved = loadIceServersConfig()
    return saved || getDefaultIceServersConfig()
  })
  const [isOpen, setIsOpen] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)

  useEffect(() => {
    if (config) {
      setTempConfig(config)
    }
  }, [config])

  const handleSave = () => {
    setShowSaveDialog(true)
  }

  const confirmSave = () => {
    onConfigChange(tempConfig)
    saveIceServersConfig(iceServersConfig)
    toast.success('配置已保存，页面即将刷新')
    setIsOpen(false)
    setShowSaveDialog(false)
    // 延迟刷新让用户看到提示
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  const handleResetToDefault = () => {
    setShowResetDialog(true)
  }

  const confirmReset = () => {
    const defaultConfig: MqttConfig = {
      brokerUrl: defaultMqttConfig.brokerUrl,
      username: defaultMqttConfig.username,
      password: defaultMqttConfig.password,
      connectTimeout: defaultMqttConfig.connectTimeout,
      reconnectPeriod: defaultMqttConfig.reconnectPeriod,
    }
    const defaultIceServers: IceServersConfig = getDefaultIceServersConfig()
    setTempConfig(defaultConfig)
    setIceServersConfig(defaultIceServers)
    onConfigChange(defaultConfig)
    clearMqttConfig()
    clearIceServersConfig()
    toast.success('已恢复默认配置，页面即将刷新')
    setIsOpen(false)
    setShowResetDialog(false)
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" title="网络设置">
            <Settings className="h-5 w-5" />
          </Button>
        </SheetTrigger>

        <SheetContent className="flex flex-col w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>设置</SheetTitle>
            <SheetDescription>配置 MQTT 连接和 WebRTC ICE 服务器</SheetDescription>
          </SheetHeader>

          <form className="flex-1 flex flex-col py-6 px-4 overflow-y-auto" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-base font-semibold">MQTT 配置</h3>

                <div>
                  <Label htmlFor="brokerUrl" className="text-sm font-medium">
                    Broker URL
                  </Label>
                  <Input
                    id="brokerUrl"
                    value={tempConfig.brokerUrl}
                    onChange={(e) => setTempConfig({ ...tempConfig, brokerUrl: e.target.value })}
                    placeholder="ws://broker.emqx.io:8083/mqtt"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="username" className="text-sm font-medium">
                    用户名
                  </Label>
                  <Input
                    id="username"
                    value={tempConfig.username}
                    onChange={(e) => setTempConfig({ ...tempConfig, username: e.target.value })}
                    placeholder="emqx-mcp-webrtc-web-ui"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm font-medium">
                    密码
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={tempConfig.password}
                    onChange={(e) => setTempConfig({ ...tempConfig, password: e.target.value })}
                    placeholder="public"
                    autoComplete="current-password"
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <h3 className="text-base font-semibold">WebRTC ICE Servers 配置</h3>

                <div>
                  <Label htmlFor="turnUrl" className="text-sm font-medium">
                    TURN 服务器地址
                  </Label>
                  <Input
                    id="turnUrl"
                    value={iceServersConfig.turnUrl || ''}
                    onChange={(e) => setIceServersConfig({ ...iceServersConfig, turnUrl: e.target.value })}
                    placeholder={`turn:${window.location.hostname}:13478`}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="turnUsername" className="text-sm font-medium">
                    TURN 用户名
                  </Label>
                  <Input
                    id="turnUsername"
                    value={iceServersConfig.turnUsername || ''}
                    onChange={(e) => setIceServersConfig({ ...iceServersConfig, turnUsername: e.target.value })}
                    placeholder=""
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="turnPassword" className="text-sm font-medium">
                    TURN 密码
                  </Label>
                  <Input
                    id="turnPassword"
                    type="password"
                    value={iceServersConfig.turnPassword || ''}
                    onChange={(e) => setIceServersConfig({ ...iceServersConfig, turnPassword: e.target.value })}
                    placeholder=""
                    autoComplete="new-password"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="stunUrl" className="text-sm font-medium">
                    STUN 服务器地址（可选，不设置将使用默认）
                  </Label>
                  <Input
                    id="stunUrl"
                    value={iceServersConfig.stunUrl || ''}
                    onChange={(e) => setIceServersConfig({ ...iceServersConfig, stunUrl: e.target.value })}
                    placeholder="stun:demo.emqx.com:13478"
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          </form>

          <div className="p-4">
            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                className="flex-1 text-white"
                style={{ backgroundColor: '#5E4EFF' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4A3EE6')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#5E4EFF')}
              >
                保存配置
              </Button>
              <Button
                variant="outline"
                onClick={handleResetToDefault}
                className="flex-1 hover:bg-gray-50"
                style={{ borderColor: '#5E4EFF', color: '#5E4EFF' }}
              >
                恢复默认
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Save Confirmation Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认保存配置</AlertDialogTitle>
            <AlertDialogDescription>保存配置将断开所有连接并刷新页面，确认继续？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSave}
              style={{ backgroundColor: '#5E4EFF' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4A3EE6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#5E4EFF')}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认恢复默认配置</AlertDialogTitle>
            <AlertDialogDescription>恢复默认配置将断开所有连接并刷新页面，确认继续？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReset}
              style={{ backgroundColor: '#5E4EFF' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4A3EE6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#5E4EFF')}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
