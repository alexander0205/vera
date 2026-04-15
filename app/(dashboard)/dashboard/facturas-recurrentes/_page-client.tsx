'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  RefreshCw, Plus, Trash2, Loader2, AlertTriangle, Pencil, PauseCircle, PlayCircle,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FacturaRecurrente {
  id: number;
  nombre: string;
  frecuencia: string;
  proximaEmision: string;
  estado: string;
  facturasEmitidas: number;
  totalEstimado: number;
  clienteRazonSocial: string | null;
  clientId: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FRECUENCIA_LABEL: Record<string, string> = {
  diario:      'Diario',
  semanal:     'Semanal',
  quincenal:   'Quincenal',
  mensual:     'Mensual',
  bimestral:   'Bimestral',
  trimestral:  'Trimestral',
  semestral:   'Semestral',
  anual:       'Anual',
};

function estadoBadge(estado: string) {
  switch (estado) {
    case 'activa':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 border">Activa</Badge>;
    case 'pausada':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 border">Pausada</Badge>;
    case 'finalizada':
      return <Badge variant="outline" className="text-gray-500 border-gray-300">Finalizada</Badge>;
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

function formatFecha(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FacturasRecurrentesPage() {
  const [facturas, setFacturas]         = useState<FacturaRecurrente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FacturaRecurrente | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);
  const [toggling, setToggling]         = useState<number | null>(null);
  const didLoad                         = useRef(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/facturas-recurrentes');
      const data = await res.json();
      setFacturas(data.facturasRecurrentes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!didLoad.current) { didLoad.current = true; cargar(); }
  }, [cargar]);

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    setOpError(null);
    try {
      const res  = await fetch(`/api/facturas-recurrentes/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleEstado(f: FacturaRecurrente) {
    const nuevoEstado = f.estado === 'activa' ? 'pausada' : 'activa';
    setToggling(f.id);
    try {
      await fetch(`/api/facturas-recurrentes/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      setFacturas(prev => prev.map(fr => fr.id === f.id ? { ...fr, estado: nuevoEstado } : fr));
    } finally {
      setToggling(null);
    }
  }

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas recurrentes</h1>
          <p className="text-sm text-gray-500 mt-1">Automatiza el ciclo de facturación de tus clientes</p>
        </div>
        <Link href="/dashboard/facturas-recurrentes/nueva">
          <Button className="bg-teal-600 hover:bg-teal-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva factura recurrente
          </Button>
        </Link>
      </div>

      {/* Tabla */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {loading
              ? 'Cargando…'
              : `${facturas.length} factura${facturas.length !== 1 ? 's' : ''} recurrente${facturas.length !== 1 ? 's' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : facturas.length === 0 ? (
            <div className="text-center py-16">
              <RefreshCw className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Sin facturas recurrentes</p>
              <p className="text-sm text-gray-400 mt-1">
                Configura una factura recurrente para automatizar tu facturación
              </p>
              <Link href="/dashboard/facturas-recurrentes/nueva">
                <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Nueva factura recurrente
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Próxima emisión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center">Emitidas</TableHead>
                  <TableHead className="text-right">Total estimado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturas.map((f) => (
                  <TableRow key={f.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-sm text-gray-900">{f.nombre}</TableCell>
                    <TableCell className="text-gray-700 text-sm">
                      {f.clienteRazonSocial ?? <span className="text-gray-400 italic">Sin contacto</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {FRECUENCIA_LABEL[f.frecuencia] ?? f.frecuencia}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {formatFecha(f.proximaEmision)}
                    </TableCell>
                    <TableCell>{estadoBadge(f.estado)}</TableCell>
                    <TableCell className="text-center text-sm text-gray-600">
                      {f.facturasEmitidas}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {formatMonto(f.totalEstimado)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/facturas-recurrentes/${f.id}/editar`}>
                          <Button variant="ghost" size="sm" title="Editar">
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                        </Link>
                        {f.estado !== 'finalizada' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggling === f.id}
                            onClick={() => handleToggleEstado(f)}
                            title={f.estado === 'activa' ? 'Pausar' : 'Reanudar'}
                          >
                            {toggling === f.id
                              ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                              : f.estado === 'activa'
                                ? <PauseCircle className="h-4 w-4 text-amber-500" />
                                : <PlayCircle className="h-4 w-4 text-teal-600" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setDeleteTarget(f); setOpError(null); }}
                          title="Eliminar"
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
          <DialogHeader><DialogTitle>¿Eliminar factura recurrente?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {opError}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Las facturas ya emitidas no se verán afectadas.</span>
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
