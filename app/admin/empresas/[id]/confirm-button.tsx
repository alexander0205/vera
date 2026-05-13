'use client';

interface Props {
  action:    (formData: FormData) => Promise<void>;
  message:   string;
  className: string;
  children:  React.ReactNode;
  fields:    Record<string, string | number>;
}

export function ConfirmButton({ action, message, className, children, fields }: Props) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <button
        type="submit"
        className={className}
        onClick={e => { if (!confirm(message)) e.preventDefault(); }}
      >
        {children}
      </button>
    </form>
  );
}
