'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { FileText, Loader2, Plus, Pencil, Trash2, Info } from 'lucide-react';

/** Config estructurada de la plantilla (espejo de lib/nomina/contrato-estructura.ts). */
interface ContratoConfig {
  incluirFunciones: boolean;
  funciones: string;
  lugarTrabajo: string;
  incluirJornada: boolean;
  jornadaTexto: string;
  formaPago: 'transferencia' | 'efectivo' | 'cheque';
  incluirBonos: boolean;
  bonos: string;
  incluirVacaciones: boolean;
  incluirRegalia: boolean;
  incluirPrueba: boolean;
  pruebaDias: number;
  incluirTerminacion: boolean;
  confidencialidad: boolean;
  noCompetencia: boolean;
  propiedadIntelectual: boolean;
}

const CONFIG_DEFAULT: ContratoConfig = {
  incluirFunciones: false, funciones: '', lugarTrabajo: '',
  incluirJornada: true, jornadaTexto: '',
  formaPago: 'transferencia', incluirBonos: false, bonos: '',
  incluirVacaciones: true, incluirRegalia: true,
  incluirPrueba: true, pruebaDias: 90, incluirTerminacion: true,
  confidencialidad: false, noCompetencia: false, propiedadIntelectual: false,
};

interface Plantilla {
  id: number;
  nombre: string;
  cuerpo: string | null;
  config: ContratoConfig | null;
  activa: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PASOS = [
  { titulo: 'Contrato', descripcion: 'Nombre de la plantilla. Las partes y el tipo de contrato se toman del empleado al generar.' },
  { titulo: 'Puesto', descripcion: 'Funciones y lugar de trabajo.' },
  { titulo: 'Jornada', descripcion: 'Jornada y horario. La jornada, el turno y el descanso salen de la ficha del empleado.' },
  { titulo: 'Compensación', descripcion: 'Forma de pago y bonos. El salario y la frecuencia salen de la ficha del empleado.' },
  { titulo: 'Vacaciones', descripcion: 'Vacaciones y beneficios de ley.' },
  { titulo: 'Prueba', descripcion: 'Período de prueba y terminación.' },
  { titulo: 'Cláusulas', descripcion: 'Cláusulas adicionales opcionales.' },
  { titulo: 'Revisión', descripcion: 'Revisa el contrato ensamblado y guarda la plantilla.' },
] as const;

export default function ContratosClient() {
  const { can } = usePermissions();
  const puedeConfig = can('nomina:configurar');
  const { data, isLoading, mutate } = useSWR<{ plantillas: Plantilla[] }>('/api/nomina/contratos/plantillas', fetcher);

  const [dlg, setDlg] = useState<{ abierto: boolean; editando: Plantilla | null }>({ abierto: false, editando: null });
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState('');
  const [config, setConfig] = useState<ContratoConfig>(CONFIG_DEFAULT);
  const [preview, setPreview] = useState<string | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Plantilla | null>(null);

  const plantillas = data?.plantillas ?? [];
  const set = <K extends keyof ContratoConfig>(k: K, v: ContratoConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));

  function abrirNueva() {
    setNombre('');
    setConfig(CONFIG_DEFAULT);
    setPreview(null);
    setPaso(0);
    setDlg({ abierto: true, editando: null });
  }
  function abrirEditar(p: Plantilla) {
    setNombre(p.nombre);
    setConfig({ ...CONFIG_DEFAULT, ...(p.config ?? {}) });
    setPreview(null);
    setPaso(0);
    setDlg({ abierto: true, editando: p });
  }

  async function cargarPreview() {
    setCargandoPreview(true);
    try {
      const res = await fetch('/api/nomina/contratos/plantillas/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo generar la vista previa');
      setPreview(j.cuerpo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setCargandoPreview(false);
    }
  }

  function irAlPaso(i: number) {
    setPaso(i);
    if (i === PASOS.length - 1) cargarPreview();
  }

  async function guardar() {
    if (!nombre.trim()) { toast.error('Ponle un nombre a la plantilla'); setPaso(0); return; }
    setGuardando(true);
    try {
      const editando = dlg.editando;
      const res = await fetch('/api/nomina/contratos/plantillas', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? { id: editando.id, nombre, config } : { nombre, config }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'No se pudo guardar');
      }
      toast.success(editando ? 'Plantilla actualizada' : 'Plantilla creada');
      setDlg({ abierto: false, editando: null });
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!aBorrar) return;
    try {
      const res = await fetch(`/api/nomina/contratos/plantillas?id=${aBorrar.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo borrar');
      toast.success('Plantilla borrada');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setABorrar(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileText className="h-6 w-6 text-zero-600" /> Plantillas de contrato
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Arma el contrato paso a paso: eliges las cláusulas y el sistema lo redacta. Se llena solo con los datos del empleado.
          </p>
        </div>
        {puedeConfig && (
          <Button onClick={abrirNueva} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nueva plantilla
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : plantillas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p>Aún no hay plantillas de contrato.</p>
          {puedeConfig && (
            <Button variant="outline" onClick={abrirNueva} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" /> Crear la primera
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {plantillas.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.nombre}</span>
                    {!p.activa && <Badge variant="secondary">Inactiva</Badge>}
                    {!p.config && p.cuerpo && <Badge variant="outline">Texto (formato anterior)</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.config ? resumenClausulas(p.config) : (p.cuerpo ?? '').replace(/\s+/g, ' ').slice(0, 90) + '…'}
                  </div>
                </div>
                {puedeConfig && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => abrirEditar(p)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setABorrar(p)} aria-label="Borrar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Asistente de plantilla (paso a paso) */}
      <Dialog open={dlg.abierto} onOpenChange={(o) => setDlg((d) => ({ ...d, abierto: o }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dlg.editando ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
            <DialogDescription>{PASOS[paso].descripcion}</DialogDescription>
          </DialogHeader>

          {/* Barra de pasos */}
          <div className="flex items-center gap-1 px-1">
            {PASOS.map((p, i) => (
              <button key={p.titulo} type="button" onClick={() => irAlPaso(i)} className="flex flex-1 flex-col gap-1 text-left">
                <span className={`h-1.5 rounded-full transition ${i <= paso ? 'bg-zero-500' : 'bg-muted'}`} />
                <span className={`hidden text-[10px] sm:block ${i === paso ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {p.titulo}
                </span>
              </button>
            ))}
          </div>

          <DialogBody className="space-y-4">
            {/* Paso 1 · Contrato */}
            {paso === 0 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nombre de la plantilla</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Contrato por tiempo indefinido" />
                </div>
                <Nota>
                  El <strong>tipo de contrato</strong> (indefinido, temporal…) y las <strong>partes</strong> (empresa y empleado) se toman
                  automáticamente del empleado y de tu empresa cuando generes el contrato. Aquí defines las cláusulas comunes.
                </Nota>
              </div>
            )}

            {/* Paso 2 · Puesto */}
            {paso === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Lugar de trabajo</Label>
                  <Input value={config.lugarTrabajo} onChange={(e) => set('lugarTrabajo', e.target.value)} placeholder="Ej. las oficinas de la empresa en Santiago" />
                </div>
                <Toggle checked={config.incluirFunciones} onChange={(v) => set('incluirFunciones', v)}
                  label="Detallar funciones del cargo" hint="Si lo apagas, el contrato solo menciona el cargo." />
                {config.incluirFunciones && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Funciones principales</Label>
                    <Textarea value={config.funciones} onChange={(e) => set('funciones', e.target.value)} rows={4}
                      placeholder="Ej. atención al cliente, manejo de caja, cuadre diario…" />
                  </div>
                )}
              </div>
            )}

            {/* Paso 3 · Jornada */}
            {paso === 2 && (
              <div className="space-y-4">
                <Toggle checked={config.incluirJornada} onChange={(v) => set('incluirJornada', v)}
                  label="Incluir cláusula de jornada" hint="Usa la jornada, el turno y el día de descanso de la ficha del empleado." />
                {config.incluirJornada && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Detalle de horario (opcional)</Label>
                    <Input value={config.jornadaTexto} onChange={(e) => set('jornadaTexto', e.target.value)} placeholder="Ej. de 8:00 a.m. a 5:00 p.m." />
                  </div>
                )}
              </div>
            )}

            {/* Paso 4 · Compensación */}
            {paso === 3 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Forma de pago</Label>
                  <NativeSelect value={config.formaPago} onChange={(e) => set('formaPago', e.target.value as ContratoConfig['formaPago'])}>
                    <option value="transferencia">Transferencia bancaria</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                  </NativeSelect>
                </div>
                <Nota>El salario y la frecuencia de pago salen de la ficha del empleado.</Nota>
                <Toggle checked={config.incluirBonos} onChange={(v) => set('incluirBonos', v)}
                  label="Incluir bonos o comisiones" />
                {config.incluirBonos && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Detalle de bonos / comisiones</Label>
                    <Textarea value={config.bonos} onChange={(e) => set('bonos', e.target.value)} rows={3}
                      placeholder="Ej. comisión del 2% sobre ventas mensuales…" />
                  </div>
                )}
              </div>
            )}

            {/* Paso 5 · Vacaciones */}
            {paso === 4 && (
              <div className="space-y-3">
                <Toggle checked={config.incluirVacaciones} onChange={(v) => set('incluirVacaciones', v)}
                  label="Vacaciones anuales" hint="Usa los días de vacaciones de la ficha del empleado (o la ley si no tiene)." />
                <Toggle checked={config.incluirRegalia} onChange={(v) => set('incluirRegalia', v)}
                  label="Salario de Navidad (regalía pascual)" hint="Artículos 219 y siguientes del Código de Trabajo." />
              </div>
            )}

            {/* Paso 6 · Prueba y terminación */}
            {paso === 5 && (
              <div className="space-y-4">
                <Toggle checked={config.incluirPrueba} onChange={(v) => set('incluirPrueba', v)}
                  label="Período de prueba" hint="Artículo 80 del Código de Trabajo (máximo 90 días)." />
                {config.incluirPrueba && (
                  <div className="ml-7 flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Días</Label>
                    <Input type="number" min={0} max={90} value={config.pruebaDias}
                      onChange={(e) => set('pruebaDias', Math.max(0, Math.min(90, Number(e.target.value) || 0)))} className="w-24" />
                  </div>
                )}
                <Toggle checked={config.incluirTerminacion} onChange={(v) => set('incluirTerminacion', v)}
                  label="Cláusula de terminación" hint="Preaviso y auxilio de cesantía según el Código de Trabajo." />
              </div>
            )}

            {/* Paso 7 · Cláusulas extra */}
            {paso === 6 && (
              <div className="space-y-3">
                <Toggle checked={config.confidencialidad} onChange={(v) => set('confidencialidad', v)}
                  label="Confidencialidad" hint="El empleado guarda secreto de la información de la empresa." />
                <Toggle checked={config.noCompetencia} onChange={(v) => set('noCompetencia', v)}
                  label="No competencia" hint="Durante el contrato, no realiza actividades que compitan con la empresa." />
                <Toggle checked={config.propiedadIntelectual} onChange={(v) => set('propiedadIntelectual', v)}
                  label="Propiedad intelectual" hint="Lo creado en sus funciones pertenece a la empresa." />
              </div>
            )}

            {/* Paso 8 · Revisión */}
            {paso === 7 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nombre de la plantilla</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Contrato por tiempo indefinido" />
                </div>
                <Label className="text-xs text-muted-foreground">Vista previa (con datos de ejemplo)</Label>
                {cargandoPreview ? (
                  <div className="flex items-center justify-center rounded-md border py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                    {preview ?? 'Sin vista previa.'}
                  </div>
                )}
              </div>
            )}
          </DialogBody>

          <DialogFooter className="flex-row justify-between gap-2">
            <Button variant="ghost" onClick={() => setDlg({ abierto: false, editando: null })} disabled={guardando}>Cancelar</Button>
            <div className="flex gap-2">
              {paso > 0 && (
                <Button variant="outline" onClick={() => irAlPaso(paso - 1)} disabled={guardando}>Atrás</Button>
              )}
              {paso < PASOS.length - 1 ? (
                <Button onClick={() => irAlPaso(paso + 1)}>Siguiente</Button>
              ) : (
                <Button onClick={guardar} disabled={guardando} className="gap-1.5">
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {dlg.editando ? 'Guardar cambios' : 'Crear plantilla'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(o) => !o && setABorrar(null)}
        title="Borrar plantilla"
        description={aBorrar ? `Se borrará "${aBorrar.nombre}". Los contratos ya generados con ella se conservan.` : ''}
        confirmLabel="Borrar"
        onConfirm={borrar}
        destructive
      />
    </div>
  );
}

/** Resumen corto de las cláusulas incluidas, para la tarjeta de la lista. */
function resumenClausulas(c: ContratoConfig): string {
  const on: string[] = ['Puesto', 'Compensación'];
  if (c.incluirJornada) on.push('Jornada');
  if (c.incluirVacaciones) on.push('Vacaciones');
  if (c.incluirRegalia) on.push('Regalía');
  if (c.incluirPrueba) on.push('Prueba');
  if (c.incluirTerminacion) on.push('Terminación');
  if (c.confidencialidad) on.push('Confidencialidad');
  if (c.noCompetencia) on.push('No competencia');
  if (c.propiedadIntelectual) on.push('Propiedad intelectual');
  return on.join(' · ');
}

function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-zero-600" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-muted bg-muted/40 p-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
