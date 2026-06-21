'use client';

// ConnectClaudeCode — Founder AI → Claude Code launch handoff (Batch 9).
//
// Founder clicks "Connect to Claude Code" → confirms/edits the task → gets a
// terminal-style block with a ONE-TOUCH copy command. Pasting it into their own
// terminal pulls the repo and launches Claude Code on the task. The command
// carries no secrets (Claude Code uses the local login); the only token is a
// single-use, 15-minute handoff token that unlocks just the task text.

import { useState } from 'react';
import { useServerSave } from '@/lib/useServerSave';

const DEFAULT_TASK =
  'Continue BSC work. Read docs/DECISIONS.md for the latest state, then pick up the next item.';

export default function ConnectClaudeCode() {
  const [open, setOpen]       = useState(false);
  const [task, setTask]       = useState(DEFAULT_TASK);
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const { save, state, error } = useServerSave('/api/founder/code-handoff');

  async function generate() {
    setCommand(null);
    const r = await save<{ command?: string }>({ task: task.trim() || DEFAULT_TASK });
    if (r.ok && r.data?.command) setCommand(r.data.command);
  }

  async function copy() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — user can select manually */ }
  }

  function close() {
    setOpen(false);
    setCommand(null);
    setCopied(false);
    setTask(DEFAULT_TASK);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#0b1628', color: '#f5c518', border: '1px solid rgba(245,197,24,0.35)',
          borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer',
        }}
      >
        🔌 Connect to Claude Code
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0b1628', borderRadius: 14, padding: 18, maxWidth: 620, width: '100%',
              marginTop: 40, border: '1px solid rgba(245,197,24,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ color: '#f5c518', margin: 0, fontSize: 17, fontWeight: 900 }}>🔌 Connect to Claude Code</h2>
              <button onClick={close} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
              This generates a one-touch terminal command. Paste it into your own terminal — it pulls the
              latest repo and launches Claude Code on the task below. No passwords or keys are in the
              command; Claude Code uses your own login. The link is single-use and expires in 15 minutes.
            </p>

            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
              Task for Claude Code
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              style={{
                width: '100%', background: '#060d1f', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, padding: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 12,
              }}
            />

            {!command ? (
              <button
                onClick={generate}
                disabled={state === 'saving'}
                style={{
                  width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 10,
                  padding: '12px', fontWeight: 900, fontSize: 14, cursor: 'pointer', opacity: state === 'saving' ? 0.6 : 1,
                }}
              >
                {state === 'saving' ? 'Generating…' : 'Generate launch command'}
              </button>
            ) : (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  Paste into your terminal
                </div>
                <pre
                  style={{
                    background: '#000', color: '#7CFC98', borderRadius: 8, padding: 12, fontSize: 12,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all', margin: '0 0 10px', border: '1px solid rgba(124,252,152,0.25)',
                  }}
                >{command}</pre>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={copy}
                    style={{ flex: 2, background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 900, fontSize: 14, cursor: 'pointer' }}
                  >
                    {copied ? '✓ Copied' : '📋 Copy command'}
                  </button>
                  <button
                    onClick={() => { setCommand(null); setCopied(false); }}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    New task
                  </button>
                </div>
                <p style={{ color: '#64748b', fontSize: 11, margin: '10px 0 0' }}>
                  ⏱ Single-use · expires 15 min after generating.
                </p>
              </>
            )}

            {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 10 }}>⚠ {error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
