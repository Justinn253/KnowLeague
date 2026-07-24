'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { getOrCreateClientId } from '@/lib/game-storage';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { ContactSubmissionCategory } from '@/lib/contact';

const CONTACT_MESSAGE_MAX_LENGTH = 2000;

const contactOptions: { value: ContactSubmissionCategory; label: string }[] = [
  { value: 'feedback', label: 'Feedback' },
  { value: 'bug_report', label: 'Report a bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'player_report', label: 'Report a player' },
];

type ContactUsWidgetProps = {
  variant?: 'floating' | 'drawer';
};

export function ContactUsWidget({ variant = 'floating' }: ContactUsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<ContactSubmissionCategory>('feedback');
  const [message, setMessage] = useState('');
  const [reportedUsername, setReportedUsername] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const submitContactForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanMessage = message.trim();
    const cleanReportedUsername = reportedUsername.trim();

    if (!cleanMessage || status === 'submitting') {
      return;
    }

    if (category === 'player_report' && cleanReportedUsername.length < 3) {
      setStatus('error');
      setErrorMessage('Enter the player username you are reporting.');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const supabase = getOptionalSupabaseClient();
      const { data: sessionData } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionData.session ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
        },
        body: JSON.stringify({
          category,
          message: cleanMessage,
          clientId: getOrCreateClientId(),
          pagePath: window.location.pathname,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          reportedUsername: category === 'player_report' ? cleanReportedUsername : null,
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error ?? 'Unable to submit contact form.');
      }

      setMessage('');
      setReportedUsername('');
      setStatus('success');
      window.setTimeout(() => {
        setStatus('idle');
        setIsOpen(false);
      }, 1200);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit contact form.');
    }
  };

  return (
    <div className="relative">
      {isOpen ? (
        <div
          ref={panelRef}
          className={variant === 'drawer'
            ? 'fixed left-1/2 top-1/2 z-[110] max-h-[90vh] w-[min(calc(100vw-2rem),26rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-4'
            : 'absolute bottom-full right-0 mb-3 w-[min(calc(100vw-2.5rem),26rem)] rounded-3xl border border-white/10 bg-slate-950 p-4'}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Contact Us</p>
              <h2 className="mt-1 text-lg font-bold text-white">Send feedback</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close contact form"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submitContactForm} className="mt-4 grid gap-3">
            <p className="rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
              Or email us directly: <a href="mailto:knowleague-support@gmail.com" className="font-semibold text-amber-200 hover:text-amber-100">knowleague-support@gmail.com</a>
            </p>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Type</span>
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as ContactSubmissionCategory);
                  setReportedUsername('');
                  setStatus('idle');
                  setErrorMessage('');
                }}
                className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition focus:border-white/20 focus:ring-1 focus:ring-white/15"
              >
                {contactOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {category === 'player_report' ? (
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Player Username</span>
                <input
                  value={reportedUsername}
                  onChange={(event) => setReportedUsername(event.target.value.slice(0, 100))}
                  placeholder="Enter username"
                  autoComplete="off"
                  className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                />
              </label>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Message</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, CONTACT_MESSAGE_MAX_LENGTH))}
                maxLength={CONTACT_MESSAGE_MAX_LENGTH}
                rows={6}
                placeholder="Tell us what happened or what you would like to see."
                className="min-h-36 resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15"
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {message.length}/{CONTACT_MESSAGE_MAX_LENGTH}
              </p>
              <button
                type="submit"
                disabled={status === 'submitting' || !message.trim() || (category === 'player_report' && reportedUsername.trim().length < 3)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={16} />
                {status === 'submitting' ? 'Sending' : 'Submit'}
              </button>
            </div>

            {status === 'success' ? (
              <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                Thanks, your message was submitted.
              </p>
            ) : null}

            {status === 'error' ? (
              <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
                {errorMessage}
              </p>
            ) : null}
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={variant === 'drawer'
            ? 'flex min-h-12 w-full items-center justify-start gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-left text-sm font-bold text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200'
            : 'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-slate-950 px-4 text-sm font-bold text-amber-200 transition hover:border-amber-200 hover:bg-slate-900'}
        >
          {variant === 'drawer' ? (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-slate-200">
              <MessageSquare size={18} />
            </span>
          ) : <MessageSquare size={18} />}
          Contact
        </button>
      )}
    </div>
  );
}
