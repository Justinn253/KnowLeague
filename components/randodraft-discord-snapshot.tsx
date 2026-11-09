'use client';

import { useEffect, useState } from 'react';
import { decodeRandodraftShare } from '@/lib/randodraft-share';
import { createRandodraftShareImage } from '@/lib/randodraft-share-image';

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Image export failed.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Image export failed.'));
    reader.readAsDataURL(blob);
  });
}

/** Non-interactive client render target that reuses Randodraft's Copy image export. */
export function RandodraftDiscordSnapshot({ share }: { share: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const entry = decodeRandodraftShare(share);
    if (!entry) {
      setError('The Randodraft snapshot is invalid or has expired.');
      return;
    }

    let active = true;
    void createRandodraftShareImage(entry)
      .then(blobDataUrl)
      .then((url) => {
        if (active) setImageUrl(url);
      })
      .catch(() => {
        if (active) setError('The Randodraft image could not be created.');
      });
    return () => { active = false; };
  }, [share]);

  if (error) {
    return (
      <main className="min-h-[100dvh] bg-[#030712] p-6 text-slate-100">
        <p data-randodraft-capture-error="true" className="rounded-2xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#030712] p-6 text-slate-100" data-randodraft-capture-ready={imageUrl ? 'true' : undefined}>
      {/* The capture flow needs the exact canvas data URL; next/image would transform it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imageUrl ? <img data-randodraft-capture-image="true" src={imageUrl} alt="Randodraft result" /> : <p>Creating Randodraft image…</p>}
    </main>
  );
}
