'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Message {
role: 'user' | 'assistant';
content: string;
ts: number;
}

const SUGGESTIONS = [
"What's my Nassau margin?",
"What should I retail Anthony Taylor's conch at?",
"What's my total monthly fixed cost?",
"How much profit on 100 lbs of Tropic snapper at Online Market price?",
"What's the SKU prefix for Asa H Pritchard?",
"When is my next rest break?",
];

export default function FounderAIPage() {
const router = useRouter();
const [messages, setMessages] = useState<Message[]>([]);
const [input, setInput] = useState('');
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
const scrollRef = useRef<HTMLDivElement>(null);

// Auto-scroll on new message
useEffect(() => {
scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
}, [messages, loading]);

async function send(text: string) {
const userMsg = text.trim();
if (!userMsg || loading) return;

setError('');
setInput('');
const newMsgs: Message[] = [...messages, { role: 'user' as const, content: userMsg, ts: Date.now() }];
setMessages(newMsgs);
setLoading(true);

try {
const res = await fetch('/api/founder-ai', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
message: userMsg,
history: messages.map(m => ({ role: m.role, content: m.content })),
}),
});

const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Request failed');

setMessages([...newMsgs, { role: 'assistant', content: data.reply, ts: Date.now() }]);
} catch (err) {
setError(err instanceof Error ? err.message : 'Something went wrong.');
} finally {
setLoading(false);
}
}

return (
<>
<style>{`
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

* { margin:0; padding:0; box-sizing:border-box; }
html,body { height:100%; overflow:hidden; }
body { font-family:'DM Sans',sans-serif; background:#060e1c; color:#fff; -webkit-font-smoothing:antialiased; }

.fai-root { display:flex; flex-direction:column; height:100vh; height:100svh; background:linear-gradient(180deg,#060e1c 0%,#0a1520 100%); }

/* ── HEADER ── */
.fai-header { padding:18px 5%; border-bottom:1px solid rgba(212,168,67,.18); display:flex; align-items:center; justify-content:space-between; backdrop-filter:blur(12px); background:rgba(6,14,28,.7); flex-shrink:0; }
.fai-header-left { display:flex; align-items:center; gap:14px; }
.fai-back-btn { background:none; border:none; color:rgba(255,255,255,.5); font-size:22px; cursor:pointer; padding:6px 10px; border-radius:8px; transition:all .2s ease; }
.fai-back-btn:hover { background:rgba(255,255,255,.06); color:#d4a843; }
.fai-title-wrap { }
.fai-title { font-family:'Playfair Display',serif; font-size:20px; font-weight:900; color:#f5c842; letter-spacing:.02em; line-height:1; }
.fai-subtitle { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:rgba(212,168,67,.55); margin-top:4px; }
.fai-header-right { display:flex; align-items:center; gap:8px; padding:6px 14px; border-radius:30px; background:rgba(34,197,94,.1); border:1px solid rgba(34,197,94,.25); }
.fai-status-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 12px rgba(34,197,94,.6); animation:pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.55;} }
.fai-status-text { font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#22c55e; }

/* ── CHAT AREA ── */
.fai-chat { flex:1; overflow-y:auto; padding:32px 5%; max-width:880px; width:100%; margin:0 auto; }
.fai-chat::-webkit-scrollbar { width:8px; }
.fai-chat::-webkit-scrollbar-track { background:transparent; }
.fai-chat::-webkit-scrollbar-thumb { background:rgba(212,168,67,.18); border-radius:8px; }

/* Welcome state */
.fai-welcome { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; padding:20px; text-align:center; }
.fai-welcome-icon { width:72px; height:72px; border-radius:50%; background:linear-gradient(135deg,#f5c842,#c8860f); display:flex; align-items:center; justify-content:center; font-size:32px; margin-bottom:24px; box-shadow:0 12px 40px rgba(212,168,67,.4); }
.fai-welcome-h1 { font-family:'Playfair Display',serif; font-size:clamp(28px,4vw,42px); font-weight:900; color:#fff; margin-bottom:10px; line-height:1.1; }
.fai-welcome-h1 .gold { background:linear-gradient(130deg,#f5c842,#c8860f); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; font-style:italic; }
.fai-welcome-sub { font-size:15px; color:rgba(255,255,255,.55); max-width:480px; line-height:1.6; margin-bottom:36px; font-weight:300; }
.fai-suggestions { display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:680px; width:100%; }
.fai-suggestion { background:rgba(255,255,255,.04); border:1px solid rgba(212,168,67,.15); border-radius:14px; padding:14px 18px; cursor:pointer; transition:all .22s ease; text-align:left; font-family:inherit; color:rgba(255,255,255,.75); font-size:13px; line-height:1.5; }
.fai-suggestion:hover { background:rgba(212,168,67,.08); border-color:rgba(212,168,67,.4); transform:translateY(-2px); color:#fff; }

/* Messages */
.fai-msg { margin-bottom:24px; animation:fadeUp .3s ease both; }
@keyframes fadeUp { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
.fai-msg-row { display:flex; gap:14px; align-items:flex-start; }
.fai-msg-row.user { justify-content:flex-end; }
.fai-avatar { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:900; flex-shrink:0; }
.fai-avatar-ai { background:linear-gradient(135deg,#f5c842,#c8860f); color:#060e1c; box-shadow:0 4px 14px rgba(212,168,67,.35); }
.fai-avatar-user { background:rgba(255,255,255,.1); color:rgba(255,255,255,.7); border:1px solid rgba(255,255,255,.15); }
.fai-bubble { max-width:75%; padding:14px 18px; border-radius:16px; font-size:14.5px; line-height:1.65; }
.fai-bubble-ai { background:rgba(255,255,255,.04); border:1px solid rgba(212,168,67,.15); color:rgba(255,255,255,.92); border-top-left-radius:4px; }
.fai-bubble-user { background:linear-gradient(135deg,rgba(212,168,67,.15),rgba(212,168,67,.08)); border:1px solid rgba(212,168,67,.3); color:#fff; border-top-right-radius:4px; }
.fai-bubble strong { color:#f5c842; font-weight:700; }
.fai-bubble code { background:rgba(0,0,0,.3); padding:2px 6px; border-radius:4px; font-size:13px; color:#f5c842; }
.fai-bubble pre { background:rgba(0,0,0,.4); padding:12px; border-radius:8px; overflow-x:auto; margin:8px 0; }

/* Loading */
.fai-typing { display:flex; gap:4px; padding:14px 18px; background:rgba(255,255,255,.04); border:1px solid rgba(212,168,67,.15); border-radius:16px; border-top-left-radius:4px; width:fit-content; }
.fai-typing-dot { width:7px; height:7px; border-radius:50%; background:#d4a843; animation:typing 1.3s ease-in-out infinite; }
.fai-typing-dot:nth-child(2) { animation-delay:.18s; }
.fai-typing-dot:nth-child(3) { animation-delay:.36s; }
@keyframes typing { 0%,100%{opacity:.3;transform:scale(.85);} 50%{opacity:1;transform:scale(1);} }

/* Error */
.fai-error { background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.3); border-radius:12px; padding:12px 16px; color:#fca5a5; font-size:13px; margin-bottom:16px; }

/* ── INPUT ── */
.fai-input-wrap { padding:16px 5% 24px; border-top:1px solid rgba(212,168,67,.12); backdrop-filter:blur(12px); background:rgba(6,14,28,.6); flex-shrink:0; }
.fai-input-inner { max-width:880px; margin:0 auto; display:flex; gap:10px; align-items:flex-end; }
.fai-input { flex:1; background:rgba(255,255,255,.05); border:1.5px solid rgba(212,168,67,.2); border-radius:16px; padding:14px 18px; color:#fff; font-family:inherit; font-size:14.5px; line-height:1.5; resize:none; max-height:120px; min-height:50px; outline:none; transition:border-color .2s ease,box-shadow .2s ease; }
.fai-input::placeholder { color:rgba(255,255,255,.35); }
.fai-input:focus { border-color:rgba(212,168,67,.5); box-shadow:0 0 0 3px rgba(212,168,67,.1); }
.fai-send { background:linear-gradient(130deg,#f5c842,#c8860f); border:none; color:#060e1c; width:50px; height:50px; border-radius:14px; cursor:pointer; font-size:18px; font-weight:900; flex-shrink:0; transition:all .2s ease; box-shadow:0 4px 18px rgba(212,168,67,.35); }
.fai-send:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 24px rgba(212,168,67,.5); }
.fai-send:disabled { opacity:.4; cursor:not-allowed; }
.fai-hint { max-width:880px; margin:8px auto 0; text-align:center; font-size:10px; letter-spacing:.1em; color:rgba(255,255,255,.25); text-transform:uppercase; }

@media(max-width:640px){
.fai-suggestions{grid-template-columns:1fr;}
.fai-bubble{max-width:88%;}
.fai-welcome-h1{font-size:26px;}
}
`}</style>

<div className="fai-root">
{/* ── HEADER ── */}
<header className="fai-header">
<div className="fai-header-left">
<button className="fai-back-btn" onClick={() => router.push('/')} aria-label="Back">←</button>
<div className="fai-title-wrap">
<div className="fai-title">Founder AI</div>
<div className="fai-subtitle">Your private BSC assistant</div>
</div>
</div>
<div className="fai-header-right">
<span className="fai-status-dot" />
<span className="fai-status-text">Online</span>
</div>
</header>

{/* ── CHAT ── */}
<div className="fai-chat" ref={scrollRef}>
{messages.length === 0 ? (
<div className="fai-welcome">
<div className="fai-welcome-icon">🤖</div>
<h1 className="fai-welcome-h1">
Welcome back, <span className="gold">Dedrick.</span>
</h1>
<p className="fai-welcome-sub">
I know your business inside and out — pricing rules, supplier costs, margins, inventory, the whole thing. Ask me anything.
</p>
<div className="fai-suggestions">
{SUGGESTIONS.map(s => (
<button key={s} className="fai-suggestion" onClick={() => send(s)}>
{s}
</button>
))}
</div>
</div>
) : (
<>
{messages.map((m, i) => (
<div key={i} className="fai-msg">
<div className={`fai-msg-row ${m.role}`}>
{m.role === 'assistant' && <div className="fai-avatar fai-avatar-ai">F</div>}
<div className={`fai-bubble ${m.role === 'user' ? 'fai-bubble-user' : 'fai-bubble-ai'}`}
dangerouslySetInnerHTML={{ __html: formatMarkdown(m.content) }} />
{m.role === 'user' && <div className="fai-avatar fai-avatar-user">D</div>}
</div>
</div>
))}
{loading && (
<div className="fai-msg">
<div className="fai-msg-row">
<div className="fai-avatar fai-avatar-ai">F</div>
<div className="fai-typing">
<div className="fai-typing-dot" />
<div className="fai-typing-dot" />
<div className="fai-typing-dot" />
</div>
</div>
</div>
)}
{error && <div className="fai-error">⚠️ {error}</div>}
</>
)}
</div>

{/* ── INPUT ── */}
<div className="fai-input-wrap">
<div className="fai-input-inner">
<textarea
className="fai-input"
placeholder="Ask Founder AI anything about your business..."
value={input}
onChange={e => setInput(e.target.value)}
onKeyDown={e => {
if (e.key === 'Enter' && !e.shiftKey) {
e.preventDefault();
send(input);
}
}}
rows={1}
disabled={loading}
/>
<button className="fai-send" onClick={() => send(input)} disabled={loading || !input.trim()}>
↑
</button>
</div>
<div className="fai-hint">🔒 Private · Only Dedrick can access · Powered by Claude</div>
</div>
</div>
</>
);
}

// ── Tiny markdown formatter (bold, code, line breaks) ──────────────────────
function formatMarkdown(text: string): string {
return text
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
.replace(/`(.+?)`/g, '<code>$1</code>')
.replace(/\n/g, '<br />');
}
