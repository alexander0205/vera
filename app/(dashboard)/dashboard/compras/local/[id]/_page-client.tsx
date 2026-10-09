'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useVolver } from '@/lib/hooks/useVolver';
import { analizarNcf, TIPOS_BIENES_606, TIPOS_RETENCION_ISR } from '@/lib/compras/fiscal';
import type { DetalleCompra } from '@/lib/compras/consultas';
import { ArrowLeft, Ban, BookOpen, Loader2, ShoppingCart, Receipt, Wallet } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (c: number) => RD.format((c ?? 0) / 100);

const TIPO_PROVEEDOR: Record<string, string> = {
  juridica: 'Empresa', fisica: 'Persona física', informal: 'Proveedor informal', rst: 'Régimen simplificado', exterior: 'Del exterior',
};
const METODO: Record<string, string> = {
  efectivo: 'efectivo', transferencia: 'transferencia', cheque: 'cheque', tarjeta: 'tarjeta', deposito: 'depósito', otro: 'otro',
};
const TASA: Record<string, string> = { '0.18': '18 %', '0.16': '16 %', '0': '0 %', exento: 'Exento' };

export default function CompraLocalDetalleClient({ compraId }: { compraId: number }) {
  const { can } = usePermissions();
  const { data, isLoading, mutate } = useSWR<{ compra?: DetalleCompra; error?: string }>(`/api/compras/local/${compraId}`, fetcher);
  const compra = data?.compra;
  const volver = useVolver(compra?.clase === 'gasto' ? '/dashboard/gastos' : '/dashboard/compras');
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const ocupado = useRef(false);

  if (isLoading) {
    return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!compra) {
    return <div className="p-6"><Card><CardContent className="p-10 text-center text-sm text-muted-foreground">{data?.error ?? 'Compra no encontrada.'}</CardContent></Card></div>;
  }

  const esGasto = compra.clase === 'gasto';
  const anulada = compra.estado === 'anulada';
  const ncf = analizarNcf(compra.ncf);
  const puedeAnular = !anulada && (can('productos:gestionar') || can('facturas:anular'));
  const Icono = esGasto ? Receipt : ShoppingCart;

  async function anular() {
    if (ocupado.current) return;
    ocupado.current = true;
    setTrabajando(true);
    try {
      const res = await fetch(`/api/compras/local/${compraId}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo anular');
      toast.success(`${esGasto ? 'Gasto' : 'Compra'} anulad${esGasto ? 'o' : 'a'}${j.asiento?.creado ? ` · reverso asiento #${j.asiento.asientoId}` : ''}`);
      setAnulando(false);
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      ocupado.current = false;
      setTrabajando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <button type="button" onClick={volver} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {esGasto ? 'Gastos' : 'Compras'}
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Icono className="h-6 w-6 text-zero-600" /> {esGasto ? 'Gasto' : 'Compra'} #{compra.id}
            </h1>
            {anulada
              ? <Badge variant="outline" className="border-red-300 text-red-700">Anulada</Badge>
              : <Badge variant="outline" className="border-emerald-300 text-emerald-700">Registrada</Badge>}
            {!anulada && (
              compra.saldoCents > 0
                ? <Badge variant="outline" className="border-amber-400 text-amber-700">Por pagar {pesos(compra.saldoCents)}</Badge>
                : <Badge variant="outline">Pagada</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {compra.proveedorNombre ?? 'Sin proveedor'} · {compra.ncf} · {fmtFechaCorta(compra.fecha)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {compra.asientoId && (
            <Link href={`/contabilidad/libro-diario?origenTipo=compra&desde=${compra.fecha}&hasta=${compra.fecha}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
              <BookOpen className="h-4 w-4" /> Asiento #{compra.asientoId}
            </Link>
          )}
          {!anulada && compra.formaPago === 'credito' && compra.saldoCents > 0 && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/contabilidad/cuentas-por-pagar"><Wallet className="h-4 w-4" /> Pagar</Link>
            </Button>
          )}
          {puedeAnular && (
            <Button variant="outline" size="sm" onClick={() => { setMotivo(''); setAnulando(true); }} className="gap-1.5 text-red-600">
              <Ban className="h-4 w-4" /> Anular
            </Button>
          )}
        </div>
      </div>

      {anulada && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="aviso-anulada">
          Anulada el {fmtFechaCorta(compra.anuladaEn)}{compra.anuladaPor ? ` por ${compra.anuladaPor}` : ''}: {compra.motivoAnulacion}.
          {compra.asientoAnulacionId ? ` El reverso es el asiento #${compra.asientoAnulacionId}.` : ''} Ya no cuenta en el 606 ni en Cuentas por pagar.
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card><CardContent className="space-y-1 p-4 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Proveedor</div>
          <div className="font-semibold">{compra.proveedorNombre ?? '—'}</div>
          <div className="text-xs text-muted-foreground">{[compra.proveedorRnc, compra.tipoProveedor ? TIPO_PROVEEDOR[compra.tipoProveedor] : null].filter(Boolean).join(' · ')}</div>
        </CardContent></Card>
        <Card><CardContent className="space-y-1 p-4 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Comprobante</div>
          <div className="font-mono font-semibold">{compra.ncf ?? '—'}</div>
          <div className="text-xs text-muted-foreground">
            {ncf.valido ? `${ncf.electronico ? 'e-CF' : 'NCF'} de ${ncf.nombre.toLowerCase()}` : ''}
            {compra.ncfModificado ? ` · modifica ${compra.ncfModificado}` : ''}
          </div>
          <div className="text-xs text-muted-foreground">
            606: {ncf.valido && !ncf.reporta606 ? 'no se reporta' : compra.tipoBienes606 ? `${compra.tipoBienes606} · ${TIPOS_BIENES_606[compra.tipoBienes606 as keyof typeof TIPOS_BIENES_606] ?? ''}` : '—'}
          </div>
        </CardContent></Card>
        <Card><CardContent className="space-y-1 p-4 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Pago</div>
          <div className="font-semibold">
            {compra.formaPago === 'contado' ? `De contado · ${METODO[compra.metodoPago] ?? compra.metodoPago}` : 'A crédito'}
          </div>
          <div className="text-xs text-muted-foreground">
            {compra.fechaPago ? `Pagada el ${fmtFechaCorta(compra.fechaPago)}` : compra.fechaVencimiento ? `Vence el ${fmtFechaCorta(compra.fechaVencimiento)}` : 'Sin vencimiento'}
          </div>
          {compra.registradoPor && <div className="text-xs text-muted-foreground">Registró {compra.registradoPor}</div>}
        </CardContent></Card>
      </div>

      <Card className="mb-5">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="lineas-compra">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Qué se compró</th>
                  <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-2 text-right font-medium">Costo</th>
                  <th className="px-4 py-2 text-right font-medium">ITBIS</th>
                  <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {compra.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      {it.productoId ? (
                        <Link href={`/dashboard/productos/${it.productoId}`} className="font-medium hover:underline">{it.productoNombre ?? '(producto eliminado)'}</Link>
                      ) : <span className="font-medium">{it.descripcion}</span>}
                      <div className="text-xs text-muted-foreground">
                        {it.productoId ? `Inventario${it.almacen ? ` · ${it.almacen}` : ''}` : it.categoriaLabel}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.cantidad}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{pesos(it.costoUnitarioCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{TASA[it.itbisTasa] ?? it.itbisTasa}{it.itbisCents > 0 ? ` · ${pesos(it.itbisCents)}` : ''}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{pesos(it.subtotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card><CardContent className="space-y-1.5 p-4 text-sm" data-testid="impuestos-compra">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Impuestos y retenciones</div>
          <Fila k="Servicios" v={pesos(compra.montoServiciosCents)} />
          <Fila k="Bienes" v={pesos(compra.montoBienesCents)} />
          <Fila k="ITBIS facturado" v={pesos(compra.itbisCents)} />
          {compra.itbisAlCostoCents > 0 && <Fila k="ITBIS llevado al costo" v={pesos(compra.itbisAlCostoCents)} tenue />}
          <Fila k="ITBIS que se adelanta" v={pesos(Math.max(0, compra.itbisCents - compra.itbisAlCostoCents))} tenue />
          {compra.iscCents > 0 && <Fila k="ISC" v={pesos(compra.iscCents)} />}
          {compra.otrosImpuestosCents > 0 && <Fila k="Otros impuestos" v={pesos(compra.otrosImpuestosCents)} />}
          {compra.propinaCents > 0 && <Fila k="Propina legal" v={pesos(compra.propinaCents)} />}
          <Fila k="Total del comprobante" v={pesos(compra.montoTotal)} fuerte />
          {compra.itbisRetenidoCents > 0 && <Fila k="ITBIS retenido" v={`−${pesos(compra.itbisRetenidoCents)}`} tenue />}
          {compra.isrRetenidoCents > 0 && (
            <Fila k={`ISR retenido${compra.isrTipoRetencion ? ` (${TIPOS_RETENCION_ISR[compra.isrTipoRetencion as keyof typeof TIPOS_RETENCION_ISR]})` : ''}`} v={`−${pesos(compra.isrRetenidoCents)}`} tenue />
          )}
          <Fila k="Neto al proveedor" v={pesos(compra.netoCents)} fuerte />
        </CardContent></Card>
        <Card><CardContent className="space-y-1.5 p-4 text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Pagos</div>
          {compra.formaPago === 'contado' ? (
            <p>Pagada de contado{compra.fechaPago ? ` el ${fmtFechaCorta(compra.fechaPago)}` : ''} por {METODO[compra.metodoPago] ?? compra.metodoPago}: {pesos(compra.netoCents)}.</p>
          ) : compra.pagos.length === 0 ? (
            <p className="text-muted-foreground">Sin pagos todavía.</p>
          ) : (
            compra.pagos.map((p) => <Fila key={p.id} k={`${fmtFechaCorta(p.fechaPago)} · ${METODO[p.metodo] ?? p.metodo}${p.referencia ? ` · ${p.referencia}` : ''}`} v={pesos(p.montoCents)} />)
          )}
          <Fila k="Pagado" v={pesos(compra.pagadoCents)} fuerte />
          <Fila k="Saldo" v={pesos(compra.saldoCents)} />
          {compra.retencionesCents > 0 && !anulada && (
            <p className="pt-1 text-xs text-muted-foreground">
              Las retenciones ({pesos(compra.retencionesCents)}) se le pagan a la DGII: el ITBIS con el IT-1 y el ISR con el IR-17.
            </p>
          )}
          {compra.notas && <p className="whitespace-pre-wrap border-t pt-2 text-xs text-muted-foreground">{compra.notas}</p>}
        </CardContent></Card>
      </div>

      <Dialog open={anulando} onOpenChange={(o) => { if (!o && !trabajando) setAnulando(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Anular {esGasto ? 'gasto' : 'compra'} #{compra.id}</DialogTitle>
            <DialogDescription>
              Sale del 606 y de Cuentas por pagar, se revierte la entrada de inventario y se genera el reverso del asiento. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="motivo-anulacion">Motivo</Label>
            <Input id="motivo-anulacion" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. el proveedor anuló la factura" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnulando(false)} disabled={trabajando}>Cancelar</Button>
            <Button variant="destructive" onClick={anular} disabled={trabajando || motivo.trim().length < 3} className="gap-1.5">
              {trabajando && <Loader2 className="h-4 w-4 animate-spin" />} Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fila({ k, v, fuerte, tenue }: { k: string; v: string; fuerte?: boolean; tenue?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'border-t pt-1.5 font-semibold' : ''} ${tenue ? 'text-muted-foreground' : ''}`}>
      <span>{k}</span>
      <span className="shrink-0 tabular-nums">{v}</span>
    </div>
  );
}
