'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type { Bandeja, LineaExtractoVista } from '@/lib/contabilidad/conciliacion';

// Estado de cuenta del banco: se sube (CSV o Excel), se empareja con el libro por
// monto, fecha y referencia, y lo que no empareja se atiende aquí. Los depósitos
// que llegan sin concepto se registran «por identificar» y se asignan después a
// un cliente. Emparejar solo marca: no cambia ningún asiento.

const fetcher = (url: string) => fetch(url).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? 'Error'); return d; });
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (c: number) => RD.format(c / 100);

interface Vista {
  vista: true; columnas: { fecha: string; descripcion: string | null; referencia: string | null; monto: string; saldo: string | null };
  total: number; entradasCents: number; salidasCents: number; desde: string | null; hasta: string | null;
  muestra: { fila: number; fecha: string; descripcion: string | null; referencia: string | null; montoCents: number }[];
  errores: { fila: number; mensaje: string }[]; totalErrores: number;
}
interface Aplicado {
  vista: false;
  importacion: { total: number; nuevas: number; yaImportadas: number };
  emparejado: { emparejadas: number; porReferencia: number; ambiguas: number; sugeridas: number; sinPareja: number };
  totalErrores: number;
}

export function ExtractoBanco({ cuentaId, puedeGestionar, onCambio }: { cuentaId: string; puedeGestionar: boolean; onCambio: () => void }) {
  const { data, mutate } = useSWR<Bandeja>(cuentaId ? `/api/contabilidad/bancos/extracto?cuentaId=${cuentaId}` : null, fetcher);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [aplicado, setAplicado] = useState<Aplicado | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [asignando, setAsignando] = useState<LineaExtractoVista | null>(null);
  const [emparejando, setEmparejando] = useState<LineaExtractoVista | null>(null);
  const ocupado = useRef(false);

  async function subir(aplicar: boolean) {
    if (!archivo || ocupado.current) return;
    ocupado.current = true; setTrabajando(true);
    try {
      const fd = new FormData();
      fd.set('archivo', archivo); fd.set('cuentaId', cuentaId); if (aplicar) fd.set('aplicar', '1');
      const res = await fetch('/api/contabilidad/bancos/extracto', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo leer el archivo');
      if (aplicar) { setAplicado(j); setVista(null); setArchivo(null); await mutate(); onCambio(); }
      else { setVista(j); setAplicado(null); }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { ocupado.current = false; setTrabajando(false); }
  }

  async function accion(id: number, cuerpo: Record<string, unknown>, exito?: string) {
    if (ocupado.current) return false;
    ocupado.current = true; setTrabajando(true);
    try {
      const res = await fetch(`/api/contabilidad/bancos/extracto/lineas/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar');
      if (exito) toast.success(exito);
      await mutate(); onCambio();
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); return false; }
    finally { ocupado.current = false; setTrabajando(false); }
  }

  async function reemparejar() {
    if (ocupado.current) return;
    ocupado.current = true; setTrabajando(true);
    try {
      const res = await fetch('/api/contabilidad/bancos/extracto/emparejar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuentaId: Number(cuentaId) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo emparejar');
      toast.success(j.emparejadas ? `${j.emparejadas} emparejadas` : 'No hay nuevas parejas');
      await mutate(); onCambio();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { ocupado.current = false; setTrabajando(false); }
  }

  if (data && !data.disponible) {
    return (
      <Card className="mb-4 print:hidden"><CardContent className="p-4 text-sm text-muted-foreground">
        Importar el estado de cuenta estará disponible en cuanto se aplique la actualización de la base de datos pendiente.
      </CardContent></Card>
    );
  }

  const r = data?.resumen;
  return (
    <section className="mb-6 space-y-3 print:hidden" data-testid="extracto-banco">
      <h2 className="flex items-center gap-2 text-base font-semibold"><FileSpreadsheet className="h-4 w-4 text-zero-600" /> Estado de cuenta del banco</h2>

      {puedeGestionar && (
        <Card><CardContent className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            Sube el estado de cuenta (CSV o Excel) con las columnas fecha, descripción, referencia y monto (o débito y crédito).
            Se empareja con el libro por monto, fecha y referencia; lo que no empareja queda aquí para resolverlo. Subir un tramo que
            se traslapa con otro no duplica nada.
          </p>
          <p className="text-xs text-muted-foreground">
            Cómo se leen los montos: un punto o una coma seguidos de exactamente tres dígitos («5.250», «5,250») se toman como miles
            (RD$5,250.00); seguidos de uno o dos («5.25», «5,5») como decimales. Revisa el total de entradas y salidas de la vista previa
            antes de importar. Se une solo lo claro: mismo monto, hasta 7 días de diferencia y sin competencia entre líneas; las referencias valen desde 6 caracteres. Lo dudoso (hasta 45 días) se sugiere para que lo revises.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              <Upload className="h-4 w-4" /> {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
              <input type="file" hidden accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setVista(null); setAplicado(null); e.target.value = ''; }} />
            </label>
            {archivo && <span className="text-sm">{archivo.name}</span>}
            {archivo && !vista && <Button size="sm" onClick={() => subir(false)} disabled={trabajando}>{trabajando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Revisar archivo</Button>}
            {r && r.pendientes > 0 && <Button size="sm" variant="outline" onClick={reemparejar} disabled={trabajando}>Volver a emparejar</Button>}
          </div>

          {vista && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm" data-testid="vista-extracto">
              <div>
                <strong>{vista.total}</strong> movimientos del {vista.desde} al {vista.hasta}: entró <span className="text-emerald-700">{pesos(vista.entradasCents)}</span>,
                salió <span className="text-red-700">{pesos(vista.salidasCents)}</span>.
              </div>
              <div className="text-xs text-muted-foreground">
                Columnas reconocidas — fecha: «{vista.columnas.fecha}»; descripción: «{vista.columnas.descripcion ?? '—'}»; referencia: «{vista.columnas.referencia ?? '—'}»;
                monto: «{vista.columnas.monto}»{vista.columnas.saldo ? `; saldo: «${vista.columnas.saldo}»` : ''}.
              </div>
              <table className="w-full text-xs"><tbody>
                {vista.muestra.map((m) => (
                  <tr key={m.fila} className="border-t"><td className="py-1 pr-2 tabular-nums">{m.fecha}</td><td className="pr-2">{m.descripcion ?? ''}</td>
                    <td className="pr-2 text-muted-foreground">{m.referencia ?? ''}</td>
                    <td className={`text-right tabular-nums ${m.montoCents < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{pesos(m.montoCents)}</td></tr>
                ))}
              </tbody></table>
              {vista.totalErrores > 0 && (
                <div role="alert" className="text-amber-800">
                  {vista.totalErrores} fila(s) no se pudieron leer y se saltarán: {vista.errores.slice(0, 5).map((e) => `fila ${e.fila} (${e.mensaje})`).join('; ')}{vista.totalErrores > 5 ? '…' : ''}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => subir(true)} disabled={trabajando}>{trabajando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Importar y emparejar</Button>
                <Button size="sm" variant="ghost" onClick={() => { setVista(null); setArchivo(null); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {aplicado && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status" data-testid="resultado-extracto">
              Se importaron {aplicado.importacion.nuevas} movimientos nuevos
              {aplicado.importacion.yaImportadas > 0 ? ` (${aplicado.importacion.yaImportadas} ya estaban)` : ''}.
              Emparejadas con el libro: {aplicado.emparejado.emparejadas}
              {aplicado.emparejado.porReferencia > 0 ? ` (${aplicado.emparejado.porReferencia} por referencia)` : ''}.
              {aplicado.emparejado.ambiguas > 0 ? ` ${aplicado.emparejado.ambiguas} con más de un candidato o que compiten por el mismo apunte: elígelas a mano.` : ''}
              {aplicado.emparejado.sugeridas > 0 ? ` ${aplicado.emparejado.sugeridas} tienen un apunte del mismo monto entre 7 y 45 días de diferencia: revísalas con «Emparejar».` : ''}
              {aplicado.emparejado.sinPareja > 0 ? ` ${aplicado.emparejado.sinPareja} sin pareja en el libro.` : ''}
            </div>
          )}
        </CardContent></Card>
      )}

      {r && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Emparejadas: {r.emparejadas}</Badge>
          <Badge variant="outline">Pendientes: {r.pendientes}</Badge>
          <Badge variant="outline">Depósitos por identificar: {r.registradas}</Badge>
          <Badge variant="outline">Asignadas: {r.asignadas}</Badge>
          {r.ignoradas > 0 && <Badge variant="outline">Ignoradas: {r.ignoradas}</Badge>}
        </div>
      )}

      {data && data.depositosSinIdentificar.length > 0 && (
        <Card data-testid="depositos-sin-identificar"><CardContent className="space-y-2 p-4">
          <div className="text-sm font-medium">Depósitos sin identificar ({data.depositosSinIdentificar.length})</div>
          <p className="text-xs text-muted-foreground">
            Dinero que entró al banco y no tiene su cobro en el libro. Por ahora esta lista es solo informativa: registra el cobro de ese
            depósito en Cobros y vuelve a emparejar. {data.depositosActivo
              ? '«Registrar» lo asienta contra «Depósitos por identificar» (2115) y «Asignar» lo pasa al saldo a favor del cliente.'
              : 'Asentarlo aquí está apagado porque luego el cobro contaría el banco dos veces; conectarlo con Cobros queda para más adelante.'}
          </p>
          <Lista lineas={data.depositosSinIdentificar} puedeGestionar={puedeGestionar} trabajando={trabajando}
            acciones={(l) => (
              <>
                {data.depositosActivo && l.estado === 'pendiente' && <Button size="sm" onClick={() => accion(l.id, { accion: 'registrar-deposito' }, 'Depósito registrado por identificar')} disabled={trabajando}>Registrar</Button>}
                {data.depositosActivo && l.estado === 'registrada' && <Button size="sm" onClick={() => setAsignando(l)} disabled={trabajando}>Asignar a cliente</Button>}
                {l.estado === 'pendiente' && <Button size="sm" variant="outline" onClick={() => setEmparejando(l)} disabled={trabajando}>Emparejar</Button>}
                {l.estado === 'pendiente' && <Button size="sm" variant="ghost" onClick={() => accion(l.id, { accion: 'ignorar' })} disabled={trabajando}>Ignorar</Button>}
              </>
            )} />
        </CardContent></Card>
      )}

      {data && data.retirosSinRegistrar.length > 0 && (
        <Card data-testid="retiros-sin-registrar"><CardContent className="space-y-2 p-4">
          <div className="text-sm font-medium">Retiros del banco sin registrar ({data.retirosSinRegistrar.length})</div>
          <p className="text-xs text-muted-foreground">
            Salió dinero del banco y no hay un apunte igual en el libro. Si ya lo registraste con otro monto, corrígelo; si falta, regístralo (pago, cargo bancario
            o retiro) y vuelve a emparejar.
          </p>
          <Lista lineas={data.retirosSinRegistrar} puedeGestionar={puedeGestionar} trabajando={trabajando}
            acciones={(l) => (
              <>
                <Button size="sm" variant="outline" onClick={() => setEmparejando(l)} disabled={trabajando}>Emparejar</Button>
                <Button size="sm" variant="ghost" onClick={() => accion(l.id, { accion: 'ignorar' })} disabled={trabajando}>Ignorar</Button>
              </>
            )} />
        </CardContent></Card>
      )}

      {asignando && <AsignarDialogo linea={asignando} onCerrar={() => setAsignando(null)}
        onAsignar={async (v) => { if (await accion(asignando.id, { accion: 'asignar', ...v }, 'Depósito asignado')) setAsignando(null); }} trabajando={trabajando} />}
      {emparejando && <EmparejarDialogo linea={emparejando} onCerrar={() => setEmparejando(null)}
        onElegir={async (lineaId) => { if (await accion(emparejando.id, { accion: 'emparejar', lineaId }, 'Emparejado')) setEmparejando(null); }} trabajando={trabajando} />}
    </section>
  );
}

function Lista({ lineas, acciones, puedeGestionar, trabajando }: {
  lineas: LineaExtractoVista[]; acciones: (l: LineaExtractoVista) => React.ReactNode; puedeGestionar: boolean; trabajando: boolean;
}) {
  void trabajando;
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="border-b text-left text-xs text-muted-foreground">
        <th className="px-2 py-1.5 font-medium">Fecha</th><th className="px-2 py-1.5 font-medium">Descripción</th>
        <th className="px-2 py-1.5 font-medium">Referencia</th><th className="px-2 py-1.5 text-right font-medium">Monto</th>
        <th className="px-2 py-1.5 font-medium">Estado</th>{puedeGestionar && <th />}
      </tr></thead>
      <tbody>{lineas.map((l) => (
        <tr key={l.id} className="border-b last:border-0 align-top">
          <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{l.fecha}</td>
          <td className="min-w-[12rem] px-2 py-1.5 [overflow-wrap:anywhere]">{l.descripcion ?? '—'}</td>
          <td className="px-2 py-1.5 text-xs text-muted-foreground">{l.referencia ?? ''}</td>
          <td className={`px-2 py-1.5 text-right tabular-nums ${l.montoCents < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{pesos(l.montoCents)}</td>
          <td className="px-2 py-1.5 text-xs">{l.estado === 'registrada' ? <Badge variant="outline">Por identificar</Badge> : l.estado === 'asignada' ? `A ${l.clienteNombre ?? 'cliente'}` : 'Pendiente'}</td>
          {puedeGestionar && <td className="whitespace-nowrap px-2 py-1.5"><div className="flex flex-wrap justify-end gap-1">{acciones(l)}</div></td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto"><CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">{titulo}</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </CardContent></Card>
    </div>
  );
}

function AsignarDialogo({ linea, onCerrar, onAsignar, trabajando }: {
  linea: LineaExtractoVista; onCerrar: () => void; trabajando: boolean;
  onAsignar: (v: { clienteId: number; cargoReferencia: string; nota: string }) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [cliente, setCliente] = useState<{ id: number; razonSocial: string } | null>(null);
  const [cargo, setCargo] = useState('');
  const [nota, setNota] = useState('');
  const { data } = useSWR<{ clientes: { id: number; razonSocial: string; rnc: string | null; dependientes: string[] }[] }>(
    q.trim().length >= 2 ? `/api/clientes?q=${encodeURIComponent(q.trim())}&limit=8` : null, fetcher);
  return (
    <Modal titulo="Asignar depósito a un cliente" onCerrar={onCerrar}>
      <p className="text-sm text-muted-foreground">{linea.fecha} · {pesos(linea.montoCents)}{linea.referencia ? ` · ref. ${linea.referencia}` : ''}</p>
      {cliente ? (
        <div className="flex items-center justify-between rounded-md border p-2 text-sm">
          <span>{cliente.razonSocial}</span>
          <Button size="sm" variant="ghost" onClick={() => setCliente(null)}>Cambiar</Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Cliente (nombre, RNC o hijo)</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe al menos 2 letras" aria-label="Buscar cliente" />
          {data?.clientes.map((c) => (
            <button key={c.id} type="button" onClick={() => setCliente({ id: c.id, razonSocial: c.razonSocial })}
              className="block w-full rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted">
              {c.razonSocial}{c.rnc ? <span className="text-xs text-muted-foreground"> · {c.rnc}</span> : null}
              {c.dependientes.length > 0 && <span className="block text-xs text-muted-foreground">{c.dependientes.slice(0, 3).join(', ')}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Cargo o factura que paga (opcional)</Label>
        <Input value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} aria-label="Cargo o factura" /></div>
      <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Nota (opcional)</Label>
        <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} aria-label="Nota" /></div>
      <p className="text-xs text-amber-800" role="note">
        Esto es solo contable: pasa el dinero de «Depósitos por identificar» a la cuenta de saldos a favor y deja anotado de quién es. Zero no tiene
        un saldo a favor por cliente que el cobro use solo (el saldo a favor sale de notas de crédito), así que el cargo se sigue cobrando en
        cobros; al hacerlo, el banco se registra de nuevo. Consúltalo con tu contable antes de asignar.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</Button>
        <Button disabled={!cliente || trabajando} onClick={() => cliente && onAsignar({ clienteId: cliente.id, cargoReferencia: cargo, nota })}>Asignar</Button>
      </div>
    </Modal>
  );
}

function EmparejarDialogo({ linea, onCerrar, onElegir, trabajando }: {
  linea: LineaExtractoVista; onCerrar: () => void; trabajando: boolean; onElegir: (lineaId: number) => Promise<void>;
}) {
  const { data, error } = useSWR<{ candidatos: { lineaId: number; fecha: string; concepto: string; montoCents: number }[] }>(
    `/api/contabilidad/bancos/extracto/lineas/${linea.id}`, fetcher);
  return (
    <Modal titulo="Emparejar con un apunte del libro" onCerrar={onCerrar}>
      <p className="text-sm text-muted-foreground">{linea.fecha} · {pesos(linea.montoCents)}{linea.descripcion ? ` · ${linea.descripcion}` : ''}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
      {data && data.candidatos.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay apuntes sin conciliar con exactamente ese monto. Registra el movimiento que falta y vuelve a emparejar.</p>
      )}
      {data?.candidatos.map((c) => (
        <button key={c.lineaId} type="button" disabled={trabajando} onClick={() => onElegir(c.lineaId)}
          className="block w-full rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted">
          <span className="tabular-nums">{c.fecha}</span> · {c.concepto} · <span className="tabular-nums">{pesos(c.montoCents)}</span>
        </button>
      ))}
    </Modal>
  );
}
