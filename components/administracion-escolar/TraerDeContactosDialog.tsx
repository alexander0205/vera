'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Search, Square, SquareCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import { toast } from 'sonner';

/**
 * Trae al módulo los alumnos que ya existen en Contactos.
 *
 * En un colegio el beneficiario de una factura ES el alumno: el censo ya está
 * en Facturación, con el padre al lado, y al módulo escolar le faltaba. Antes
 * había que darlos de alta uno a uno —y aquí son cientos.
 *
 * Trae lo que hay y nada más: nombre, apellido y de quién cuelga. Un
 * beneficiario no tiene sexo, ni fecha de nacimiento, ni código de estudiante;
 * exigirlos dejaría fuera justo a los que hay que traer. Eso se completa
 * después en la ficha de cada uno.
 *
 * No crea matrículas. Matricular es decidir período, curso y tarifa, y eso no
 * se hace en lote a ciegas.
 */

interface Beneficiario {
  dependienteId: number;
  nombre: string;
  apellido: string;
  clientId: number | null;
  contacto: string | null;
}

const traer = (u: string): Promise<{ beneficiarios: Beneficiario[]; truncado: boolean }> =>
  fetch(u).then((r) => (r.ok ? r.json() : { beneficiarios: [], truncado: false }));

export function TraerDeContactosDialog({ open, onOpenChange, onImportado }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Se llama al terminar, para que el listado de detrás se entere. */
  onImportado: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [importando, setImportando] = useState(false);

  // La búsqueda va al servidor, así que se espera a que el usuario pare de
  // escribir: son cientos de filas y una consulta por tecla no aporta nada.
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const { data, isLoading, mutate } = useSWR(
    open ? `/api/administracion-escolar/estudiantes/desde-dependiente${q ? `?q=${encodeURIComponent(q)}` : ''}` : null,
    traer,
    { revalidateOnFocus: false },
  );

  const lista = useMemo(() => data?.beneficiarios ?? [], [data]);

  // Al cerrar se olvida todo: reabrir con lo marcado de la vez anterior es la
  // forma de importar sin querer a quien ya no está en pantalla.
  useEffect(() => {
    if (!open) { setBusqueda(''); setQ(''); setMarcados(new Set()); }
  }, [open]);

  // «Todos» es todos los que se ven AHORA. Con una búsqueda puesta, marcar
  // gente que el usuario no tiene delante es exactamente lo que no debe pasar.
  const visiblesMarcados = lista.filter((b) => marcados.has(b.dependienteId)).length;
  const todosMarcados = lista.length > 0 && visiblesMarcados === lista.length;

  function alternarTodos() {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (todosMarcados) lista.forEach((b) => s.delete(b.dependienteId));
      else lista.forEach((b) => s.add(b.dependienteId));
      return s;
    });
  }

  function alternar(id: number) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function importar() {
    if (marcados.size === 0) return;
    setImportando(true);
    try {
      const res = await fetch('/api/administracion-escolar/estudiantes/desde-dependiente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependienteIds: [...marcados] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudieron traer');

      const partes = [`${json.creados} ${json.creados === 1 ? 'alumno creado' : 'alumnos creados'}`];
      if (json.omitidos > 0) partes.push(`${json.omitidos} ya estaban`);
      toast.success(partes.join(' · '));

      setMarcados(new Set());
      await mutate();
      onImportado();
      // Si ya no queda nadie por traer, no hay nada más que hacer aquí.
      if ((json.creados ?? 0) > 0 && lista.length - json.creados <= 0) onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron traer');
    } finally {
      setImportando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importando) onOpenChange(o); }}>
      <DialogContent maxWidth={false} className="flex !h-[75vh] !w-[62vw] !max-w-none flex-col">
        <ModalHeader
          title="Traer estudiantes de Contactos"
          subtitle="Los beneficiarios a los que ya le facturas. Marca los que son alumnos y tráelos."
        />

        <div className="border-b border-gray-100 px-6 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por alumno o por el nombre del padre…"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zero-600" />
            </div>
          ) : lista.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">
                {q
                  ? 'Ningún beneficiario coincide con esa búsqueda.'
                  : 'Todos los beneficiarios de Contactos ya son alumnos del módulo.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="w-10 py-2">
                    <button
                      type="button"
                      onClick={alternarTodos}
                      aria-label={todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                      className="text-gray-500 hover:text-zero-600"
                    >
                      {todosMarcados
                        ? <SquareCheck className="h-4 w-4 text-zero-600" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="py-2 font-medium">Estudiante</th>
                  <th className="py-2 font-medium">Padre / contacto</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((b) => {
                  const marcado = marcados.has(b.dependienteId);
                  return (
                    <tr
                      key={b.dependienteId}
                      onClick={() => alternar(b.dependienteId)}
                      className={`cursor-pointer border-b border-gray-100 ${marcado ? 'bg-zero-50/50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="py-2.5">
                        {marcado
                          ? <SquareCheck className="h-4 w-4 text-zero-600" />
                          : <Square className="h-4 w-4 text-gray-300" />}
                      </td>
                      <td className="py-2.5 font-medium text-gray-900">
                        {`${b.nombre} ${b.apellido}`.trim()}
                      </td>
                      <td className="py-2.5 text-gray-600">
                        {b.contacto ?? <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {data?.truncado && (
            <p className="mt-3 text-xs text-gray-500">
              Se muestran los primeros 1.000. Busca para acotar y tráelos por tandas.
            </p>
          )}
        </div>

        <DialogFooter>
          <span className="mr-auto pl-2 text-sm text-gray-500">
            {marcados.size > 0
              ? `${marcados.size} ${marcados.size === 1 ? 'marcado' : 'marcados'}`
              : `${lista.length} sin traer`}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importando}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={importando || marcados.size === 0}>
            {importando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Traer {marcados.size > 0 ? marcados.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
