'use client';

/**
 * Dar de baja a un alumno, o volver a darlo de alta.
 *
 * Enseña ANTES de confirmar qué se va a tocar —su matrícula, su mensualidad
 * automática, las cuotas de los meses siguientes— porque eso es lo que cambia
 * lo que se le cobra a la familia, y no se ve en ninguna otra parte de la
 * pantalla. Lo que ya debe se dice también: darle de baja no lo borra.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { MESES } from '@/components/administracion-escolar/PeriodoDetalle';

interface PreviaBaja {
  matriculas: { id: number; periodo: string | null; curso: string | null }[];
  recurrentes: { id: number; nombre: string; estado: string }[];
  cargosPosteriores: { id: number; concepto: string | null; mes: number; anio: number; montoCentavos: number }[];
  deudaQueSeQuedaCentavos: number;
}

interface PreviaReingreso {
  matricula: { id: number; periodo: string | null; curso: string | null; estado: string; fechaInscripcion: string | null } | null;
  recurrente: { id: number; nombre: string; estado: string; proximaActual: string; proximaNueva: string | null } | null;
  cuotasARestaurar: { id: number; concepto: string | null; mes: number; anio: number; montoCentavos: number }[];
  fechaUltimaBaja: string | null;
}

const MOTIVOS = [
  { value: 'retirado', label: 'Se retiró del colegio' },
  { value: 'inactivo', label: 'Inactivo por un tiempo' },
  { value: 'graduado', label: 'Se graduó' },
] as const;

export function BajaReingresoDialog({ estudianteId, nombre, accion, abierto, onCerrar, onHecho, onMatricular }: {
  estudianteId: number;
  nombre: string;
  accion: 'baja' | 'reingreso';
  abierto: boolean;
  onCerrar: () => void;
  onHecho: () => void;
  /** Sin matrícula del año en curso que reabrir, lo que toca es matricularlo. */
  onMatricular?: () => void;
}) {
  const [fecha, setFecha] = useState(hoyRD());
  const [estado, setEstado] = useState<(typeof MOTIVOS)[number]['value']>('retirado');
  const [motivo, setMotivo] = useState('');
  const [anular, setAnular] = useState(true);
  const [previa, setPrevia] = useState<PreviaBaja | PreviaReingreso | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setFecha(hoyRD()); setEstado('retirado'); setMotivo(''); setAnular(true);
  }, [abierto]);

  // La vista previa depende de la fecha: qué meses quedan «después» de la baja
  // y en qué fecha vuelve a facturar la mensualidad.
  useEffect(() => {
    if (!abierto || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    let vivo = true;
    setCargando(true);
    fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/estado?accion=${accion}&fecha=${fecha}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setPrevia(d); })
      .catch(() => { if (vivo) setPrevia(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [abierto, accion, estudianteId, fecha]);

  const baja = accion === 'baja' ? (previa as PreviaBaja | null) : null;
  const reingreso = accion === 'reingreso' ? (previa as PreviaReingreso | null) : null;
  const reabrible = reingreso?.matricula?.estado === 'retirada' ? reingreso.matricula : null;
  // No puede volver antes de haberse ido: el servidor lo rechaza, y aquí se dice antes.
  const antesDeLaBaja = !!reingreso?.fechaUltimaBaja && fecha < reingreso.fechaUltimaBaja;

  async function confirmar() {
    setGuardando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accion === 'baja'
          ? { accion, fecha, estado, motivo, anularPosteriores: anular }
          : { accion, fecha, reabrirMatricula: !!reabrible }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? 'No se pudo guardar'); return; }
      toast.success(accion === 'baja' ? `${nombre} quedó dado de baja` : `${nombre} está activo otra vez`);
      onHecho();
      onCerrar();
      // Volvió, pero no hay matrícula de este año que reabrir: hay que hacerle una.
      if (accion === 'reingreso' && !reabrible && onMatricular) onMatricular();
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{accion === 'baja' ? `Dar de baja a ${nombre}` : `Reactivar a ${nombre}`}</DialogTitle>
          <DialogDescription>
            {accion === 'baja'
              ? 'Deja de generarle cuotas y facturas. Su historial y lo que ya debe se quedan.'
              : 'Vuelve a estar activo. Los meses que estuvo fuera no se le cobran.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fecha-estado">{accion === 'baja' ? 'Fecha de baja' : 'Fecha en que vuelve'}</Label>
              <Input id="fecha-estado" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            {accion === 'baja' && (
              <div className="space-y-1.5">
                <Label htmlFor="motivo-estado">Por qué</Label>
                <select id="motivo-estado" value={estado}
                  onChange={(e) => setEstado(e.target.value as typeof estado)}
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm">
                  {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>
          {accion === 'baja' && (
            <div className="space-y-1.5">
              <Label htmlFor="nota-estado">Nota (opcional)</Label>
              <Input id="nota-estado" value={motivo} maxLength={200}
                placeholder="Se mudó de ciudad, cambio de colegio…" onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}

          {cargando ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : baja ? (
            <ul className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
              {baja.matriculas.length > 0 ? baja.matriculas.map((m) => (
                <li key={m.id}>
                  Matrícula <b>{m.periodo ?? '—'}{m.curso ? ` · ${m.curso}` : ''}</b> pasa a{' '}
                  {estado === 'graduado' ? 'finalizada' : 'retirada'}: el colegio deja de generarle cuotas.
                </li>
              )) : <li>No tiene matrícula activa.</li>}
              {baja.recurrentes.map((r) => (
                <li key={r.id}>Se pausa la mensualidad automática <b>{r.nombre}</b>: no se emiten más facturas.</li>
              ))}
              {baja.cargosPosteriores.length > 0 && (
                <li>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={anular} onChange={(e) => setAnular(e.target.checked)} />
                    <span>
                      Anular {baja.cargosPosteriores.length}{' '}
                      {baja.cargosPosteriores.length === 1 ? 'cuota' : 'cuotas'} de meses después de la baja, sin factura
                      {' '}(<b>{fmtDOP(baja.cargosPosteriores.reduce((s, c) => s + c.montoCentavos, 0))}</b>):
                      <span className="block text-xs text-gray-500">
                        {baja.cargosPosteriores.map((c) => `${c.concepto ?? 'Cargo'} ${MESES[c.mes]} ${c.anio}`).join(' · ')}
                      </span>
                      {/* La facturación por calendario factura todo cargo que ya
                          existe cuando llega su fecha, esté o no el alumno en el
                          colegio: es deuda. Quien las deja vivas tiene que saber
                          que se van a facturar. */}
                      {!anular && (
                        <span className="mt-1 block text-xs font-medium text-amber-700">
                          Si no las anulas, se le facturarán a la familia cuando llegue la fecha de cada una.
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )}
              {baja.deudaQueSeQuedaCentavos > 0 && (
                <li className="text-red-700">
                  Sigue debiendo <b>{fmtDOP(baja.deudaQueSeQuedaCentavos)}</b> de lo que ya cursó o ya se le facturó. Eso no se borra.
                </li>
              )}
            </ul>
          ) : reingreso && antesDeLaBaja ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              Se dio de baja el {fmtFechaCorta(reingreso.fechaUltimaBaja!)}. La fecha en que vuelve no puede ser anterior.
            </p>
          ) : reingreso ? (
            <ul className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
              {reabrible ? (
                <li>
                  Se reabre la matrícula <b>{reabrible.periodo ?? '—'}{reabrible.curso ? ` · ${reabrible.curso}` : ''}</b>.
                  Las cuotas empiezan a contar desde el {fmtFechaCorta(fecha)}
                  {reabrible.fechaInscripcion ? ` (la inscripción era del ${fmtFechaCorta(reabrible.fechaInscripcion)})` : ''}.
                </li>
              ) : (
                <li>No tiene matrícula de este año que reabrir. Al reactivarlo te llevamos a matricularlo.</li>
              )}
              {reabrible && reingreso.cuotasARestaurar.length > 0 && (
                <li>
                  Vuelven {reingreso.cuotasARestaurar.length}{' '}
                  {reingreso.cuotasARestaurar.length === 1 ? 'cuota que se anuló' : 'cuotas que se anularon'} al darle de baja
                  {' '}(<b>{fmtDOP(reingreso.cuotasARestaurar.reduce((s, c) => s + c.montoCentavos, 0))}</b>), las de este mes en adelante:
                  <span className="block text-xs text-gray-500">
                    {reingreso.cuotasARestaurar.map((c) => `${c.concepto ?? 'Cargo'} ${MESES[c.mes]} ${c.anio}`).join(' · ')}
                  </span>
                </li>
              )}
              {reabrible && reingreso.recurrente && (
                reingreso.recurrente.proximaNueva ? (
                  <li>
                    La mensualidad <b>{reingreso.recurrente.nombre}</b> vuelve a emitir el{' '}
                    <b>{fmtFechaCorta(reingreso.recurrente.proximaNueva)}</b>. Los meses que estuvo fuera no se facturan.
                  </li>
                ) : (
                  <li>La mensualidad <b>{reingreso.recurrente.nombre}</b> ya terminó su calendario: no vuelve a emitir.</li>
                )
              )}
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={guardando || cargando || !previa || (accion === 'reingreso' && antesDeLaBaja)}
            variant={accion === 'baja' ? 'destructive' : 'default'}>
            {guardando
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : accion === 'baja' ? <UserMinus className="mr-1.5 h-4 w-4" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
            {accion === 'baja' ? 'Dar de baja' : 'Reactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
