const baseInterruptKeywords = [
  '暂停',
  '暂停一下',
  '停止',
  '停一下',
  '先停一下',
  '先别说',
  '别说了',
  '别继续',
  '打断',
  '打住',
  '可以了',
  '好了',
  '够了',
  '下一个',
  '下一项',
  '换一个',
  '我知道了',
  '谢谢',
  '收到',
  '知道了',
  '不用了',
  '行了',
  '先这样',
  '听到了',
  '听够了',
  '等一下',
  '稍等一下',
  '别说话',
  '不用继续',
  '够啦',
  '停下',
  '不想听了',
  '故事先这样',
  '先讲到这里',
  '换个话题',
  '后面不用说了',
  '休息一下',
  '我累了',
  '先停一会儿',
  '可以换别的',
  '不用重复',
  '我知道接下来',
  '先告一段落',
  '到此为止',
  '别讲故事了',
  '先聊别的',
  '停一停',
  '静一下',
  '安静一下',
  '冷静一下',
  'quiet please',
  'stop talking',
  'that is enough',
  'no more',
  'all good',
  'we are good',
  'you can pause',
  'please wait',
  'i am good',
  'i heard enough',
  'tell me later',
  'change topic',
  'not interested',
  'story can stop',
  'take a break',
  'let us pause',
  'Stop',
  'Hold on',
  'Pause',
  'Wait',
  'Enough',
  'Next one',
  'You can stop now',
] as const

const politePrefixes = [
  '好',
  '好的',
  '好吧',
  '好啦',
  '行',
  '行吧',
  '行啦',
  '行了',
  '嗯',
  '嗯好',
  'OK',
  'Ok',
  'ok',
  'okay',
  'Alright',
  'alright',
  'sure',
] as const
const politeSuffixes = ['吧', '啦', '了'] as const

const punctuationPattern = /[，。,\.!?！？]/g
const whitespacePattern = /\s+/g

const normalize = (phrase: string) => phrase.replace(punctuationPattern, '').replace(whitespacePattern, '')
const toAsciiLower = (phrase: string) => {
  const lowered = phrase.toLowerCase()
  return /[a-z]/i.test(phrase) ? lowered : phrase
}

const keywordSet = new Set<string>()

const addKeyword = (phrase: string) => {
  const trimmed = phrase.trim()
  if (!trimmed) return
  keywordSet.add(trimmed)
  keywordSet.add(normalize(trimmed))
  keywordSet.add(toAsciiLower(trimmed))
}

baseInterruptKeywords.forEach((phrase) => {
  addKeyword(phrase)
  politePrefixes.forEach((prefix) => {
    addKeyword(`${prefix}${phrase}`)
    addKeyword(`${prefix}，${phrase}`)
    addKeyword(`${prefix}${normalize(phrase)}`)
  })
  politeSuffixes.forEach((suffix) => {
    addKeyword(`${phrase}${suffix}`)
    addKeyword(`${normalize(phrase)}${suffix}`)
  })
})

export const semanticInterruptKeywords = Array.from(keywordSet)
export { baseInterruptKeywords }
