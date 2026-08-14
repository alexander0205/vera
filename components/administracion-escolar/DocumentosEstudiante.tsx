'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  FileCheck, Upload, Eye, Check, X, Ban, Loader2, AlertTriangle, Link2, Plus,
  FileText, ListPlus, Trash2, ClipboardList, MoreHorizontal, Mail,
} from 'lucide-react';
import { EnlaceDocumentoDialog } from '@/components/administracion-escolar/EnlaceDocumentoDialog';
import { AgregarDocumentoDialog, type ModoAgregar } from '@/components/administracion-escolar/AgregarDocumentoDialog';
import { RespuestaFormularioDialog } from '@/components/administracion-escolar/RespuestaFormularioDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
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
  const [agregar, setAgregar] = useState<ModoAgregar | null>(null);
  const [quitando, setQuitando] = useState<FilaChecklist | null>(null);
  const [viendo, setViendo] = useState<FilaChecklist | null>(null);
  const [enviandoCorreo, setEnviandoCorreo] = useState<FilaChecklist | null>(null);
  const [correo, setCorreo] = useState('');
  const [mandando, setMandando] = useState(false);
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

  const { resumen } = data;
  const vacio = data.filas.length === 0;

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

  async function quitarExtra(fila: FilaChecklist) {
    try {
      const res = await fetch(`/api/administracion-escolar/documentos/extras/${fila.requeridoId}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo quitar');
      toast.success(`«${fila.nombre}» ya no se le pide a este alumno.`);
      setQuitando(null);
      await mutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar');
    }
  }

  async function mandarFormularioPorCorreo() {
    const fila = enviandoCorreo;
    if (!fila) return;
    setMandando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/documentos/extras/${fila.requeridoId}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: correo.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar');
      toast.success(`«${fila.nombre}» enviado a ${json.enviadoA}. Queda en el historial de avisos.`);
      setEnviandoCorreo(null);
      setCorreo('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setMandando(false);
    }
  }

  async function copiarEnlaceFormulario(fila: FilaChecklist) {
    if (!fila.formulario) return;
    const url = `${window.location.origin}${fila.formulario.enlace}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado. Mándaselo a la familia.');
    } catch {
      toast.error(url);
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

      {/* Una barra y una frase, no cuatro píldoras de colores: de un vistazo
          interesa cuánto falta, no el desglose. Los ceros no se enseñan —
          «Sin resolver: 0» ocupa lo mismo que un problema real y no lo es. */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-[240px] flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-gray-900">
              <span className="font-semibold">{resumen.resueltos}</span>
              <span className="text-gray-400"> / {resumen.total}</span>
              <span className="ml-1.5 text-gray-500">
                {resumen.total === 1 ? 'documento listo' : 'documentos listos'}
              </span>
            </p>
            {resumen.completa && resumen.total > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-zero-700">
                <Check className="h-3.5 w-3.5" />Expediente completo
              </span>
            )}
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${resumen.completa ? 'bg-zero-600' : 'bg-zero-500'}`}
              style={{ width: `${resumen.total === 0 ? 0 : Math.round((resumen.resueltos / resumen.total) * 100)}%` }}
            />
          </div>

          {(resumen.faltanRequeridos > 0 || resumen.sinResolver > 0 || resumen.porAprobar > 0) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {resumen.porAprobar > 0 && (
                <span className="font-medium text-amber-700">
                  {resumen.porAprobar === 1 ? '1 esperando tu revisión' : `${resumen.porAprobar} esperando tu revisión`}
                </span>
              )}
              {resumen.faltanRequeridos > 0 && (
                <span className="text-gray-500">
                  Faltan {resumen.faltanRequeridos} {resumen.faltanRequeridos === 1 ? 'requerido' : 'requeridos'}
                </span>
              )}
              {resumen.sinResolver > 0 && (
                <span className="text-gray-500">
                  {resumen.sinResolver} sin resolver
                </span>
              )}
            </p>
          )}
        </div>

        {puedeGestionar && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              onClick={() => setEnlacePara({ requeridoId: null, nombre: null })}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />Enlace de todo el expediente
            </Button>

            {/* Un menú y no tres botones: los tres caminos acaban en la misma
                fila del checklist, y puestos en fila competirían por atención
                con «Enlace de todo el expediente», que es lo que de verdad se
                usa a diario. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />Agregar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => setAgregar('suelto')}>
                  <Upload className="mr-2 h-4 w-4" />
                  <div>
                    <p className="font-medium">Documento suelto</p>
                    <p className="text-xs text-gray-500">Solo para este alumno</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAgregar('del-listado')}>
                  <ListPlus className="mr-2 h-4 w-4" />
                  <div>
                    <p className="font-medium">Del listado de documentos</p>
                    <p className="text-xs text-gray-500">Copiar uno ya definido</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAgregar('formulario')}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  <div>
                    <p className="font-medium">Adjuntar un formulario</p>
                    <p className="text-xs text-gray-500">La familia lo contesta por enlace</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Tabla y no lista de tarjetas: son diez renglones que se comparan entre
          sí —qué falta, qué está pendiente de aprobar—, y en columnas el ojo
          recorre una sola vertical en vez de rebuscar la etiqueta dentro de
          cada fila. `min-w` para que desplace en vez de estrujarse. */}
      {vacio ? (
        <EmptyBox
          icon={<FileCheck className="mx-auto mb-2 h-8 w-8 text-gray-300" />}
          text="A este alumno no se le pide ningún documento todavía. El listado se configura en Configuración → Documentos, o agrégale uno aquí mismo con «Agregar»."
        />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2 font-medium">Documento</th>
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
                onQuitar={() => setQuitando(fila)}
                onCopiarFormulario={() => copiarEnlaceFormulario(fila)}
                onVerRespuesta={() => setViendo(fila)}
                onEnviarCorreo={() => { setCorreo(''); setEnviandoCorreo(fila); }}
              />
            ))}
          </tbody>
        </table>
      </div>
      )}

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

      {/* Leer antes de decidir. Aprobar sin poder abrir lo que la familia
          contestó es justo lo que el módulo evita al separar recibido de
          aprobado. */}
      <RespuestaFormularioDialog
        requeridoId={viendo?.requeridoId ?? null}
        open={viendo !== null}
        onOpenChange={(o) => { if (!o) setViendo(null); }}
        onAprobar={() => viendo && abrirDialogo('aprobar', viendo)}
        onRechazar={() => viendo && abrirDialogo('rechazar', viendo)}
      />

      <Dialog
        open={enviandoCorreo !== null}
        onOpenChange={(o) => { if (!o) { setEnviandoCorreo(null); setCorreo(''); } }}
      >
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Enviar por correo"
            subtitle={enviandoCorreo
              ? `La familia recibe «${enviandoCorreo.nombre}» con su enlace personal. Queda registrado en Avisos.`
              : undefined}
          />
          <div className="px-6 py-4">
            <Label htmlFor="correo-formulario">Correo de la familia</Label>
            <Input
              id="correo-formulario"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="madre@ejemplo.com"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnviandoCorreo(null)} disabled={mandando}>
              Cancelar
            </Button>
            <Button onClick={mandarFormularioPorCorreo} disabled={mandando || !correo.trim()}>
              {mandando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgregarDocumentoDialog
        matriculaId={matriculaId}
        modo={agregar}
        onOpenChange={(o) => { if (!o) setAgregar(null); }}
        onHecho={() => { setAgregar(null); void mutate(); }}
      />

      {/* Quitar un extra se lleva por delante lo que se hubiera subido para
          cumplirlo, así que se avisa antes. */}
      <ConfirmDialog
        open={quitando !== null}
        onOpenChange={(o) => { if (!o) setQuitando(null); }}
        title="Quitar del expediente"
        description={quitando
          ? `«${quitando.nombre}» deja de pedírsele a este alumno${
            quitando.archivos.length > 0
              ? `, y se borra ${quitando.archivos.length === 1 ? 'el archivo subido' : `los ${quitando.archivos.length} archivos subidos`}`
              : ''}. Al resto de sus compañeros no les cambia nada.`
          : ''}
        confirmLabel="Quitar"
        onConfirm={() => quitando && quitarExtra(quitando)}
      />

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
  onQuitar, onCopiarFormulario, onVerRespuesta, onEnviarCorreo,
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
  onQuitar: () => void;
  onCopiarFormulario: () => void;
  onVerRespuesta: () => void;
  onEnviarCorreo: () => void;
}) {
  const tieneArchivo = fila.archivos.length > 0;
  const esFormulario = fila.formulario != null;
  // Hay algo que dar por bueno: o un papel subido, o un formulario contestado.
  const hayQueRevisar = tieneArchivo || (esFormulario && fila.entregadoId != null);

  return (
    <tr className="border-b border-gray-100 align-middle last:border-b-0 hover:bg-gray-50/60">
      <td className="px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-gray-900">{fila.nombre}</span>
          {fila.cantidad > 1 && <span className="shrink-0 text-xs text-gray-400">×{fila.cantidad}</span>}
          {esFormulario && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-zero-50 px-1.5 py-0.5 text-[11px] font-medium text-zero-700">
              <FileText className="h-3 w-3" />Formulario
            </span>
          )}
          {/* Solo la excepción. «Requerido» es lo normal, y repetirlo en cada
              renglón pintaba una columna entera de color que no dice nada. */}
          {fila.exigencia === 'si_aplica' && (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              Si aplica
            </span>
          )}
          {/* Que se distinga de un vistazo lo que se le pide a todos de lo que
              se le pidió solo a este niño: si no, alguien lo busca en el
              listado y no lo encuentra. */}
          {fila.esExtra && !esFormulario && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
              Solo este alumno
            </span>
          )}
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

      <td className="px-3 py-2.5"><EstadoBadge estado={fila.estado} /></td>

      <td className="px-4 py-2.5">
        {/* Una sola acción a la vista y el resto en el menú.
            Cuatro botones con borde por fila convertían la tabla en una reja:
            con diez renglones son cuarenta bordes compitiendo, y el que de
            verdad toca hacer ahora se pierde entre los demás. */}
        <div className="flex items-center justify-end gap-1.5">
          {puedeGestionar && (
            <>
              {/* La que toca AHORA según el estado: aprobar lo que llegó, subir
                  lo que falta, o mandarle el enlace del formulario. */}
              {/* En un formulario lo primero es LEERLO, no aprobarlo: la
                  decisión se toma dentro, con lo que contestó delante. */}
              {esFormulario && hayQueRevisar ? (
                <Button size="sm" onClick={onVerRespuesta}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" />Ver respuesta
                </Button>
              ) : hayQueRevisar && fila.estado !== 'aprobado' ? (
                <Button size="sm" onClick={onAprobar}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />Aprobar
                </Button>
              ) : esFormulario ? (
                <Button size="sm" variant="outline" onClick={onCopiarFormulario}
                  title="Copiar el enlace del formulario para esta familia">
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />Copiar enlace
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={onSubir} disabled={subiendo}>
                  {subiendo
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : tieneArchivo
                      ? <Plus className="mr-1.5 h-3.5 w-3.5" />
                      : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                  {tieneArchivo ? 'Añadir' : 'Subir'}
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label={`Más acciones de ${fila.nombre}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {esFormulario ? (
                    <>
                      {/* Ver lo escrito siempre, aunque la familia no lo haya
                          mandado: «¿ya lo llenó?» se contesta mirando. */}
                      <DropdownMenuItem onClick={onVerRespuesta}>
                        <Eye className="mr-2 h-4 w-4" />Ver lo contestado
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onEnviarCorreo}>
                        <Mail className="mr-2 h-4 w-4" />Enviar por correo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onCopiarFormulario}>
                        <Link2 className="mr-2 h-4 w-4" />Copiar enlace
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={onSubir} disabled={subiendo}>
                        <Upload className="mr-2 h-4 w-4" />{tieneArchivo ? 'Añadir otro archivo' : 'Subir archivo'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onEnlace}>
                        <Link2 className="mr-2 h-4 w-4" />Enlace para la familia
                      </DropdownMenuItem>
                    </>
                  )}

                  {hayQueRevisar && fila.estado !== 'aprobado' && (
                    <DropdownMenuItem onClick={onAprobar}>
                      <Check className="mr-2 h-4 w-4" />Aprobar
                    </DropdownMenuItem>
                  )}
                  {hayQueRevisar && fila.estado !== 'rechazado' && (
                    <DropdownMenuItem onClick={onRechazar} className="text-red-600 focus:text-red-600">
                      <X className="mr-2 h-4 w-4" />Rechazar
                    </DropdownMenuItem>
                  )}
                  {fila.exigencia === 'si_aplica' && fila.estado !== 'no_aplica' && (
                    <DropdownMenuItem onClick={onNoAplica}>
                      <Ban className="mr-2 h-4 w-4" />No aplica a este alumno
                    </DropdownMenuItem>
                  )}

                  {/* Solo los sueltos. Un renglón del listado se le pide a
                      todos, y quitarlo desde aquí lo quitaría de los
                      trescientos: eso se hace en Configuración. */}
                  {fila.esExtra && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onQuitar} className="text-red-600 focus:text-red-600">
                        <Trash2 className="mr-2 h-4 w-4" />Quitar del expediente
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * Un punto de color y el texto en gris, en vez de una pastilla de fondo por
 * renglón: en una tabla de diez, diez fondos de color pesan más que la propia
 * información. El punto basta para recorrer la columna con la vista.
 */
function EstadoBadge({ estado }: { estado: EstadoDocumento }) {
  const punto: Record<EstadoDocumento, string> = {
    pendiente:  'bg-gray-300',
    recibido:   'bg-amber-500',
    aprobado:   'bg-zero-600',
    rechazado:  'bg-red-500',
    no_aplica:  'bg-gray-300',
  };
  const texto: Record<EstadoDocumento, string> = {
    pendiente:  'text-gray-500',
    recibido:   'text-amber-700',
    aprobado:   'text-gray-700',
    rechazado:  'text-red-600',
    no_aplica:  'text-gray-400',
  };
  const etiquetas: Record<EstadoDocumento, string> = {
    pendiente: 'Pendiente',
    recibido: 'Por aprobar',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    no_aplica: 'No aplica',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${texto[estado]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${punto[estado]}`} />
      {etiquetas[estado]}
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
