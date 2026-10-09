'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import type { Exigencia } from '@/lib/administracion-escolar/documentos';

/**
 * Agregar algo al expediente de UN alumno.
 *
 * Tres caminos que acaban en la misma fila del checklist, porque para la
 * secretaria son la misma decisión —«a este niño le falta esto»— aunque por
 * dentro sean distintos:
 *
 *  · Suelto: lo escribe a mano. La carta del pediatra, el permiso de viaje.
 *  · Del listado: copia uno de los que el colegio ya tiene definidos, sin
 *    tener que reescribir el nombre ni acordarse de la exigencia.
 *  · Formulario: en vez de pedir un papel, le manda un formulario para que lo
 *    conteste.
 */

export type ModoAgregar = 'suelto' | 'del-listado' | 'formulario';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

interface RequeridoConfig {
  id: number; nombre: string; exigencia: string; cantidad: number;
  listaId: number | null; matriculaId: number | null; formularioId: number | null;
}
interface FormularioConfig { id: number; nombre: string; activo: boolean }
interface ListaConfig { id: number; nombre: string }

export function AgregarDocumentoDialog({ matriculaId, modo, onHecho, onOpenChange }: {
  matriculaId: number;
  /** `null` = cerrado. */
  modo: ModoAgregar | null;
  onHecho: (enlace?: string) => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [exigencia, setExigencia] = useState<Exigencia>('requerido');
  const [cantidad, setCantidad] = useState(1);
  const [elegido, setElegido] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Solo se piden cuando de verdad se abre el diálogo que los usa, y SIEMPRE
  // frescas: la caché global de SWR dura 30 s, y quien acaba de crear un
  // documento en Configuración y vuelve aquí no lo vería.
  const alAbrir = { revalidateOnMount: true, dedupingInterval: 0 };

  const { data: config } = useSWR<{ documentos: RequeridoConfig[]; listas?: ListaConfig[] }>(
    modo === 'del-listado' ? '/api/administracion-escolar/documentos/requeridos' : null, fetcher, alAbrir);
  const { data: listasData } = useSWR<{ listas: ListaConfig[] }>(
    modo === 'del-listado' ? '/api/administracion-escolar/documentos/listas' : null, fetcher, alAbrir);
  const { data: forms } = useSWR<{ formularios: FormularioConfig[] }>(
    modo === 'formulario' ? '/api/administracion-escolar/formularios' : null, fetcher, alAbrir);

  // Lo que ya está colgado de un alumno no se ofrece para copiar: sería copiar
  // una copia.
  const delListado = (config?.documentos ?? []).filter((d) => d.matriculaId == null);
  const nombreLista = new Map((listasData?.listas ?? []).map((l) => [l.id, l.nombre]));
  const formularios = (forms?.formularios ?? []).filter((f) => f.activo);

  function limpiar() {
    setNombre(''); setExigencia('requerido'); setCantidad(1); setElegido(null);
  }

  async function guardar() {
    if (!modo) return;
    setGuardando(true);
    try {
      const cuerpo = modo === 'suelto'
        ? { matriculaId, modo, nombre: nombre.trim(), exigencia, cantidad }
        : modo === 'del-listado'
          ? { matriculaId, modo, requeridoId: elegido }
          : { matriculaId, modo, formularioId: elegido };

      const res = await fetch('/api/administracion-escolar/documentos/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo agregar');

      toast.success(modo === 'formulario'
        ? `«${json.nombre}» adjuntado. Ya tiene su enlace para la familia.`
        : `«${json.nombre}» agregado al expediente.`);
      limpiar();
      onHecho(json.enlace);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar');
    } finally {
      setGuardando(false);
    }
  }

  const puedeGuardar = modo === 'suelto' ? nombre.trim().length > 0 : elegido != null;

  return (
    <Dialog open={modo !== null} onOpenChange={(o) => { if (!o) { limpiar(); onOpenChange(false); } }}>
      <DialogContent className="max-w-md">
        <ModalHeader
          title={
            modo === 'suelto' ? 'Documento suelto'
              : modo === 'del-listado' ? 'Documento del listado'
                : 'Adjuntar un formulario'
          }
          subtitle={
            modo === 'suelto'
              ? 'Se le pide solo a este alumno. No se le agrega a sus compañeros.'
              : modo === 'del-listado'
                ? 'Se copia al expediente de este alumno. Si el colegio cambia el listado después, lo que ya se le pidió a esta familia no cambia.'
                : 'La familia recibe un enlace y lo contesta. Al enviarlo, el renglón queda por aprobar.'
          }
        />

        <div className="space-y-4 px-6 py-4">
          {modo === 'suelto' && (
            <>
              <div>
                <Label htmlFor="doc-nombre">Nombre del documento</Label>
                <Input
                  id="doc-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Carta del pediatra"
                  maxLength={160}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="doc-exigencia">Exigencia</Label>
                  <select
                    id="doc-exigencia"
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                    value={exigencia}
                    onChange={(e) => setExigencia(e.target.value as Exigencia)}
                  >
                    <option value="requerido">Requerido</option>
                    <option value="si_aplica">Si aplica</option>
                  </select>
                </div>
                <div className="w-28">
                  <Label htmlFor="doc-cantidad">Cantidad</Label>
                  <Input
                    id="doc-cantidad"
                    type="number"
                    min={1}
                    max={20}
                    value={cantidad}
                    onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>
            </>
          )}

          {modo === 'del-listado' && (
            delListado.length === 0
              ? <Vacio texto="Los listados no tienen ningún documento todavía. Se definen en Configuración → Documentos." />
              : (
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {delListado.map((d) => (
                    <Opcion
                      key={d.id}
                      activa={elegido === d.id}
                      onClick={() => setElegido(d.id)}
                      titulo={d.nombre}
                      pie={[
                        d.listaId ? nombreLista.get(d.listaId) : null,
                        d.exigencia === 'si_aplica' ? 'Si aplica' : null,
                        d.cantidad > 1 ? `×${d.cantidad}` : null,
                      ].filter(Boolean).join(' · ')}
                    />
                  ))}
                </div>
              )
          )}

          {modo === 'formulario' && (
            formularios.length === 0
              ? <Vacio texto="No hay formularios activos. Se crean en Documentos → Formularios." />
              : (
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {formularios.map((f) => (
                    <Opcion
                      key={f.id}
                      activa={elegido === f.id}
                      onClick={() => setElegido(f.id)}
                      titulo={f.nombre}
                    />
                  ))}
                </div>
              )
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { limpiar(); onOpenChange(false); }} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !puedeGuardar}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {modo === 'formulario' ? 'Adjuntar' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opcion({ activa, onClick, titulo, pie }: {
  activa: boolean; onClick: () => void; titulo: string; pie?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
        activa
          ? 'border-zero-500 bg-zero-50 text-zero-900'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <span className="font-medium">{titulo}</span>
      {pie && <span className="mt-0.5 block text-xs text-gray-500">{pie}</span>}
    </button>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
      {texto}
    </p>
  );
}
