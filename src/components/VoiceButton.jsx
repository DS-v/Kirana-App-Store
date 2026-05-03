import { useState, useRef } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { isSpeechSupported, createRecognition } from '../utils/speech'

export default function VoiceButton({ onResult, onInterim, size = 'md', label = 'Speak' }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef(null)

  if (!isSpeechSupported()) return null

  const sizes = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
  }

  function start() {
    const rec = createRecognition()
    if (!rec) return
    recRef.current = rec

    rec.onstart = () => setListening(true)
    rec.onend = () => { setListening(false); setInterim('') }
    rec.onerror = () => { setListening(false); setInterim('') }

    rec.onresult = (e) => {
      const results = Array.from(e.results)
      const interimText = results.map(r => r[0].transcript).join(' ')
      setInterim(interimText)
      onInterim?.(interimText)

      const final = results.find(r => r.isFinal)
      if (final) {
        onResult?.(final[0].transcript.trim())
        setInterim('')
      }
    }

    rec.start()
  }

  function stop() {
    recRef.current?.stop()
    setListening(false)
    setInterim('')
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        className={`${sizes[size]} rounded-full flex items-center justify-center shadow-lg transition-all
          ${listening
            ? 'bg-red-500 voice-active'
            : 'bg-green-600 active:scale-95'
          }`}
        aria-label={listening ? 'Listening…' : label}
      >
        {listening
          ? <MicOff size={size === 'lg' ? 28 : 22} className="text-white" />
          : <Mic size={size === 'lg' ? 28 : 22} className="text-white" />
        }
      </button>
      {interim && (
        <p className="text-sm text-gray-500 italic text-center max-w-xs">{interim}…</p>
      )}
      {!listening && (
        <span className="text-xs text-gray-400">Hold to speak</span>
      )}
    </div>
  )
}
