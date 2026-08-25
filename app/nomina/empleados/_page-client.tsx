'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import {
  Users, Search, Loader2, IdCard, Phone, Mail, Briefcase, Wallet, Landmark,
  Plus, Pencil, Trash2, UserPlus, GraduationCap, Check, FileText, Download,
} from 'lucide-react';

interface Empleado {
  id: number;
  cedula: string | null;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  tipoContrato: string;
  salarioBaseCents: number;
  frecuenciaPago: string;
  fechaIngreso: string | null;
  fechaSalida: string | null;
  estado: string;
  afp: string | null;
  ars: string | null;
  bancoNombre: string | null;
  bancoCuenta: string | null;
  bancoTipoCuenta: string | null;
  sexo: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  origen: string;
  origenRef: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (cents: number) => RD.format((cents ?? 0) / 100);

function nombreCompleto(e: Empleado): string {
  return [e.nombres, e.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}
function iniciales(e: Empleado): string {
  const n = (e.nombres ?? '').trim()[0] ?? '';
  const a = (e.apellidos ?? '').trim()[0] ?? '';
  return (n + a).toUpperCase() || '·';
}
const esActivo = (estado: string) => estado === 'activo';

const LABEL_CONTRATO: Record<string, string> = {
  indefinido: 'Indefinido', temporal: 'Temporal', por_obra: 'Por obra', pasantia: 'Pasantía',
};
const LABEL_FRECUENCIA: Record<string, string> = {
  mensual: 'Mensual', quincenal: 'Quincenal', semanal: 'Semanal',
};

/** Estado en blanco del formulario (crear). Salario en pesos, texto para el input. */
function formVacio() {
  return {
    cedula: '', nombres: '', apellidos: '', cargo: '',
    tipoContrato: 'indefinido', salarioBase: '', frecuenciaPago: 'mensual',
    fechaIngreso: '', afp: '', ars: '',
    bancoNombre: '', bancoCuenta: '', bancoTipoCuenta: '',
    sexo: '', fechaNacimiento: '', nacionalidad: '', telefono: '', email: '', notas: '',
    estado: 'activo', fechaSalida: '',
  };
}
type FormState = ReturnType<typeof formVacio>;

function empleadoAForm(e: Empleado): FormState {
  return {
    cedula: e.cedula ?? '', nombres: e.nombres, apellidos: e.apellidos, cargo: e.cargo ?? '',
    tipoContrato: e.tipoContrato, salarioBase: e.salarioBaseCents ? String(e.salarioBaseCents / 100) : '',
    frecuenciaPago: e.frecuenciaPago, fechaIngreso: e.fechaIngreso ?? '',
    afp: e.afp ?? '', ars: e.ars ?? '',
    bancoNombre: e.bancoNombre ?? '', bancoCuenta: e.bancoCuenta ?? '', bancoTipoCuenta: e.bancoTipoCuenta ?? '',
    sexo: e.sexo ?? '', fechaNacimiento: e.fechaNacimiento ?? '', nacionalidad: e.nacionalidad ?? '',
    telefono: e.telefono ?? '', email: e.email ?? '', notas: e.notas ?? '',
    estado: e.estado, fechaSalida: e.fechaSalida ?? '',
  };
}

export default function EmpleadosClient({ tieneEscolar = false }: { tieneEscolar?: boolean }) {
  const { can } = usePermissions();
  const puedeGestionar = can('empleados:gestionar');
  const { data, isLoading, mutate } = useSWR<{ empleados: Empleado[] }>('/api/nomina/empleados', fetcher);

  const [busca, setBusca] = useState('');
  const [dialogo, setDialogo] = useState<{ abierto: boolean; editando: Empleado | null }>({ abierto: false, editando: null });
  const [form, setForm] = useState<FormState>(formVacio());
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Empleado | null>(null);
  const [importAbierto, setImportAbierto] = useState(false);
  const [contratoDe, setContratoDe] = useState<Empleado | null>(null);

  const empleados = data?.empleados ?? [];
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return empleados;
    return empleados.filter((e) =>
      nombreCompleto(e).toLowerCase().includes(q) ||
      (e.cedula ?? '').includes(q) ||
      (e.cargo ?? '').toLowerCase().includes(q),
    );
  }, [empleados, busca]);

  const activos = empleados.filter((e) => esActivo(e.estado)).length;
  const masaSalarial = empleados
    .filter((e) => esActivo(e.estado))
    .reduce((sum, e) => sum + (e.salarioBaseCents ?? 0), 0);

  function abrirNuevo() {
    setForm(formVacio());
    setDialogo({ abierto: true, editando: null });
  }
  function abrirEditar(e: Empleado) {
    setForm(empleadoAForm(e));
    setDialogo({ abierto: true, editando: e });
  }
  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function guardar() {
    if (!form.nombres.trim() || !form.apellidos.trim()) {
      toast.error('Nombres y apellidos son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      const editando = dialogo.editando;
      const url = editando ? `/api/nomina/empleados/${editando.id}` : '/api/nomina/empleados';
      const res = await fetch(url, {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'No se pudo guardar');
      }
      toast.success(editando ? 'Empleado actualizado' : 'Empleado creado');
      setDialogo({ abierto: false, editando: null });
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!aEliminar) return;
    try {
      const res = await fetch(`/api/nomina/empleados/${aEliminar.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo dar de baja');
      toast.success('Empleado dado de baja');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setAEliminar(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-6 w-6 text-zero-600" /> Empleados
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El directorio del personal. Sobre estas fichas corren las nóminas.
          </p>
        </div>
        {puedeGestionar && (
          <div className="flex flex-wrap gap-2">
            {tieneEscolar && (
              <Button variant="outline" onClick={() => setImportAbierto(true)} className="gap-1.5">
                <GraduationCap className="h-4 w-4" /> Importar del colegio
              </Button>
            )}
            <Button onClick={abrirNuevo} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nuevo empleado
            </Button>
          </div>
        )}
      </div>

      {/* Totales */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Activos</div>
          <div className="mt-1 text-xl font-semibold">{activos}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total registrados</div>
          <div className="mt-1 text-xl font-semibold">{empleados.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Masa salarial (activos)</div>
          <div className="mt-1 text-xl font-semibold">{pesos(masaSalarial)}</div>
        </CardContent></Card>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, cédula o cargo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <UserPlus className="h-8 w-8" />
          <p>{empleados.length === 0 ? 'Aún no hay empleados registrados.' : 'Ningún empleado coincide con la búsqueda.'}</p>
          {puedeGestionar && empleados.length === 0 && (
            <Button variant="outline" onClick={abrirNuevo} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" /> Agregar el primero
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((e) => (
            <Card key={e.id} className={esActivo(e.estado) ? '' : 'opacity-60'}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zero-100 text-sm font-semibold text-zero-700">
                  {iniciales(e)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{nombreCompleto(e)}</span>
                    {!esActivo(e.estado) && <Badge variant="secondary">Inactivo</Badge>}
                    {e.origen === 'escolar' && (
                      <Badge variant="outline" className="gap-1"><GraduationCap className="h-3 w-3" /> Del colegio</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {e.cargo && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{e.cargo}</span>}
                    {e.cedula && <span className="flex items-center gap-1"><IdCard className="h-3 w-3" />{e.cedula}</span>}
                    {e.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{e.telefono}</span>}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="font-medium">{pesos(e.salarioBaseCents)}</div>
                  <div className="text-xs text-muted-foreground">{LABEL_FRECUENCIA[e.frecuenciaPago] ?? e.frecuenciaPago}</div>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setContratoDe(e)} aria-label="Contrato" title="Contrato">
                    <FileText className="h-4 w-4" />
                  </Button>
                  {puedeGestionar && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => abrirEditar(e)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {esActivo(e.estado) && (
                        <Button variant="ghost" size="icon" onClick={() => setAEliminar(e)} aria-label="Dar de baja">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Diálogo crear / editar */}
      <Dialog open={dialogo.abierto} onOpenChange={(o) => setDialogo((d) => ({ ...d, abierto: o }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogo.editando ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
            <DialogDescription>
              Datos del empleado. El salario y la cuenta de banco alimentan la nómina y el pago.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {/* Identidad */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Nombres *"><Input value={form.nombres} onChange={(e) => set('nombres')(e.target.value)} /></Campo>
              <Campo label="Apellidos *"><Input value={form.apellidos} onChange={(e) => set('apellidos')(e.target.value)} /></Campo>
              <Campo label="Cédula"><Input value={form.cedula} onChange={(e) => set('cedula')(e.target.value)} placeholder="Solo dígitos" inputMode="numeric" /></Campo>
              <Campo label="Cargo"><Input value={form.cargo} onChange={(e) => set('cargo')(e.target.value)} /></Campo>
            </div>

            {/* Contrato y salario */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Wallet className="h-4 w-4" /> Contrato y salario</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo label="Tipo de contrato">
                  <NativeSelect value={form.tipoContrato} onChange={(e) => set('tipoContrato')(e.target.value)}>
                    {Object.entries(LABEL_CONTRATO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </NativeSelect>
                </Campo>
                <Campo label="Salario base (RD$)">
                  <Input value={form.salarioBase} onChange={(e) => set('salarioBase')(e.target.value)} inputMode="decimal" placeholder="0.00" />
                </Campo>
                <Campo label="Frecuencia de pago">
                  <NativeSelect value={form.frecuenciaPago} onChange={(e) => set('frecuenciaPago')(e.target.value)}>
                    {Object.entries(LABEL_FRECUENCIA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </NativeSelect>
                </Campo>
                <Campo label="Fecha de ingreso"><Input type="date" value={form.fechaIngreso} onChange={(e) => set('fechaIngreso')(e.target.value)} /></Campo>
                <Campo label="AFP"><Input value={form.afp} onChange={(e) => set('afp')(e.target.value)} /></Campo>
                <Campo label="ARS"><Input value={form.ars} onChange={(e) => set('ars')(e.target.value)} /></Campo>
              </div>
            </div>

            {/* Banco (dispersión, Fase 4) */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Landmark className="h-4 w-4" /> Cuenta para el pago</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo label="Banco"><Input value={form.bancoNombre} onChange={(e) => set('bancoNombre')(e.target.value)} /></Campo>
                <Campo label="No. de cuenta"><Input value={form.bancoCuenta} onChange={(e) => set('bancoCuenta')(e.target.value)} inputMode="numeric" /></Campo>
                <Campo label="Tipo de cuenta">
                  <NativeSelect value={form.bancoTipoCuenta} onChange={(e) => set('bancoTipoCuenta')(e.target.value)}>
                    <option value="">—</option>
                    <option value="ahorros">Ahorros</option>
                    <option value="corriente">Corriente</option>
                  </NativeSelect>
                </Campo>
              </div>
            </div>

            {/* Contacto */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Teléfono"><Input value={form.telefono} onChange={(e) => set('telefono')(e.target.value)} /></Campo>
              <Campo label="Correo"><Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} /></Campo>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo({ abierto: false, editando: null })} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando} className="gap-1.5">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {dialogo.editando ? 'Guardar cambios' : 'Crear empleado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {tieneEscolar && (
        <ImportarEscolarDialog
          open={importAbierto}
          onOpenChange={setImportAbierto}
          onImportado={() => { setImportAbierto(false); mutate(); }}
        />
      )}

      <ContratosEmpleadoDialog
        empleado={contratoDe}
        puedeGestionar={puedeGestionar}
        onOpenChange={(o) => { if (!o) setContratoDe(null); }}
      />

      <ConfirmDialog
        open={!!aEliminar}
        onOpenChange={(o) => !o && setAEliminar(null)}
        title="Dar de baja al empleado"
        description={aEliminar ? `${nombreCompleto(aEliminar)} pasará a inactivo y no entrará en nóminas nuevas. Su historia se conserva.` : ''}
        confirmLabel="Dar de baja"
        onConfirm={eliminar}
        destructive
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

// ── Contratos del empleado ────────────────────────────────────────────────────
// Lista los contratos ya generados (con descarga PDF) y permite generar uno
// nuevo desde una plantilla: el servidor autollena los marcadores con los datos
// del empleado y archiva el texto resuelto.

interface PlantillaContrato { id: number; nombre: string; activa: boolean }
interface ContratoEmitido { id: number; titulo: string; estado: string; createdAt: string }

const ESTADO_CONTRATO: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  generado: { label: 'Generado', variant: 'outline' },
  enviado:  { label: 'Enviado a firmar', variant: 'secondary' },
  firmado:  { label: 'Firmado', variant: 'default' },
};

function ContratosEmpleadoDialog({
  empleado, puedeGestionar, onOpenChange,
}: {
  empleado: Empleado | null;
  puedeGestionar: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const abierto = !!empleado;
  const { data: dContratos, mutate } = useSWR<{ contratos: ContratoEmitido[] }>(
    abierto ? `/api/nomina/empleados/${empleado!.id}/contratos` : null, fetcher,
  );
  const { data: dPlantillas } = useSWR<{ plantillas: PlantillaContrato[] }>(
    abierto ? '/api/nomina/contratos/plantillas' : null, fetcher,
  );
  const [plantillaId, setPlantillaId] = useState('');
  const [generando, setGenerando] = useState(false);
  const [enlaces, setEnlaces] = useState<Record<number, string>>({});
  const [enviandoId, setEnviandoId] = useState<number | null>(null);

  const contratos = dContratos?.contratos ?? [];
  const plantillas = (dPlantillas?.plantillas ?? []).filter((p) => p.activa);

  async function enviarAFirmar(contratoId: number) {
    setEnviandoId(contratoId);
    try {
      const res = await fetch(`/api/nomina/contratos/${contratoId}/enviar`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo enviar');
      setEnlaces((e) => ({ ...e, [contratoId]: j.url }));
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setEnviandoId(null);
    }
  }

  async function copiar(url: string) {
    try { await navigator.clipboard.writeText(url); toast.success('Enlace copiado'); }
    catch { toast.error('No se pudo copiar'); }
  }

  async function generar() {
    const pid = Number(plantillaId) || plantillas[0]?.id;
    if (!pid || !empleado) { toast.error('Elige una plantilla'); return; }
    setGenerando(true);
    try {
      const res = await fetch(`/api/nomina/empleados/${empleado.id}/contratos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantillaId: pid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo generar');
      toast.success('Contrato generado');
      mutate();
      if (j.contrato?.id) window.open(`/api/nomina/contratos/${j.contrato.id}/pdf`, '_blank');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-zero-600" /> Contratos
          </DialogTitle>
          <DialogDescription>
            {empleado ? nombreCompleto(empleado) : ''} — genera el contrato desde una plantilla; se llena solo con sus datos.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Generar nuevo */}
          {puedeGestionar && (
            plantillas.length === 0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                No hay plantillas activas. Crea una en <span className="font-medium">Nómina → Contratos</span>.
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Generar desde plantilla</Label>
                  <NativeSelect value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
                    {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </NativeSelect>
                </div>
                <Button onClick={generar} disabled={generando} className="gap-1.5">
                  {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Generar
                </Button>
              </div>
            )
          )}

          {/* Emitidos */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Contratos generados</Label>
            {contratos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay contratos para este empleado.</p>
            ) : (
              <div className="space-y-1.5">
                {contratos.map((c) => {
                  const est = ESTADO_CONTRATO[c.estado] ?? ESTADO_CONTRATO.generado;
                  const enlace = enlaces[c.id];
                  return (
                    <div key={c.id} className="space-y-2 rounded-md border p-2.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{c.titulo}</span>
                            <Badge variant={est.variant} className="shrink-0">{est.label}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(c.createdAt).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5"
                          onClick={() => window.open(`/api/nomina/contratos/${c.id}/pdf`, '_blank')}>
                          <Download className="h-3.5 w-3.5" /> PDF
                        </Button>
                      </div>

                      {puedeGestionar && c.estado !== 'firmado' && (
                        <div className="flex items-center gap-2 pl-6">
                          <Button variant="secondary" size="sm" className="gap-1.5"
                            onClick={() => enviarAFirmar(c.id)} disabled={enviandoId === c.id}>
                            {enviandoId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            {c.estado === 'enviado' ? 'Regenerar enlace' : 'Enviar a firmar'}
                          </Button>
                        </div>
                      )}

                      {enlace && (
                        <div className="ml-6 flex items-center gap-1.5 rounded-md border bg-muted/40 p-1.5">
                          <input readOnly value={enlace} className="min-w-0 flex-1 bg-transparent px-1 text-xs text-muted-foreground outline-none" />
                          <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={() => copiar(enlace)}>Copiar</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Importar personal del colegio ─────────────────────────────────────────────
// Trae el personal del módulo escolar (SIGERD + agregados a mano) y crea
// empleados de nómina. Snapshot: copia la identidad; el salario nace en 0 y se
// completa después. Idempotente: las ya importadas salen marcadas y bloqueadas.

interface PersonaImportable {
  ref: string;
  origen: 'sigerd' | 'manual';
  cedula: string | null;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  esProfesor: boolean;
  activo: boolean;
  yaImportada: boolean;
  cedulaOcupada: boolean;
}

function nombrePersona(p: PersonaImportable): string {
  return [p.nombres, p.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

function ImportarEscolarDialog({
  open, onOpenChange, onImportado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImportado: () => void;
}) {
  const { data, isLoading } = useSWR<{ disponible: boolean; personas: PersonaImportable[] }>(
    open ? '/api/nomina/empleados/importar-escolar' : null,
    fetcher,
  );
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState('');

  const personas = useMemo(() => data?.personas ?? [], [data]);
  const importables = personas.filter((p) => !p.yaImportada);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return personas;
    return personas.filter((p) =>
      nombrePersona(p).toLowerCase().includes(q) ||
      (p.cedula ?? '').includes(q) ||
      (p.cargo ?? '').toLowerCase().includes(q),
    );
  }, [personas, busca]);

  function toggle(ref: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(ref)) n.delete(ref); else n.add(ref);
      return n;
    });
  }
  const todosSel = importables.length > 0 && importables.every((p) => sel.has(p.ref));
  function toggleTodos() {
    setSel(todosSel ? new Set() : new Set(importables.map((p) => p.ref)));
  }

  async function importar() {
    if (sel.size === 0) return;
    setImportando(true);
    try {
      const res = await fetch('/api/nomina/empleados/importar-escolar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs: [...sel] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo importar');
      toast.success(j.creados ? `${j.creados} empleado(s) importado(s)` : (j.mensaje ?? 'Nada que importar'));
      setSel(new Set());
      onImportado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar');
    } finally {
      setImportando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-zero-600" /> Importar personal del colegio
          </DialogTitle>
          <DialogDescription>
            Trae al personal del módulo escolar como empleados. Se copia su identidad;
            el salario y la cuenta de banco los completas después en cada ficha.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, cédula o cargo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading || !data ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : personas.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No hay personal en el colegio. Corre “Obtener información” en SIGERD o agrégalo a mano en Personal.
            </p>
          ) : importables.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Todo el personal del colegio ya está en la nómina.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={toggleTodos}
                  disabled={importables.length === 0}
                  className="font-medium text-zero-600 hover:underline disabled:opacity-50"
                >
                  {todosSel ? 'Quitar selección' : 'Seleccionar todos los que faltan'}
                </button>
                <span>{sel.size} seleccionado(s) · {importables.length} sin importar</span>
              </div>
              <div className="max-h-[22rem] space-y-1 overflow-auto pr-1">
                {filtradas.map((p) => {
                  const marcado = sel.has(p.ref);
                  const bloqueado = p.yaImportada;
                  return (
                    <button
                      key={p.ref}
                      type="button"
                      onClick={() => !bloqueado && toggle(p.ref)}
                      disabled={bloqueado}
                      className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition ${
                        bloqueado ? 'opacity-60' : marcado ? 'border-zero-500 bg-zero-50' : 'hover:bg-muted/50'
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        marcado || bloqueado ? 'border-zero-500 bg-zero-500 text-white' : 'border-muted-foreground/40'
                      }`}>
                        {(marcado || bloqueado) && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{nombrePersona(p)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.cargo ?? '—'}{p.cedula ? ` · ${p.cedula}` : ''}
                        </span>
                      </span>
                      {p.esProfesor && <Badge variant="secondary" className="shrink-0">Maestro</Badge>}
                      {bloqueado ? (
                        <Badge variant="outline" className="shrink-0">Ya en nómina</Badge>
                      ) : p.cedulaOcupada ? (
                        <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700">Cédula repetida</Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importando}>Cerrar</Button>
          <Button onClick={importar} disabled={importando || sel.size === 0} className="gap-1.5">
            {importando && <Loader2 className="h-4 w-4 animate-spin" />}
            Importar {sel.size > 0 ? `(${sel.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
