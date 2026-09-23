'use client';

import { Info } from 'lucide-react';
import { ToggleSwitch } from '@/components/toggle-switch';
import { HeaderHoverNote } from '@/components/header-hover-note';
import { augmentInput } from '@/components/augment-shared';
import { AUGMENT_LIMITS, type AugmentDraft } from '@/lib/augment-builder';

function FieldLabel({ id, label, help }: { id: string; label: string; help: string }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-bold text-slate-300">
        {label}
      </label>
      <span className="group relative inline-flex">
        <button
          type="button"
          aria-label={`About ${label}`}
          aria-describedby={`${id}-help`}
          className="rounded-full p-0 text-slate-500 hover:text-amber-200 focus:outline-none"
        >
          <Info size={15} />
        </button>
        <HeaderHoverNote id={`${id}-help`} wide>
          {help}
        </HeaderHoverNote>
      </span>
    </div>
  );
}

export function AugmentExtraDetails({
  draft,
  disabled,
  onChange,
}: {
  draft: AugmentDraft;
  disabled: boolean;
  onChange: (patch: Partial<AugmentDraft>) => void;
}) {
  return (
    <details className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
      <summary className="cursor-pointer font-bold text-slate-200">
        Extra details & full description <span className="ml-2 text-xs font-normal text-slate-500">Optional</span>
      </summary>
      <fieldset disabled={disabled} className="mt-5 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              {
                field: 'questRequirements',
                toggle: 'questEnabled',
                label: 'Quest Requirements',
                help: 'Does this augment have a quest progress system? If so, describe it below.',
              },
              {
                field: 'restrictions',
                toggle: 'restrictionsEnabled',
                label: 'Restrictions',
                help: 'Is this augment restricted for certain champions, classes, etc? If so, describe them below.',
              },
            ] as const
          ).map(({ field, toggle, label, help }) => (
            <div key={field} className="min-w-0">
              <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <FieldLabel id={`augment-${field}`} label={label} help={help} />
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft[toggle]}
                  aria-label={`Enable ${label}`}
                  aria-controls={`augment-${field}`}
                  onClick={() => onChange({ [toggle]: !draft[toggle] })}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-1 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <ToggleSwitch checked={draft[toggle]} disabled={disabled} />
                </button>
              </div>
              <textarea
                id={`augment-${field}`}
                rows={4}
                disabled={!draft[toggle]}
                value={draft[field]}
                maxLength={AUGMENT_LIMITS[field]}
                onChange={(event) => onChange({ [field]: event.target.value })}
                className={`${augmentInput} disabled:cursor-not-allowed disabled:opacity-40`}
              />
            </div>
          ))}
        </div>
        {(
          [
            {
              field: 'longDescription',
              label: 'Long Description',
              help: 'In depth description of the augment that is usually behind the scenes.',
              rows: 5,
            },
            { field: 'notes', label: 'Notes', help: 'Anything else you want to add to this augment?', rows: 3 },
          ] as const
        ).map(({ field, label, help, rows }) => (
          <div key={field}>
            <FieldLabel id={`augment-${field}`} label={label} help={help} />
            <textarea
              id={`augment-${field}`}
              rows={rows}
              value={draft[field]}
              maxLength={AUGMENT_LIMITS[field]}
              onChange={(event) => onChange({ [field]: event.target.value })}
              className={`${augmentInput} mt-2`}
            />
          </div>
        ))}
      </fieldset>
    </details>
  );
}
