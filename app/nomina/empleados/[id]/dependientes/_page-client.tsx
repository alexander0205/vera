'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import {
  LABEL_PARENTESCO, PARENTESCOS, tipoSegunTSS,
  type Parentesco, type TipoDependiente,
} from '@/lib/nomina/dependientes';
import { AlertTriangle, ArrowLeft, HeartPulse, Loader2, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { Empleado, fetcher, nombreCompleto, pesos } from '../../shared';

// Dependientes del empleado en el Seguro Familiar de Salud, en su propia página
// como el contrato. Lo que se cobra es lo REGISTRADO (directo o adicional); la
// regla de la TSS por edad solo sugiere y avisa.

interface Dependiente {
  id: number;
  nombre: string;
  cedula: string | null;
  parentesco: Parentesco;
  fechaNacimiento: string | null;
  estudiante: boolean;
  tipo: TipoDependiente;
  desde: string;
  hasta: string | null;
}

interface Respuesta {
  dependientes: Dependiente[];
  resumen: { adicionalesVigentes: number; capitaCents: number; costoMensualCents: number; resolucion: string; vigenteDesde: string };
  avisos: string[];
}

const formVacio = () => ({
  nombre: '', cedula: '', parentesco: '' as Parentesco | '', fechaNacimiento: '', estudiante: false,
  tipo: '' as TipoDependiente | '', desde: hoyRD(), hasta: '',
});
type FormDep = ReturnType<typeof formVacio>;

const LABEL_TIPO: Record<TipoDependiente, string> = { directo: 'Directo', adicional: 'Adicional' };

export default function DependientesEmpleadoClient({ id }: { id: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeGestionar = can('empleados:gestionar');
  const volver = () => router.push('/nomina/empleados');

  const { data: dEmpleado, isLoading } = useSWR<{ empleado?: Empleado }>(`/api/nomina/empleados/${id}`, fetcher);
  const empleado = dEmpleado?.empleado ?? null;
  const { data, mutate } = useSWR<Respuesta>(`/api/nomina/empleados/${id}/dependientes`, fetcher);
  const dependientes = data?.dependientes ?? [];
  const resumen = data?.resumen;

  // null = formulario cerrado; 'nuevo' = alta; número = edición de ese registro.
  const [editando, setEditando] = useState<'nuevo' | number | null>(null);
  const [form, setForm] = useState<FormDep>(formVacio);
  // Mientras no toquen «Registrado como», se sugiere según la regla de la TSS.
  const [tipoTocado, setTipoTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const ocupadoRef = useRef(false);
  const [aBorrar, setABorrar] = useState<Dependiente | null>(null);
  const [aDarDeBaja, setADarDeBaja] = useState<Dependiente | null>(null);

  const hoy = hoyRD();
  const sugerido = form.parentesco
    ? tipoSegunTSS({ parentesco: form.parentesco, fechaNacimiento: form.fechaNacimiento || null, estudiante: form.estudiante }, hoy)
    : null;

  function cambiar(parcial: Partial<FormDep>) {
    setForm((f) => {
      const nuevo = { ...f, ...parcial };
      if (!tipoTocado && nuevo.parentesco) {
        const s = tipoSegunTSS({ parentesco: nuevo.parentesco, fechaNacimiento: nuevo.fechaNacimiento || null, estudiante: nuevo.estudiante }, hoy);
        if (s) nuevo.tipo = s;
      }
      return nuevo;
    });
  }

  function abrirNuevo() {
    setForm(formVacio());
    setTipoTocado(false);
    setEditando('nuevo');
  }

  function abrirEdicion(d: Dependiente) {
    setForm({
      nombre: d.nombre, cedula: d.cedula ?? '', parentesco: d.parentesco, fechaNacimiento: d.fechaNacimiento ?? '',
      estudiante: d.estudiante, tipo: d.tipo, desde: d.desde, hasta: d.hasta ?? '',
    });
    setTipoTocado(true);
    setEditando(d.id);
  }

  async function enviar(url: string, method: 'POST' | 'PATCH', cuerpo: FormDep) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
  }

  async function guardar() {
    if (ocupadoRef.current || editando === null) return;
    ocupadoRef.current = true;
    setGuardando(true);
    try {
      if (editando === 'nuevo') await enviar(`/api/nomina/empleados/${id}/dependientes`, 'POST', form);
      else await enviar(`/api/nomina/empleados/${id}/dependientes/${editando}`, 'PATCH', form);
      toast.success(editando === 'nuevo' ? 'Dependiente registrado' : 'Cambios guardados');
      setEditando(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
      setGuardando(false);
    }
  }

  async function darDeBaja() {
    const d = aDarDeBaja;
    if (!d || ocupadoRef.current) return;
    ocupadoRef.current = true;
    setGuardando(true);
    try {
      // La baja no puede quedar antes del alta (registro con fecha futura).
      const hasta = d.desde > hoy ? d.desde : hoy;
      await enviar(`/api/nomina/empleados/${id}/dependientes/${d.id}`, 'PATCH', {
        nombre: d.nombre, cedula: d.cedula ?? '', parentesco: d.parentesco, fechaNacimiento: d.fechaNacimiento ?? '',
        estudiante: d.estudiante, tipo: d.tipo, desde: d.desde, hasta,
      });
      toast.success(`${d.nombre} queda de baja desde el ${fmtFechaCorta(hasta)}`);
      setADarDeBaja(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
      setGuardando(false);
    }
  }

  async function borrar() {
    const d = aBorrar;
    if (!d || ocupadoRef.current) return;
    ocupadoRef.current = true;
    setGuardando(true);
    try {
      const res = await fetch(`/api/nomina/empleados/${id}/dependientes/${d.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo borrar');
      toast.success('Registro borrado');
      setABorrar(null);
      if (editando === d.id) setEditando(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      ocupadoRef.current = false;
      setGuardando(false);
    }
  }

  const vigente = (d: Dependiente) => d.hasta === null || d.hasta >= hoy;
  const esHijo = form.parentesco === 'hijo' || form.parentesco === 'hijastro';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <button
        type="button"
        onClick={volver}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Empleados
      </button>

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HeartPulse className="h-6 w-6 text-zero-600" /> Dependientes del seguro de salud
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empleado ? `${nombreCompleto(empleado)}. ` : ''}
          Los directos (cónyuge e hijos menores) no cuestan. Cada adicional le descuenta al empleado
          {resumen ? ` ${pesos(resumen.capitaCents)}` : ' una cápita'} al mes, que la TSS le factura a la empresa.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !empleado ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p>No se encontró este empleado.</p>
          <Button variant="outline" onClick={volver} className="mt-3">Volver al listado</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {resumen && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Adicionales vigentes hoy</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{resumen.adicionalesVigentes}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Descuento al mes</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{pesos(resumen.costoMensualCents)}</div>
                <div className="text-xs text-muted-foreground">
                  {pesos(resumen.capitaCents)} c/u · Res. {resumen.resolucion}
                </div>
              </div>
            </div>
          )}

          {(data?.avisos ?? []).length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {data!.avisos.map((a) => (
                <p key={a} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {a}
                </p>
              ))}
            </div>
          )}

          {/* Envuelto: el botón de MUI anula el margen de space-y y quedaba pegado a la lista. */}
          {puedeGestionar && editando === null && (
            <div>
              <Button onClick={abrirNuevo} className="gap-1.5">
                <Plus className="h-4 w-4" /> Agregar dependiente
              </Button>
            </div>
          )}

          {puedeGestionar && editando !== null && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm font-medium">{editando === 'nuevo' ? 'Nuevo dependiente' : 'Editar dependiente'}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Nombre completo *">
                  <Input value={form.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
                </Campo>
                <Campo label="Cédula">
                  <Input value={form.cedula} onChange={(e) => cambiar({ cedula: e.target.value })} inputMode="numeric" placeholder="Opcional" />
                </Campo>
                <Campo label="Parentesco *">
                  <NativeSelect value={form.parentesco} onChange={(e) => cambiar({ parentesco: e.target.value as Parentesco })}>
                    <option value="">Elige…</option>
                    {PARENTESCOS.map((p) => <option key={p} value={p}>{LABEL_PARENTESCO[p]}</option>)}
                  </NativeSelect>
                </Campo>
                <Campo label={esHijo ? 'Fecha de nacimiento *' : 'Fecha de nacimiento'}>
                  <Input type="date" value={form.fechaNacimiento} onChange={(e) => cambiar({ fechaNacimiento: e.target.value })} />
                </Campo>
                {esHijo && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.estudiante}
                      onChange={(e) => cambiar({ estudiante: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-zero-600"
                    />
                    Estudia (entre 18 y 21 años sigue siendo directo si estudia)
                  </label>
                )}
                <Campo label="Registrado como *">
                  <NativeSelect
                    value={form.tipo}
                    onChange={(e) => { setTipoTocado(true); setForm((f) => ({ ...f, tipo: e.target.value as TipoDependiente })); }}
                  >
                    <option value="">Elige…</option>
                    <option value="directo">Directo (sin costo)</option>
                    <option value="adicional">Adicional ({resumen ? pesos(resumen.capitaCents) : 'cápita'} al mes)</option>
                  </NativeSelect>
                  {sugerido && (
                    <p className={`text-xs ${form.tipo && form.tipo !== sugerido ? 'text-amber-700' : 'text-muted-foreground'}`}>
                      Según la regla de la TSS hoy: {LABEL_TIPO[sugerido].toLowerCase()}.
                      {form.tipo && form.tipo !== sugerido && ' Se cobra lo registrado: revisa que coincida con el SUIR.'}
                    </p>
                  )}
                </Campo>
                <Campo label="Registrado desde *">
                  <Input type="date" value={form.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
                </Campo>
                {editando !== 'nuevo' && (
                  <Campo label="Baja (si ya salió del seguro)">
                    <Input type="date" value={form.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
                  </Campo>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando} className="gap-1.5">
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Registrados</Label>
            {dependientes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Este empleado no tiene dependientes registrados.</p>
            ) : (
              dependientes.map((d) => (
                <div key={d.id} className={`flex items-center gap-3 rounded-md border p-2.5 ${vigente(d) ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{d.nombre}</span>
                      <Badge variant={d.tipo === 'adicional' ? 'default' : 'secondary'}>{LABEL_TIPO[d.tipo]}</Badge>
                      {!vigente(d) && <Badge variant="outline">De baja</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {LABEL_PARENTESCO[d.parentesco]}
                      {d.fechaNacimiento && ` · nació el ${fmtFechaCorta(d.fechaNacimiento)}`}
                      {` · desde el ${fmtFechaCorta(d.desde)}`}
                      {d.hasta && ` · baja el ${fmtFechaCorta(d.hasta)}`}
                    </div>
                  </div>
                  {d.tipo === 'adicional' && vigente(d) && resumen && (
                    <div className="hidden shrink-0 text-right text-sm tabular-nums sm:block">
                      −{pesos(resumen.capitaCents)}
                      <div className="text-xs text-muted-foreground">al mes</div>
                    </div>
                  )}
                  {puedeGestionar && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicion(d)} aria-label={`Editar ${d.nombre}`} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {d.hasta === null && (
                        <Button variant="ghost" size="icon" onClick={() => setADarDeBaja(d)} aria-label={`Dar de baja a ${d.nombre}`} title="Dar de baja">
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setABorrar(d)} aria-label={`Borrar ${d.nombre}`} title="Borrar (registro hecho por error)">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={aDarDeBaja !== null}
        onOpenChange={(o) => { if (!o) setADarDeBaja(null); }}
        title="Dar de baja"
        description={aDarDeBaja
          ? `${aDarDeBaja.nombre} deja de contar desde hoy. Las corridas ya calculadas no cambian. Recuerda darlo de baja también en el SUIR y en la ARS.`
          : ''}
        confirmLabel={guardando ? 'Guardando…' : 'Dar de baja'}
        loading={guardando}
        onConfirm={darDeBaja}
      />

      <ConfirmDialog
        open={aBorrar !== null}
        onOpenChange={(o) => { if (!o) setABorrar(null); }}
        title="Borrar el registro"
        description="Úsalo solo si se registró por error. Si la persona salió del seguro, mejor dale de baja: así quedan los meses en que sí se cobró."
        confirmLabel={guardando ? 'Borrando…' : 'Borrar'}
        loading={guardando}
        destructive
        onConfirm={borrar}
      />
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
