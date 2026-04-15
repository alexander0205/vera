'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

export function SubmitButton({
  destacado = false,
  label = 'Empezar prueba gratis',
}: {
  destacado?: boolean;
  label?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className={`w-full rounded-full text-sm font-medium py-2.5 transition-colors ${
        destacado
          ? 'bg-white text-teal-700 hover:bg-teal-50 border-0'
          : 'bg-teal-600 text-white hover:bg-teal-700 border-0'
      }`}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin mr-2 h-4 w-4" />
          Cargando...
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="ml-2 h-4 w-4" />
        </>
      )}
    </Button>
  );
}
