'use client';

// components/SimpleMarkdown.tsx
//
// Tiny markdown renderer for the seeded SOP/SSOP bodies (no extra
// dependency). Supports: headings (#, ##, ###), bold (**...**), italic
// (_..._), inline code (`...`), bulleted lists (-), tables (|...|),
// horizontal rules (---), and paragraph breaks on blank lines.
//
// HTML is escaped first so user-supplied markdown can't inject script.

import { useMemo } from 'react';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function renderInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code style="background:rgba(245,197,24,0.12);color:#f5c518;padding:1px 4px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:.92em">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^_\w])_([^_]+)_(?!\w)/g, '$1<em>$2</em>');
}

function renderMarkdown(md: string): string {
  const escaped = escapeHtml(md.trim());
  const lines = escaped.split('\n');
  const out: string[] = [];

  let inList = false;
  let inTable = false;
  let tableHeaderEmitted = false;
  let paraBuf: string[] = [];

  function flushPara() {
    if (paraBuf.length > 0) {
      out.push('<p style="margin:0 0 10px;line-height:1.55;">' + renderInline(paraBuf.join(' ')) + '</p>');
      paraBuf = [];
    }
  }
  function flushList() {
    if (inList) { out.push('</ul>'); inList = false; }
  }
  function flushTable() {
    if (inTable) { out.push('</tbody></table>'); inTable = false; tableHeaderEmitted = false; }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const t = raw.trimEnd();

    // Blank line — flush paragraph
    if (!t.trim()) { flushPara(); flushList(); flushTable(); continue; }

    // Horizontal rule
    if (/^-{3,}$/.test(t.trim())) { flushPara(); flushList(); flushTable(); out.push('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:14px 0" />'); continue; }

    // Headings
    const h = /^(#{1,3})\s+(.+)$/.exec(t);
    if (h) {
      flushPara(); flushList(); flushTable();
      const lvl = h[1].length;
      const styles = lvl === 1 ? 'font-size:20px;font-weight:800;color:#f5c518;margin:14px 0 8px;'
                  : lvl === 2 ? 'font-size:16px;font-weight:800;color:#f5c518;margin:14px 0 6px;'
                  :              'font-size:13px;font-weight:800;color:#fbbf24;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.5px;';
      out.push(`<h${lvl} style="${styles}">${renderInline(h[2])}</h${lvl}>`);
      continue;
    }

    // Bullet
    if (/^- /.test(t.trim())) {
      flushPara(); flushTable();
      if (!inList) { out.push('<ul style="margin:0 0 10px;padding-left:18px;line-height:1.55;">'); inList = true; }
      out.push('<li style="margin-bottom:2px;">' + renderInline(t.trim().slice(2)) + '</li>');
      continue;
    }

    // Table row: starts with |
    if (/^\|.+\|/.test(t.trim())) {
      flushPara(); flushList();
      const cells = t.trim().split('|').slice(1, -1).map(c => c.trim());
      // Skip the alignment row (|---|---|)
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      if (!inTable) {
        out.push('<table style="width:100%;border-collapse:collapse;margin:0 0 10px;font-size:13px;background:rgba(0,0,0,0.15);border-radius:6px;overflow:hidden">');
        inTable = true;
      }
      if (!tableHeaderEmitted) {
        out.push('<thead><tr>' + cells.map(c => `<th style="text-align:left;padding:6px 10px;background:rgba(245,197,24,0.12);color:#f5c518;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">${renderInline(c)}</th>`).join('') + '</tr></thead><tbody>');
        tableHeaderEmitted = true;
      } else {
        out.push('<tr>' + cells.map(c => `<td style="padding:6px 10px;border-top:1px solid rgba(255,255,255,0.06);">${renderInline(c)}</td>`).join('') + '</tr>');
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Regular paragraph line
    flushList(); flushTable();
    paraBuf.push(t.trim());
  }

  flushPara(); flushList(); flushTable();
  return out.join('\n');
}

export default function SimpleMarkdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div className={className}
      style={{ color: '#cbd5e1', fontSize: 14 }}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
