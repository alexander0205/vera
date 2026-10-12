'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Loader2, GraduationCap } from 'lucide-react';

interface EstCond {
  idEstudiante: number; nombre: string; edad: string | null;
  estadoMatricula: string | null; condicion: string; idCondicion: number;
}
interface Seccion { nombre: string; total: number; resumen: Record<string, number>; estudiantes: EstCond[] }
interface Grado { nombre: string; secciones: Seccion[] }
interface Servicio { nombre: string; grados: Grado[] }
interface Data { servicios: Servicio[]; actualizadoEn: string | null }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/** Color del badge según la condición (id de SIGERD). */
function condClase(id: number): string {
  switch (id) {
    case 3:  return 'bg-emerald-50 text-emerald-700 border-emerald-200'; // Promovido
    case 4:  return 'bg-red-50 text-red-700 border-red-200';             // Reprobado
    case 23: return 'bg-amber-50 text-amber-700 border-amber-200';       // Aplazado
    case 8:  return 'bg-blue-50 text-blue-700 border-blue-200';          // Transferido
    case 2:  return 'bg-gray-100 text-gray-600 border-gray-200';         // Abandono
    default: return 'bg-gray-50 text-gray-500 border-gray-200';          // No definido
  }
}

export default function CondicionAcademicaClient() {
  const { data, isLoading } = useSWR<Data>('/api/escolar/condicion-academica', fetcher);
  const [svi, setSvi] = useState(0);
  const [gri, setGri] = useState(0);
  const [sei, setSei] = useState(0);

  // Reinicia índices hijos al cambiar el padre.
  useEffect(() => { setGri(0); setSei(0); }, [svi]);
  useEffect(() => { setSei(0); }, [gri]);

  const servicios = data?.servicios ?? [];
  const servicio = servicios[svi];
  const grado = servicio?.grados[gri];
  const seccion = grado?.secciones[sei];

  const fecha = useMemo(() => {
    if (!data?.actualizadoEn) return null;
    return new Date(data.actualizadoEn).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Condición académica</h1>
        <p className="text-sm text-muted-foreground">
          Estado final de cada estudiante por sección (Promovido, Reprobado, Aplazado…), tal como lo
          trae SIGERD. {fecha && <>Datos del {fecha}.</>}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : servicios.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No hay datos de condición académica. Corre “Obtener información” en SIGERD.
        </CardContent></Card>
      ) : (
        <>
          {/* Selectores en cascada */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Servicio</label>
                <NativeSelect className="min-w-56" value={svi} onChange={(e) => setSvi(Number(e.target.value))}>
                  {servicios.map((s, i) => <option key={i} value={i}>{s.nombre}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Grado</label>
                <NativeSelect className="min-w-44" value={gri} onChange={(e) => setGri(Number(e.target.value))}>
                  {(servicio?.grados ?? []).map((g, i) => <option key={i} value={i}>{g.nombre}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Sección</label>
                <NativeSelect className="min-w-28" value={sei} onChange={(e) => setSei(Number(e.target.value))}>
                  {(grado?.secciones ?? []).map((s, i) => <option key={i} value={i}>{s.nombre} ({s.total})</option>)}
                </NativeSelect>
              </div>
            </CardContent>
          </Card>

          {/* Resumen por condición */}
          {seccion && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(seccion.resumen).sort((a, b) => b[1] - a[1]).map(([cond, n]) => {
                const id = seccion.estudiantes.find((e) => e.condicion === cond)?.idCondicion ?? 0;
                return (
                  <span key={cond} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${condClase(id)}`}>
                    {cond} <b>{n}</b>
                  </span>
                );
              })}
            </div>
          )}

          {/* Tabla de estudiantes */}
          <Card>
            <CardContent className="p-0">
              {!seccion || seccion.estudiantes.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Sin estudiantes en esta sección.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2 font-medium">#</th>
                        <th className="px-4 py-2 font-medium">Estudiante</th>
                        <th className="px-4 py-2 font-medium">Edad</th>
                        <th className="px-4 py-2 font-medium">Matrícula</th>
                        <th className="px-4 py-2 font-medium">Condición</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seccion.estudiantes.map((e, i) => (
                        <tr key={e.idEstudiante} className="border-b last:border-0 hover:bg-gray-50/60">
                          <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-gray-900">{e.nombre || 'Sin nombre'}</td>
                          <td className="px-4 py-2 text-gray-500">{e.edad ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-500">{e.estadoMatricula ?? '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${condClase(e.idCondicion)}`}>
                              {e.condicion}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {seccion && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" /> {servicio?.nombre} · {grado?.nombre} · Sección {seccion.nombre} · {seccion.total} estudiante(s)
            </p>
          )}
        </>
      )}
    </div>
  );
}
