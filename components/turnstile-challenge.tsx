'use client';

import { useEffect, useRef } from 'react';

type TurnstileInstance = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    theme: 'light' | 'dark' | 'auto';
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

const TURNSTILE_SCRIPT_ID = 'knowleague-turnstile-script';
export const isTurnstileClientEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

type TurnstileChallengeProps = {
  onTokenChange: (token: string | null) => void;
  resetKey: number;
};

export function TurnstileChallenge({ onTokenChange, resetKey }: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const container = containerRef.current;
    if (!siteKey || !container) {
      return undefined;
    }

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || widgetIdRef.current || !window.turnstile) {
        return;
      }

      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token) => onTokenChange(token),
        'expired-callback': () => onTokenChange(null),
        'error-callback': () => onTokenChange(null),
      });
    };

    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', renderWidget);
      renderWidget();
    } else {
      const script = document.createElement('script');
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', renderWidget);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (existingScript) {
        existingScript.removeEventListener('load', renderWidget);
      }
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      onTokenChange(null);
    };
  }, [onTokenChange, resetKey]);

  if (!isTurnstileClientEnabled) {
    return null;
  }

  return <div ref={containerRef} className="min-h-[65px]" />;
}
