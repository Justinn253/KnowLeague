type ToggleSwitchProps = {
  checked: boolean;
  disabled?: boolean;
};

export function ToggleSwitch({ checked, disabled = false }: ToggleSwitchProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
        checked ? 'border-amber-300/50 bg-amber-300' : 'border-white/10 bg-slate-950'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </span>
  );
}
