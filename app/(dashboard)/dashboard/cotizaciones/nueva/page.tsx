'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface LineItem {
  descripcion: string;
  precio: number;
  cantidad: number;
}

const EMPTY_ITEM: LineItem = { descripcion: '', precio: 0, cantidad: 1 };

export default function NuevaCotizacionPage() {
  const router = useRouter();

  // Datos del comprador
  const [razonSocial, setRazonSocial]       = useState('');
  const [rnc, setRnc]                       = useState('');
  const [email, setEmail]                   = useState('');
  const [fechaVencimiento, setFechaVenc]    = useState('');
  const [notas, setNotas]                   = useState('');
  const [terminos, setTerminos]             = useState('');

  // Líneas
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

  // UI
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── helpers ────────────────────────────────────────────────────────────────

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, [field]: value } : it
    ));
  }

  function addItem() {
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const subtotal  = items.reduce((s, it) => s + it.precio * it.cantidad, 0);
  const total     = subtotal; // sin ITBIS en cotización simple

  function formatPesos(n: number) {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(n);
  }

  // ── submit ─────────────────────────────────────────────────────────────────

  async function handleGuardar() {
    if (!razonSocial.trim() && items.every(it => !it.descripcion.trim())) {
      setError('Ingresa al menos el nombre del cliente o una línea de ítem');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocialComprador: razonSocial.trim() || null,
          rncComprador:         rnc.trim() || null,
          emailComprador:       email.trim() || null,
          fechaVencimiento:     fechaVencimiento || null,
          montoSubtotal:        subtotal,
          montoDescuento:       0,
          totalItbis:           0,
          montoTotal:           total,
          items:                items.filter(it => it.descripcion.trim()),
          notas:                notas.trim() || null,
          terminosCondiciones:  terminos.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      router.push('/dashboard/cotizaciones');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#eef0f7] min-h-full p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/cotizaciones">
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva cotización</h1>
          <p className="text-sm text-gray-500">Se guardará como borrador (COT-XXXX)</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* ── Documento ────────────────────────────────────────────────────────── */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Datos del cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre / Razón Social</Label>
              <Input
                placeholder="Empresa XYZ SRL"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>RNC / Cédula</Label>
              <Input
                placeholder="130123456"
                value={rnc}
                onChange={(e) => setRnc(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="facturacion@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de vencimiento</Label>
              <Input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVenc(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Líneas ───────────────────────────────────────────────────────────── */}
      <Card className="bg-white">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Ítems / Servicios</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar línea
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%]">Descripción</TableHead>
                <TableHead className="w-[20%]">Precio (RD$)</TableHead>
                <TableHead className="w-[15%]">Cantidad</TableHead>
                <TableHead className="w-[15%]">Total</TableHead>
                <TableHead className="w-[5%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      placeholder="Descripción del servicio o producto"
                      value={item.descripcion}
                      onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={item.precio === 0 ? '' : item.precio}
                      onChange={(e) => updateItem(idx, 'precio', parseFloat(e.target.value) || 0)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="1"
                      value={item.cantidad}
                      onChange={(e) => updateItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {formatPesos(item.precio * item.cantidad)}
                  </TableCell>
                  <TableCell>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(idx)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Totales */}
          <div className="flex justify-end p-4 border-t">
            <div className="space-y-1 text-sm min-w-[200px]">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPesos(subtotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-1 mt-1">
                <span>Total</span>
                <span>{formatPesos(total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Notas y Términos ─────────────────────────────────────────────────── */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Notas y condiciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Notas internas / mensaje al cliente</Label>
            <Textarea
              placeholder="Agradecemos su preferencia. Esta cotización es válida por 30 días."
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Términos y condiciones</Label>
            <Textarea
              placeholder="Pago a 30 días. Precios sujetos a cambio sin previo aviso."
              rows={3}
              value={terminos}
              onChange={(e) => setTerminos(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Acciones ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pb-6">
        <Link href="/dashboard/cotizaciones">
          <Button variant="outline" disabled={saving}>Cancelar</Button>
        </Link>
        <Button
          className="bg-teal-600 hover:bg-teal-700"
          onClick={handleGuardar}
          disabled={saving}
        >
          {saving
            ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
            : 'Guardar como borrador'}
        </Button>
      </div>
    </div>
  );
}
