'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  FileText, Plus, Trash2, Search, Loader2, AlertTriangle, X, Pencil,
} from 'lucide-react';

interface Cotizacion {
  id: number;
  numero: string;
  estado: string;
  razonSocialComprador: string | null;
  montoTotal: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
}

function estadoBadge(estado: string) {
  switch (estado) {
    case 'borrador':
      return <Badge variant="outline" className="text-gray-600 border-gray-300">Borrador</Badge>;
    case 'enviada':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">Enviada</Badge>;
    case 'aceptada':
      return <Badge className="bg-green-600 hover:bg-green-600 text-white">Aceptada</Badge>;
    case 'rechazada':
      return <Badge variant="destructive">Rechazada</Badge>;
    case 'vencida':
      return <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">Vencida</Badge>;
    default:
      return <Badge variant="outline">{estado}</Badge>;
  }
}

function formatMonto(centavos: number) {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(centavos / 100);
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones]   = useState<Cotizacion[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [deleteTarget, setDeleteTarget]   = useState<Cotizacion | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [opError, setOpError]             = useState<string | null>(null);
  const searchTimer                       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/cotizaciones${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      setCotizaciones(data.cotizaciones ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function handleSearch(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => cargar(v), 300);
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    setOpError(null);
    try {
      const res  = await fetch(`/api/cotizaciones/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar(search);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Presupuestos y propuestas para tus clientes</p>
        </div>
        <Link href="/dashboard/cotizaciones/nueva">
          <Button className="bg-teal-600 hover:bg-teal-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva cotización
          </Button>
        </Link>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9 bg-white"
          placeholder="Buscar por número o cliente…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => { setSearch(''); cargar(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabla */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {loading
              ? 'Cargando…'
              : `${cotizaciones.length} cotización${cotizaciones.length !== 1 ? 'es' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : cotizaciones.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">
                {search ? 'Sin resultados para esa búsqueda' : 'Sin cotizaciones registradas'}
              </p>
              {!search && (
                <>
                  <p className="text-sm text-gray-400 mt-1">
                    Crea tu primera cotización para enviarla a un cliente
                  </p>
                  <Link href="/dashboard/cotizaciones/nueva">
                    <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Nueva cotización
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Monto Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotizaciones.map((c) => (
                  <TableRow key={c.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono font-medium text-sm">{c.numero}</TableCell>
                    <TableCell className="text-gray-700">
                      {c.razonSocialComprador ?? <span className="text-gray-400 italic">Sin cliente</span>}
                    </TableCell>
                    <TableCell className="font-medium">{formatMonto(c.montoTotal)}</TableCell>
                    <TableCell>{estadoBadge(c.estado)}</TableCell>
                    <TableCell className="text-sm text-gray-600">{formatFecha(c.fechaEmision)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/cotizaciones/${c.id}/editar`}>
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setDeleteTarget(c); setOpError(null); }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modal: Confirmar eliminación ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar cotización?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {opError}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar la cotización{' '}
              <strong>{deleteTarget?.numero}</strong>
              {deleteTarget?.razonSocialComprador
                ? ` de ${deleteTarget.razonSocialComprador}`
                : ''}
              . Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Esta cotización no se convertirá en factura si la eliminas.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleEliminar} disabled={deleting}>
              {deleting
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Eliminando…</>
                : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
