'use client';

/**
 * Las bajas y reingresos del alumno, con quién los hizo.
 *
 * Es la respuesta a «¿cuándo se fue?, ¿por qué?, ¿por qué no se le cobró
 * diciembre?» sin abrir las notas de la matrícula: cada baja dice cuántas
 * cuotas anuló, y cada reingreso qué fechas movió para no cobrar los meses
 * fuera.
 */

import useSWR from 'swr';
import { UserMinus, UserPlus } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';

export interface MovimientoEstudiante {
  id: number;
  tipo: 'baja' | 'reingreso' | string;
  estadoAnterior: string | null;
  estadoNuevo: string;
  fecha: string;
  motivo: string | null;
  cuotasAnuladas: number[];
  cuotasRestauradas: number[];
  fechaInscripcionAnterior: string | null;
  recurrenteInicioAnterior: string | null;
  recurrenteInicioNuevo: string | null;
  periodo: string | null;
  usuario: string | null;
  usuarioEmail: string | null;
  creadoEn: string;
}

/** La clave SWR, para que quien da de baja o reactiva la marque como vieja. */
export const claveMovimientosEstudiante = (estudianteId: number) =>
  `/api/administracion-escolar/estudiantes/${estudianteId}/estado?accion=historial`;

const ESTADO: Record<string, string> = {
  activo: 'activo', retirado: 'retirado', inactivo: 'inactivo', graduado: 'graduado',
};

export function MovimientosEstudiante({ estudianteId }: { estudianteId: number }) {
  const { data } = useSWR<{ movimientos: MovimientoEstudiante[] }>(
    claveMovimientosEstudiante(estudianteId),
    (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { movimientos: [] })),
    { revalidateOnFocus: false },
  );
  const movimientos = data?.movimientos ?? [];
  if (movimientos.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">Bajas y reingresos</h3>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {movimientos.map((m) => {
          const baja = m.tipo === 'baja';
          return (
            <li key={m.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
              {baja
                ? <UserMinus className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                : <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-zero-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-gray-900">
                  <b>{baja ? 'Baja' : 'Reingreso'}</b> el {fmtFechaCorta(m.fecha)}
                  {baja && <> · quedó {ESTADO[m.estadoNuevo] ?? m.estadoNuevo}</>}
                  {m.periodo && <span className="text-gray-500"> · {m.periodo}</span>}
                </p>
                {m.motivo && <p className="text-gray-600">{m.motivo}</p>}
                <p className="text-xs text-gray-500">
                  {baja && m.cuotasAnuladas.length > 0 && `${m.cuotasAnuladas.length} cuota(s) futura(s) anulada(s). `}
                  {!baja && m.cuotasRestauradas.length > 0 && `${m.cuotasRestauradas.length} cuota(s) devuelta(s). `}
                  {!baja && m.recurrenteInicioNuevo && (
                    `La mensualidad volvió a contar desde el ${fmtFechaCorta(m.recurrenteInicioNuevo)}`
                    + (m.recurrenteInicioAnterior ? ` (antes ${fmtFechaCorta(m.recurrenteInicioAnterior)}). ` : '. ')
                  )}
                  {!baja && m.fechaInscripcionAnterior && `Inscripción anterior: ${fmtFechaCorta(m.fechaInscripcionAnterior)}. `}
                  Registrado por {m.usuario || m.usuarioEmail || 'alguien'} el {fmtFechaCorta(m.creadoEn)}.
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
