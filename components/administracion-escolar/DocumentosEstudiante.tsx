'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  FileCheck, Upload, Eye, Check, X, Ban, Loader2, AlertTriangle, Link2, Plus,
} from 'lucide-react';
import { EnlaceDocumentoDialog } from '@/components/administracion-escolar/EnlaceDocumentoDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import { ExigenciaBadge } from '@/components/administracion-escolar/DocumentosPanel';
import type { Checklist, FilaChecklist, EstadoDocumento } from '@/lib/administracion-escolar/documentos';

/**
 * Repetido a propósito y no importado de lib/administracion-escolar/
 * documentos-archivo.ts: ese módulo carga `lib/db/drizzle` y el SDK de S3, y
 * esto es un componente de cliente — importar de ahí metía toda esa cadena
 * (hasta `sharp`, que a su vez tira de `detect-libc`/`child_process`) en el
 * bundle del navegador y tumbaba el build entero. El límite real vive en el
 * servidor; este solo evita una subida condenada a fallar antes de mandarla.
 */
const MAX_BYTES_DOCUMENTO = 8 * 1024 * 1024;

/**
 * Pestaña "Documentos" del perfil del estudiante.
 *
 * El checklist es de la MATRÍCULA del período elegido en el filtro global del
 * perfil (`grupoActivo`), no del estudiante en general: lo que se exige
 * depende del nivel y de si es nuevo ingreso o reinscripción, y las dos cosas
 * cambian de un año a otro. Sin matrícula en el período elegido no hay
 * checklist que mostrar.
 *
 * Acepta y muta su propio SWR: el perfil solo le pasa `matriculaId` y
 * `puedeGestionar`, sin tocar su propio `cargar()`.
 */

const API_ENTREGADOS = '/api/administracion-escolar/documentos/entregados';
const ACEPTA = 'image/jpeg,image/png,image/webp,application/pdf';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

interface Props {
  matriculaId: number | null;
  puedeGestionar: boolean;
}

type Accion = 'aprobar' | 'rechazar' | 'no_aplica';
interface DialogState { accion: Accion; fila: FilaChecklist }

export function DocumentosEstudiante({ matriculaId, puedeGestionar }: Props) {
  const { data, isLoading, mutate } = useSWR<Checklist | { error: string }>(
    matriculaId ? `/api/administracion-escolar/documentos/checklist?matriculaId=${matriculaId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [subiendoRequeridoId, setSubiendoRequeridoId] = useState<number | null>(null);
  // `undefined` = cerrado. `null` = enlace del expediente entero. Un número =
  // enlace de ese documento.
  const [enlacePara, setEnlacePara] = useState<{ requeridoId: number | null; nombre: string | null } | null>(null);
  const [dialogo, setDialogo] = useState<DialogState | null>(null);
  const [motivoDraft, setMotivoDraft] = useState('');
  const [guardandoDialogo, setGuardandoDialogo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filaParaSubir = useRef<FilaChecklist | null>(null);

  if (!matriculaId) {
    return <EmptyBox text="Sin matrícula en este período: no hay checklist de documentos que mostrar." />;
  }
  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-zero-600" /></div>;
  }
  if (!data || 'error' in data) {
    return <EmptyBox text={(data as { error?: string })?.error ?? 'No se pudo cargar el checklist'} />;
  }
  if (data.filas.length === 0) {
    return (
      <EmptyBox
        icon={<FileCheck className="mx-auto mb-2 h-8 w-8 text-gray-300" />}
        text="Este nivel todavía no tiene documentos configurados. Se configuran en Configuración → Documentos."
      />
    );
  }

  const { resumen } = data;

  function abrirSelectorArchivo(fila: FilaChecklist) {
    filaParaSubir.current = fila;
    inputRef.current?.click();
  }

  async function onArchivoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const fila = filaParaSubir.current;
    e.target.value = '';
    if (!file || !fila) return;

    if (file.size > MAX_BYTES_DOCUMENTO) {
      toast.error(`El archivo pesa más de ${Math.round(MAX_BYTES_DOCUMENTO / 1024 / 1024)} MB.`);
      return;
    }

    setSubiendoRequeridoId(fila.requeridoId);
    try {
      const fd = new FormData();
      fd.append('matriculaId', String(matriculaId));
      fd.append('requeridoId', String(fila.requeridoId));
      fd.append('accion', 'subir');
      fd.append('archivo', file);
      const res = await fetch(API_ENTREGADOS, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo subir el documento');
      toast.success(`«${fila.nombre}» subido. Queda pendiente de aprobación.`);
      await mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el documento');
    } finally {
      setSubiendoRequeridoId(null);
    }
  }

  async function borrarArchivo(archivoId: number) {
    try {
      const res = await fetch(`/api/administracion-escolar/documentos/archivos/${archivoId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo quitar el archivo');
      await mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar el archivo');
    }
  }

  function abrirDialogo(accion: Accion, fila: FilaChecklist) {
    setMotivoDraft('');
    setDialogo({ accion, fila });
  }

  async function confirmarDialogo() {
    if (!dialogo) return;
    const { accion, fila } = dialogo;
    if (accion !== 'aprobar' && !motivoDraft.trim()) {
      toast.error('El motivo es obligatorio');
      return;
    }
    setGuardandoDialogo(true);
    try {
      if (accion === 'no_aplica') {
        const fd = new FormData();
        fd.append('matriculaId', String(matriculaId));
        fd.append('requeridoId', String(fila.requeridoId));
        fd.append('accion', 'no_aplica');
        fd.append('motivo', motivoDraft.trim());
        const res = await fetch(API_ENTREGADOS, { method: 'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
        toast.success(`«${fila.nombre}» marcado como no aplica.`);
      } else {
        if (!fila.entregadoId) throw new Error('No hay nada entregado todavía');
        const res = await fetch(`${API_ENTREGADOS}/${fila.entregadoId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(accion === 'aprobar'
            ? { accion: 'aprobar' }
            : { accion: 'rechazar', motivo: motivoDraft.trim() }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
        toast.success(accion === 'aprobar'
          ? `«${fila.nombre}» aprobado.`
          : `«${fila.nombre}» rechazado.`);
      }
      setDialogo(null);
      await mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardandoDialogo(false);
    }
  }

  return (
    <div className="space-y-4">
      <input ref={inputRef} type="file" accept={ACEPTA} hidden onChange={onArchivoElegido} />

      {/* Resumen: lo que el colegio necesita ver de un vistazo. */}
      <div className="flex flex-wrap gap-2">
        <ResumenChip label="Documentos" valor={resumen.total} tono="neutro" />
        <ResumenChip label="Faltan requeridos" valor={resumen.faltanRequeridos} tono={resumen.faltanRequeridos > 0 ? 'alerta' : 'ok'} />
        <ResumenChip label="Sin resolver (si aplica)" valor={resumen.sinResolver} tono={resumen.sinResolver > 0 ? 'alerta' : 'ok'} />
        <ResumenChip label="Por aprobar" valor={resumen.porAprobar} tono={resumen.porAprobar > 0 ? 'aviso' : 'ok'} />
        {resumen.completa && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zero-50 px-2.5 py-1 text-xs font-medium text-zero-700">
            <Check className="h-3.5 w-3.5" />Checklist completo
          </span>
        )}
        {puedeGestionar && (
          <Button size="sm" variant="outline" className="ml-auto"
            onClick={() => setEnlacePara({ requeridoId: null, nombre: null })}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />Enlace de todo el expediente
          </Button>
        )}
      </div>

      {/* Tabla y no lista de tarjetas: son diez renglones que se comparan entre
          sí —qué falta, qué está pendiente de aprobar—, y en columnas el ojo
          recorre una sola vertical en vez de rebuscar la etiqueta dentro de
          cada fila. `min-w` para que desplace en vez de estrujarse. */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Exigencia</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map((fila) => (
              <FilaDocumento
                key={fila.requeridoId}
                fila={fila}
                puedeGestionar={puedeGestionar}
                subiendo={subiendoRequeridoId === fila.requeridoId}
                onSubir={() => abrirSelectorArchivo(fila)}
                onBorrarArchivo={borrarArchivo}
                onEnlace={() => setEnlacePara({ requeridoId: fila.requeridoId, nombre: fila.nombre })}
                onNoAplica={() => abrirDialogo('no_aplica', fila)}
                onAprobar={() => abrirDialogo('aprobar', fila)}
                onRechazar={() => abrirDialogo('rechazar', fila)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Aprobar no pide motivo: la descripción es texto plano, así que
          ConfirmDialog (que la mete dentro de un <p> de MUI) alcanza. */}
      <ConfirmDialog
        open={dialogo?.accion === 'aprobar'}
        onOpenChange={(o) => { if (!o) setDialogo(null); }}
        title="Aprobar documento"
        description={dialogo?.accion === 'aprobar'
          ? `«${dialogo.fila.nombre}» queda marcado como aprobado, con tu nombre y la fecha de hoy.`
          : ''}
        confirmLabel="Aprobar"
        loading={guardandoDialogo}
        onConfirm={confirmarDialogo}
      />

      {/* Rechazar y "no aplica" sí piden motivo. Un <Textarea> es un bloque
          (MUI arma un <div> por dentro) y ConfirmDialog mete su `description`
          en un <p> — un <div> ahí adentro es HTML inválido y rompe la
          hidratación. Por eso estos dos arman su propio Dialog en vez de
          reusar ConfirmDialog. */}
      <Dialog
        open={dialogo?.accion === 'rechazar' || dialogo?.accion === 'no_aplica'}
        onOpenChange={(o) => { if (!o) setDialogo(null); }}
      >
        <DialogContent className="max-w-sm">
          <ModalHeader
            title={dialogo?.accion === 'rechazar' ? 'Rechazar documento' : 'Marcar «no aplica»'}
            subtitle={
              dialogo?.accion === 'rechazar'
                ? `«${dialogo.fila.nombre}» vuelve a pedirse a la familia. Explica por qué se rechaza.`
                : dialogo?.accion === 'no_aplica'
                  ? `«${dialogo.fila.nombre}» deja de pedirse para este alumno. Explica por qué no aplica.`
                  : undefined
            }
          />
          <div className="px-6 py-4">
            <Textarea
              rows={3}
              placeholder="Motivo…"
              value={motivoDraft}
              onChange={(e) => setMotivoDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={guardandoDialogo}>
              Cancelar
            </Button>
            <Button
              variant={dialogo?.accion === 'rechazar' ? 'destructive' : undefined}
              onClick={confirmarDialogo}
              disabled={guardandoDialogo || !motivoDraft.trim()}
            >
              {guardandoDialogo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialogo?.accion === 'rechazar' ? 'Rechazar' : 'Marcar no aplica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EnlaceDocumentoDialog
        matriculaId={matriculaId}
        requeridoId={enlacePara?.requeridoId ?? null}
        documento={enlacePara?.nombre ?? null}
        open={enlacePara !== null}
        onOpenChange={(o) => { if (!o) setEnlacePara(null); }}
      />
    </div>
  );
}

function FilaDocumento({
  fila, puedeGestionar, subiendo, onSubir, onBorrarArchivo, onEnlace, onNoAplica, onAprobar, onRechazar,
}: {
  fila: FilaChecklist;
  puedeGestionar: boolean;
  subiendo: boolean;
  onSubir: () => void;
  onBorrarArchivo: (archivoId: number) => void;
  onEnlace: () => void;
  onNoAplica: () => void;
  onAprobar: () => void;
  onRechazar: () => void;
}) {
  const tieneArchivo = fila.archivos.length > 0;

  return (
    <tr className="border-b border-gray-100 align-middle last:border-b-0 hover:bg-gray-50/60">
      <td className="px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-gray-900">{fila.nombre}</span>
          {fila.cantidad > 1 && <span className="shrink-0 text-xs text-gray-400">×{fila.cantidad}</span>}
        </div>

        {/* El rastro de quién aprobó y cuándo: lo que el colegio necesita poder
            mostrar si alguien pregunta por qué una matrícula quedó completa. */}
        {fila.estado === 'aprobado' && fila.aprobadoEn && (
          <p className="mt-0.5 text-xs text-gray-400">
            Aprobado por {fila.aprobadoPor ?? 'alguien del equipo'} el {new Date(fila.aprobadoEn).toLocaleDateString('es-DO')}
          </p>
        )}
        {(fila.estado === 'rechazado' || fila.estado === 'no_aplica') && fila.motivo && (
          <p className="mt-0.5 text-xs text-gray-500">
            {fila.estado === 'rechazado' ? 'Rechazado: ' : 'No aplica: '}{fila.motivo}
          </p>
        )}
        {fila.estado === 'recibido' && fila.subidoEn && (
          <p className="mt-0.5 text-xs text-gray-400">
            Subido el {new Date(fila.subidoEn).toLocaleDateString('es-DO')} · esperando revisión
            {fila.subidoFamilia && ' · lo mandó la familia'}
          </p>
        )}

        {/* Los archivos uno a uno y no un "Ver" suelto: el acta tiene dos caras
            y la tarjeta de vacunas varias páginas, y hay que poder abrir —o
            quitar— la que está movida sin tocar las demás. */}
        {tieneArchivo && (
          <ul className="mt-1.5 space-y-1">
            {fila.archivos.map((a, i) => (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <a
                  href={`/api/administracion-escolar/documentos/archivos/${a.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-zero-700 hover:underline"
                >
                  <Eye className="h-3 w-3" />
                  {a.archivoNombre || `Archivo ${i + 1}`}
                </a>
                <span className="text-gray-400">{Math.max(1, Math.round(a.tamanoBytes / 1024))} KB</span>
                {puedeGestionar && (
                  <button
                    type="button"
                    onClick={() => onBorrarArchivo(a.id)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`Quitar ${a.archivoNombre ?? 'archivo'}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </td>

      <td className="px-3 py-2.5"><ExigenciaBadge exigencia={fila.exigencia} /></td>
      <td className="px-3 py-2.5"><EstadoBadge estado={fila.estado} /></td>

      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
        {puedeGestionar && (
          <>
            <Button size="sm" variant="outline" onClick={onEnlace} title="Enlace y QR para que la familia lo suba">
              <Link2 className="mr-1.5 h-3.5 w-3.5" />Enlace
            </Button>

            <Button size="sm" variant="outline" onClick={onSubir} disabled={subiendo}>
              {subiendo
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : tieneArchivo
                  ? <Plus className="mr-1.5 h-3.5 w-3.5" />
                  : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {tieneArchivo ? 'Añadir' : 'Subir'}
            </Button>

            {tieneArchivo && fila.estado !== 'aprobado' && (
              <Button size="sm" variant="outline" onClick={onAprobar}
                className="text-zero-700 hover:bg-zero-50">
                <Check className="mr-1.5 h-3.5 w-3.5" />Aprobar
              </Button>
            )}
            {tieneArchivo && fila.estado !== 'rechazado' && (
              <Button size="sm" variant="outline" onClick={onRechazar}
                className="text-red-600 hover:bg-red-50">
                <X className="mr-1.5 h-3.5 w-3.5" />Rechazar
              </Button>
            )}
            {fila.exigencia === 'si_aplica' && fila.estado !== 'no_aplica' && (
              <Button size="sm" variant="outline" onClick={onNoAplica}>
                <Ban className="mr-1.5 h-3.5 w-3.5" />No aplica
              </Button>
            )}
          </>
        )}
        </div>
      </td>
    </tr>
  );
}

function EstadoBadge({ estado }: { estado: EstadoDocumento }) {
  const estilos: Record<EstadoDocumento, string> = {
    pendiente:  'bg-gray-100 text-gray-500',
    recibido:   'bg-amber-50 text-amber-700',
    aprobado:   'bg-zero-50 text-zero-700',
    rechazado:  'bg-red-50 text-red-700',
    no_aplica:  'bg-gray-100 text-gray-500',
  };
  const etiquetas: Record<EstadoDocumento, string> = {
    pendiente: 'Pendiente',
    recibido: 'Por aprobar',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    no_aplica: 'No aplica',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${estilos[estado]}`}>
      {etiquetas[estado]}
    </span>
  );
}

function ResumenChip({ label, valor, tono }: {
  label: string; valor: number; tono: 'neutro' | 'ok' | 'alerta' | 'aviso';
}) {
  const estilos = {
    neutro: 'bg-gray-100 text-gray-600',
    ok:     'bg-zero-50 text-zero-700',
    alerta: 'bg-red-50 text-red-700',
    aviso:  'bg-amber-50 text-amber-700',
  }[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${estilos}`}>
      {label}: <b>{valor}</b>
    </span>
  );
}

function EmptyBox({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
      {icon ?? <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-gray-300" />}
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}
