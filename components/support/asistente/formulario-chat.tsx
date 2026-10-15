'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import {
  armarPayload, endpointDe, esNota, guardarLineas, leerLineas, lineaVacia, prefillDeBorrador, prefillDeNota, resultadoDeCreacion, resumenDeEmision,
  resumenDeAnulacion, resumenDeNota, totalesDeLineas, validarFormulario,
  type Campo, type DefFormulario, type Linea, type ModoEmision, type Valores,
} from '@/lib/asistente/formulario';
import s from './asistente.module.css';

/**
 * Formulario dentro del chat. Envía a la MISMA ruta de la API que la pantalla
 * equivalente, con la sesión de quien lo llena; no hay una vía propia del
 * asistente. Los valores que adelantó el asistente son solo un punto de partida.
 * Emitir un comprobante a la DGII pide una segunda confirmación a la vista.
 */

interface ResumenImportacion {
  total: number; created: number; updated: number; skipped: number; errors: string[];
}

type Fase =
  | { t: 'editando' }
  | { t: 'enviando' }
  | { t: 'confirmar'; texto: string; accion: 'emitir' | 'anular' }
  | { t: 'duplicado'; nombre: string }
  | { t: 'previa'; resumen: ResumenImportacion }
  | { t: 'listo'; mensaje: string; enlace: string }
  | { t: 'error'; mensaje: string; enlace?: string; enlaceTexto?: string };

const MAX_ARCHIVO = 8 * 1024 * 1024;

/** Lo que ya se hizo con este formulario, para que recargar la página no lo muestre vacío otra vez. */
function leerHecho(clave: string | undefined): { mensaje: string; enlace: string } | null {
  if (!clave) return null;
  try {
    const crudo = window.localStorage.getItem(`asistente-form:${clave}`);
    if (!crudo) return null;
    const d = JSON.parse(crudo) as { mensaje?: unknown; enlace?: unknown };
    return typeof d.mensaje === 'string' && typeof d.enlace === 'string' && d.enlace.startsWith('/') && !d.enlace.startsWith('//')
      ? { mensaje: d.mensaje.slice(0, 300), enlace: d.enlace }
      : null;
  } catch { return null; }
}
function guardarHecho(clave: string | undefined, h: { mensaje: string; enlace: string }) {
  if (!clave) return;
  try { window.localStorage.setItem(`asistente-form:${clave}`, JSON.stringify(h)); } catch { /* sin almacenamiento: no pasa nada */ }
}
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const pesos = (n: number) => n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mensajeDeError(status: number, cuerpo: unknown): string {
  const c = (cuerpo ?? {}) as { error?: string; mensaje?: string; detalles?: { fieldErrors?: Record<string, string[]> } };
  const campos = c.detalles?.fieldErrors ? Object.values(c.detalles.fieldErrors).flat().filter(Boolean) : [];
  if (campos.length) return campos.join(' · ');
  if (status === 401) return 'Tu sesión venció. Recarga la página e inicia sesión de nuevo.';
  if (status === 403) return c.error && c.error.length < 200 ? c.error : 'Tu usuario no tiene permiso para hacer esto.';
  if (status === 429) return 'Demasiados intentos seguidos. Espera un momento.';
  const texto = c.error ?? c.mensaje;
  return texto && texto.length < 240 ? texto : 'No se pudo completar. No se guardó nada; revisa los datos e intenta de nuevo.';
}

/** Busca en una ruta de la API con una pausa corta y cancela la búsqueda anterior. */
function useBusqueda<T>(url: (q: string) => string, leer: (d: unknown) => T[], q: string, activo: boolean) {
  const [items, setItems] = useState<T[]>([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    const t = q.trim();
    if (!activo || t.length < 2) { setItems([]); return; }
    const ac = new AbortController();
    const espera = setTimeout(async () => {
      setCargando(true);
      try {
        const r = await fetch(url(t), { signal: ac.signal, cache: 'no-store' });
        setItems(r.ok ? leer(await r.json()).slice(0, 6) : []);
      } catch {
        if (!ac.signal.aborted) setItems([]);
      } finally {
        if (!ac.signal.aborted) setCargando(false);
      }
    }, 300);
    return () => { clearTimeout(espera); ac.abort(); };
    // `url` y `leer` son estables por uso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, activo]);
  return { items, cargando };
}

interface ClienteApi { id: number; razonSocial: string; rnc?: string | null; email?: string | null }
interface ProductoApi { id: number; nombre: string; precioDOP?: number; tasaItbis?: string; tipo?: string }
interface FacturaApi { id: number; codigo?: string | null; encf?: string | null; razonSocialComprador?: string | null; montoTotal: number; pagado?: number; estadoPago?: string | null }

function SelectorCliente({ id, valores, poner, deshabilitado }: {
  id: string; valores: Valores; poner: (p: Valores) => void; deshabilitado: boolean;
}) {
  const [texto, setTexto] = useState(valores.clienteNombre ?? '');
  const [abierto, setAbierto] = useState(false);
  const elegido = Boolean(valores.clienteId);
  const { items, cargando } = useBusqueda<ClienteApi>(
    (q) => `/api/clientes?q=${encodeURIComponent(q)}&limit=8`,
    (d) => ((d as { clientes?: ClienteApi[] }).clientes ?? []),
    texto, abierto && !elegido,
  );
  return (
    <div className={s.selector}>
      <input
        id={id}
        value={texto}
        disabled={deshabilitado}
        maxLength={200}
        autoComplete="off"
        placeholder="Nombre o RNC del cliente"
        role="combobox"
        aria-expanded={abierto && items.length > 0}
        aria-autocomplete="list"
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(ev) => {
          setTexto(ev.target.value);
          setAbierto(true);
          // Escribir otra vez deshace la elección: queda como nombre libre.
          poner({ clienteId: '', clienteRnc: '', clienteEmail: '', clienteNombre: ev.target.value });
        }}
      />
      {elegido && (
        <p className={s.campoAyuda}>
          Cliente registrado{valores.clienteRnc ? ` · ${valores.clienteRnc}` : ' · sin RNC'}
        </p>
      )}
      {abierto && !elegido && (items.length > 0 || cargando) && (
        <ul className={s.sugeridos} role="listbox">
          {cargando && items.length === 0 && <li className={s.sugeridoVacio}>Buscando…</li>}
          {items.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  setTexto(c.razonSocial);
                  setAbierto(false);
                  poner({ clienteId: String(c.id), clienteNombre: c.razonSocial, clienteRnc: c.rnc ?? '', clienteEmail: c.email ?? '' });
                }}
              >
                <strong>{c.razonSocial}</strong>
                <small>{c.rnc || 'sin RNC'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectorFactura({ id, valores, poner, deshabilitado, soloBorradores }: {
  id: string; valores: Valores; poner: (p: Valores) => void; deshabilitado: boolean; soloBorradores?: boolean;
}) {
  const [texto, setTexto] = useState(valores.documentoNombre ?? '');
  const [abierto, setAbierto] = useState(false);
  const elegido = Boolean(valores.documentoId);
  const { items, cargando } = useBusqueda<FacturaApi>(
    (q) => `/api/facturas?search=${encodeURIComponent(q)}&limit=8${soloBorradores ? '&estado=BORRADOR' : ''}`,
    (d) => ((d as { docs?: FacturaApi[] }).docs ?? []),
    texto, abierto && !elegido,
  );
  return (
    <div className={s.selector}>
      <input
        id={id}
        value={texto}
        disabled={deshabilitado}
        maxLength={100}
        autoComplete="off"
        placeholder="Número, código o cliente"
        role="combobox"
        aria-expanded={abierto && items.length > 0}
        aria-autocomplete="list"
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(ev) => {
          setTexto(ev.target.value);
          setAbierto(true);
          poner({ documentoId: '', documentoNombre: ev.target.value, documentoSaldo: '' });
        }}
      />
      {elegido && valores.documentoSaldo && (
        <p className={s.campoAyuda}>Saldo pendiente: RD$ {valores.documentoSaldo}</p>
      )}
      {abierto && !elegido && (items.length > 0 || cargando) && (
        <ul className={s.sugeridos} role="listbox">
          {cargando && items.length === 0 && <li className={s.sugeridoVacio}>Buscando…</li>}
          {items.map((f) => {
            const saldo = Math.max(0, (f.montoTotal - (f.pagado ?? 0)) / 100);
            const nombre = `${f.encf || f.codigo || `#${f.id}`} · ${f.razonSocialComprador ?? 'consumo final'}`;
            return (
              <li key={f.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    setTexto(nombre);
                    setAbierto(false);
                    poner({ documentoId: String(f.id), documentoNombre: nombre, documentoSaldo: pesos(saldo), ...(saldo > 0 ? { monto: String(saldo) } : {}) });
                  }}
                >
                  <strong>{nombre}</strong>
                  <small>{saldo > 0 ? `debe RD$ ${pesos(saldo)}` : 'pagada'}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EditorLineas({ id, valor, cambiar, deshabilitado }: {
  id: string; valor: string; cambiar: (v: string) => void; deshabilitado: boolean;
}) {
  const lineas = leerLineas(valor);
  const filas: Linea[] = lineas.length ? lineas : [lineaVacia()];
  const [buscando, setBuscando] = useState<number | null>(null);
  const q = buscando !== null ? filas[buscando]?.nombre ?? '' : '';
  const { items } = useBusqueda<ProductoApi>(
    (t) => `/api/productos?contexto=facturacion&q=${encodeURIComponent(t)}&limit=8`,
    (d) => ((d as { productos?: ProductoApi[] }).productos ?? []),
    q, buscando !== null && !filas[buscando]?.productoId,
  );
  const t = totalesDeLineas(filas.filter((l) => l.nombre && l.cantidad > 0 && l.precio > 0));

  const poner = (i: number, p: Partial<Linea>) => cambiar(guardarLineas(filas.map((l, j) => (j === i ? { ...l, ...p } : l))));

  return (
    <div className={s.lineas}>
      {filas.map((l, i) => (
        <div className={s.linea} key={i}>
          <div className={s.lineaNombre}>
            <input
              id={i === 0 ? id : undefined}
              aria-label={`Descripción de la línea ${i + 1}`}
              placeholder="Producto o servicio"
              value={l.nombre}
              disabled={deshabilitado}
              maxLength={200}
              autoComplete="off"
              onFocus={() => setBuscando(i)}
              onBlur={() => setTimeout(() => setBuscando((x) => (x === i ? null : x)), 150)}
              // Escribir de nuevo suelta el producto del catálogo: es texto libre otra vez.
              onChange={(ev) => poner(i, { nombre: ev.target.value, productoId: undefined })}
            />
            {buscando === i && !l.productoId && items.length > 0 && (
              <ul className={s.sugeridos} role="listbox">
                {items.map((p) => (
                  <li key={p.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        const tasa = (['0.18', '0.16', '0', 'exento'] as const).find((x) => x === p.tasaItbis) ?? '0.18';
                        poner(i, { nombre: p.nombre, productoId: p.id, precio: p.precioDOP ?? l.precio, tasa, bien: p.tipo === 'bien' });
                        setBuscando(null);
                      }}
                    >
                      <strong>{p.nombre}</strong>
                      <small>RD$ {pesos(p.precioDOP ?? 0)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input
            className={s.lineaNum}
            aria-label={`Cantidad de la línea ${i + 1}`}
            inputMode="decimal"
            value={l.cantidad ? String(l.cantidad) : ''}
            disabled={deshabilitado}
            onChange={(ev) => poner(i, { cantidad: Number(ev.target.value.replace(/,/g, '')) || 0 })}
            placeholder="Cant."
          />
          <input
            className={s.lineaNum}
            aria-label={`Precio de la línea ${i + 1}`}
            inputMode="decimal"
            value={l.precio ? String(l.precio) : ''}
            disabled={deshabilitado}
            onChange={(ev) => poner(i, { precio: Number(ev.target.value.replace(/,/g, '')) || 0 })}
            placeholder="Precio"
          />
          <select
            className={s.lineaTasa}
            aria-label={`ITBIS de la línea ${i + 1}`}
            value={l.tasa}
            disabled={deshabilitado}
            onChange={(ev) => poner(i, { tasa: ev.target.value as Linea['tasa'] })}
          >
            <option value="0.18">18 %</option>
            <option value="0.16">16 %</option>
            <option value="0">0 %</option>
            <option value="exento">Exento</option>
          </select>
          <button
            type="button"
            className={s.lineaQuitar}
            aria-label={`Quitar la línea ${i + 1}`}
            disabled={deshabilitado || filas.length === 1}
            onClick={() => cambiar(guardarLineas(filas.filter((_, j) => j !== i)))}
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
      ))}
      <div className={s.lineasPie}>
        <button
          type="button"
          className={s.lineaAgregar}
          disabled={deshabilitado || filas.length >= 30}
          onClick={() => cambiar(guardarLineas([...filas, lineaVacia()]))}
        >
          <Plus size={14} aria-hidden /> Agregar línea
        </button>
        <dl className={s.totales}>
          <div><dt>Subtotal</dt><dd>RD$ {pesos(t.subtotal)}</dd></div>
          <div><dt>ITBIS</dt><dd>RD$ {pesos(t.itbis)}</dd></div>
          <div className={s.totalFinal}><dt>Total</dt><dd>RD$ {pesos(t.total)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export function FormularioChat({ def, inicial, clave }: { def: DefFormulario; inicial: Valores; clave?: string }) {
  const base = useId();
  const [valores, setValores] = useState<Valores>(() => ({
    ...(def.id === 'pago' ? { fechaPago: hoy(), metodo: 'efectivo' } : {}),
    ...(def.id === 'factura' ? { tipoEcf: 'sin-ncf' } : {}),
    ...(def.id === 'anulacion' ? { tipoAnulacion: '04' } : {}),
    ...inicial,
  }));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<Fase>(() => {
    const hecho = typeof window !== 'undefined' ? leerHecho(clave) : null;
    return hecho ? { t: 'listo', ...hecho } : { t: 'editando' };
  });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Nota de crédito: al elegir la factura se traen sus líneas, su comprobante y su cliente.
  const documentoElegido = valores.documentoId;
  useEffect(() => {
    if (!esNota(def.id) || !documentoElegido) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/facturas/${encodeURIComponent(documentoElegido)}`, { signal: ac.signal, cache: 'no-store' });
        const d = await r.json().catch(() => null);
        const p = r.ok ? prefillDeNota(d, def.id === 'notacredito') : { valores: { ncfModificado: '', fechaNcfModificado: '', documentoTotal: '', documentoError: 'No pude leer esa factura.' }, error: 'No pude leer esa factura.' };
        setValores((x) => ({ ...x, ...p.valores }));
        setErrores((e) => (p.error ? { ...e, documento: p.error } : (({ documento: _d, ...resto }) => resto)(e)));
      } catch { /* cancelado */ }
    })();
    return () => ac.abort();
  }, [def.id, documentoElegido]);

  // Editar borrador: al elegirlo se traen sus datos (y se guardan aparte los que no se editan).
  useEffect(() => {
    if (def.id !== 'borrador' || !documentoElegido) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/facturas/${encodeURIComponent(documentoElegido)}`, { signal: ac.signal, cache: 'no-store' });
        const d = await r.json().catch(() => null);
        const p = r.ok ? prefillDeBorrador(d) : { valores: { tipoEcf: '', documentoError: 'No pude leer ese borrador.', conservado: '', documentoTotal: '' }, error: 'No pude leer ese borrador.' };
        setValores((x) => ({ ...x, ...p.valores }));
        setErrores((e) => (p.error ? { ...e, documento: p.error } : (({ documento: _d, ...resto }) => resto)(e)));
      } catch { /* cancelado */ }
    })();
    return () => ac.abort();
  }, [def.id, documentoElegido]);

  const ocupado = fase.t === 'enviando';
  const esArchivo = def.modo !== 'json';
  const campoArchivo = def.campos.find((c) => c.tipo === 'archivo');

  function terminar(h: { mensaje: string; enlace: string }) {
    guardarHecho(clave, h);
    setFase({ t: 'listo', ...h });
  }

  function poner(p: Valores) {
    setValores((x) => ({ ...x, ...p }));
    setErrores((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      if ('clienteId' in p || 'clienteNombre' in p) delete n.cliente;
      if ('documentoId' in p) delete n.documento;
      return n;
    });
  }

  async function enviarJson(opts: { modo?: ModoEmision; forzar?: boolean } = {}) {
    const modo = opts.modo ?? 'borrador';
    const e = validarFormulario(def, valores);
    setErrores(e);
    if (Object.keys(e).length) { setFase({ t: 'editando' }); return; }
    const destino = endpointDe(def, valores);
    if (!destino) { setErrores({ documento: 'Elige la factura de la lista' }); setFase({ t: 'editando' }); return; }
    setFase({ t: 'enviando' });
    try {
      // Emitir un borrador existente son dos pasos: guardar los cambios y enviarlo a la DGII.
      const emitirBorrador = def.id === 'borrador' && modo === 'emitir';
      const cuerpo = { ...armarPayload(def, valores, emitirBorrador ? 'borrador' : modo), ...(opts.forzar ? { force: true } : {}) };
      const r = await fetch(destino, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      const d = await r.json().catch(() => null);
      if (r.status === 409 && d?.duplicado) {
        setFase({ t: 'duplicado', nombre: String(d.duplicado.razonSocial ?? 'otro cliente') });
        return;
      }
      if (!r.ok) {
        const doc = typeof d?.docId === 'number' ? `/dashboard/facturas/${d.docId}` : undefined;
        const caja = typeof d?.code === 'string' && d.code.startsWith('CAJA_');
        setFase({
          t: 'error', mensaje: mensajeDeError(r.status, d),
          enlace: caja ? '/dashboard/caja' : doc,
          enlaceTexto: caja ? 'Abrir la caja' : 'Abrir en Zero',
        });
        return;
      }
      if (emitirBorrador) {
        const id = Number(valores.documentoId);
        const r2 = await fetch(`/api/facturas/${id}/emitir-ecf`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tipoEcf: valores.tipoEcf }),
        });
        const d2 = await r2.json().catch(() => null);
        if (!r2.ok) {
          const caja = typeof d2?.code === 'string' && d2.code.startsWith('CAJA_');
          const faltan = Array.isArray(d2?.errores) ? d2.errores.map((x: { mensaje?: string }) => x.mensaje).filter(Boolean).slice(0, 3).join(' · ') : '';
          setFase({
            t: 'error',
            mensaje: `Guardé los cambios, pero no se pudo emitir: ${faltan || mensajeDeError(r2.status, d2)}`,
            enlace: caja ? '/dashboard/caja' : `/dashboard/facturas/${id}`,
            enlaceTexto: caja ? 'Abrir la caja' : 'Abrir en Zero',
          });
          return;
        }
        terminar(resultadoDeCreacion(def, { documentoId: id, encf: d2?.encf, estado: d2?.estado }, 'emitir'));
        return;
      }
      terminar(resultadoDeCreacion(def, d, modo));
    } catch {
      setFase({ t: 'error', mensaje: 'No hay conexión. No se guardó nada; revisa tu internet e intenta de nuevo.' });
    }
  }

  function pedirEmision() {
    const e = validarFormulario(def, valores);
    setErrores(e);
    if (Object.keys(e).length) return;
    if (def.id === 'factura' && valores.tipoEcf === 'sin-ncf') { setErrores({ tipoEcf: 'Sin comprobante fiscal solo se guarda como borrador. Elige consumo o crédito fiscal para emitir.' }); return; }
    setFase({ t: 'confirmar', texto: def.id === 'borrador' ? resumenDeEmision(valores) : def.id === 'notacredito' ? resumenDeNota(valores) : def.id === 'notadebito' ? resumenDeNota(valores, 'debito') : resumenDeEmision(valores), accion: 'emitir' });
  }

  function pedirAnulacion() {
    const e = validarFormulario(def, valores);
    setErrores(e);
    if (Object.keys(e).length) return;
    setFase({ t: 'confirmar', texto: resumenDeAnulacion(valores), accion: 'anular' });
  }

  async function subirCsv(modo: 'preview' | 'commit') {
    const archivo = archivos[0];
    if (!archivo) { setErrorArchivo('Elige un archivo CSV'); return; }
    setFase({ t: 'enviando' });
    try {
      const fd = new FormData();
      fd.set('file', archivo);
      fd.set('mode', modo);
      const r = await fetch(def.endpoint, { method: 'POST', body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setFase({ t: 'error', mensaje: mensajeDeError(r.status, d) }); return; }
      const resumen: ResumenImportacion = {
        total: Number(d?.total ?? 0), created: Number(d?.created ?? 0), updated: Number(d?.updated ?? 0),
        skipped: Number(d?.skipped ?? 0), errors: Array.isArray(d?.errors) ? d.errors.slice(0, 5).map(String) : [],
      };
      if (modo === 'preview') { setFase({ t: 'previa', resumen }); return; }
      terminar({
        enlace: def.pantalla,
        mensaje: `Listo: importé ${resumen.created} ${def.id === 'importar-clientes' ? 'clientes' : 'productos'}` +
          (resumen.skipped ? ` (omití ${resumen.skipped}).` : '.'),
      });
    } catch {
      setFase({ t: 'error', mensaje: 'No hay conexión. No se importó nada; intenta de nuevo.' });
    }
  }

  async function subirCaptura() {
    if (!archivos.length) { setErrorArchivo('Elige el PDF o la imagen del comprobante'); return; }
    setFase({ t: 'enviando' });
    try {
      const fd = new FormData();
      for (const f of archivos) fd.append('archivos', f);
      const nota = (valores.nota ?? '').trim();
      if (nota) fd.set('nota', nota);
      const r = await fetch(def.endpoint, { method: 'POST', body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setFase({ t: 'error', mensaje: mensajeDeError(r.status, d) }); return; }
      terminar(resultadoDeCreacion(def, d));
    } catch {
      setFase({ t: 'error', mensaje: 'No hay conexión. No se subió nada; intenta de nuevo.' });
    }
  }

  function elegirArchivos(lista: FileList | null) {
    setErrorArchivo(null);
    setFase({ t: 'editando' });
    const fs = Array.from(lista ?? []);
    if (!fs.length) { setArchivos([]); return; }
    const ok = def.modo === 'csv'
      ? (f: File) => /\.csv$/i.test(f.name) || f.type === 'text/csv'
      : (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf' || f.type.startsWith('image/');
    const mala = fs.find((f) => !ok(f));
    if (mala) { setArchivos([]); setErrorArchivo(def.modo === 'csv' ? 'Debe ser un archivo CSV (.csv)' : 'Debe ser un PDF o una imagen'); return; }
    if (fs.some((f) => f.size > MAX_ARCHIVO)) { setArchivos([]); setErrorArchivo('Cada archivo debe pesar menos de 8 MB'); return; }
    setArchivos(fs.slice(0, campoArchivo?.multiple ? 5 : 1));
  }

  if (fase.t === 'listo') {
    return (
      <section className={`${s.formulario} ${s.formularioListo}`} aria-live="polite">
        <CheckCircle2 size={18} aria-hidden />
        <div>
          <strong>{fase.mensaje}</strong>
          <Link href={fase.enlace}>Ver en Zero</Link>
        </div>
      </section>
    );
  }

  const idCampo = (c: Campo) => `${base}-${c.id}`;

  function renderCampo(c: Campo) {
    const id = idCampo(c);
    const err = errores[c.id];
    const comun = {
      id, value: valores[c.id] ?? '', disabled: ocupado,
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `${id}-e` : c.ayuda ? `${id}-a` : undefined,
    };
    let control: React.ReactNode;
    if (c.tipo === 'select') {
      control = (
        <select {...comun} onChange={(ev) => poner({ [c.id]: ev.target.value })}>
          {c.requerido && def.id === 'producto' ? <option value="">Elige…</option> : null}
          {c.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      );
    } else if (c.tipo === 'area') {
      control = <textarea {...comun} rows={2} maxLength={c.max} placeholder={c.placeholder} onChange={(ev) => poner({ [c.id]: ev.target.value })} />;
    } else if (c.tipo === 'fecha') {
      control = <input {...comun} type="date" onChange={(ev) => poner({ [c.id]: ev.target.value })} />;
    } else if (c.tipo === 'cliente') {
      control = <SelectorCliente id={id} valores={valores} poner={poner} deshabilitado={ocupado} />;
    } else if (c.tipo === 'documento') {
      control = <SelectorFactura id={id} valores={valores} poner={poner} deshabilitado={ocupado} soloBorradores={def.id === 'borrador'} />;
    } else if (c.tipo === 'lineas') {
      control = <EditorLineas id={id} valor={valores[c.id] ?? ''} cambiar={(v) => poner({ [c.id]: v })} deshabilitado={ocupado} />;
    } else {
      control = (
        <input
          {...comun}
          type={c.tipo === 'email' ? 'email' : 'text'}
          inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
          maxLength={c.max}
          placeholder={c.placeholder}
          onChange={(ev) => poner({ [c.id]: ev.target.value })}
        />
      );
    }
    const etiqueta = c.tipo === 'lineas' || c.tipo === 'cliente' || c.tipo === 'documento'
      ? <span className={s.etiquetaCampo}>{c.etiqueta}{c.requerido && <span aria-hidden> *</span>}</span>
      : <label htmlFor={id}>{c.etiqueta}{c.requerido && <span aria-hidden> *</span>}</label>;
    return (
      <div className={s.campo} key={c.id}>
        {etiqueta}
        {control}
        {err ? <p id={`${id}-e`} className={s.campoError} role="alert">{err}</p>
          : c.ayuda ? <p id={`${id}-a`} className={s.campoAyuda}>{c.ayuda}</p> : null}
      </div>
    );
  }

  const puedeEmitir = (def.id === 'factura' && valores.tipoEcf !== 'sin-ncf' && Boolean(valores.tipoEcf))
    || (esNota(def.id) && Boolean(valores.ncfModificado))
    || (def.id === 'borrador' && ['31', '32', '44', '45', '46'].includes(valores.tipoEcf ?? ''));

  return (
    <section className={s.formulario} aria-label={def.titulo}>
      <header>
        <strong>{def.titulo}</strong>
        <p>{def.descripcion}</p>
      </header>

      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          if (ocupado || fase.t === 'confirmar') return;
          if (def.modo === 'csv') void subirCsv('preview');
          else if (def.modo === 'captura') void subirCaptura();
          else if (def.id === 'anulacion') pedirAnulacion();
          else void enviarJson();
        }}
      >
        {esArchivo && campoArchivo && (
          <div className={s.campo}>
            <label htmlFor={`${base}-archivo`}>{campoArchivo.etiqueta}{campoArchivo.requerido && <span aria-hidden> *</span>}</label>
            <div className={s.archivo}>
              <button type="button" onClick={() => entrada.current?.click()} disabled={ocupado}>
                {archivos.length ? <FileSpreadsheet size={16} aria-hidden /> : <Upload size={16} aria-hidden />}
                <span>
                  {archivos.length === 0 ? 'Elegir archivo…' : archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos`}
                </span>
              </button>
              <input
                id={`${base}-archivo`}
                ref={entrada}
                type="file"
                accept={campoArchivo.accept}
                multiple={campoArchivo.multiple}
                hidden
                onChange={(ev) => elegirArchivos(ev.target.files)}
              />
            </div>
            {errorArchivo && <p className={s.campoError} role="alert">{errorArchivo}</p>}
          </div>
        )}

        {def.campos.filter((c) => c.tipo !== 'archivo').map(renderCampo)}

        {def.id === 'borrador' && valores.cobrosConservados && (
          <p className={s.campoAyuda}>Este borrador tiene {valores.cobrosConservados} cobro(s) registrado(s): se conservan al guardar.</p>
        )}

        {fase.t === 'previa' && (
          <div className={s.previa} role="status">
            <strong>Esto es lo que encontré en el archivo</strong>
            <ul>
              <li>{fase.resumen.total} filas leídas</li>
              <li>{fase.resumen.created} se van a importar</li>
              {fase.resumen.skipped > 0 && <li>{fase.resumen.skipped} se omiten (sin nombre o ya existen)</li>}
            </ul>
            {fase.resumen.errors.length > 0 && <p className={s.campoError}>{fase.resumen.errors.join(' · ')}</p>}
          </div>
        )}

        {fase.t === 'duplicado' && (
          <div className={s.avisoForm} role="alert">
            <AlertTriangle size={16} aria-hidden />
            <div>
              <strong>Ya existe «{fase.nombre}» con ese RNC.</strong>
              <div className={s.avisoAcciones}>
                <button type="button" onClick={() => void enviarJson({ forzar: true })}>Crear de todos modos</button>
                <button type="button" onClick={() => setFase({ t: 'editando' })}>Corregir</button>
              </div>
            </div>
          </div>
        )}

        {fase.t === 'confirmar' && (
          <div className={s.avisoForm} role="alertdialog" aria-label={fase.accion === 'emitir' ? 'Confirmar emisión' : 'Confirmar anulación'}>
            <AlertTriangle size={16} aria-hidden />
            <div>
              <strong>{fase.texto}</strong>
              <div className={s.avisoAcciones}>
                <button type="button" className={s.peligro} onClick={() => void enviarJson({ modo: fase.accion === 'emitir' ? 'emitir' : 'borrador' })}>
                  {fase.accion === 'emitir' ? (esNota(def.id) ? 'Sí, emitir la nota' : 'Sí, emitir') : 'Sí, anular'}
                </button>
                <button type="button" onClick={() => setFase({ t: 'editando' })}>Volver</button>
              </div>
            </div>
          </div>
        )}

        {fase.t === 'error' && (
          <p className={s.campoError} role="alert">
            <AlertTriangle size={14} aria-hidden /> {fase.mensaje}
            {fase.enlace && <> <Link href={fase.enlace}>{fase.enlaceTexto ?? 'Abrir en Zero'}</Link></>}
          </p>
        )}

        {fase.t !== 'duplicado' && fase.t !== 'confirmar' && (
          <div className={s.formularioAcciones}>
            {fase.t === 'previa' && fase.resumen.created > 0 && (
              <button type="button" className={s.primario} onClick={() => void subirCsv('commit')}>
                Importar {fase.resumen.created}
              </button>
            )}
            {puedeEmitir && (
              <button type="button" className={s.secundario} disabled={ocupado} onClick={pedirEmision}>
                {esNota(def.id) ? 'Emitir la nota…' : def.id === 'borrador' ? 'Guardar y emitir…' : 'Emitir a la DGII…'}
              </button>
            )}
            {fase.t === 'previa' ? (
              <button type="button" className={s.secundario} onClick={() => entrada.current?.click()}>Elegir otro archivo</button>
            ) : (
              <button type="submit" className={s.primario} disabled={ocupado}>
                {ocupado ? <><Loader2 size={15} className={s.girar} aria-hidden /> Un momento…</> : def.boton}
              </button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
