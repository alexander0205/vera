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
  Plus, Pencil, Trash2, UserPlus,
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

export default function EmpleadosClient() {
  const { can } = usePermissions();
  const puedeGestionar = can('empleados:gestionar');
  const { data, isLoading, mutate } = useSWR<{ empleados: Empleado[] }>('/api/nomina/empleados', fetcher);

  const [busca, setBusca] = useState('');
  const [dialogo, setDialogo] = useState<{ abierto: boolean; editando: Empleado | null }>({ abierto: false, editando: null });
  const [form, setForm] = useState<FormState>(formVacio());
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Empleado | null>(null);

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
          <Button onClick={abrirNuevo} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo empleado
          </Button>
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
                {puedeGestionar && (
                  <div className="flex flex-shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => abrirEditar(e)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {esActivo(e.estado) && (
                      <Button variant="ghost" size="icon" onClick={() => setAEliminar(e)} aria-label="Dar de baja">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
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
