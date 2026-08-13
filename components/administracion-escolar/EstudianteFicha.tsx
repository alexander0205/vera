'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Receipt, HandCoins, AlertTriangle } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';

/** Espejo de `EstudianteEnriquecido` de lib/administracion-escolar/queries.ts
 *  (aquel es `server-only` y no se puede importar desde el cliente). */
export interface EstudianteEnriquecido {
  /** 'dependiente' = beneficiario de Contactos sin ficha escolar; entonces `id`
   *  es el del DEPENDIENTE y esta ficha no aplica. */
  origen: 'estudiante' | 'dependiente';
  id: number;
  dependienteId: number | null;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  estado: string | null;
  sexo: string | null;
  fechaNacimiento: string | null;
  matriculaActivaId: number | null;
  periodoActivo: string | null;
  cursoActual: string | null;
  contacto: string | null;
  tutorResponsable: string | null;
  tutorTelefono: string | null;
  tutorEmail: string | null;
  deudaCentavos: number | null;
  cargosPendientes: number | null;
  ultimoPagoFecha: string | null;
  ultimoPagoCentavos: number | null;
}

interface CargoRow {
  id: number;
  montoCentavos: number;
  saldoCentavos: number;
  estado: string;
}

interface TutorVinculo {
  tutorId: number;
  nombre: string;
  relacion: string;
  responsablePago: boolean;
}

function iniciales(nombres: string, apellidos: string): string {
  return `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

interface Props {
  estudiante: EstudianteEnriquecido;
}

export function EstudianteFicha({ estudiante: e }: Props) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  const [cargos, setCargos]   = useState<CargoRow[]>([]);
  const [relacion, setRelacion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/administracion-escolar/estudiantes/${e.id}/cargos`).then((r) => r.json()),
      fetch(`/api/administracion-escolar/estudiantes/${e.id}/tutores`).then((r) => r.json()),
    ]).then(([c, t]) => {
      if (cancel) return;
      setCargos((c.cargos ?? []) as CargoRow[]);
      const resp = (t.tutores ?? []).find((x: TutorVinculo) => x.responsablePago);
      setRelacion(resp?.relacion ?? null);
      setLoading(false);
    });
    return () => { cancel = true; };
  }, [e.id]);

  // Totales generales del estudiante (los cargos anulados no cuentan).
  const totales = useMemo(() => {
    const vivos = cargos.filter((c) => c.estado !== 'anulado');
    const deuda = vivos.reduce((s, c) => s + c.montoCentavos, 0);
    const pendiente = vivos.reduce((s, c) => s + c.saldoCentavos, 0);
    return { deuda, pendiente, pagado: deuda - pendiente };
  }, [cargos]);

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-5 space-y-4 sticky top-4">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-zero-100 text-zero-700 flex items-center justify-center font-semibold shrink-0">
          {iniciales(e.nombres, e.apellidos)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{e.nombres} {e.apellidos}</p>
          <p className="text-xs text-gray-500">
            {e.codigo ?? 'Sin código'} · <span className="capitalize">{e.estado ?? '—'}</span>
          </p>
        </div>
        {puedeGestionar && (
          <Button variant="ghost" size="sm" className="shrink-0"
            onClick={() => router.push(`/escolar/estudiantes/${e.id}`)}>
            Editar
          </Button>
        )}
      </div>

      {/* Mini stat cards */}
      <div className="grid grid-cols-2 gap-2">
        <MiniCard label="Matrícula" value={e.periodoActivo ?? '—'} />
        <MiniCard label="Curso" value={e.cursoActual ?? '—'} />
        <MiniCard label="Último pago" value={e.ultimoPagoFecha ? fmtFechaCorta(e.ultimoPagoFecha) : '—'} />
        <MiniCard label="Estado" value={e.estado ?? '—'} capitalize />
      </div>

      {/* Tutor responsable */}
      <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
        <Row label="Tutor responsable" value={e.tutorResponsable ?? '—'} strong />
        {relacion && <Row label="Relación" value={relacion} capitalize />}
        <Row label="Teléfono" value={e.tutorTelefono ?? '—'} />
        <Row label="Email" value={e.tutorEmail ?? '—'} />
      </div>

      {/* Totales generales */}
      <div className="border-t border-gray-100 pt-3">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-zero-600" /></div>
        ) : (
          <div className="space-y-2">
            <TotalRow icon={Receipt} tone="gray" label="Deuda total" value={fmtDOP(totales.deuda)} />
            <TotalRow icon={HandCoins} tone="teal" label="Pago total" value={fmtDOP(totales.pagado)} />
            <TotalRow icon={AlertTriangle} tone="red" label="Pendiente total" value={fmtDOP(totales.pendiente)}
              muted={totales.pendiente === 0} />
          </div>
        )}
      </div>

      {/* Acciones — el cobro se hace por-cargo en el perfil (va a la factura). */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <Button className="w-full bg-zero-600 hover:bg-zero-700"
          onClick={() => router.push(`/escolar/estudiantes/${e.id}`)}>
          Abrir perfil completo
        </Button>
      </div>
    </div>
  );
}

function MiniCard({ label, value, accent, capitalize }: { label: string; value: string; accent?: boolean; capitalize?: boolean }) {
  return (
    <div className="border border-gray-200 rounded-lg p-2.5">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold truncate ${accent ? 'text-red-600' : 'text-gray-900'} ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  );
}

const TONES = {
  gray: { box: 'bg-gray-100 text-gray-600', val: 'text-gray-900' },
  teal: { box: 'bg-zero-100 text-zero-700', val: 'text-zero-700' },
  red:  { box: 'bg-red-100 text-red-600', val: 'text-red-600' },
} as const;

function TotalRow({ icon: Icon, tone, label, value, muted }: {
  icon: typeof Receipt; tone: keyof typeof TONES; label: string; value: string; muted?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className="flex items-center gap-2.5">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${muted ? 'bg-gray-100 text-gray-400' : t.box}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm text-gray-500 flex-1">{label}</span>
      <span className={`text-sm font-semibold ${muted ? 'text-gray-400' : t.val}`}>{value}</span>
    </div>
  );
}

function Row({ label, value, strong, capitalize }: { label: string; value: string; strong?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right truncate ${strong ? 'font-semibold text-gray-900' : 'text-gray-700'} ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}
