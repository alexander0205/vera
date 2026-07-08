'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { EditarEstudianteDialog } from '@/components/administracion-escolar/EditarEstudianteDialog';

export interface EstudianteEnriquecido {
  id: number;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  estado: string;
  fechaNacimiento: string | null;
  matriculaActivaId: number | null;
  periodoActivo: string | null;
  cursoActual: string | null;
  tutorResponsable: string | null;
  tutorTelefono: string | null;
  tutorEmail: string | null;
  deudaCentavos: number;
  cargosPendientes: number;
  ultimoPagoFecha: string | null;
  ultimoPagoCentavos: number | null;
}

interface CargoPendiente {
  id: number;
  concepto: string | null;
  mes: number | null;
  anio: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
}

interface TutorVinculo {
  tutorId: number;
  nombre: string;
  relacion: string;
  responsablePago: boolean;
}

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function iniciales(nombres: string, apellidos: string): string {
  return `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

function labelCargoPendiente(c: CargoPendiente): string {
  const concepto = c.concepto ?? 'Cargo';
  const mes = c.mes ? ` ${MESES[c.mes]}` : '';
  return `${concepto}${mes}`;
}

interface Props {
  estudiante: EstudianteEnriquecido;
  onRegistrarPago: () => void;
  onChange: () => void;
}

export function EstudianteFicha({ estudiante: e, onRegistrarPago, onChange }: Props) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  const [editOpen, setEditOpen] = useState(false);
  const [cargos, setCargos]   = useState<CargoPendiente[]>([]);
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
      const pendientes: CargoPendiente[] = (c.cargos ?? []).filter(
        (x: CargoPendiente) => ['pendiente', 'parcial', 'vencido'].includes(x.estado),
      );
      setCargos(pendientes);
      const resp = (t.tutores ?? []).find((x: TutorVinculo) => x.responsablePago);
      setRelacion(resp?.relacion ?? null);
      setLoading(false);
    });
    return () => { cancel = true; };
  }, [e.id]);

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-5 space-y-4 sticky top-4">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold shrink-0">
          {iniciales(e.nombres, e.apellidos)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{e.nombres} {e.apellidos}</p>
          <p className="text-xs text-gray-500">
            {e.codigo ?? 'Sin código'} · <span className="capitalize">{e.estado}</span>
          </p>
        </div>
        {puedeGestionar && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setEditOpen(true)}>
            Editar
          </Button>
        )}
      </div>

      {/* Mini stat cards */}
      <div className="grid grid-cols-2 gap-2">
        <MiniCard label="Matrícula" value={e.periodoActivo ?? '—'} />
        <MiniCard label="Curso" value={e.cursoActual ?? '—'} />
        <MiniCard label="Deuda total" value={fmtDOP(e.deudaCentavos)} accent={e.deudaCentavos > 0} />
        <MiniCard label="Último pago" value={e.ultimoPagoFecha ? fmtFechaCorta(e.ultimoPagoFecha) : '—'} />
      </div>

      {/* Tutor responsable */}
      <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
        <Row label="Tutor responsable" value={e.tutorResponsable ?? '—'} strong />
        {relacion && <Row label="Relación" value={relacion} capitalize />}
        <Row label="Teléfono" value={e.tutorTelefono ?? '—'} />
        <Row label="Email" value={e.tutorEmail ?? '—'} />
      </div>

      {/* Pendientes */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-sm font-medium text-gray-900 mb-2">Pendientes</p>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>
        ) : cargos.length === 0 ? (
          <p className="text-sm text-gray-400 py-1">Sin cargos pendientes</p>
        ) : (
          <div className="space-y-2">
            {cargos.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.estado === 'vencido' ? 'bg-red-500' : 'bg-teal-500'}`} />
                    <span className="truncate capitalize">{labelCargoPendiente(c)}</span>
                  </p>
                  {c.fechaVencimiento && (
                    <p className="text-xs text-gray-400 ml-3">Vence {fmtFechaCorta(c.fechaVencimiento)}</p>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900 shrink-0">{fmtDOP(c.saldoCentavos)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <Button className="w-full bg-teal-600 hover:bg-teal-700"
          onClick={onRegistrarPago}
          disabled={e.deudaCentavos === 0}>
          Registrar pago
        </Button>
        <Button variant="outline" className="w-full"
          onClick={() => router.push(`/dashboard/administracion-escolar/estudiantes/${e.id}`)}>
          Abrir perfil completo
        </Button>
      </div>

      <EditarEstudianteDialog
        estudiante={e}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={onChange}
      />
    </div>
  );
}

function MiniCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-gray-200 rounded-lg p-2.5">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold truncate ${accent ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
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
