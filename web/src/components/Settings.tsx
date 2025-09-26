import { useState, useEffect } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
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
import { appLogger } from '@/utils/logger'

interface SettingsProps {
  config: MqttConfig
  onConfigChange: (config: MqttConfig) => void
  isConnected: boolean
  className?: string
}

const languages = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
]

const voiceOptions = [{ value: 'longhua_v2', name: 'Longhua V2 (Chinese)' }]

export function Settings({ config, onConfigChange, className }: SettingsProps) {
  const { t, i18n } = useTranslation()
  const [tempConfig, setTempConfig] = useState<MqttConfig>(
    config || {
      brokerUrl: '',
      username: '',
      password: '',
      connectTimeout: 4000,
      reconnectPeriod: 1000,
    },
  )
  const [tempLanguage, setTempLanguage] = useState<string>(i18n.language)
  const [currentVoice, setCurrentVoice] = useState<string>('longhua_v2')
  const [tempVoice, setTempVoice] = useState<string>('longhua_v2')
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

  useEffect(() => {
    setTempLanguage(i18n.language)
  }, [i18n.language])

  useEffect(() => {
    const fetchCurrentVoice = async () => {
      try {
        const response = await fetch('/api/get_tts_voice')
        const data = await response.json()
        if (data.voice_type) {
          setCurrentVoice(data.voice_type)
          setTempVoice(data.voice_type)
        }
      } catch (error) {
        console.error('Failed to fetch current voice:', error)
      }
    }
    fetchCurrentVoice()
  }, [])

  const handleLanguageChange = (newLanguage: string) => {
    setTempLanguage(newLanguage)
  }

  const handleSave = () => {
    setShowSaveDialog(true)
  }

  const confirmSave = async () => {
    // Change language if it's different
    if (tempLanguage !== i18n.language) {
      i18n.changeLanguage(tempLanguage)
    }

    // Change voice if it's different
    if (tempVoice !== currentVoice) {
      try {
        const response = await fetch('/api/set_tts_voice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ voice_type: tempVoice }),
        })
        const data = await response.json()
        if (data.success) {
          setCurrentVoice(tempVoice)
          appLogger.info(`TTS Voice changed to ${tempVoice}`)
        }
      } catch (error) {
        console.error('Failed to change voice:', error)
      }
    }

    onConfigChange(tempConfig)
    saveIceServersConfig(iceServersConfig)
    toast.success(t('settings.configSaved'))
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

    // Reset language to default (English)
    setTempLanguage('en')
    i18n.changeLanguage('en')

    setTempConfig(defaultConfig)
    setIceServersConfig(defaultIceServers)
    onConfigChange(defaultConfig)
    clearMqttConfig()
    clearIceServersConfig()
    toast.success(t('settings.configReset'))
    setIsOpen(false)
    setShowResetDialog(false)
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset temp values when closing without saving
      setTempLanguage(i18n.language)
      setTempVoice(currentVoice)
    }
    setIsOpen(open)
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-10 w-10 rounded-full ${className || ''}`}
            title={t('settings.title')}
          >
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </SheetTrigger>

        <SheetContent className="flex flex-col w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t('settings.title')}</SheetTitle>
            <SheetDescription></SheetDescription>
          </SheetHeader>

          <form className="flex-1 flex flex-col py-6 px-4 overflow-y-auto" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-base font-semibold">{t('settings.language')}</h3>
                <Select value={tempLanguage} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold">{t('settings.ttsVoice', 'TTS Voice')}</h3>
                <Select value={tempVoice} onValueChange={setTempVoice}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {voiceOptions.map((voice) => (
                      <SelectItem key={voice.value} value={voice.value}>
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold">{t('settings.mqtt')}</h3>

                <div>
                  <Label htmlFor="brokerUrl" className="text-sm font-medium">
                    {t('settings.broker')}
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
                    Username
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
                    Password
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
                <h3 className="text-base font-semibold">{t('settings.webrtcIceServers')}</h3>

                <div>
                  <Label htmlFor="turnUrl" className="text-sm font-medium">
                    {t('settings.turnServerUrl')}
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
                    {t('settings.turnUsername')}
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
                    {t('settings.turnPassword')}
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
                    {t('settings.stunServerUrl')}
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
                {t('common.save')}
              </Button>
              <Button
                variant="outline"
                onClick={handleResetToDefault}
                className="flex-1 hover:bg-gray-50"
                style={{ borderColor: '#5E4EFF', color: '#5E4EFF' }}
              >
                {t('common.resetToDefault')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Save Confirmation Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.saveConfigTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.saveConfigDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSave}
              style={{ backgroundColor: '#5E4EFF' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4A3EE6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#5E4EFF')}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.resetConfigTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.resetConfigDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReset}
              style={{ backgroundColor: '#5E4EFF' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4A3EE6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#5E4EFF')}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
