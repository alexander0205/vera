'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Users, CalendarDays, Wallet, AlertTriangle, Plus, Search, Loader2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';
import { EstudianteFicha, type EstudianteEnriquecido } from '@/components/administracion-escolar/EstudianteFicha';
import { usePermissions } from '@/lib/hooks/usePermissions';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];
const PAGE_SIZE = 25;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ListaResp {
  estudiantes: EstudianteEnriquecido[];
  total: number;
  stats: { activos: number; balancePendienteCentavos: number; morosos: number };
}
interface Curso { id: number; nombre: string }
interface Periodo { activo: boolean; nombre: string }

function iniciales(nombres: string, apellidos: string): string {
  return `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

export default function EstudiantesClient() {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  const irANuevo = () => router.push('/escolar/estudiantes/nuevo');

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Filtros. `query` es el input crudo; `qDebounced` es lo que va al servidor.
  const [query, setQuery]           = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [filtroCurso, setFiltroCurso]   = useState<string>('todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('activo');
  const [page, setPage] = useState(0);

  // Debounce de la búsqueda (300ms) — evita una llamada por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Cualquier cambio de filtro vuelve a la primera página.
  useEffect(() => { setPage(0); }, [qDebounced, filtroCurso, filtroEstado]);

  // Key del listado — SWR cachea por combinación de filtros+página.
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    estado: filtroEstado,
  });
  if (qDebounced) params.set('q', qDebounced);
  if (filtroCurso !== 'todos') params.set('cursoId', filtroCurso);
  const listaKey = `/api/administracion-escolar/estudiantes?${params.toString()}`;

  const { data, isLoading } = useSWR<ListaResp>(listaKey, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const { data: cursosData } = useSWR<{ cursos: Curso[] }>(
    '/api/administracion-escolar/cursos', fetcher, { revalidateOnFocus: false });
  const { data: periodosData } = useSWR<{ periodos: Periodo[] }>(
    '/api/administracion-escolar/periodos', fetcher, { revalidateOnFocus: false });

  const estudiantes = data?.estudiantes ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats;
  const cursos = cursosData?.cursos ?? [];
  const periodoActivo = periodosData?.periodos?.find((p) => p.activo)?.nombre ?? null;

  const seleccionado = estudiantes.find((e) => e.id === selectedId) ?? null;

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const hasta = Math.min((page + 1) * PAGE_SIZE, total);
  const filtrosActivos = qDebounced !== '' || filtroCurso !== 'todos';

  return (
    <section className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estudiantes</h1>
          <p className="text-sm text-gray-500 mt-1">Matrículas, tutores, pagos y deudas por estudiante</p>
        </div>
        {puedeGestionar && (
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={irANuevo}>
            <Plus className="h-4 w-4 mr-2" />Nuevo estudiante
          </Button>
        )}
      </div>

      {/* Stat cards — globales del team (no dependen de la página) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Estudiantes activos" value={stats ? String(stats.activos) : '—'} />
        <StatCard icon={CalendarDays} label="Período activo" value={periodoActivo ?? '—'} />
        <StatCard icon={Wallet} label="Balance pendiente" value={stats ? fmtDOP(stats.balancePendienteCentavos) : '—'} />
        <StatCard icon={AlertTriangle} label="Morosos" value={stats ? String(stats.morosos) : '—'} accent={(stats?.morosos ?? 0) > 0} />
      </div>

      {/* Directorio + ficha */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Directorio */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Directorio de estudiantes</h2>
              <Badge variant="outline" className="text-teal-700 border-teal-200 bg-teal-50">
                {total} registro{total !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-8" placeholder="Buscar por nombre, código o tutor…"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
                {isLoading && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-teal-500" />
                )}
              </div>
              <Select value={filtroCurso} onValueChange={setFiltroCurso}>
                <SelectTrigger className="sm:w-40"><SelectValue placeholder="Curso" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Curso: Todos</SelectItem>
                  {cursos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="sm:w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Estado: Todos</SelectItem>
                  {ESTADOS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Tabla */}
            {isLoading && !data ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
            ) : total === 0 ? (
              <div className="text-center py-16">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">
                  {filtrosActivos ? 'Sin resultados para los filtros' : 'Aún no hay estudiantes registrados'}
                </p>
                {!filtrosActivos && puedeGestionar && (
                  <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={irANuevo}>
                    <Plus className="h-4 w-4 mr-1" />Nuevo estudiante
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                        <th className="px-3 py-2 font-medium">Estudiante</th>
                        <th className="px-3 py-2 font-medium">Curso</th>
                        <th className="px-3 py-2 font-medium">Tutor</th>
                        <th className="px-3 py-2 font-medium text-right">Balance</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estudiantes.map((e) => (
                        <tr key={e.id}
                          onClick={() => setSelectedId(e.id)}
                          className={`border-t border-gray-100 cursor-pointer transition-colors ${
                            e.id === selectedId ? 'bg-teal-50' : 'hover:bg-gray-50'
                          }`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-semibold shrink-0">
                                {iniciales(e.nombres, e.apellidos)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{e.nombres} {e.apellidos}</p>
                                <p className="text-xs text-gray-400">{e.codigo ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{e.cursoActual ?? '—'}</td>
                          <td className="px-3 py-2.5 text-gray-600">{e.tutorResponsable ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right">
                            {e.deudaCentavos > 0
                              ? <Badge className="bg-red-50 text-red-600 border-red-200">{fmtDOP(e.deudaCentavos)}</Badge>
                              : <Badge className="bg-teal-50 text-teal-700 border-teal-200">Al día</Badge>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs capitalize text-gray-600">{e.estado}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Mostrando {desde}–{hasta} de {total}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="tabular-nums">{page + 1} / {totalPaginas}</span>
                    <Button variant="outline" size="sm" disabled={page + 1 >= totalPaginas}
                      onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Ficha lateral */}
        <div>
          {seleccionado ? (
            <EstudianteFicha
              key={seleccionado.id}
              estudiante={seleccionado}
            />
          ) : (
            <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400 h-full flex items-center justify-center">
              Selecciona un estudiante para ver su ficha
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        <p className={`text-2xl font-bold mt-1 truncate ${accent ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
