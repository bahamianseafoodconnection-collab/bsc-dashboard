'use client'

import { useState, useRef, useEffect } from 'react'
import BriefPanel from './BriefPanel'

interface Message {
  role: 'user' | 'assistant'
  content: string
  webSearchUsed?: boolean
  timestamp?: Date
}

const INTELLIGENCE_LAYERS = [
  { id: 'bsc', label: 'BSC Core', description: 'Operations, pricing, processing, export', color: '#f5c518', icon: '🦞' },
  { id: 'species', label: 'Species Intel', description: 'Identification, arbitrage, regional pricing', color: '#4ade80', icon: '🐟' },
  { id: 'trace', label: 'Traceability', description: 'Chain of custody, compliance, audit', color: '#60a5fa', icon: '📍' },
  { id: 'cultivate', label: 'Cultivation', description: 'R&D intelligence, cost reduction, demand', color: '#c084fc', icon: '🔬' }
]

const SUGGESTED_QUESTIONS = [
  'What seafood species has the highest arbitrage opportunity from the Bahamas right now?',
  'How do I trace a batch of spiny lobster from boat to US export?',
  'What is the current global price of wahoo and where should BSC sell it?',
  'Which species should BSC consider for cultivation to reduce COGS?',
  'What are the CITES regulations for queen conch export to the US?',
  'How does lionfish compare to grouper in flavor and what restaurants want it?',
  'What are BSC\'s pricing margins and how do I calculate them?',
  'When does lobster season open and how should BSC pre-sell?'
]

function generateSessionId(): string {
  return `bsc-founder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

interface PendingImage {
  preview: string       // object URL for thumbnail
  media_type: string    // e.g. image/jpeg
  data: string          // base64, no `data:` prefix
}

// Read a File as base64 (without the `data:...,` prefix).
function fileToBase64(file: File): Promise<{ media_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma  = result.indexOf(',')
      if (comma < 0) { reject(new Error('unexpected dataURL format')); return }
      resolve({ media_type: file.type || 'image/jpeg', data: result.slice(comma + 1) })
    }
    reader.readAsDataURL(file)
  })
}

export default function FounderAIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(generateSessionId)
  const [isSearching, setIsSearching] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([])
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { media_type, data } = await fileToBase64(file)
      setPendingImages(prev => [...prev, { preview: URL.createObjectURL(file), media_type, data }])
    } catch (err) {
      console.error('image pick failed', err)
    } finally {
      // allow re-selecting the same file later
      if (e.target) e.target.value = ''
    }
  }

  function removePendingImage(idx: number) {
    setPendingImages(prev => {
      const next = prev.slice()
      const [removed] = next.splice(idx, 1)
      if (removed) URL.revokeObjectURL(removed.preview)
      return next
    })
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!loading && inputRef.current) inputRef.current.focus()
  }, [loading])

  async function sendMessage(text?: string) {
    const messageText = text || input.trim()
    // Allow image-only sends: as long as there's text OR at least one image.
    if ((!messageText && pendingImages.length === 0) || loading) return

    const imagesToSend = pendingImages.map(({ media_type, data }) => ({ media_type, data }))
    const displayText = messageText || (pendingImages.length > 0 ? `📷 ${pendingImages.length} image${pendingImages.length === 1 ? '' : 's'} attached` : '')

    setMessages(prev => [...prev, { role: 'user', content: displayText, timestamp: new Date() }])
    setInput('')
    pendingImages.forEach(p => URL.revokeObjectURL(p.preview))
    setPendingImages([])
    setLoading(true)
    setIsSearching(false)

    const searchTimer = setTimeout(() => setIsSearching(true), 1500)

    try {
      const response = await fetch('/api/founder-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText || '(image attached)', sessionId, conversationHistory, images: imagesToSend })
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        webSearchUsed: data.webSearchUsed,
        timestamp: new Date()
      }])

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: messageText },
        { role: 'assistant', content: data.message }
      ])

    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Intelligence engine encountered an error. Please try again.',
        timestamp: new Date()
      }])
    } finally {
      clearTimeout(searchTimer)
      setLoading(false)
      setIsSearching(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', color: '#ffffff', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a1628; }
        ::-webkit-scrollbar-thumb { background: #f5c518; border-radius: 2px; }
        .user-bubble { background: linear-gradient(135deg, #f5c518 0%, #e6b000 100%); color: #060d1f; border-radius: 18px 18px 4px 18px; padding: 12px 16px; max-width: 80%; margin-left: auto; font-weight: 500; line-height: 1.5; }
        .assistant-bubble { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px 18px 18px 18px; padding: 16px; max-width: 90%; line-height: 1.7; font-size: 14px; color: rgba(255,255,255,0.9); white-space: pre-wrap; }
        .assistant-bubble strong { color: #f5c518; font-weight: 600; }
        .send-btn { background: linear-gradient(135deg, #f5c518, #e6b000); border: none; border-radius: 12px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
        .send-btn:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 4px 12px rgba(245,197,24,0.4); }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .layer-pill { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); font-size: 11px; font-weight: 500; white-space: nowrap; }
        .pulse-dot { width: 6px; height: 6px; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.8); } }
        .loading-dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f5c518; margin: 0 2px; animation: bounce 1.4s infinite; }
        .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-6px); opacity: 1; } }
        .web-badge { display: inline-flex; align-items: center; gap: 4px; background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.2); border-radius: 10px; padding: 2px 7px; font-size: 10px; color: #60a5fa; margin-bottom: 8px; }
        textarea { background: transparent; border: none; outline: none; color: white; font-family: 'DM Sans', sans-serif; font-size: 14px; resize: none; flex: 1; min-height: 24px; max-height: 120px; line-height: 1.5; }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>

      {/* Header */}
      <header style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(6,13,31,0.95)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <a href="/dashboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f5c518', fontSize: 12, textDecoration: 'none', marginBottom: 8, opacity: 0.85 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; }}>
            ← Back to Dashboard
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #f5c518, #e6b000)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🦞</div>
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.3px', lineHeight: 1 }}>
                BSC Founder <span style={{ color: '#f5c518' }}>AI</span>
              </h1>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Global Seafood Intelligence Engine</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            {INTELLIGENCE_LAYERS.map(layer => (
              <div key={layer.id} className="layer-pill" style={{ borderColor: `${layer.color}30`, background: `${layer.color}08` }}>
                <div className="pulse-dot" style={{ background: layer.color }} />
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{layer.icon} {layer.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>

        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0 32px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'linear-gradient(135deg, rgba(245,197,24,0.15), rgba(245,197,24,0.05))', border: '1px solid rgba(245,197,24,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 20px' }}>🦞</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>Bahamian Seafood Intelligence</h2>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', lineHeight: 1.6 }}>Species · Traceability · Arbitrage · Cultivation</p>
            <p style={{ fontSize: '12px', color: 'rgba(245,197,24,0.6)', marginBottom: '32px' }}>Built in Nassau. Powered by AI. Ready for the world.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '32px', textAlign: 'left' }}>
              {INTELLIGENCE_LAYERS.map(layer => (
                <div key={layer.id} style={{ background: `${layer.color}06`, border: `1px solid ${layer.color}20`, borderRadius: '12px', padding: '12px' }}>
                  <div style={{ fontSize: '18px', marginBottom: '4px' }}>{layer.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: layer.color, marginBottom: '3px' }}>{layer.label}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{layer.description}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Try asking</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '10px 14px', color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer', textAlign: 'left', lineHeight: 1.4 }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,197,24,0.06)'; e.currentTarget.style.borderColor = 'rgba(245,197,24,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'assistant' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: 'linear-gradient(135deg, #f5c518, #e6b000)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>🦞</div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>BSC Intelligence</span>
                  {msg.timestamp && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{formatTime(msg.timestamp)}</span>}
                </div>
              )}
              <div className={msg.role === 'user' ? 'user-bubble' : 'assistant-bubble'}>
                {msg.role === 'assistant' && msg.webSearchUsed && <div className="web-badge">🔍 Live data retrieved</div>}
                {msg.content}
              </div>
              {msg.role === 'user' && msg.timestamp && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>{formatTime(msg.timestamp)}</span>}
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: 'linear-gradient(135deg, #f5c518, #e6b000)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>🦞</div>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>BSC Intelligence</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px 18px 18px 18px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {isSearching && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}><span>🔍</span><span>Searching live seafood data...</span></div>}
                <div className="loading-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </main>

      {/* Suggestion chips after first message */}
      {messages.length > 0 && (
        <div style={{ overflowX: 'auto', padding: '12px 16px 0', display: 'flex', gap: '8px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          {SUGGESTED_QUESTIONS.slice(4).map((q, i) => (
            <button key={i} onClick={() => sendMessage(q)}
              style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '20px', padding: '8px 14px', fontSize: '12px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,197,24,0.15)'; e.currentTarget.style.color = '#f5c518' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,197,24,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}>
              {q.length > 50 ? q.slice(0, 50) + '…' : q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '12px 16px 24px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        {/* Hidden inputs: 3 sources for image attach */}
        <input ref={cameraRef}  type="file" accept="image/*" capture="environment" onChange={handleImagePick} style={{ display: 'none' }} />
        <input ref={galleryRef} type="file" accept="image/*"                       onChange={handleImagePick} style={{ display: 'none' }} />
        <input ref={fileRef}    type="file" accept="image/*"                       onChange={handleImagePick} style={{ display: 'none' }} />

        {/* Thumbnail row when images are queued */}
        {pendingImages.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {pendingImages.map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 56, height: 56, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(245,197,24,0.3)' }}>
                <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removePendingImage(i)} aria-label="Remove image"
                  style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', fontSize: 11, lineHeight: '18px', padding: 0, cursor: 'pointer' }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px 14px' }}>
          {/* Attach buttons — Camera / Gallery / Files */}
          <div style={{ display: 'flex', gap: 4, alignSelf: 'center' }}>
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={loading} title="Take photo"
              style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', color: '#f5c518', cursor: 'pointer', fontSize: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              📸
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} disabled={loading} title="From gallery"
              style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', color: '#f5c518', cursor: 'pointer', fontSize: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              🖼️
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} title="Upload file"
              style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', color: '#f5c518', cursor: 'pointer', fontSize: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              📁
            </button>
          </div>

          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ask anything about seafood, species, markets, traceability, or BSC operations…"
            rows={1} disabled={loading} />
          <button className="send-btn" onClick={() => sendMessage()} disabled={loading || (!input.trim() && pendingImages.length === 0)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="#060d1f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#060d1f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '8px', flexWrap: 'wrap' }}>
          <a href="/founder-ai/flyer-maker" style={{ fontSize: '11px', color: '#f5c518', textDecoration: 'none', borderBottom: '1px dashed rgba(245,197,24,0.4)' }}>
            🎨 Open Flyer Maker
          </a>
          <a href="/founder-ai/products/intake" style={{ fontSize: '11px', color: '#60a5fa', textDecoration: 'none', borderBottom: '1px dashed rgba(96,165,250,0.4)' }}>
            📷 New product intake
          </a>
          <a href="/founder-ai/products/pending" style={{ fontSize: '11px', color: '#4ade80', textDecoration: 'none', borderBottom: '1px dashed rgba(74,222,128,0.4)' }}>
            🧪 Pending products review
          </a>
        </div>
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: '8px' }}>
          BSC Global Seafood Intelligence · Nassau, Bahamas · bscbahamas.com
        </p>
      </div>
      <BriefPanel />
    </div>
  )
}
