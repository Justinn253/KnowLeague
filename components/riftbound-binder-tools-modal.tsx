'use client';

import { Check, Copy, FileDown, LoaderCircle, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { buildRiftboundBinderShareSnapshot } from '@/lib/riftbound-share-types';
import { createRiftboundShareUrl } from '@/lib/riftbound-share-client';
import { createRiftboundBinderExport } from '@/lib/riftbound-binder-json';
import type { RiftboundBinder } from '@/lib/riftbound-binders';

export function RiftboundBinderToolsModal({ binder, session, onClose, onImport }: { binder: RiftboundBinder; session: Session; onClose: () => void; onImport: (file: File) => Promise<void> }) {
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(true);
  const [shareError, setShareError] = useState('');
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setShareLoading(true);
    setShareError('');
    const metadata = {
      createdBy: String(session.user.user_metadata?.username ?? session.user.user_metadata?.display_name ?? session.user.email?.split('@')[0] ?? 'KnowLeague user'),
      createdAt: new Date().toISOString(),
    };
    void createRiftboundShareUrl(buildRiftboundBinderShareSnapshot(binder, metadata), session)
      .then((url) => {
        if (!cancelled) setShareUrl(url);
      })
      .catch((error: unknown) => {
        if (!cancelled) setShareError(error instanceof Error ? error.message : 'Unable to prepare the binder share link.');
      })
      .finally(() => {
        if (!cancelled) setShareLoading(false);
      });
    return () => { cancelled = true; };
  }, [binder, session]);

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(createRiftboundBinderExport(binder), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${binder.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'riftbound-binder'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportError('');
    try {
      await onImport(file);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to import this binder JSON file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Export or import Riftbound binder" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-7" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close binder tools" onClick={onClose} className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"><X size={18} /></button>
        <div className="pr-14">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Binder tools</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Export / Import {binder.name}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Share, print, export, or import a binder.</p>
        </div>
        <div className="mt-6 grid gap-3">
          {shareLoading ? <p className="text-center text-xs font-semibold text-slate-500">Preparing share link...</p> : null}
          {shareError ? <p role="alert" className="text-center text-sm font-semibold text-red-200">{shareError}</p> : null}
          <button type="button" onClick={() => void copyShareUrl()} disabled={!shareUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200/50 bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60">{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Link copied' : 'Copy share link'}</button>
          <button type="button" onClick={() => shareUrl && window.open(shareUrl, '_blank', 'noopener,noreferrer')} disabled={!shareUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white disabled:cursor-wait disabled:opacity-60"><FileDown size={17} /> Open print / Save as PDF view</button>
          <button type="button" onClick={exportJson} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white"><FileDown size={17} /> Export Binder JSON</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void handleImport(event)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white disabled:cursor-wait disabled:opacity-60">{importing ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}{importing ? 'Importing binder...' : 'Import Binder JSON'}</button>
          {importError ? <p role="alert" className="text-sm font-semibold text-red-200">{importError}</p> : null}
        </div>
      </div>
    </div>
  );
}
