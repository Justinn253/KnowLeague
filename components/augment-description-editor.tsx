'use client';

import { useLayoutEffect, useRef } from 'react';
import { AUGMENT_LIMITS, AUGMENT_STATS, AUGMENT_STAT_ICONS, AUGMENT_INLINE_ICONS, type AugmentInlineIcon } from '@/lib/augment-builder';
import { augmentButton, augmentInput } from '@/components/augment-shared';
import { HeaderHoverNote } from '@/components/header-hover-note';

export function AugmentDescriptionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const selection = selectionRef.current;
    if (!selection || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(selection.start, selection.end);
    selectionRef.current = null;
  }, [value]);
  function insert(key: AugmentInlineIcon | 'bold', icon = false) {
    const start = ref.current?.selectionStart ?? value.length;
    const end = ref.current?.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const text = icon ? `[icon:${key}]` : `[${key}]${selected}[/${key}]`;
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > AUGMENT_LIMITS.description) return;
    const cursor = icon ? start + text.length : start + key.length + 2;
    selectionRef.current = { start: cursor, end: icon ? cursor : cursor + selected.length };
    onChange(next);
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-bold text-slate-300">Text colors & formatting</p>
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Text colors and formatting">
          <span className="group relative inline-flex">
            <button type="button" className={augmentButton} onClick={() => insert('bold')}>Bold</button>
            <HeaderHoverNote compact>Bold selected text</HeaderHoverNote>
          </span>
          {Object.entries(AUGMENT_STATS).map(([key, stat]) => (
            <span key={key} className="group relative inline-flex">
              <button
                type="button"
                className={augmentButton}
                style={{ color: stat.color }}
                onClick={() => insert(key as AugmentInlineIcon)}
                aria-label={`Color text: ${stat.label}`}
              >
                {stat.label}
              </button>
              <HeaderHoverNote compact>Color selected text as {stat.label}</HeaderHoverNote>
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold text-slate-300">Icons</p>
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Description icons">
          {Object.entries(AUGMENT_INLINE_ICONS).map(([key, stat]) => {
            const uv = AUGMENT_STAT_ICONS[key as AugmentInlineIcon];
            const width = uv.endX - uv.startX;
            const height = uv.endY - uv.startY;
            return (
              <span key={key} className="group relative inline-flex">
                <button
                  type="button"
                  className={`${augmentButton} w-11 !px-2`}
                  onClick={() => insert(key as AugmentInlineIcon, true)}
                  aria-label={`Insert ${stat.label} icon`}
                >
                  <span aria-hidden="true" className="inline-block h-5 w-5" style={{
                    backgroundImage: 'url(/augments/stat-icons.png)',
                    backgroundSize: `${100 / width}% ${100 / height}%`,
                    backgroundPosition: `${(uv.startX / (1 - width)) * 100}% ${(uv.startY / (1 - height)) * 100}%`,
                  }} />
                </button>
                <HeaderHoverNote compact>Insert {stat.label} icon</HeaderHoverNote>
              </span>
            );
          })}
        </div>
      </div>
      <label className="block text-sm font-bold text-slate-200" htmlFor="augment-description">
        Short description
      </label>
      <textarea
        ref={ref}
        id="augment-description"
        rows={8}
        className={augmentInput}
        value={value}
        maxLength={AUGMENT_LIMITS.description}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Your attacks grant [health]50 maximum health[/health]."
      />
      {value.split('\n').length > 12 ? (
        <p role="alert" className="text-sm text-red-200">
          Use at most 12 lines on the card. Put additional detail in the long description.
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        {value.length}/{AUGMENT_LIMITS.description} characters
      </p>
    </div>
  );
}
