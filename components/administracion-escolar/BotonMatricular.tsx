'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, DownloadCloud, GitCompareArrows, Grid3x3, Plus, Users } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/lib/hooks/usePermissions';

/**
 * «Nueva matrícula» con sus otras formas al lado, en la flecha: en lote, desde
 * SIGERD y «Servicios por alumno». Antes eran tres botones y un recuadro con
 * otro botón, todos para lo mismo: matricular.
 *
 * Los alumnos de SIGERD sin matricular se cuentan aquí (la misma consulta que
 * usaba el recuadro) y el número sale en la flecha, para que no se pierda.
 */

interface PendientesSigerd { disponible: boolean; porMatricular: number }

export function BotonMatricular({ onNueva, onLote, deshabilitado }: {
  onNueva: () => void;
  onLote: () => void;
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const [sigerd, setSigerd] = useState<PendientesSigerd | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch('/api/administracion-escolar/matriculas/desde-sigerd')
      // Sin permiso o sin SIGERD, la opción simplemente no sale.
      .then(async (res) => (res.ok ? (await res.json()) as PendientesSigerd : null))
      .catch(() => null)
      .then((d) => { if (vigente) setSigerd(d); });
    return () => { vigente = false; };
  }, []);

  const pendientes = sigerd?.disponible ? sigerd.porMatricular : 0;

  return (
    <div className="inline-flex shrink-0 rounded-lg shadow-sm">
      <button type="button" onClick={onNueva} disabled={deshabilitado}
        title="Matricular a un alumno"
        className="inline-flex h-[35px] items-center gap-2 rounded-l-lg bg-zero-600 pl-4 pr-3 text-sm font-semibold text-white transition-colors hover:bg-zero-700 disabled:opacity-50">
        <Plus className="h-4 w-4" />Nueva matrícula
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button"
            aria-label={pendientes > 0 ? `Otras formas de matricular (${pendientes} de SIGERD sin matricular)` : 'Otras formas de matricular'}
            title="Otras formas de matricular: en lote, desde SIGERD, servicios por alumno"
            className="inline-flex h-[35px] items-center gap-1.5 rounded-r-lg border-l border-white/30 bg-zero-600 px-2.5 text-white transition-colors hover:bg-zero-700">
            {pendientes > 0 && (
              <span className="rounded-full bg-white px-1.5 text-[11px] font-bold tabular-nums leading-[18px] text-zero-700">{pendientes}</span>
            )}
            <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <Opcion icono={<Users className="h-4 w-4" />} titulo="Matricular en lote"
            detalle="Varios alumnos a la misma sección" disabled={deshabilitado} onSelect={onLote} />
          {sigerd?.disponible && (
            <Opcion icono={<DownloadCloud className="h-4 w-4" />} titulo="Desde SIGERD"
              detalle={pendientes > 0
                ? `${pendientes} alumno${pendientes !== 1 ? 's' : ''} que SIGERD ya tiene en su sección`
                : 'Todos los de SIGERD ya tienen matrícula'}
              cuenta={pendientes}
              onSelect={() => router.push('/escolar/matriculas/desde-sigerd')} />
          )}
          <DropdownMenuSeparator />
          <Opcion icono={<Grid3x3 className="h-4 w-4" />} titulo="Servicios por alumno"
            detalle="Qué lleva cada matriculado: almuerzo, transporte…"
            onSelect={() => router.push('/escolar/matriculas/servicios')} />
          {/* Los ya matriculados que SIGERD cambió de sección no salen en «Desde SIGERD». */}
          {sigerd?.disponible && can('administracion-escolar:configurar') && (
            <Opcion icono={<GitCompareArrows className="h-4 w-4" />} titulo="Revisar cambios de SIGERD"
              detalle="Matriculados que SIGERD cambió de sección"
              onSelect={() => router.push('/escolar/configuracion/sigerd/cambios')} />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Opcion({ icono, titulo, detalle, cuenta, disabled, onSelect }: {
  icono: ReactNode; titulo: string; detalle: string; cuenta?: number; disabled?: boolean; onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled}>
      <span className="flex w-full items-start gap-3 py-0.5">
        <span className="mt-0.5 text-zero-600">{icono}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900">{titulo}</span>
          <span className="block whitespace-normal text-xs text-gray-500">{detalle}</span>
        </span>
        {!!cuenta && (
          <span className="mt-0.5 rounded-full bg-zero-600 px-1.5 text-[11px] font-bold tabular-nums leading-[18px] text-white">{cuenta}</span>
        )}
      </span>
    </DropdownMenuItem>
  );
}
