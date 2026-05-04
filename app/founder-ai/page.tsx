'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const LOGO = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/A0EF44D5-D0F6-4D15-9826-4FED851A2719.png';

type Message = { id: string; role: 'user' | 'assistant'; content: string; created_at: string; };
type Chat = { id: string; title: string; created_at: string; };

const SUGGESTIONS = [
  'Where does BSC stand today?',
  "What's my Nassau margin?",
  "What should I retail Anthony Taylor's conch at?",
  'How much profit on 100 lbs of Tropic snapper online?',
  "What's my monthly fixed cost?",
  'When is my next rest break?',
];

export default function FounderAIPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadChats(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function loadChats() {
    const { data } = await supabase.from('founder_chats').select('id, title, created_at').order('created_at', { ascending: false }).limit(30);
    if (data) setChats(data);
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase.from('founder_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (data) setMessages(data);
    setCurrentChatId(chatId);
    setSidebarOpen(false);
  }

  async function startNewChat() {
    setMessages([]);
    setCurrentChatId(null);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function deleteChat(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    await supabase.from('founder_messages').delete().eq('chat_id', chatId);
    await supabase.from('founder_chats').delete().eq('id', chatId);
    if (chatId === currentChatId) { setMessages([]); setCurrentChatId(null); }
    await loadChats();
  }

  async function sendMessage(textOverride?: string) {
    const userText = (textOverride ?? input).trim();
    if (!userText || loading) return;
    setInput('');
    setLoading(true);

    let chatId = currentChatId;
    if (!chatId) {
      const { data: newChat } = await supabase.from('founder_chats').insert([{ title: userText.slice(0, 60), created_at: new Date().toISOString() }]).select().single();
      if (newChat) { chatId = newChat.id; setCurrentChatId(chatId); loadChats(); }
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: userText, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    if (chatId) {
      await supabase.from('founder_messages').insert([{ chat_id: chatId, role: 'user', content: userText, created_at: userMsg.created_at }]);
    }

    try {
      const res = await fetch('/api/founder-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: userText, history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      const aiText = data.reply || data.error || 'No response received.';
      const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: aiText, created_at: new Date().toISOString() };

      if (chatId) {
        await supabase.from('founder_messages').insert([{ chat_id: chatId, role: 'assistant', content: aiText, created_at: aiMsg.created_at }]);
      }
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      const errMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '⚠️ Connection error. Check that ANTHROPIC_API_KEY is set in Vercel.', created_at: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    }
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function formatTime(iso: string) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
  function formatDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function greeting() { const h = new Date().getHours(); if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening'; }

  function fmt(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br />');
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        html,body { height:100%; overflow:hidden; }
        body { font-family:'DM Sans',sans-serif; background:#060e1c; color:#fff; -webkit-font-smoothing:antialiased; }
        .fai-shell { display:flex; height:100dvh; background:linear-gradient(180deg,#060e1c 0%,#0a1520 100%); position:relative; overflow:hidden; }
        .fai-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); z-index:10; animation:fadeIn .25s ease; }
        @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
        .fai-sidebar { position:fixed; top:0; left:0; bottom:0; width:300px; background:linear-gradient(180deg,#0a1520 0%,#060e1c 100%); border-right:1px solid rgba(212,168,67,.15); z-index:20; display:flex; flex-direction:column; transition:transform .28s cubic-bezier(.25,.46,.45,.94); box-shadow:8px 0 32px rgba(0,0,0,.4); }
        .fai-sidebar-header { display:flex; justify-content:space-between; align-items:center; padding:20px 18px 14px; border-bottom:1px solid rgba(212,168,67,.12); }
        .fai-sidebar-title { color:#f5c842; font-family:'Playfair Display',serif; font-weight:700; font-size:16px; }
        .fai-sidebar-icon { background:none; border:none; color:rgba(255,255,255,.55); font-size:22px; cursor:pointer; padding:6px 10px; border-radius:8px; }
        .fai-sidebar-icon:hover { background:rgba(255,255,255,.06); color:#d4a843; }
        .fai-new-btn { margin:14px 16px; padding:12px 16px; background:linear-gradient(130deg,#f5c842,#c8860f); color:#060e1c; border:none; border-radius:10px; font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; cursor:pointer; box-shadow:0 4px 18px rgba(212,168,67,.3); font-family:inherit; }
        .fai-new-btn:hover { transform:translateY(-1px); box-shadow:0 6px 24px rgba(212,168,67,.45); }
        .fai-chat-list { flex:1; overflow-y:auto; padding:0 10px 20px; }
        .fai-chat-list::-webkit-scrollbar { width:6px; }
        .fai-chat-list::-webkit-scrollbar-thumb { background:rgba(212,168,67,.2); border-radius:6px; }
        .fai-empty { color:rgba(255,255,255,.35); font-size:12px; padding:18px 10px; text-align:center; line-height:1.5; }
        .fai-chat-item { width:100%; padding:11px 13px; background:transparent; border:1px solid transparent; border-radius:10px; cursor:pointer; text-align:left; display:flex; flex-direction:column; gap:3px; margin-bottom:3px; position:relative; font-family:inherit; }
        .fai-chat-item:hover { background:rgba(255,255,255,.04); border-color:rgba(212,168,67,.12); }
        .fai-chat-item.active { background:rgba(212,168,67,.08); border-color:rgba(212,168,67,.25); }
        .fai-chat-item-title { color:#e8d5a3; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:230px; }
        .fai-chat-item-date { color:rgba(255,255,255,.35); font-size:10.5px; }
        .fai-chat-del { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; color:rgba(255,255,255,.3); font-size:14px; cursor:pointer; padding:4px 6px; border-radius:5px; opacity:0; }
        .fai-chat-item:hover .fai-chat-del { opacity:1; }
        .fai-chat-del:hover { color:#fca5a5; background:rgba(239,68,68,.1); }
        .fai-main { flex:1; display:flex; flex-direction:column; height:100dvh; min-width:0; }
        .fai-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:rgba(6,14,28,.7); backdrop-filter:blur(12px); border-bottom:1px solid rgba(212,168,67,.18); flex-shrink:0; gap:12px; }
        .fai-header-left, .fai-header-right { display:flex; align-items:center; gap:8px; }
        .fai-icon-btn { background:none; border:none; color:rgba(255,255,255,.6); font-size:20px; cursor:pointer; padding:8px 10px; border-radius:8px; line-height:1; }
        .fai-icon-btn:hover { background:rgba(255,255,255,.06); color:#d4a843; }
        .fai-header-center { display:flex; align-items:center; gap:11px; flex:1; min-width:0; justify-content:center; }
        .fai-logo { width:36px; height:36px; border-radius:50%; background:#fafaf6; display:flex; align-items:center; justify-content:center; padding:4px; flex-shrink:0; box-shadow:0 2px 12px rgba(212,168,67,.3); border:1.5px solid rgba(212,168,67,.4); }
        .fai-logo img { width:100%; height:100%; object-fit:contain; }
        .fai-header-text { display:flex; flex-direction:column; }
        .fai-header-name { font-family:'Playfair Display',serif; color:#f5c842; font-weight:900; font-size:17px; line-height:1; }
        .fai-header-sub { color:rgba(212,168,67,.55); font-size:9.5px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; margin-top:3px; }
        .fai-status { display:flex; align-items:center; gap:6px; padding:5px 11px; border-radius:30px; background:rgba(34,197,94,.1); border:1px solid rgba(34,197,94,.25); }
        .fai-status-dot { width:6px; height:6px; border-radius:50%; background:#22c55e; box-shadow:0 0 10px rgba(34,197,94,.7); animation:pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.5;} }
        .fai-status-text { font-size:9.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#22c55e; }
        .fai-messages { flex:1; overflow-y:auto; padding:24px 16px; display:flex; flex-direction:column; gap:14px; max-width:880px; width:100%; margin:0 auto; }
        .fai-messages::-webkit-scrollbar { width:7px; }
        .fai-messages::-webkit-scrollbar-thumb { background:rgba(212,168,67,.18); border-radius:7px; }
        .fai-welcome { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; padding:30px 20px; gap:14px; flex:1; text-align:center; }
        .fai-welcome-logo { width:90px; height:90px; border-radius:50%; background:#fafaf6; display:flex; align-items:center; justify-content:center; padding:10px; margin-bottom:14px; box-shadow:0 12px 40px rgba(212,168,67,.45); border:2px solid rgba(212,168,67,.5); animation:welcomeIn .6s cubic-bezier(.25,.46,.45,.94); }
        @keyframes welcomeIn { from{opacity:0;transform:scale(.7);} to{opacity:1;transform:scale(1);} }
        .fai-welcome-logo img { width:100%; height:100%; object-fit:contain; }
        .fai-welcome-title { font-family:'Playfair Display',serif; color:#fff; font-size:clamp(24px,3.6vw,34px); font-weight:900; line-height:1.15; max-width:480px; }
        .fai-welcome-title .gold { background:linear-gradient(130deg,#f5c842,#c8860f); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; font-style:italic; }
        .fai-welcome-text { color:rgba(255,255,255,.55); font-size:14.5px; line-height:1.65; max-width:440px; font-weight:300; }
        .fai-suggestions { display:grid; grid-template-columns:1fr 1fr; gap:9px; max-width:680px; width:100%; margin-top:18px; }
        .fai-sugg { background:rgba(255,255,255,.04); border:1px solid rgba(212,168,67,.15); border-radius:12px; padding:13px 16px; cursor:pointer; text-align:left; font-family:inherit; color:rgba(255,255,255,.78); font-size:12.5px; line-height:1.5; }
        .fai-sugg:hover { background:rgba(212,168,67,.08); border-color:rgba(212,168,67,.4); transform:translateY(-2px); color:#fff; }
        .fai-msg-row { display:flex; align-items:flex-end; gap:9px; animation:fadeUp .3s ease both; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
        .fai-msg-row.user { justify-content:flex-end; }
        .fai-avatar { width:32px; height:32px; border-radius:50%; flex-shrink:0; margin-bottom:2px; display:flex; align-items:center; justify-content:center; }
        .fai-avatar-ai { background:#fafaf6; padding:3px; box-shadow:0 3px 12px rgba(212,168,67,.35); border:1.5px solid rgba(212,168,67,.4); }
        .fai-avatar-ai img { width:100%; height:100%; object-fit:contain; }
        .fai-avatar-user { background:rgba(212,168,67,.15); color:#f5c842; font-weight:900; font-size:14px; border:1px solid rgba(212,168,67,.3); }
        .fai-bubble { max-width:78%; padding:11px 15px; border-radius:16px; display:flex; flex-direction:column; gap:5px; }
        .fai-bubble-user { background:linear-gradient(135deg,rgba(212,168,67,.18),rgba(212,168,67,.1)); border:1px solid rgba(212,168,67,.3); border-bottom-right-radius:4px; color:#fff; }
        .fai-bubble-ai { background:rgba(255,255,255,.04); border:1px solid rgba(212,168,67,.15); border-bottom-left-radius:4px; }
        .fai-bubble-text { color:#f1f5f9; font-size:14.5px; line-height:1.65; white-space:pre-wrap; word-wrap:break-word; }
        .fai-bubble-text strong { color:#f5c842; font-weight:700; }
        .fai-bubble-text code { background:rgba(0,0,0,.3); padding:2px 6px; border-radius:4px; font-size:13px; color:#f5c842; font-family:ui-monospace,monospace; }
        .fai-bubble-time { color:rgba(255,255,255,.3); font-size:10px; align-self:flex-end; }
        .fai-typing { display:flex; gap:5px; padding:6px 0; align-items:center; }
        .fai-dot { width:7px; height:7px; border-radius:50%; background:#d4a843; animation:typing 1.3s ease-in-out infinite; }
        .fai-dot:nth-child(2) { animation-delay:.18s; }
        .fai-dot:nth-child(3) { animation-delay:.36s; }
        @keyframes typing { 0%,100%{opacity:.3;transform:scale(.85);} 50%{opacity:1;transform:scale(1);} }
        .fai-input-wrap { padding:14px 16px 18px; background:rgba(6,14,28,.7); backdrop-filter:blur(12px); border-top:1px solid rgba(212,168,67,.15); flex-shrink:0; }
        .fai-input-inner { max-width:880px; margin:0 auto; display:flex; gap:10px; align-items:flex-end; }
        .fai-textarea { flex:1; background:rgba(255,255,255,.05); border:1.5px solid rgba(212,168,67,.2); border-radius:14px; padding:13px 16px; color:#fff; font-family:inherit; font-size:14.5px; resize:none; outline:none; line-height:1.5; max-height:120px; min-height:48px; }
        .fai-textarea::placeholder { color:rgba(255,255,255,.35); }
        .fai-textarea:focus { border-color:rgba(212,168,67,.5); box-shadow:0 0 0 3px rgba(212,168,67,.1); }
        .fai-send { background:linear-gradient(130deg,#f5c842,#c8860f); border:none; color:#060e1c; width:48px; height:48px; border-radius:13px; cursor:pointer; font-size:18px; font-weight:900; flex-shrink:0; box-shadow:0 4px 18px rgba(212,168,67,.35); display:flex; align-items:center; justify-content:center; }
        .fai-send:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 24px rgba(212,168,67,.5); }
        .fai-send:disabled { opacity:.35; cursor:not-allowed; }
        .fai-hint { max-width:880px; margin:8px auto 0; text-align:center; font-size:9.5px; letter-spacing:.12em; color:rgba(255,255,255,.28); text-transform:uppercase; font-weight:600; }
        @media(max-width:640px){
          .fai-suggestions{grid-template-columns:1fr;}
          .fai-bubble{max-width:88%;}
          .fai-welcome-title{font-size:24px;}
          .fai-header-center{justify-content:flex-start;}
          .fai-sidebar{width:280px;}
        }
      `}</style>

      <div className="fai-shell">
        {sidebarOpen && <div className="fai-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className="fai-sidebar" style={{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
          <div className="fai-sidebar-header">
            <span className="fai-sidebar-title">💬 Past Chats</span>
            <button className="fai-sidebar-icon" onClick={() => setSidebarOpen(false)}>✕</button>
          </div>
          <button className="fai-new-btn" onClick={startNewChat}>+ New Chat</button>
          <div className="fai-chat-list">
            {chats.length === 0 ? (
              <p className="fai-empty">No chats yet.<br />Start a conversation.</p>
            ) : chats.map(chat => (
              <button key={chat.id} className={`fai-chat-item ${chat.id === currentChatId ? 'active' : ''}`} onClick={() => loadMessages(chat.id)}>
                <span className="fai-chat-item-title">{chat.title || 'Untitled'}</span>
                <span className="fai-chat-item-date">{formatDate(chat.created_at)}</span>
                <button className="fai-chat-del" onClick={(e) => deleteChat(chat.id, e)}>🗑</button>
              </button>
            ))}
          </div>
        </div>

        <div className="fai-main">
          <div className="fai-header">
            <div className="fai-header-left">
              <button className="fai-icon-btn" onClick={() => setSidebarOpen(true)}>☰</button>
              <button className="fai-icon-btn" onClick={() => router.push('/')}>←</button>
            </div>
            <div className="fai-header-center">
              <div className="fai-logo"><img src={LOGO} alt="BSC" /></div>
              <div className="fai-header-text">
                <div className="fai-header-name">Founder AI</div>
                <div className="fai-header-sub">Your private BSC assistant</div>
              </div>
            </div>
            <div className="fai-header-right">
              <div className="fai-status">
                <span className="fai-status-dot" />
                <span className="fai-status-text">Online</span>
              </div>
              <button className="fai-icon-btn" onClick={startNewChat}>✏️</button>
            </div>
          </div>

          <div className="fai-messages">
            {messages.length === 0 ? (
              <div className="fai-welcome">
                <div className="fai-welcome-logo"><img src={LOGO} alt="BSC Marketplace" /></div>
                <h2 className="fai-welcome-title">{greeting()}, <span className="gold">Dedrick.</span></h2>
                <p className="fai-welcome-text">I know your business inside and out — pricing rules, supplier costs, margins, inventory, the whole thing. Ask me anything.</p>
                <div className="fai-suggestions">
                  {SUGGESTIONS.map(s => (
                    <button key={s} className="fai-sugg" onClick={() => sendMessage(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(m => (
                  <div key={m.id} className={`fai-msg-row ${m.role}`}>
                    {m.role === 'assistant' && <div className="fai-avatar fai-avatar-ai"><img src={LOGO} alt="" /></div>}
                    <div className={`fai-bubble ${m.role === 'user' ? 'fai-bubble-user' : 'fai-bubble-ai'}`}>
                      <div className="fai-bubble-text" dangerouslySetInnerHTML={{ __html: fmt(m.content) }} />
                      <span className="fai-bubble-time">{formatTime(m.created_at)}</span>
                    </div>
                    {m.role === 'user' && <div className="fai-avatar fai-avatar-user">D</div>}
                  </div>
                ))}
                {loading && (
                  <div className="fai-msg-row">
                    <div className="fai-avatar fai-avatar-ai"><img src={LOGO} alt="" /></div>
                    <div className="fai-bubble fai-bubble-ai">
                      <div className="fai-typing">
                        <span className="fai-dot" />
                        <span className="fai-dot" />
                        <span className="fai-dot" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="fai-input-wrap">
            <div className="fai-input-inner">
              <textarea ref={inputRef} className="fai-textarea" placeholder="Ask Founder AI anything about your business..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} rows={1} disabled={loading} />
              <button className="fai-send" onClick={() => sendMessage()} disabled={!input.trim() || loading}>↑</button>
            </div>
            <div className="fai-hint">🔒 Private · Powered by Claude · Chat history saved</div>
          </div>
        </div>
      </div>
    </>
  );
}
