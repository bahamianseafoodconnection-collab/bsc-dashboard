// ============================================================
// BSC MARKETPLACE — FOUNDER AI CHAT PAGE
// File: app/founder-ai/page.tsx
// Route: /founder-ai
// Day 2 of 14 — Shell built, Claude connected Day 3
// ============================================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Message = {
id: string;
role: 'user' | 'assistant';
content: string;
created_at: string;
};

type Chat = {
id: string;
title: string;
created_at: string;
};

export default function FounderAIPage() {
const [messages, setMessages] = useState<Message[]>([]);
const [chats, setChats] = useState<Chat[]>([]);
const [currentChatId, setCurrentChatId] = useState<string | null>(null);
const [input, setInput] = useState('');
const [loading, setLoading] = useState(false);
const [sidebarOpen, setSidebarOpen] = useState(false);
const bottomRef = useRef<HTMLDivElement>(null);
const inputRef = useRef<HTMLTextAreaElement>(null);

useEffect(() => {
loadChats();
}, []);

useEffect(() => {
bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);

async function loadChats() {
const { data } = await supabase
.from('founder_chats')
.select('id, title, created_at')
.order('created_at', { ascending: false })
.limit(30);
if (data) setChats(data);
}

async function loadMessages(chatId: string) {
const { data } = await supabase
.from('founder_messages')
.select('*')
.eq('chat_id', chatId)
.order('created_at', { ascending: true });
if (data) setMessages(data);
setCurrentChatId(chatId);
setSidebarOpen(false);
}

async function startNewChat() {
setMessages([]);
setCurrentChatId(null);
setSidebarOpen(false);
inputRef.current?.focus();
}

async function sendMessage() {
if (!input.trim() || loading) return;
const userText = input.trim();
setInput('');
setLoading(true);

// Create chat if first message
let chatId = currentChatId;
if (!chatId) {
const { data: newChat } = await supabase
.from('founder_chats')
.insert([{
title: userText.slice(0, 60),
created_at: new Date().toISOString(),
}])
.select()
.single();
if (newChat) {
chatId = newChat.id;
setCurrentChatId(chatId);
await loadChats();
}
}

// Save user message
const userMsg: Message = {
id: crypto.randomUUID(),
role: 'user',
content: userText,
created_at: new Date().toISOString(),
};

await supabase.from('founder_messages').insert([{
chat_id: chatId,
role: 'user',
content: userText,
created_at: userMsg.created_at,
}]);

setMessages((prev) => [...prev, userMsg]);

// Call AI route
try {
const res = await fetch('/api/founder-ai', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
chatId,
message: userText,
history: messages.slice(-10),
}),
});

const data = await res.json();
const aiText = data.reply || 'Founder AI is being connected. Back tomorrow.';

const aiMsg: Message = {
id: crypto.randomUUID(),
role: 'assistant',
content: aiText,
created_at: new Date().toISOString(),
};

await supabase.from('founder_messages').insert([{
chat_id: chatId,
role: 'assistant',
content: aiText,
created_at: aiMsg.created_at,
}]);

setMessages((prev) => [...prev, aiMsg]);
} catch {
const errMsg: Message = {
id: crypto.randomUUID(),
role: 'assistant',
content: 'Connection error. Please try again.',
created_at: new Date().toISOString(),
};
setMessages((prev) => [...prev, errMsg]);
}

setLoading(false);
}

function handleKeyDown(e: React.KeyboardEvent) {
if (e.key === 'Enter' && !e.shiftKey) {
e.preventDefault();
sendMessage();
}
}

function formatTime(iso: string) {
return new Date(iso).toLocaleTimeString('en-US', {
hour: 'numeric',
minute: '2-digit',
hour12: true,
});
}

function formatDate(iso: string) {
return new Date(iso).toLocaleDateString('en-US', {
month: 'short',
day: 'numeric',
});
}

return (
<div style={s.shell}>

{/* SIDEBAR */}
{sidebarOpen && (
<div style={s.sidebarOverlay} onClick={() => setSidebarOpen(false)} />
)}
<div style={{ ...s.sidebar, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
<div style={s.sidebarHeader}>
<span style={s.sidebarTitle}>💬 Past Chats</span>
<button style={s.iconBtn} onClick={() => setSidebarOpen(false)}>✕</button>
</div>
<button style={s.newChatBtn} onClick={startNewChat}>
+ New Chat
</button>
<div style={s.chatList}>
{chats.length === 0 && (
<p style={s.emptyChats}>No chats yet. Start a conversation.</p>
)}
{chats.map((chat) => (
<button
key={chat.id}
style={{
...s.chatItem,
...(chat.id === currentChatId ? s.chatItemActive : {}),
}}
onClick={() => loadMessages(chat.id)}
>
<span style={s.chatItemTitle}>{chat.title || 'Untitled'}</span>
<span style={s.chatItemDate}>{formatDate(chat.created_at)}</span>
</button>
))}
</div>
</div>

{/* MAIN */}
<div style={s.main}>

{/* HEADER */}
<div style={s.header}>
<button style={s.iconBtn} onClick={() => setSidebarOpen(true)}>☰</button>
<div style={s.headerCenter}>
<span style={s.headerIcon}>🐟</span>
<div>
<div style={s.headerName}>Founder AI</div>
<div style={s.headerSub}>BSC Marketplace — Dedrick Storr Snr</div>
</div>
</div>
<button style={s.iconBtn} onClick={startNewChat}>✏️</button>
</div>

{/* MESSAGES */}
<div style={s.messages}>
{messages.length === 0 && (
<div style={s.welcome}>
<div style={s.welcomeIcon}>🐟</div>
<h2 style={s.welcomeTitle}>Good morning, Dedrick.</h2>
<p style={s.welcomeText}>
Your Founder AI is ready. Ask me anything about BSC —
operations, supply chain, pricing, strategy, or where we stand today.
</p>
<div style={s.suggestions}>
{[
'Where does BSC stand today?',
'What are my immediate priorities?',
'Show me the yield formula',
'What is the Tropic Seafood deal?',
].map((s) => (
<button
key={s}
style={styles.suggBtn}
onClick={() => { setInput(s); inputRef.current?.focus(); }}
>
{s}
</button>
))}
</div>
</div>
)}

{messages.map((msg) => (
<div
key={msg.id}
style={{
...s.msgRow,
justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
}}
>
{msg.role === 'assistant' && (
<div style={s.avatar}>🐟</div>
)}
<div
style={{
...s.bubble,
...(msg.role === 'user' ? s.bubbleUser : s.bubbleAI),
}}
>
<p style={s.bubbleText}>{msg.content}</p>
<span style={s.bubbleTime}>{formatTime(msg.created_at)}</span>
</div>
</div>
))}

{loading && (
<div style={{ ...s.msgRow, justifyContent: 'flex-start' }}>
<div style={s.avatar}>🐟</div>
<div style={{ ...s.bubble, ...s.bubbleAI }}>
<div style={s.typing}>
<span style={s.dot} />
<span style={{ ...s.dot, animationDelay: '0.2s' }} />
<span style={{ ...s.dot, animationDelay: '0.4s' }} />
</div>
</div>
</div>
)}

<div ref={bottomRef} />
</div>

{/* INPUT */}
<div style={s.inputBar}>
<textarea
ref={inputRef}
style={s.textarea}
placeholder="Ask your Founder AI anything…"
value={input}
onChange={(e) => setInput(e.target.value)}
onKeyDown={handleKeyDown}
rows={1}
/>
<button
style={{
...s.sendBtn,
opacity: input.trim() && !loading ? 1 : 0.4,
}}
onClick={sendMessage}
disabled={!input.trim() || loading}
>
➤
</button>
</div>
</div>

<style>{`
@keyframes blink {
0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
40% { opacity: 1; transform: scale(1); }
}
`}</style>
</div>
);
}

const s: Record<string, React.CSSProperties> = {
shell: {
display: 'flex',
height: '100dvh',
backgroundColor: '#0f172a',
fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
overflow: 'hidden',
position: 'relative',
},
sidebarOverlay: {
position: 'fixed',
inset: 0,
backgroundColor: 'rgba(0,0,0,0.5)',
zIndex: 10,
},
sidebar: {
position: 'fixed',
top: 0,
left: 0,
bottom: 0,
width: 280,
backgroundColor: '#1e293b',
zIndex: 20,
display: 'flex',
flexDirection: 'column',
transition: 'transform 0.25s ease',
},
sidebarHeader: {
display: 'flex',
justifyContent: 'space-between',
alignItems: 'center',
padding: '20px 16px 12px',
borderBottom: '1px solid #334155',
},
sidebarTitle: {
color: '#f1f5f9',
fontWeight: 700,
fontSize: 16,
},
newChatBtn: {
margin: '12px 16px',
padding: '10px 16px',
backgroundColor: '#1e40af',
color: '#ffffff',
border: 'none',
borderRadius: 8,
fontSize: 14,
fontWeight: 600,
cursor: 'pointer',
textAlign: 'left',
},
chatList: {
flex: 1,
overflowY: 'auto',
padding: '0 8px 20px',
},
emptyChats: {
color: '#64748b',
fontSize: 13,
padding: '16px 8px',
textAlign: 'center',
},
chatItem: {
width: '100%',
padding: '10px 12px',
backgroundColor: 'transparent',
border: 'none',
borderRadius: 8,
cursor: 'pointer',
textAlign: 'left',
display: 'flex',
flexDirection: 'column',
gap: 2,
marginBottom: 2,
},
chatItemActive: {
backgroundColor: '#1e40af22',
},
chatItemTitle: {
color: '#e2e8f0',
fontSize: 13,
fontWeight: 500,
overflow: 'hidden',
textOverflow: 'ellipsis',
whiteSpace: 'nowrap',
display: 'block',
maxWidth: 220,
},
chatItemDate: {
color: '#64748b',
fontSize: 11,
},
main: {
flex: 1,
display: 'flex',
flexDirection: 'column',
height: '100dvh',
},
header: {
display: 'flex',
alignItems: 'center',
justifyContent: 'space-between',
padding: '12px 16px',
backgroundColor: '#1e293b',
borderBottom: '1px solid #334155',
flexShrink: 0,
},
headerCenter: {
display: 'flex',
alignItems: 'center',
gap: 10,
},
headerIcon: {
fontSize: 28,
},
headerName: {
color: '#f1f5f9',
fontWeight: 700,
fontSize: 16,
lineHeight: 1.2,
},
headerSub: {
color: '#64748b',
fontSize: 11,
},
iconBtn: {
background: 'none',
border: 'none',
color: '#94a3b8',
fontSize: 20,
cursor: 'pointer',
padding: 6,
borderRadius: 6,
},
messages: {
flex: 1,
overflowY: 'auto',
padding: '20px 16px',
display: 'flex',
flexDirection: 'column',
gap: 12,
},
welcome: {
display: 'flex',
flexDirection: 'column',
alignItems: 'center',
justifyContent: 'center',
textAlign: 'center',
padding: '40px 20px',
gap: 12,
flex: 1,
},
welcomeIcon: {
fontSize: 56,
},
welcomeTitle: {
color: '#f1f5f9',
fontSize: 22,
fontWeight: 700,
margin: 0,
},
welcomeText: {
color: '#94a3b8',
fontSize: 15,
lineHeight: 1.6,
maxWidth: 340,
margin: 0,
},
suggestions: {
display: 'flex',
flexDirection: 'column',
gap: 8,
width: '100%',
maxWidth: 360,
marginTop: 8,
},
msgRow: {
display: 'flex',
alignItems: 'flex-end',
gap: 8,
},
avatar: {
fontSize: 22,
flexShrink: 0,
marginBottom: 4,
},
bubble: {
maxWidth: '78%',
padding: '10px 14px',
borderRadius: 16,
display: 'flex',
flexDirection: 'column',
gap: 4,
},
bubbleUser: {
backgroundColor: '#1e40af',
borderBottomRightRadius: 4,
},
bubbleAI: {
backgroundColor: '#1e293b',
borderBottomLeftRadius: 4,
border: '1px solid #334155',
},
bubbleText: {
color: '#f1f5f9',
fontSize: 15,
lineHeight: 1.5,
margin: 0,
whiteSpace: 'pre-wrap',
},
bubbleTime: {
color: '#64748b',
fontSize: 10,
alignSelf: 'flex-end',
},
typing: {
display: 'flex',
gap: 4,
padding: '4px 0',
alignItems: 'center',
},
dot: {
width: 7,
height: 7,
borderRadius: '50%',
backgroundColor: '#64748b',
display: 'inline-block',
animation: 'blink 1.2s infinite',
},
inputBar: {
display: 'flex',
alignItems: 'flex-end',
gap: 10,
padding: '12px 16px',
backgroundColor: '#1e293b',
borderTop: '1px solid #334155',
flexShrink: 0,
},
textarea: {
flex: 1,
backgroundColor: '#0f172a',
border: '1px solid #334155',
borderRadius: 12,
padding: '12px 14px',
color: '#f1f5f9',
fontSize: 15,
resize: 'none',
outline: 'none',
lineHeight: 1.5,
maxHeight: 120,
overflowY: 'auto',
},
sendBtn: {
backgroundColor: '#1e40af',
color: '#ffffff',
border: 'none',
borderRadius: 10,
width: 44,
height: 44,
fontSize: 18,
cursor: 'pointer',
flexShrink: 0,
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
},
};

const styles = {
suggBtn: {
backgroundColor: '#1e293b',
border: '1px solid #334155',
borderRadius: 10,
padding: '10px 14px',
color: '#94a3b8',
fontSize: 14,
cursor: 'pointer',
textAlign: 'left' as const,
width: '100%',
},
};
