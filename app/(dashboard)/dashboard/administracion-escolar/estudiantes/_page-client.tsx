'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Users, CalendarDays, Wallet, AlertTriangle, Plus, Search, Loader2,
} from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';
import { EstudianteFicha, type EstudianteEnriquecido } from '@/components/administracion-escolar/EstudianteFicha';
import { usePermissions } from '@/lib/hooks/usePermissions';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];

function iniciales(nombres: string, apellidos: string): string {
  return `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

export default function EstudiantesClient() {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  const irANuevo = () => router.push('/dashboard/administracion-escolar/estudiantes/nuevo');

  const [estudiantes, setEstudiantes] = useState<EstudianteEnriquecido[]>([]);
  const [periodoActivo, setPeriodoActivo] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // filtros
  const [query, setQuery]         = useState('');
  const [filtroCurso, setFiltroCurso] = useState<string>('todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('activo');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([
        fetch('/api/administracion-escolar/estudiantes').then((r) => r.json()),
        fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
      ]);
      setEstudiantes(e.estudiantes ?? []);
      setPeriodoActivo((p.periodos ?? []).find((x: { activo: boolean; nombre: string }) => x.activo)?.nombre ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Cursos únicos para el filtro.
  const cursos = useMemo(
    () => Array.from(new Set(estudiantes.map((e) => e.cursoActual).filter(Boolean))) as string[],
    [estudiantes],
  );

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return estudiantes.filter((e) => {
      if (filtroEstado !== 'todos' && e.estado !== filtroEstado) return false;
      if (filtroCurso !== 'todos' && e.cursoActual !== filtroCurso) return false;
      if (q) {
        const hay = `${e.nombres} ${e.apellidos} ${e.codigo ?? ''} ${e.tutorResponsable ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [estudiantes, query, filtroCurso, filtroEstado]);

  const seleccionado = estudiantes.find((e) => e.id === selectedId) ?? null;

  // Stats
  const activos = estudiantes.filter((e) => e.estado === 'activo').length;
  const balancePendiente = estudiantes.reduce((s, e) => s + e.deudaCentavos, 0);
  const morosos = estudiantes.filter((e) => e.deudaCentavos > 0).length;

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

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Estudiantes activos" value={String(activos)} />
        <StatCard icon={CalendarDays} label="Período activo" value={periodoActivo ?? '—'} />
        <StatCard icon={Wallet} label="Balance pendiente" value={fmtDOP(balancePendiente)} />
        <StatCard icon={AlertTriangle} label="Morosos" value={String(morosos)} accent={morosos > 0} />
      </div>

      {/* Directorio + ficha */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Directorio */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Directorio de estudiantes</h2>
              <Badge variant="outline" className="text-teal-700 border-teal-200 bg-teal-50">
                {filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-8" placeholder="Buscar por nombre, código o tutor…"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <Select value={filtroCurso} onValueChange={setFiltroCurso}>
                <SelectTrigger className="sm:w-40"><SelectValue placeholder="Curso" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Curso: Todos</SelectItem>
                  {cursos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">
                  {estudiantes.length === 0 ? 'Aún no hay estudiantes registrados' : 'Sin resultados para los filtros'}
                </p>
                {estudiantes.length === 0 && puedeGestionar && (
                  <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={irANuevo}>
                    <Plus className="h-4 w-4 mr-1" />Nuevo estudiante
                  </Button>
                )}
              </div>
            ) : (
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
                    {filtrados.map((e) => (
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
