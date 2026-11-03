export type BERElement = {
  tag: number
  value: Buffer
}

// Security limits applied while decoding
export const MAX_FRAME_SIZE = 64 * 1024 // 64 KiB per LDAP frame
const MAX_BER_SEQUENCE_ELEMENTS = 200
const MAX_INTEGER_BYTES = 4 // limit BER integer byte length

export class BERReader {
  private offset = 0

  constructor(private readonly buffer: Buffer) {}

  readAll() {
    const elements: BERElement[] = []

    while (this.offset < this.buffer.length) {
      if (elements.length >= MAX_BER_SEQUENCE_ELEMENTS) {
        throw new Error('BER sequence contains too many elements')
      }
      elements.push(this.readElement())
    }

    return elements
  }

  readSequence(tag = 0x30) {
    const element = this.readElement()

    if (element.tag !== tag) {
      throw new Error(`Expected BER tag 0x${tag.toString(16)}, got 0x${element.tag.toString(16)}`)
    }

    return new BERReader(element.value).readAll()
  }

  readInteger() {
    const element = this.readElement()

    if (element.tag !== 0x02 && element.tag !== 0x0a) {
      throw new Error(`Expected integer, got 0x${element.tag.toString(16)}`)
    }

    if (element.value.length > MAX_INTEGER_BYTES) {
      throw new Error('Integer too large')
    }

    let value = 0
    for (const byte of element.value) {
      value = (value << 8) | byte
    }

    return value
  }

  readBoolean() {
    const element = this.readElement()

    if (element.tag !== 0x01 || element.value.length !== 1) {
      throw new Error('Expected boolean')
    }

    return element.value[0] !== 0
  }

  readString() {
    const element = this.readElement()

    if (element.tag !== 0x04) {
      throw new Error(`Expected string, got 0x${element.tag.toString(16)}`)
    }

    return element.value.toString('utf8')
  }

  readElement(): BERElement {
    if (this.offset + 2 > this.buffer.length) {
      throw new Error('Incomplete BER element')
    }

    const tag = this.buffer[this.offset]

    if (tag == null) {
      throw new Error('Incomplete BER element')
    }
    const length = readLength(this.buffer, this.offset + 1)

    if (!length || this.offset + 1 + length.bytes + length.value > this.buffer.length) {
      throw new Error('Invalid BER length')
    }

    if (length.value > MAX_FRAME_SIZE) {
      throw new Error('Invalid BER length')
    }

    const valueStart = this.offset + 1 + length.bytes
    const valueEnd = valueStart + length.value
    this.offset = valueEnd

    return {
      tag,
      value: this.buffer.subarray(valueStart, valueEnd),
    }
  }
}

export function readLength(buffer: Buffer, offset: number) {
  const first = buffer[offset]

  if (first == null) {
    return
  }

  if (!(first & 0x80)) {
    return { bytes: 1, value: first }
  }

  const byteCount = first & 0x7f

  if (!byteCount || byteCount > 4 || offset + byteCount >= buffer.length) {
    return
  }

  let value = 0

  for (let index = 0; index < byteCount; index += 1) {
    const byte = buffer[offset + 1 + index]

    if (byte == null) {
      return
    }

    value = (value << 8) | byte
  }

  // Prevent too large length values from being processed
  if (value > MAX_FRAME_SIZE) {
    return
  }

  return { bytes: 1 + byteCount, value }
}

export function berSequence(children: Buffer[]) {
  return berTLV(0x30, Buffer.concat(children))
}

export function berSet(children: Buffer[]) {
  return berTLV(0x31, Buffer.concat(children))
}

function encodeIntegerBytes(value: number) {
  const bytes: number[] = []
  let remaining = value

  // add bytes to array until we have no more remaining value
  do {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8 // shift right by 8 bits to get the next byte
  } while (remaining)

  if ((bytes[0] ?? 0) & 0x80) {
    bytes.unshift(0)
  }

  return Buffer.from(bytes)
}

export function berInteger(value: number) {
  return berTLV(0x02, encodeIntegerBytes(value))
}

// same as berInteger but with tag 0x0a for enumerated type
export function berEnumerated(value: number) {
  return berTLV(0x0a, encodeIntegerBytes(value))
}

export function berOctetString(value: string | Buffer) {
  return berTLV(0x04, Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'))
}

// TLV stands for tag+length+value
export function berTLV(tag: number, value: Buffer) {
  return Buffer.concat([Buffer.from([tag]), berLength(value.length), value])
}

function berLength(length: number) {
  // For lengths less than 128, the length is encoded in a single byte
  if (length < 0x80) {
    return Buffer.from([length])
  }

  const bytes: number[] = []
  let remaining = length

  while (remaining) {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8
  }

  // For lengths 128 or greater
  // the length is as a leading byte with the high bit set
  // and the low 7 bits indicating the number of subsequent bytes that encode the length,
  // followed by the length bytes
  return Buffer.from([0x80 | bytes.length, ...bytes])
}
