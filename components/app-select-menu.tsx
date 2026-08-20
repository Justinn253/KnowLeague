'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { playUiSound } from '@/lib/ui-sounds';

const APP_SELECT_MENU_OPEN_EVENT = 'knowleague:app-select-menu-open';

export type AppSelectOption<T extends string | number | null> = {
  value: T;
  label: string;
  description?: string;
};

type AppSelectMenuProps<T extends string | number | null> = {
  label: string;
  value: T;
  options: AppSelectOption<T>[];
  onChange?: (value: T) => void;
  onToggle?: (value: T) => void;
  selectedValues?: T[];
  multiple?: boolean;
  headerDescription?: string;
  disabled?: boolean;
  disabledDescription?: string;
  className?: string;
  triggerClassName?: string;
  hideLabel?: boolean;
  optionsClassName?: string;
  menuPlacement?: 'left' | 'right';
  menuClassName?: string;
};

export function AppSelectMenu<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
  onToggle,
  selectedValues,
  multiple = false,
  headerDescription,
  disabled = false,
  disabledDescription,
  className = '',
  triggerClassName = '',
  hideLabel = false,
  optionsClassName = '',
  menuPlacement = 'left',
  menuClassName = '',
}: AppSelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const activeValues = multiple ? (selectedValues ?? [value]) : [value];
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedOptions = options.filter((option) => activeValues.includes(option.value));
  const selectedLabel = multiple ? selectedOptions.map((option) => option.label).join(', ') : selectedOption?.label;

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWhenAnotherMenuOpens = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== menuId) setOpen(false);
    };
    document.addEventListener('pointerdown', closeWhenOutside);
    window.addEventListener(APP_SELECT_MENU_OPEN_EVENT, closeWhenAnotherMenuOpens);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      window.removeEventListener(APP_SELECT_MENU_OPEN_EVENT, closeWhenAnotherMenuOpens);
    };
  }, [menuId]);

  return (
    <div ref={rootRef} className={`relative grid gap-2 ${open ? 'z-[100]' : 'z-0'} ${disabledDescription ? 'group' : ''} ${className}`}>
      {!hideLabel ? <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span> : null}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            window.dispatchEvent(new CustomEvent(APP_SELECT_MENU_OPEN_EVENT, { detail: menuId }));
            setOpen(true);
          }}
          aria-label={hideLabel ? label : undefined}
          title={disabled ? disabledDescription : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex h-12 w-full items-center justify-between gap-3 rounded-2xl border bg-slate-950/90 py-2 pl-4 pr-5 text-left text-sm font-semibold text-white outline-none transition hover:bg-slate-900 focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60 ${open ? 'border-amber-300' : 'border-white/10'} ${triggerClassName}`}
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown size={17} className={`mr-1 shrink-0 text-slate-400 transition ${open ? 'rotate-180 text-amber-200' : ''}`} />
        </button>
        <div
          role="listbox"
          aria-multiselectable={multiple || undefined}
          aria-hidden={!open}
          className={`absolute ${menuPlacement === 'right' ? 'right-0' : menuClassName ? 'left-0' : 'left-0 right-0'} top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-3 transition-[opacity,transform] duration-100 ease-out sm:p-4 ${menuClassName} ${open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0'}`}
        >
          <div className="mb-3 border-b border-white/10 pb-3"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">{label}</p>{headerDescription ? <p className="mt-2 text-xs leading-5 text-slate-400">{headerDescription}</p> : null}</div>
          <div className={`grid gap-2 py-1 ${optionsClassName}`}>
            {options.map((option) => {
              const selected = activeValues.includes(option.value);
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={open ? 0 : -1}
                  onMouseEnter={() => playUiSound('autocomplete-hover')}
                  onFocus={() => playUiSound('autocomplete-hover')}
                  onClick={() => {
                    playUiSound('autocomplete-select');
                    if (multiple) onToggle?.(option.value);
                    else {
                      onChange?.(option.value);
                      setOpen(false);
                    }
                  }}
                  className={`flex min-h-12 w-full items-start gap-3 rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300 ${selected ? 'border-amber-300/60 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900/80 text-slate-200 hover:border-white/25'}`}
                >
                  <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-600 text-transparent'}`}><Check size={13} /></span>
                  <span><span className="block text-sm font-bold">{option.label}</span>{option.description ? <span className="mt-0.5 block text-xs leading-5 text-slate-400">{option.description}</span> : null}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {disabled && disabledDescription ? <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-max max-w-[calc(100vw-2rem)] whitespace-normal rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold leading-5 text-slate-200 group-hover:block group-focus-within:block sm:left-0 sm:right-auto sm:max-w-72">{disabledDescription}</span> : null}
    </div>
  );
}
