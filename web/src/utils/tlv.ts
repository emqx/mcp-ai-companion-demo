export const stringToTlv = (value: string, type: string) => {
  const typeBuffer = new Uint8Array(4)

  for (let i = 0; i < type.length; i += 1) {
    typeBuffer[i] = type.charCodeAt(i)
  }

  const encodedValue = new TextEncoder().encode(value)
  const lengthBuffer = new Uint32Array([encodedValue.length])
  const tlvBuffer = new Uint8Array(typeBuffer.length + 4 + encodedValue.length)

  tlvBuffer.set(typeBuffer, 0)
  tlvBuffer[4] = (lengthBuffer[0] >> 24) & 0xff
  tlvBuffer[5] = (lengthBuffer[0] >> 16) & 0xff
  tlvBuffer[6] = (lengthBuffer[0] >> 8) & 0xff
  tlvBuffer[7] = lengthBuffer[0] & 0xff
  tlvBuffer.set(encodedValue, 8)

  return tlvBuffer.buffer
}

export const tlvToString = (buffer: ArrayBufferLike) => {
  const typeBuffer = new Uint8Array(buffer, 0, 4)
  const lengthBuffer = new Uint8Array(buffer, 4, 4)
  const valueBuffer = new Uint8Array(buffer, 8)

  let type = ''
  for (let i = 0; i < typeBuffer.length; i += 1) {
    type += String.fromCharCode(typeBuffer[i])
  }

  const length =
    (lengthBuffer[0] << 24) | (lengthBuffer[1] << 16) | (lengthBuffer[2] << 8) | lengthBuffer[3]
  const value = new TextDecoder().decode(valueBuffer.subarray(0, length))

  return { type, value }
}
