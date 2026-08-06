'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { CalendarDays, Loader2, Receipt, Search, UserRound, Wallet } from 'lucide-react';

interface Pago {
  id: number;
  estudianteId: number;
  estudiante: string | null;
  estudianteApellidos: string | null;
  cargoId: number | null;
  concepto: string | null;
  mes: number | null;
  anio: number | null;
  montoCentavos: number;
  fechaPago: string;
  metodo: string | null;
  referencia: string | null;
  notas: string | null;
  createdAt: string;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
};

function conceptoLabel(p: Pago): string {
  if (!p.concepto) return 'Sin cargo';
  if (p.mes) return `${p.concepto} · ${MESES[p.mes]} ${p.anio ?? ''}`.trim();
  return p.anio ? `${p.concepto} · ${p.anio}` : p.concepto;
}

export default function PagosEscolaresClient() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [metodo, setMetodo] = useState('todos');

  const cargar = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/administracion-escolar/pagos');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando pagos');
      setPagos(data.pagos ?? []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Error cargando pagos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const metodos = useMemo(
    () => Array.from(new Set(pagos.map((p) => p.metodo).filter(Boolean))) as string[],
    [pagos],
  );

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pagos.filter((p) => {
      if (metodo !== 'todos' && p.metodo !== metodo) return false;
      if (!q) return true;
      const hay = `${p.estudiante ?? ''} ${p.estudianteApellidos ?? ''} ${p.concepto ?? ''} ${p.referencia ?? ''} ${p.metodo ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [metodo, pagos, query]);

  const totalPagado = pagos.reduce((sum, p) => sum + p.montoCentavos, 0);
  const estudiantesUnicos = new Set(pagos.map((p) => p.estudianteId)).size;
  const hoyIso = new Date().toISOString().split('T')[0];
  const pagosHoy = pagos.filter((p) => p.fechaPago === hoyIso).reduce((sum, p) => sum + p.montoCentavos, 0);
  const ultimoPago = pagos[0]?.fechaPago ?? null;

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos escolares</h1>
          <p className="text-sm text-gray-500 mt-1">Pagos aplicados a inscripción, mensualidades y otros cargos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Wallet} label="Pagos" value={String(pagos.length)} />
        <StatCard icon={Receipt} label="Total cobrado" value={fmtDOP(totalPagado)} />
        <StatCard icon={CalendarDays} label="Cobrado hoy" value={fmtDOP(pagosHoy)} />
        <StatCard icon={UserRound} label="Estudiantes" value={String(estudiantesUnicos)} sub={ultimoPago ? `Último: ${fmtFechaCorta(ultimoPago)}` : undefined} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-8" placeholder="Buscar por estudiante, concepto, referencia o método..."
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Método: Todos</SelectItem>
                {metodos.map((m) => <SelectItem key={m} value={m}>{METODO_LABEL[m] ?? m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loadError ? (
            <div className="text-center py-16">
              <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-red-600 font-medium">{loadError}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={cargar}>Reintentar</Button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16">
              <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{pagos.length === 0 ? 'Aún no hay pagos registrados' : 'Sin resultados'}</p>
              <p className="text-sm text-gray-400 mt-2">
                Los pagos se registran desde la ficha o perfil del estudiante cuando tiene cargos pendientes.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Estudiante</th>
                    <th className="px-3 py-2 font-medium">Aplicado a</th>
                    <th className="px-3 py-2 font-medium">Método</th>
                    <th className="px-3 py-2 font-medium">Referencia</th>
                    <th className="px-3 py-2 font-medium text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-600">{fmtFechaCorta(p.fechaPago)}</td>
                      <td className="px-3 py-2.5">
                        <Link href={`/escolar/estudiantes/${p.estudianteId}`}
                          className="font-medium text-gray-900 hover:text-zero-600">
                          {p.estudiante} {p.estudianteApellidos}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{conceptoLabel(p)}</td>
                      <td className="px-3 py-2.5">
                        {p.metodo
                          ? <Badge variant="outline" className="capitalize">{METODO_LABEL[p.metodo] ?? p.metodo}</Badge>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{p.referencia ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{fmtDOP(p.montoCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}
