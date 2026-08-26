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
  Upload, X,
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
  pais: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  jornada: string | null;
  turno: string | null;
  vacacionesDias: number | null;
  diasLibres: string | null;
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
const LABEL_JORNADA: Record<string, string> = {
  tiempo_completo: 'Tiempo completo', medio_tiempo: 'Medio tiempo', por_horas: 'Por horas',
};
const LABEL_TURNO: Record<string, string> = {
  diurno: 'Diurno', nocturno: 'Nocturno', mixto: 'Mixto', rotativo: 'Rotativo',
};
const LABEL_TIPO_DOC: Record<string, string> = {
  antecedentes: 'Verificación de antecedentes', cedula: 'Cédula', titulo: 'Título', otro: 'Otro',
};

/** Pasos del asistente de alta/edición (estilo Deel). */
const PASOS = [
  { titulo: 'Identidad', descripcion: 'Datos personales del empleado.' },
  { titulo: 'Puesto y jornada', descripcion: 'Cargo, tipo de contrato, jornada, turno y vacaciones.' },
  { titulo: 'Pago y banco', descripcion: 'Salario y la cuenta donde recibe el pago.' },
  { titulo: 'Documentos', descripcion: 'Adjunta la verificación de antecedentes y otros documentos.' },
] as const;

/** Bytes legibles para el listado de documentos. */
function tam(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Estado en blanco del formulario (crear). Salario en pesos, texto para el input. */
function formVacio() {
  return {
    cedula: '', nombres: '', apellidos: '', cargo: '',
    tipoContrato: 'indefinido', salarioBase: '', frecuenciaPago: 'mensual',
    fechaIngreso: '', afp: '', ars: '',
    bancoNombre: '', bancoCuenta: '', bancoTipoCuenta: '',
    sexo: '', fechaNacimiento: '', nacionalidad: '', pais: 'República Dominicana',
    telefono: '', email: '', notas: '',
    jornada: 'tiempo_completo', turno: 'diurno', vacacionesDias: '', diasLibres: '',
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
    pais: e.pais ?? '', telefono: e.telefono ?? '', email: e.email ?? '', notas: e.notas ?? '',
    jornada: e.jornada ?? '', turno: e.turno ?? '',
    vacacionesDias: e.vacacionesDias != null ? String(e.vacacionesDias) : '', diasLibres: e.diasLibres ?? '',
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
  const [paso, setPaso] = useState(0);
  const [docsPendientes, setDocsPendientes] = useState<{ file: File; tipo: string }[]>([]);
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
    setPaso(0);
    setDocsPendientes([]);
    setDialogo({ abierto: true, editando: null });
  }
  function abrirEditar(e: Empleado) {
    setForm(empleadoAForm(e));
    setPaso(0);
    setDocsPendientes([]);
    setDialogo({ abierto: true, editando: e });
  }
  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function guardar() {
    if (!form.nombres.trim() || !form.apellidos.trim()) {
      toast.error('Nombres y apellidos son obligatorios');
      setPaso(0);
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
      // En alta nueva, los documentos se encolaron en el paso 4: se suben ahora
      // que el empleado ya tiene id. Un fallo de subida no descarta el empleado.
      if (!editando && docsPendientes.length > 0) {
        const j = await res.json().catch(() => ({}));
        const nuevoId = j.empleado?.id;
        if (nuevoId) {
          let fallidos = 0;
          for (const d of docsPendientes) {
            const fd = new FormData();
            fd.append('archivo', d.file);
            fd.append('tipo', d.tipo);
            const up = await fetch(`/api/nomina/empleados/${nuevoId}/documentos`, { method: 'POST', body: fd });
            if (!up.ok) fallidos++;
          }
          if (fallidos > 0) toast.error(`${fallidos} documento(s) no se pudieron subir; agrégalos desde la ficha.`);
        }
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

      {/* Asistente crear / editar (estilo Deel: varios pasos) */}
      <Dialog open={dialogo.abierto} onOpenChange={(o) => setDialogo((d) => ({ ...d, abierto: o }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogo.editando ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
            <DialogDescription>
              {PASOS[paso].descripcion}
            </DialogDescription>
          </DialogHeader>

          {/* Barra de pasos */}
          <div className="flex items-center gap-1.5 px-1">
            {PASOS.map((p, i) => (
              <button
                key={p.titulo}
                type="button"
                onClick={() => setPaso(i)}
                className="flex flex-1 flex-col gap-1 text-left"
              >
                <span className={`h-1.5 rounded-full transition ${i <= paso ? 'bg-zero-500' : 'bg-muted'}`} />
                <span className={`text-[11px] ${i === paso ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {i + 1}. {p.titulo}
                </span>
              </button>
            ))}
          </div>

          <DialogBody className="space-y-5">
            {/* Paso 1 · Identidad */}
            {paso === 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Nombres *"><Input value={form.nombres} onChange={(e) => set('nombres')(e.target.value)} /></Campo>
                <Campo label="Apellidos *"><Input value={form.apellidos} onChange={(e) => set('apellidos')(e.target.value)} /></Campo>
                <Campo label="Cédula"><Input value={form.cedula} onChange={(e) => set('cedula')(e.target.value)} placeholder="Solo dígitos" inputMode="numeric" /></Campo>
                <Campo label="Sexo">
                  <NativeSelect value={form.sexo} onChange={(e) => set('sexo')(e.target.value)}>
                    <option value="">—</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                  </NativeSelect>
                </Campo>
                <Campo label="Fecha de nacimiento"><Input type="date" value={form.fechaNacimiento} onChange={(e) => set('fechaNacimiento')(e.target.value)} /></Campo>
                <Campo label="Nacionalidad"><Input value={form.nacionalidad} onChange={(e) => set('nacionalidad')(e.target.value)} placeholder="Dominicana" /></Campo>
                <Campo label="País"><Input value={form.pais} onChange={(e) => set('pais')(e.target.value)} /></Campo>
                <Campo label="Teléfono"><Input value={form.telefono} onChange={(e) => set('telefono')(e.target.value)} /></Campo>
                <Campo label="Correo"><Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} /></Campo>
              </div>
            )}

            {/* Paso 2 · Puesto y jornada */}
            {paso === 1 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Cargo"><Input value={form.cargo} onChange={(e) => set('cargo')(e.target.value)} placeholder="Ej. Cajero" /></Campo>
                <Campo label="Tipo de contrato">
                  <NativeSelect value={form.tipoContrato} onChange={(e) => set('tipoContrato')(e.target.value)}>
                    {Object.entries(LABEL_CONTRATO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </NativeSelect>
                </Campo>
                <Campo label="Jornada">
                  <NativeSelect value={form.jornada} onChange={(e) => set('jornada')(e.target.value)}>
                    <option value="">—</option>
                    {Object.entries(LABEL_JORNADA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </NativeSelect>
                </Campo>
                <Campo label="Turno">
                  <NativeSelect value={form.turno} onChange={(e) => set('turno')(e.target.value)}>
                    <option value="">—</option>
                    {Object.entries(LABEL_TURNO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </NativeSelect>
                </Campo>
                <Campo label="Fecha de ingreso"><Input type="date" value={form.fechaIngreso} onChange={(e) => set('fechaIngreso')(e.target.value)} /></Campo>
                <Campo label="Vacaciones (días/año)">
                  <Input value={form.vacacionesDias} onChange={(e) => set('vacacionesDias')(e.target.value)} inputMode="numeric" placeholder="14" />
                </Campo>
                <Campo label="Día(s) de descanso"><Input value={form.diasLibres} onChange={(e) => set('diasLibres')(e.target.value)} placeholder="Domingo" /></Campo>
              </div>
            )}

            {/* Paso 3 · Pago y banco */}
            {paso === 2 && (
              <div className="space-y-4">
                <div className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Wallet className="h-4 w-4" /> Salario</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Campo label="Salario base (RD$)">
                      <Input value={form.salarioBase} onChange={(e) => set('salarioBase')(e.target.value)} inputMode="decimal" placeholder="0.00" />
                    </Campo>
                    <Campo label="Frecuencia de pago">
                      <NativeSelect value={form.frecuenciaPago} onChange={(e) => set('frecuenciaPago')(e.target.value)}>
                        {Object.entries(LABEL_FRECUENCIA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </NativeSelect>
                    </Campo>
                    <Campo label="AFP"><Input value={form.afp} onChange={(e) => set('afp')(e.target.value)} /></Campo>
                    <Campo label="ARS"><Input value={form.ars} onChange={(e) => set('ars')(e.target.value)} /></Campo>
                  </div>
                </div>
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
              </div>
            )}

            {/* Paso 4 · Documentos */}
            {paso === 3 && (
              <DocumentosPaso
                empleado={dialogo.editando}
                pendientes={docsPendientes}
                setPendientes={setDocsPendientes}
              />
            )}
          </DialogBody>

          <DialogFooter className="flex-row justify-between gap-2">
            <Button variant="ghost" onClick={() => setDialogo({ abierto: false, editando: null })} disabled={guardando}>
              Cancelar
            </Button>
            <div className="flex gap-2">
              {paso > 0 && (
                <Button variant="outline" onClick={() => setPaso((p) => p - 1)} disabled={guardando}>Atrás</Button>
              )}
              {paso < PASOS.length - 1 ? (
                <Button onClick={() => setPaso((p) => p + 1)}>Siguiente</Button>
              ) : (
                <Button onClick={guardar} disabled={guardando} className="gap-1.5">
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {dialogo.editando ? 'Guardar cambios' : 'Crear empleado'}
                </Button>
              )}
            </div>
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

// ── Paso 4 · Documentos ───────────────────────────────────────────────────────
// Alta nueva (empleado=null): encola los archivos; el padre los sube tras crear
// al empleado (ya con id). Edición: sube y borra en vivo contra la ficha.

interface DocumentoResumen { id: number; tipo: string; archivoNombre: string | null; mime: string; tamanoBytes: number; subidoEn: string }

function DocumentosPaso({
  empleado, pendientes, setPendientes,
}: {
  empleado: Empleado | null;
  pendientes: { file: File; tipo: string }[];
  setPendientes: React.Dispatch<React.SetStateAction<{ file: File; tipo: string }[]>>;
}) {
  const esEdicion = !!empleado;
  const [tipo, setTipo] = useState('antecedentes');
  const [subiendo, setSubiendo] = useState(false);
  const { data, mutate } = useSWR<{ documentos: DocumentoResumen[] }>(
    esEdicion ? `/api/nomina/empleados/${empleado!.id}/documentos` : null, fetcher,
  );
  const existentes = data?.documentos ?? [];

  async function elegir(file: File | undefined) {
    if (!file) return;
    if (!esEdicion) {
      setPendientes((p) => [...p, { file, tipo }]);
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('tipo', tipo);
      const res = await fetch(`/api/nomina/empleados/${empleado!.id}/documentos`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo subir');
      toast.success('Documento subido');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir');
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(docId: number) {
    try {
      const res = await fetch(`/api/nomina/empleados/${empleado!.id}/documentos/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo borrar');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo de documento</Label>
          <NativeSelect value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(LABEL_TIPO_DOC).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </div>
        <label className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition hover:bg-muted/50 ${subiendo ? 'pointer-events-none opacity-60' : ''}`}>
          {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Adjuntar
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">PDF o imagen, hasta 8 MB. Ej. certificación de no antecedentes penales.</p>

      {/* Cola (alta nueva): se suben al crear el empleado */}
      {!esEdicion && pendientes.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Se subirán al crear</Label>
          {pendientes.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{d.file.name}</span>
              <Badge variant="outline" className="shrink-0">{LABEL_TIPO_DOC[d.tipo] ?? d.tipo}</Badge>
              <span className="shrink-0 text-xs text-muted-foreground">{tam(d.file.size)}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => setPendientes((p) => p.filter((_, j) => j !== i))} aria-label="Quitar">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Ya subidos (edición) */}
      {esEdicion && (
        existentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay documentos.</p>
        ) : (
          <div className="space-y-1.5">
            {existentes.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.archivoNombre ?? 'documento'}</span>
                <Badge variant="outline" className="shrink-0">{LABEL_TIPO_DOC[d.tipo] ?? d.tipo}</Badge>
                <span className="shrink-0 text-xs text-muted-foreground">{tam(d.tamanoBytes)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => window.open(`/api/nomina/empleados/${empleado!.id}/documentos/${d.id}`, '_blank')}
                  aria-label="Ver">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => borrar(d.id)} aria-label="Borrar">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Contratos del empleado ────────────────────────────────────────────────────
// Lista los contratos ya generados (con descarga PDF) y permite generar uno
// nuevo desde una plantilla: el servidor autollena los marcadores con los datos
// del empleado y archiva el texto resuelto.

interface PlantillaContrato { id: number; nombre: string; activa: boolean }
interface ContratoEmitido { id: number; titulo: string; estado: string; origen: string; createdAt: string }

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
  const [subiendoFirmado, setSubiendoFirmado] = useState(false);
  const [preview, setPreview] = useState<{ titulo: string; cuerpo: string } | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
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
      if (j.emailEnviado) toast.success(`Enlace enviado por correo a ${j.email}`);
      else if (j.email) toast.error('No se pudo enviar el correo; copia el enlace de abajo.');
      else toast.success('Enlace listo. El empleado no tiene correo: cópialo abajo.');
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

  async function verPreview() {
    const pid = Number(plantillaId) || plantillas[0]?.id;
    if (!pid || !empleado) { toast.error('Elige una plantilla'); return; }
    setCargandoPreview(true);
    try {
      const res = await fetch(`/api/nomina/empleados/${empleado.id}/contratos/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantillaId: pid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo generar la vista previa');
      setPreview({ titulo: j.titulo, cuerpo: j.cuerpo });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setCargandoPreview(false);
    }
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
      setPreview(null);
      mutate();
      if (j.contrato?.id) window.open(`/api/nomina/contratos/${j.contrato.id}/pdf`, '_blank');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGenerando(false);
    }
  }

  async function subirFirmado(file: File | undefined) {
    if (!file || !empleado) return;
    setSubiendoFirmado(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('titulo', 'Contrato firmado');
      const res = await fetch(`/api/nomina/empleados/${empleado.id}/contratos/subir`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo subir');
      toast.success('Contrato firmado subido');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir');
    } finally {
      setSubiendoFirmado(false);
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
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Generar desde plantilla</Label>
                    <NativeSelect
                      value={plantillaId}
                      onChange={(e) => { setPlantillaId(e.target.value); setPreview(null); }}
                    >
                      {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </NativeSelect>
                  </div>
                  <Button variant="outline" onClick={verPreview} disabled={cargandoPreview} className="gap-1.5">
                    {cargandoPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Vista previa
                  </Button>
                </div>

                {/* Vista previa del contrato lleno, antes de emitirlo */}
                {preview && (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs leading-relaxed">
                      {preview.cuerpo}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cerrar</Button>
                      <Button size="sm" onClick={generar} disabled={generando} className="gap-1.5">
                        {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Generar contrato
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* O subir un contrato propio ya firmado (camino offline) */}
          {puedeGestionar && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium">¿Ya tienes el contrato firmado?</div>
                <div className="text-xs text-muted-foreground">Súbelo (PDF o escaneo). Queda como firmado, sin pedir firma.</div>
              </div>
              <label className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition hover:bg-muted/50 ${subiendoFirmado ? 'pointer-events-none opacity-60' : ''}`}>
                {subiendoFirmado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Subir firmado
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => { subirFirmado(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>
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
                            {c.origen === 'subido' && <Badge variant="outline" className="shrink-0">Subido</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(c.createdAt).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5"
                          onClick={() => window.open(`/api/nomina/contratos/${c.id}/pdf`, '_blank')}>
                          <Download className="h-3.5 w-3.5" /> {c.origen === 'subido' ? 'Ver' : 'PDF'}
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
