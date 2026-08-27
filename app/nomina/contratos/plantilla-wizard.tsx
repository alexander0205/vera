'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import { Loader2, Info } from 'lucide-react';
import { ContratoConfig, CONFIG_DEFAULT, Plantilla } from './shared';

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

/**
 * Asistente de plantilla de contrato (8 pasos), SIN modal a propósito: vive en su
 * propia página (`/nomina/contratos/nueva` y `/[id]/editar`) para que cerrar por
 * accidente no borre lo configurado (pedido de Alex). Trae sus propios botones.
 */
export function PlantillaWizard({
  editando, onCancel, onSaved,
}: {
  editando: Plantilla | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
  const [config, setConfig] = useState<ContratoConfig>({ ...CONFIG_DEFAULT, ...(editando?.config ?? {}) });
  const [preview, setPreview] = useState<string | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const set = <K extends keyof ContratoConfig>(k: K, v: ContratoConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));

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
    if (i < 0 || i >= PASOS.length) return;
    setPaso(i);
    if (i === PASOS.length - 1) cargarPreview();
  }

  async function guardar() {
    if (!nombre.trim()) { toast.error('Ponle un nombre a la plantilla'); setPaso(0); return; }
    setGuardando(true);
    try {
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
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{PASOS[paso].descripcion}</p>

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

      <div className="space-y-4">
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
              <div className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                {preview ?? 'Sin vista previa.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex flex-row justify-between gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <div className="flex gap-2">
          {paso > 0 && (
            <Button variant="outline" onClick={() => irAlPaso(paso - 1)} disabled={guardando}>Atrás</Button>
          )}
          {paso < PASOS.length - 1 ? (
            <Button onClick={() => irAlPaso(paso + 1)}>Siguiente</Button>
          ) : (
            <Button onClick={guardar} disabled={guardando} className="gap-1.5">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {editando ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
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
