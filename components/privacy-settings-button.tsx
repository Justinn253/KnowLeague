'use client';

import { useEffect, useState } from 'react';

type GoogleFundingChoices = {
  callbackQueue?: Array<(() => void) | { CONSENT_API_READY: () => void }>;
  showRevocationMessage?: () => void;
};

type WindowWithGoogleFundingChoices = Window & { googlefc?: GoogleFundingChoices };

export function PrivacySettingsButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'unavailable'>('idle');

  useEffect(() => {
    if (status !== 'loading') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setStatus('unavailable'), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const openPrivacySettings = () => {
    const windowWithGooglefc = window as WindowWithGoogleFundingChoices;
    const googlefc = windowWithGooglefc.googlefc ?? {};
    windowWithGooglefc.googlefc = googlefc;
    googlefc.callbackQueue ??= [];

    if (googlefc.showRevocationMessage) {
      googlefc.showRevocationMessage();
      setStatus('idle');
      return;
    }

    googlefc.callbackQueue.push({
      CONSENT_API_READY: () => {
        setStatus('idle');
        windowWithGooglefc.googlefc?.showRevocationMessage?.();
      },
    });
    setStatus('loading');
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={openPrivacySettings}
        className="transition hover:text-amber-200"
        aria-describedby={status === 'unavailable' ? 'privacy-settings-status' : undefined}
      >
        Privacy and cookie settings
      </button>
      {status === 'loading' ? <span className="text-slate-500">Loading…</span> : null}
      {status === 'unavailable' ? <span id="privacy-settings-status" className="text-slate-500">Unavailable right now</span> : null}
    </span>
  );
}
