// File: app/ErrorBoundary.tsx
'use client';

import React from 'react';

type Props = { children: React.ReactNode; fallback?: React.ReactNode; label?: string; };
type State = { hasError: boolean; error?: Error; };

export class ErrorBoundary extends React.Component<Props, State> {
constructor(props: Props) {
super(props);
this.state = { hasError: false };
}

static getDerivedStateFromError(error: Error): State {
return { hasError: true, error };
}

componentDidCatch(error: Error, info: React.ErrorInfo) {
console.error('[BSC Error Boundary]', this.props.label || 'Unknown', error, info);
}

render() {
if (this.state.hasError) {
if (this.props.fallback) return this.props.fallback;
return (
<div style={{
backgroundColor: '#1a0808', border: '1px solid #7f1d1d',
borderRadius: 14, padding: '20px 18px', margin: '12px 0',
}}>
<p style={{ margin: '0 0 6px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>
⚠️ {this.props.label || 'Section'} failed to load
</p>
<p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: 12 }}>
The rest of BSC is working normally. Tap below to retry.
</p>
<button
onClick={() => this.setState({ hasError: false, error: undefined })}
style={{
padding: '9px 18px', borderRadius: 10, backgroundColor: '#f5c518',
color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13,
}}
>
🔄 Retry
</button>
{process.env.NODE_ENV === 'development' && this.state.error && (
<pre style={{ marginTop: 12, color: '#f87171', fontSize: 10, overflowX: 'auto' }}>
{this.state.error.message}
</pre>
)}
</div>
);
}
return this.props.children;
}
}

// ── PAGE-LEVEL ERROR BOUNDARY ──
// Wraps an entire page — shows full screen error with retry
export class PageErrorBoundary extends React.Component<Props, State> {
constructor(props: Props) {
super(props);
this.state = { hasError: false };
}

static getDerivedStateFromError(error: Error): State {
return { hasError: true, error };
}

componentDidCatch(error: Error, info: React.ErrorInfo) {
console.error('[BSC Page Error]', error, info);
}

render() {
if (this.state.hasError) {
return (
<div style={{
minHeight: '100vh', backgroundColor: '#060d1f',
display: 'flex', alignItems: 'center', justifyContent: 'center',
padding: 24, fontFamily: "'Inter', sans-serif",
}}>
<div style={{ textAlign: 'center', maxWidth: 360 }}>
<div style={{ fontSize: 56, marginBottom: 16 }}>🐟</div>
<p style={{ margin: '0 0 8px', color: '#f5c518', fontWeight: 'bold', fontSize: 20 }}>
BSC hit a snag
</p>
<p style={{ margin: '0 0 24px', color: '#4a5568', fontSize: 14, lineHeight: 1.6 }}>
Something went wrong loading this page. Your data is safe. Tap below to reload.
</p>
<button
onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
style={{
width: '100%', padding: '14px', borderRadius: 12,
backgroundColor: '#f5c518', color: '#000',
fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 15,
marginBottom: 12,
}}
>
🔄 Reload Page
</button>
<button
onClick={() => { window.location.href = '/'; }}
style={{
width: '100%', padding: '12px', borderRadius: 12,
backgroundColor: 'transparent', color: '#6b7280',
border: '1px solid #1e3a5f', cursor: 'pointer', fontSize: 14,
}}
>
← Back to Dashboard
</button>
{process.env.NODE_ENV === 'development' && this.state.error && (
<pre style={{ marginTop: 16, color: '#f87171', fontSize: 10, textAlign: 'left', overflowX: 'auto' }}>
{this.state.error.message}
</pre>
)}
</div>
</div>
);
}
return this.props.children;
}
}
