'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import {
  Loader2, Wallet, Landmark, FileText, Download, Upload, X, Trash2,
} from 'lucide-react';
import {
  Empleado, FormState, fetcher, formVacio, empleadoAForm, tam,
  LABEL_CONTRATO, LABEL_FRECUENCIA, LABEL_JORNADA, LABEL_TURNO, LABEL_TIPO_DOC,
} from './shared';

/** Pasos base (edición). */
const PASOS_BASE = [
  { titulo: 'Identidad', descripcion: 'Datos personales del empleado.' },
  { titulo: 'Puesto y jornada', descripcion: 'Cargo, tipo de contrato, jornada, turno y vacaciones.' },
  { titulo: 'Pago y banco', descripcion: 'Salario y la cuenta donde recibe el pago.' },
  { titulo: 'Documentos', descripcion: 'Adjunta la verificación de antecedentes y otros documentos.' },
] as const;

/** Pasos extra al CREAR: contrato + revisión (estilo Deel — el empleado nace del contrato). */
const PASOS_CONTRATO = [
  { titulo: 'Contrato', descripcion: 'Usa una plantilla nuestra, sube uno firmado, u omítelo por ahora.' },
  { titulo: 'Revisión', descripcion: 'Confirma que los datos del nuevo empleado están correctos.' },
] as const;

/**
 * Asistente de alta/edición de empleado (estilo Deel, varios pasos). Se renderiza
 * SIN modal a propósito: al crear vive en su propia página (`/nomina/empleados/nuevo`)
 * para que cerrar por accidente no borre todo lo tecleado (pedido de Alex). Trae
 * sus propios botones de navegación; el contenedor no pone footer.
 */
export function EmpleadoWizard({
  editando, onCancel, onSaved,
}: {
  editando: Empleado | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => (editando ? empleadoAForm(editando) : formVacio()));
  const [paso, setPaso] = useState(0);
  const [docsPendientes, setDocsPendientes] = useState<{ file: File; tipo: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  // Paso "Contrato" del alta (solo al crear): una de las tres vías.
  const [contratoModo, setContratoModo] = useState<'ninguno' | 'plantilla' | 'subido'>('ninguno');
  const [contratoPlantillaId, setContratoPlantillaId] = useState('');
  const [contratoArchivo, setContratoArchivo] = useState<File | null>(null);
  const [revisionPreview, setRevisionPreview] = useState<string | null>(null);
  const [cargandoRevision, setCargandoRevision] = useState(false);

  // Pasos según modo: al crear se añaden Contrato + Revisión; al editar, no.
  const pasos = editando ? PASOS_BASE : [...PASOS_BASE, ...PASOS_CONTRATO];
  const { data: dPlantillasAlta } = useSWR<{ plantillas: { id: number; nombre: string; activa: boolean }[] }>(
    !editando ? '/api/nomina/contratos/plantillas' : null, fetcher,
  );
  const plantillasAlta = (dPlantillasAlta?.plantillas ?? []).filter((p) => p.activa);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  /** Ensambla la vista previa del contrato con los datos tecleados (paso Revisión). */
  async function cargarRevision() {
    if (contratoModo !== 'plantilla') { setRevisionPreview(null); return; }
    const pid = Number(contratoPlantillaId) || plantillasAlta[0]?.id;
    if (!pid) { setRevisionPreview(null); return; }
    setCargandoRevision(true);
    try {
      const res = await fetch('/api/nomina/contratos/preview-adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantillaId: pid, empleado: form }),
      });
      const j = await res.json().catch(() => ({}));
      setRevisionPreview(res.ok ? j.cuerpo : null);
    } catch {
      setRevisionPreview(null);
    } finally {
      setCargandoRevision(false);
    }
  }

  /** Navega a un paso; al entrar a Revisión (último del alta) carga el preview. */
  function irPaso(i: number) {
    if (i < 0 || i >= pasos.length) return;
    if (!editando && i === pasos.length - 1) cargarRevision();
    setPaso(i);
  }

  async function guardar() {
    if (!form.nombres.trim() || !form.apellidos.trim()) {
      toast.error('Nombres y apellidos son obligatorios');
      setPaso(0);
      return;
    }
    if (!editando && contratoModo === 'subido' && !contratoArchivo) {
      toast.error('Elige el archivo del contrato firmado o cambia la opción de contrato');
      setPaso(pasos.length - 2);
      return;
    }
    setGuardando(true);
    try {
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

      if (!editando) {
        const j = await res.json().catch(() => ({}));
        const nuevoId = j.empleado?.id;
        if (nuevoId) {
          // Documentos encolados en el paso Documentos.
          let docsFallidos = 0;
          for (const d of docsPendientes) {
            const fd = new FormData();
            fd.append('archivo', d.file);
            fd.append('tipo', d.tipo);
            const up = await fetch(`/api/nomina/empleados/${nuevoId}/documentos`, { method: 'POST', body: fd });
            if (!up.ok) docsFallidos++;
          }
          if (docsFallidos > 0) toast.error(`${docsFallidos} documento(s) no se pudieron subir; agrégalos desde la ficha.`);

          // Contrato: una de las tres vías. Un fallo aquí no descarta el empleado.
          if (contratoModo === 'plantilla') {
            const pid = Number(contratoPlantillaId) || plantillasAlta[0]?.id;
            if (pid) {
              const c = await fetch(`/api/nomina/empleados/${nuevoId}/contratos`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plantillaId: pid }),
              });
              if (!c.ok) toast.error('El empleado se creó, pero el contrato no se generó; hazlo desde la ficha.');
            }
          } else if (contratoModo === 'subido' && contratoArchivo) {
            const fd = new FormData();
            fd.append('archivo', contratoArchivo);
            fd.append('titulo', 'Contrato firmado');
            const c = await fetch(`/api/nomina/empleados/${nuevoId}/contratos/subir`, { method: 'POST', body: fd });
            if (!c.ok) toast.error('El empleado se creó, pero el contrato no se subió; hazlo desde la ficha.');
          }
        }
      }
      toast.success(editando ? 'Empleado actualizado' : 'Empleado creado');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Descripción del paso actual */}
      <p className="text-sm text-muted-foreground">{pasos[paso].descripcion}</p>

      {/* Barra de pasos */}
      <div className="flex items-center gap-1 px-1">
        {pasos.map((p, i) => (
          <button
            key={p.titulo}
            type="button"
            onClick={() => irPaso(i)}
            className="flex flex-1 flex-col gap-1 text-left"
          >
            <span className={`h-1.5 rounded-full transition ${i <= paso ? 'bg-zero-500' : 'bg-muted'}`} />
            <span className={`hidden text-[10px] sm:block ${i === paso ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {p.titulo}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-5">
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
            empleado={editando}
            pendientes={docsPendientes}
            setPendientes={setDocsPendientes}
          />
        )}

        {/* Paso 5 · Contrato (solo al crear) */}
        {!editando && paso === 4 && (
          <div className="space-y-3">
            <OpcionContrato
              activo={contratoModo === 'plantilla'}
              onClick={() => setContratoModo('plantilla')}
              titulo="Usar una plantilla nuestra"
              desc="El sistema arma el contrato con los datos del empleado. Se puede enviar a firmar después."
            >
              {contratoModo === 'plantilla' && (
                plantillasAlta.length === 0 ? (
                  <div className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                    No hay plantillas activas. Créalas en <span className="font-medium">Nómina → Contratos</span>, o sube un contrato firmado.
                  </div>
                ) : (
                  <NativeSelect value={contratoPlantillaId} onChange={(e) => setContratoPlantillaId(e.target.value)}>
                    {plantillasAlta.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </NativeSelect>
                )
              )}
            </OpcionContrato>

            <OpcionContrato
              activo={contratoModo === 'subido'}
              onClick={() => setContratoModo('subido')}
              titulo="Subir contrato firmado"
              desc="El empleado ya tiene su contrato firmado (PDF o escaneo). Queda como firmado, sin pedir firma."
            >
              {contratoModo === 'subido' && (
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition hover:bg-muted/50">
                  <Upload className="h-4 w-4" />
                  {contratoArchivo ? 'Cambiar archivo' : 'Elegir archivo'}
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setContratoArchivo(e.target.files?.[0] ?? null)} />
                  {contratoArchivo && <span className="ml-1 truncate text-xs text-muted-foreground">{contratoArchivo.name}</span>}
                </label>
              )}
            </OpcionContrato>

            <OpcionContrato
              activo={contratoModo === 'ninguno'}
              onClick={() => setContratoModo('ninguno')}
              titulo="Omitir por ahora"
              desc="Crea el empleado sin contrato. Podrás generarlo o subirlo después desde su ficha."
            />
          </div>
        )}

        {/* Paso 6 · Revisión (solo al crear) */}
        {!editando && paso === 5 && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 text-sm font-medium">¿Los datos están correctos conforme al nuevo empleado?</div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <Dato k="Nombre" v={`${form.nombres} ${form.apellidos}`.trim()} />
                <Dato k="Cédula" v={form.cedula || '—'} />
                <Dato k="Cargo" v={form.cargo || '—'} />
                <Dato k="Salario" v={form.salarioBase ? `RD$${form.salarioBase}` : '—'} />
                <Dato k="Frecuencia" v={LABEL_FRECUENCIA[form.frecuenciaPago] ?? form.frecuenciaPago} />
                <Dato k="Jornada" v={LABEL_JORNADA[form.jornada] ?? '—'} />
                <Dato k="Ingreso" v={form.fechaIngreso || '—'} />
                <Dato k="Contrato" v={contratoModo === 'plantilla' ? 'Plantilla nuestra' : contratoModo === 'subido' ? 'Subido (firmado)' : 'Sin contrato'} />
              </div>
            </div>

            {contratoModo === 'plantilla' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vista previa del contrato</Label>
                {cargandoRevision ? (
                  <div className="flex items-center justify-center rounded-md border py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                  <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
                    {revisionPreview ?? 'No se pudo generar la vista previa. Revisa que haya una plantilla elegida.'}
                  </div>
                )}
              </div>
            )}
            {contratoModo === 'subido' && (
              <p className="text-xs text-muted-foreground">Se subirá el contrato firmado <span className="font-medium">{contratoArchivo?.name ?? '(sin archivo)'}</span> y quedará como firmado.</p>
            )}
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex flex-row justify-between gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onCancel} disabled={guardando}>
          Cancelar
        </Button>
        <div className="flex gap-2">
          {paso > 0 && (
            <Button variant="outline" onClick={() => irPaso(paso - 1)} disabled={guardando}>Atrás</Button>
          )}
          {paso < pasos.length - 1 ? (
            <Button onClick={() => irPaso(paso + 1)}>Siguiente</Button>
          ) : (
            <Button onClick={guardar} disabled={guardando} className="gap-1.5">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {editando ? 'Guardar cambios' : 'Crear empleado'}
            </Button>
          )}
        </div>
      </div>
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

/** Una de las opciones (radio) del paso Contrato, con su detalle desplegable. */
function OpcionContrato({ activo, onClick, titulo, desc, children }: {
  activo: boolean; onClick: () => void; titulo: string; desc: string; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 transition ${activo ? 'border-zero-500 bg-zero-50' : ''}`}>
      <button type="button" onClick={onClick} className="flex w-full items-start gap-3 text-left">
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${activo ? 'border-zero-500' : 'border-muted-foreground/40'}`}>
          {activo && <span className="h-2 w-2 rounded-full bg-zero-500" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{titulo}</span>
          <span className="block text-xs text-muted-foreground">{desc}</span>
        </span>
      </button>
      {children && <div className="mt-2 pl-7">{children}</div>}
    </div>
  );
}

/** Par etiqueta/valor del resumen de revisión. */
function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate text-right font-medium">{v}</span>
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
