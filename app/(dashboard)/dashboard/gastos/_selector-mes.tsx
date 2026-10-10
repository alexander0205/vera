'use client';

import { useRouter } from 'next/navigation';
import { NativeSelect } from '@/components/ui/native-select';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Todos los gastos, o los de un mes.
 *
 * Arranca en «Todos» a propósito: con un mes por defecto, un gasto registrado
 * en otro mes no aparece y parece que no se guardó. Pasó de verdad —la factura
 * de septiembre no salía porque la pantalla abría en octubre—, así que la
 * lista enseña todo y el mes se elige cuando se busca algo concreto.
 *
 * Cambiar de mes vuelve a la primera página: el `?p=` de la anterior no
 * significa nada en una lista distinta.
 */
export function SelectorMes({ mes, hoy }: { mes: string | null; hoy: string }) {
  const router = useRouter();
  const [y, m] = hoy.split('-').map(Number);
  const meses = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return (
    <NativeSelect aria-label="Mes" value={mes ?? ''} style={{ width: 'auto', height: 36 }}
      onChange={(e) => router.push(e.target.value ? `/dashboard/gastos?mes=${e.target.value}` : '/dashboard/gastos')}>
      <option value="">Todos los meses</option>
      {meses.map((x) => <option key={x} value={x}>{MESES[Number(x.slice(5, 7)) - 1]} {x.slice(0, 4)}</option>)}
    </NativeSelect>
  );
}
