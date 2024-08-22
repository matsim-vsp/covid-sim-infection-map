// --- WORKER PREAMBLE ---------------------------------------
// This lets typescript know we are in a worker, not a window
const ctx: Worker = self as any
// make the typescript compiler happy on import
export default null as any
// -----------------------------------------------------------
import pako from 'pako'
import Papa from '@simwrapper/papaparse'

// read one chunk at a time. This sends backpressure to the server
const strategy = new CountQueuingStrategy({ highWaterMark: 1 })

// 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
const MAX_CHUNK_SIZE = 1024 * 1024 * 8

let _numChunks = 0
let _dataLength = 0
let _isCancelled = false
let _leftOvers = ''
let _decoder = new TextDecoder()
let _options = {} as any
let _header = null as any

onmessage = async ({ data: { url, options } }: MessageEvent) => {
  try {
    _options = options

    const response = await fetch(url)
    const blob = await response.blob()
    const stream = blob.stream()
    if (!stream) throw Error('STREAM is null')

    await stream.pipeTo(streamProcessorWithBackPressure)

    ctx.postMessage({ finished: true })

    // stream will handle things from here
  } catch (e) {
    ctx.postMessage({ error: 'Error loading ' + url + ' :: ' + e })
  }
}

// Pako library has gunzip chunking mode built in!
let _isGzipped = false

const _gunzipper = new pako.Inflate({ to: 'string', chunkSize: 1024 * 256 })
const _queue = [] as any[]

_gunzipper.onData = (chunk: any) => {
  _queue.push(chunk)
}

_gunzipper.onEnd = (status: number) => {
  console.log('gzipper onEnd', status)
}

const handleText = async (chunkText: string) => {
  // reconstruct first line taking mid-line breaks into account
  let text = _leftOvers + chunkText

  // clip last line; it may be incomplete
  const lastLF = text.lastIndexOf('\n')
  _leftOvers = text.slice(lastLF + 1)
  text = text.slice(0, lastLF)

  // manage header line - need to re-insert it for each chunk
  if (_options.header) {
    if (_header) {
      text = _header + text
    } else {
      _header = text.substring(0, 1 + text.indexOf('\n'))
    }
  }
  // Papaparse that text!
  const result = Papa.parse(text, _options)

  postMessage({ data: result.data })
}

const streamProcessorWithBackPressure = new WritableStream(
  {
    // Stream calls write() for every new chunk from fetch call:
    write(entireChunk: Uint8Array) {
      return new Promise(async (resolve, reject) => {
        if (_isCancelled) reject()

        const parseIt = async (smallChunk: Uint8Array, chunkId: number) => {
          if (_isCancelled) reject()

          // check for gzip at start
          if (_numChunks == 1) {
            const header = new Uint8Array(smallChunk.buffer.slice(0, 2))
            if (header[0] === 0x1f && header[1] === 0x8b) _isGzipped = true
          }

          if (_isGzipped) {
            _gunzipper.push(smallChunk)

            while (_queue.length) {
              const text = _queue.shift()
              await handleText(text)
            }
            // console.log('queue empty')
          } else {
            const chunkText = _decoder.decode(smallChunk)
            handleText(chunkText)
          }
        }

        _numChunks++
        _dataLength += entireChunk.length
        let startOffset = 0

        // console.log('got chunk', _numChunks)

        while (!_isCancelled && startOffset < entireChunk.length) {
          const subchunk = entireChunk.subarray(startOffset, startOffset + MAX_CHUNK_SIZE)
          if (subchunk.length) await parseIt(subchunk, _numChunks)
          startOffset += MAX_CHUNK_SIZE
        }
        resolve()
      })
    },

    close() {
      console.log('STREAM FINISHED!')
    },
    abort(err) {
      console.log('STREAM error:', err)
    },
  },
  strategy
)
