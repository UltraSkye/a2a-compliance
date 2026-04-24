'use client';

import type { ComplianceReport } from '@a2a-compliance/core';
import { useState } from 'react';

type Result =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; report: ComplianceReport }
  | { kind: 'error'; message: string };

export default function Page() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setResult({ kind: 'loading' });
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        let parsed: { error?: string } = {};
        try {
          parsed = await res.json();
        } catch {
          parsed = { error: await res.text() };
        }
        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after');
          const waitHint = retryAfter ? ` Retry in ~${retryAfter}s.` : '';
          setResult({
            kind: 'error',
            message: `${parsed.error ?? 'rate limit exceeded'}.${waitHint}`,
          });
          return;
        }
        setResult({ kind: 'error', message: parsed.error || `HTTP ${res.status}` });
        return;
      }
      const report = (await res.json()) as ComplianceReport;
      setResult({ kind: 'ok', report });
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">a2a-compliance</h1>
      <p className="text-zinc-400 mb-8">
        Paste an A2A endpoint base URL. We'll fetch its agent card, probe its JSON-RPC endpoint, and
        run security checks — no data leaves your report.
      </p>

      <form onSubmit={onSubmit} className="flex gap-2 mb-8">
        <input
          type="url"
          required
          placeholder="https://agent.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 font-mono text-sm outline-none focus:border-zinc-600"
        />
        <button
          type="submit"
          disabled={result.kind === 'loading'}
          className="rounded-md bg-zinc-100 px-5 py-2 font-medium text-zinc-950 transition hover:bg-white disabled:opacity-50"
        >
          {result.kind === 'loading' ? 'Checking…' : 'Check'}
        </button>
      </form>

      {result.kind === 'error' && (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 p-4 text-red-300">
          {result.message}
        </div>
      )}

      {result.kind === 'ok' && <Report report={result.report} />}
    </main>
  );
}

function Report({ report }: { report: ComplianceReport }) {
  const { summary, checks } = report;
  return (
    <section>
      <div className="mb-6 flex gap-6 text-sm">
        <Stat label="passed" value={summary.pass} tone="ok" />
        <Stat label="warnings" value={summary.warn} tone="warn" />
        <Stat label="failed" value={summary.fail} tone="bad" />
        <Stat label="skipped" value={summary.skip} tone="muted" />
      </div>

      <ul className="divide-y divide-zinc-900 rounded-md border border-zinc-900">
        {checks.map((c) => (
          <li key={c.id} className="p-4">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <StatusIcon status={c.status} />
                <span className="font-mono text-xs text-zinc-500">[{c.severity}]</span>
                <span className="font-medium">{c.title}</span>
              </div>
              <span className="font-mono text-xs text-zinc-600">{c.id}</span>
            </div>
            {c.message && <p className="mt-2 pl-9 text-sm text-zinc-400">{c.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'bad' | 'muted';
}) {
  const color = {
    ok: 'text-green-400',
    warn: 'text-yellow-400',
    bad: 'text-red-400',
    muted: 'text-zinc-500',
  }[tone];
  return (
    <div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-zinc-500">{label}</div>
    </div>
  );
}

function StatusIcon({ status }: { status: 'pass' | 'fail' | 'warn' | 'skip' }) {
  const map = {
    pass: { char: '✓', class: 'text-green-400' },
    fail: { char: '✗', class: 'text-red-400' },
    warn: { char: '!', class: 'text-yellow-400' },
    skip: { char: '-', class: 'text-zinc-600' },
  } as const;
  const { char, class: cls } = map[status];
  return <span className={`inline-block w-4 font-mono ${cls}`}>{char}</span>;
}
