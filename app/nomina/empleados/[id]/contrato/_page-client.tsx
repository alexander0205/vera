'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { ArrowLeft, Loader2, FileText, Download, Upload, Plus, Check } from 'lucide-react';
import { Empleado, fetcher, nombreCompleto } from '../../shared';

// Gestión del contrato de UN empleado, en su propia página (no modal — pedido de
// Alex): genera desde una plantilla (con vista previa), sube uno ya firmado, o
// envía a firmar. Un empleado tiene un solo contrato: generar/subir reemplaza al
// anterior (con confirmación).

interface PlantillaContrato { id: number; nombre: string; activa: boolean }
interface ContratoEmitido { id: number; titulo: string; estado: string; origen: string; createdAt: string }

const ESTADO_CONTRATO: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  generado: { label: 'Generado', variant: 'outline' },
  enviado:  { label: 'Enviado a firmar', variant: 'secondary' },
  firmado:  { label: 'Firmado', variant: 'default' },
};

export default function ContratoEmpleadoClient({ id }: { id: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeGestionar = can('empleados:gestionar');
  const volver = () => router.push('/nomina/empleados');

  const { data: dEmpleado, isLoading } = useSWR<{ empleado?: Empleado }>(
    `/api/nomina/empleados/${id}`, fetcher,
  );
  const empleado = dEmpleado?.empleado ?? null;

  const { data: dContratos, mutate } = useSWR<{ contratos: ContratoEmitido[] }>(
    `/api/nomina/empleados/${id}/contratos`, fetcher,
  );
  const { data: dPlantillas } = useSWR<{ plantillas: PlantillaContrato[] }>(
    '/api/nomina/contratos/plantillas', fetcher,
  );
  const [plantillaId, setPlantillaId] = useState('');
  const [generando, setGenerando] = useState(false);
  const [subiendoFirmado, setSubiendoFirmado] = useState(false);
  const [preview, setPreview] = useState<{ titulo: string; cuerpo: string } | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [enlaces, setEnlaces] = useState<Record<number, string>>({});
  const [enviandoId, setEnviandoId] = useState<number | null>(null);
  const [pendiente, setPendiente] = useState<{ tipo: 'generar' } | { tipo: 'subir'; file: File } | null>(null);

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

  // Un empleado tiene un solo contrato: generar o subir uno nuevo reemplaza al
  // anterior. Si ya hay contrato, se confirma antes.
  const pedirGenerar = () => { if (contratos.length > 0) setPendiente({ tipo: 'generar' }); else hacerGenerar(); };
  const pedirSubir = (file: File | undefined) => {
    if (!file) return;
    if (contratos.length > 0) setPendiente({ tipo: 'subir', file }); else hacerSubir(file);
  };

  async function hacerGenerar() {
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

  async function hacerSubir(file: File | undefined) {
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
          <FileText className="h-6 w-6 text-zero-600" /> Contrato
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empleado ? `${nombreCompleto(empleado)} — genera el contrato desde una plantilla; se llena solo con sus datos.` : 'Contrato del empleado.'}
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
                    <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs leading-relaxed">
                      {preview.cuerpo}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cerrar</Button>
                      <Button size="sm" onClick={pedirGenerar} disabled={generando} className="gap-1.5">
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
                  onChange={(e) => { pedirSubir(e.target.files?.[0]); e.target.value = ''; }}
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
        </div>
      )}

      <ConfirmDialog
        open={!!pendiente}
        onOpenChange={(o) => !o && setPendiente(null)}
        title="Reemplazar el contrato actual"
        description="Este empleado ya tiene un contrato. Si continúas, se eliminará y quedará solo el nuevo. Esta acción no se puede deshacer."
        confirmLabel="Reemplazar"
        onConfirm={() => {
          const p = pendiente;
          setPendiente(null);
          if (p?.tipo === 'generar') hacerGenerar();
          else if (p?.tipo === 'subir') hacerSubir(p.file);
        }}
        destructive
      />
    </div>
  );
}
