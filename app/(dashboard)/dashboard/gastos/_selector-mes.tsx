'use client';

import { useRouter } from 'next/navigation';
import { NativeSelect } from '@/components/ui/native-select';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Los últimos doce meses; cambiar de mes recarga la pantalla con `?mes=`. */
export function SelectorMes({ mes, hoy }: { mes: string; hoy: string }) {
  const router = useRouter();
  const [y, m] = hoy.split('-').map(Number);
  const meses = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return (
    <NativeSelect aria-label="Mes" value={mes} onChange={(e) => router.push(`/dashboard/gastos?mes=${e.target.value}`)} style={{ width: 'auto', height: 36 }}>
      {meses.map((x) => <option key={x} value={x}>{MESES[Number(x.slice(5, 7)) - 1]} {x.slice(0, 4)}</option>)}
    </NativeSelect>
  );
}
