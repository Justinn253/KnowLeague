import { Check, X } from 'lucide-react';

export type PasswordRequirement = {
  id: string;
  label: string;
  met: boolean;
};

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: 'uppercase',
      label: 'At least 1 capital letter',
      met: /[A-Z]/.test(password),
    },
    {
      id: 'lowercase',
      label: 'At least 1 lowercase letter',
      met: /[a-z]/.test(password),
    },
    {
      id: 'length',
      label: 'At least 8 characters',
      met: password.length >= 8,
    },
    {
      id: 'digit',
      label: 'At least 1 digit',
      met: /\d/.test(password),
    },
  ];
}

export function isValidPassword(password: string) {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2">
      {getPasswordRequirements(password).map((requirement) => (
        <div
          key={requirement.id}
          className={`flex items-center gap-2 text-xs font-semibold ${
            requirement.met ? 'text-emerald-200' : 'text-red-200'
          }`}
        >
          {requirement.met ? <Check size={14} /> : <X size={14} />}
          {requirement.label}
        </div>
      ))}
    </div>
  );
}
