'use client';

import Link from 'next/link';
import { ArrowLeft, BookOpen, Check, Copy, Download, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { augmentPng } from '@/lib/augment-card-renderer';
import { HeaderHoverNote } from '@/components/header-hover-note';
import type { AugmentAuthor, AugmentDraft, PublishedAugment } from '@/lib/augment-builder';

export const augmentButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-100 transition hover:border-amber-200/60 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-50';
export const augmentInput =
  'w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:border-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-200';
export function AugmentAuthHint({ authenticated, children }: { authenticated: boolean; children: ReactNode }) {
  if (authenticated) return <>{children}</>;
  return (
    <span className="group relative inline-flex">
      {children}
      <HeaderHoverNote compact>KnowLeague account required</HeaderHoverNote>
    </span>
  );
}
export type AugmentBinderData = { author: AugmentAuthor; augments: PublishedAugment[]; hasMore: boolean };
const augmentBinderCache = new Map<string, AugmentBinderData>();
const augmentViewCache = new Map<string, PublishedAugment>();
export function getCachedAugmentBinder(owner: string, page: number) {
  return augmentBinderCache.get(`${owner}:${page}`) ?? null;
}
export function cacheAugmentBinder(owner: string, page: number, binder: AugmentBinderData) {
  augmentBinderCache.set(`${owner}:${page}`, binder);
}
export function invalidateAugmentBinder(owner: string) {
  for (const key of augmentBinderCache.keys()) if (key.startsWith(`${owner}:`)) augmentBinderCache.delete(key);
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('augment-binder-invalidated', { detail: { owner } }));
}
function augmentViewCacheKey(id: string, viewer: string | null) {
  return `${id}:${viewer ?? 'guest'}`;
}
export function getCachedAugmentView(id: string, viewer: string | null) {
  return augmentViewCache.get(augmentViewCacheKey(id, viewer)) ?? null;
}
export function cacheAugmentView(augment: PublishedAugment, viewer: string | null) {
  augmentViewCache.set(augmentViewCacheKey(augment.id, viewer), augment);
}
export function invalidateAugmentView(id: string) {
  for (const key of augmentViewCache.keys()) if (key.startsWith(`${id}:`)) augmentViewCache.delete(key);
}
export function useAugmentSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(
    () =>
      subscribeToAuthSession((next) => {
        setSession(next);
        setResolved(true);
      }),
    [],
  );
  return { session, resolved };
}
export async function augmentRequest<T>(url: string, session: Session | null, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to complete this request.');
  return body as T;
}
export function AugmentHeader({
  title,
  subtitle,
  back = '/games',
  backLabel,
  binder,
  forceBack = false,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  backLabel?: string;
  binder?: string;
  forceBack?: boolean;
}) {
  const router = useRouter();
  function goBack() {
    if (!forceBack && typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(back);
  }
  return (
    <header className="mb-6 flex flex-col items-start gap-3 border-b border-white/10 pb-6 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:gap-4">
        <button type="button" onClick={goBack} className={augmentButton + ' shrink-0'} aria-label={backLabel ?? 'Go back'}>
          <ArrowLeft size={18} />
          {backLabel ? <><span className="sm:hidden">Back</span><span className="hidden sm:inline">{backLabel}</span></> : null}
        </button>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-black text-white sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {binder ? (
        <Link href={`/augment-builder/binder/${binder}`} className={augmentButton + ' self-start'}>
          <BookOpen size={17} />
          My Augments
        </Link>
      ) : null}
    </header>
  );
}
export async function copyAugmentLink(path: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable.');
  await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
}

export async function copyAugmentImage(draft: AugmentDraft) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable.');
  const blob = augmentPng(draft);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function AugmentExport({ draft, url, compact = false }: { draft: AugmentDraft; url?: string; compact?: boolean }) {
  const [status, setStatus] = useState('');
  const [completedAction, setCompletedAction] = useState<'image' | 'download' | 'link' | null>(null);
  const [busy, setBusy] = useState(false);
  function showCompletedAction(action: 'image' | 'download' | 'link') {
    setStatus('');
    setCompletedAction(action);
    window.setTimeout(() => setCompletedAction((current) => current === action ? null : current), 1600);
  }
  async function exportImage(copy: boolean) {
    setBusy(true);
    setStatus('');
    try {
      // Supply a promise immediately to preserve Safari's clipboard user gesture.
      if (copy && typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem !== 'undefined') {
        await copyAugmentImage(draft);
        showCompletedAction('image');
      } else {
        const blob = augmentPng(draft);
        const objectUrl = URL.createObjectURL(await blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `${draft.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 60) || 'augment'}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        showCompletedAction('download');
      }
    } catch {
      setStatus('Could not copy the image. Try Download PNG, or check browser clipboard permissions.');
    } finally {
      setBusy(false);
    }
  }
  const buttonClass = compact ? `${augmentButton} !min-h-9 w-full !gap-1 !px-1 text-[0.65rem]` : `${augmentButton} w-full sm:w-auto`;
  return (
    <div className={compact ? 'flex w-full flex-wrap gap-1' : 'space-y-3'}>
      <div className={compact ? 'grid w-full grid-cols-1 gap-2 sm:grid-cols-2' : 'grid grid-cols-2 gap-2 sm:flex sm:flex-wrap'}>
        <button className={buttonClass} disabled={busy} onClick={() => void exportImage(true)}>
          {completedAction === 'image' ? <Check size={16} aria-hidden="true" /> : <ImageIcon size={16} />}
          <span>Copy image</span>
        </button>
        <button className={buttonClass} disabled={busy} onClick={() => void exportImage(false)}>
          {completedAction === 'download' ? <Check size={16} aria-hidden="true" /> : <Download size={16} />}
          <span>Download PNG</span>
        </button>
        {url ? (
          <button
            className={buttonClass + (compact ? '' : ' col-span-2 sm:col-auto')}
            aria-label="Copy link"
            title="Copy link"
            onClick={() => {
              void copyAugmentLink(url)
                .then(() => {
                  showCompletedAction('link');
                })
                .catch(() => setStatus('Could not copy. Copy the address from your browser.'));
            }}
          >
            {completedAction === 'link' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>Copy link</span>
          </button>
        ) : null}
      </div>
      {status ? <p role="alert" className={compact ? 'basis-full text-xs text-red-200' : 'text-sm text-red-200'}>{status}</p> : null}
    </div>
  );
}

