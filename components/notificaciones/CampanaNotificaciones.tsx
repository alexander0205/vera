'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate as mutarGlobal } from 'swr';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Popover from '@mui/material/Popover';
import { AlertTriangle, Bell, BellOff, BellRing, CheckCheck, CreditCard, ListChecks, Loader2, Receipt } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { tiposVisibles } from '@/lib/notificaciones/tipos';
import { cuandoLlego } from '@/lib/notificaciones/texto';
import { base64UrlABytes } from '@/lib/notificaciones/base64';

/**
 * La campana de arriba, junto a «Asistencia»: los pagos que acaban de llegar —un
 * comprobante que subió una familia, un pago con tarjeta— para no tener que
 * entrar a «Pagos» a ver si hay algo, y lo que pasa en las tareas por revisar de
 * quien mira (le respondieron, le subieron un archivo). Cada renglón lleva
 * directo a donde se encuentra ese pago o esa tarea.
 *
 * Abajo, «Activar avisos en este dispositivo» suscribe el navegador a los avisos
 * push: el pago suena en el celular aunque Zero esté cerrado. Es opcional y por
 * dispositivo; si el servidor no tiene las llaves VAPID, el botón no aparece.
 *
 * No se sondea con un reloj, igual que `CampanaTareas`: se pide al entrar, al
 * volver a la pestaña y al abrir la campana. Un sondeo en cada pestaña abierta
 * fue en su día la mayoría de las peticiones del sistema; el push existe
 * justamente para que no haga falta preguntar.
 *
 * Solo se monta, y solo pide algo, para quien tiene permiso sobre algún tipo de
 * aviso (ver `PERMISOS_POR_TIPO`): al resto le sobraría una consulta para
 * enseñarle un cero.
 */

export const CLAVE_NOTIFICACIONES = '/api/notificaciones';
export const refrescarNotificaciones = () => { void mutarGlobal(CLAVE_NOTIFICACIONES); };

interface Item {
  id: number;
  tipo: string;
  titulo: string;
  detalle: string | null;
  enlace: string;
  creadoEn: string;
  noLeida: boolean;
}
interface Respuesta { items: Item[]; noLeidas: number; puede?: boolean; hayMas?: boolean }

const VACIA: Respuesta = { items: [], noLeidas: 0 };
const traer = (url: string): Promise<Respuesta> =>
  fetch(url).then((r) => (r.ok ? r.json() : VACIA)).catch(() => VACIA);

/** Cómo está el push en ESTE dispositivo. */
type EstadoPush =
  | 'sin-mirar'      // todavía no se abrió la campana
  | 'no-disponible'  // el servidor no tiene llaves VAPID: el botón no se muestra
  | 'no-soportado'   // el navegador no sabe de push
  | 'bloqueado'      // la persona negó el permiso
  | 'inactivo'
  | 'activo'
  | 'trabajando';

const admitePush = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registro(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration('/');
}

/** Le dice al servidor que este dispositivo es de quien tiene la sesión ahora. */
async function guardarSuscripcion(sub: PushSubscription): Promise<boolean> {
  const j = sub.toJSON();
  const r = await fetch('/api/notificaciones/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
  });
  return r.ok;
}

/**
 * Cómo se reconoce cada tipo de un vistazo, como en Facebook: un círculo de
 * color con su ícono y una etiqueta. Un comprobante es un pago que espera
 * aprobación y lleva a esa pantalla; una tarea lleva a su conversación.
 */
const TIPO: Record<string, { icono: typeof Receipt; etiqueta: string; circulo: string; etiquetaClase: string }> = {
  comprobante: { icono: Receipt, etiqueta: 'Pago por aprobar', circulo: 'bg-amber-100 text-amber-700', etiquetaClase: 'bg-amber-50 text-amber-800' },
  pago_en_linea: { icono: CreditCard, etiqueta: 'Pago con tarjeta', circulo: 'bg-emerald-100 text-emerald-700', etiquetaClase: 'bg-emerald-50 text-emerald-800' },
  tarea: { icono: ListChecks, etiqueta: 'Tarea', circulo: 'bg-violet-100 text-violet-700', etiquetaClase: 'bg-violet-50 text-violet-800' },
};
const TIPO_OTRO = { icono: Bell, etiqueta: 'Aviso', circulo: 'bg-gray-100 text-gray-600', etiquetaClase: 'bg-gray-100 text-gray-700' };
/** Una tarea con 24 horas sin respuesta (cron `escolar-tareas`): en rojo, que no pase por una más. */
const URGENTE = { icono: AlertTriangle, etiqueta: 'Urgente', circulo: 'bg-red-100 text-red-700', etiquetaClase: 'bg-red-50 text-red-800' };

/**
 * `personales`: en Gobernanza a cualquiera le pueden llegar avisos de sus
 * tareas por revisar, así que ahí la campana va para todos. En Facturación solo
 * para quien recibe pagos.
 */
export function CampanaNotificaciones({ personales = false }: { personales?: boolean }) {
  const { permissions } = usePermissions();
  const puede = personales || tiposVisibles(permissions).length > 0;

  const { data, mutate } = useSWR<Respuesta>(puede ? CLAVE_NOTIFICACIONES : null, traer, { revalidateOnFocus: true });
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  // Los que estaban sin leer al abrir: se siguen marcando mientras el menú está
  // abierto aunque ya se hayan dado por leídos en el servidor.
  const [recientes, setRecientes] = useState<Set<number>>(new Set());
  const [push, setPush] = useState<EstadoPush>('sin-mirar');
  const clavePush = useRef<string | null>(null);
  const yaMiro = useRef(false);

  // Lo que se va cargando con «Ver anteriores»: el historial no tiene tope.
  const [anteriores, setAnteriores] = useState<Item[]>([]);
  const [hayMasAnteriores, setHayMasAnteriores] = useState<boolean | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'no-leidas'>('todas');

  const noLeidas = data?.noLeidas ?? 0;
  const primeras = data?.items ?? [];
  const vistos = new Set(primeras.map((i) => i.id));
  const todas = [...primeras, ...anteriores.filter((i) => !vistos.has(i.id))];
  const items = filtro === 'no-leidas' ? todas.filter((i) => recientes.has(i.id) || i.noLeida) : todas;
  const hayMas = hayMasAnteriores ?? data?.hayMas ?? false;

  async function verAnteriores() {
    const ultimo = todas[todas.length - 1];
    if (!ultimo) return;
    setCargandoMas(true);
    try {
      const r = await traer(`${CLAVE_NOTIFICACIONES}?antes=${ultimo.id}`);
      setAnteriores((a) => [...a, ...r.items]);
      setHayMasAnteriores(r.hayMas ?? false);
    } finally { setCargandoMas(false); }
  }

  /** Mira el estado del push en este dispositivo. Una vez por sesión de la pestaña. */
  const mirarPush = useCallback(async () => {
    if (yaMiro.current) return;
    yaMiro.current = true;
    try {
      const r = await fetch('/api/notificaciones/push');
      const { publicKey } = r.ok ? await r.json() : { publicKey: null };
      clavePush.current = publicKey ?? null;
      if (!publicKey) { setPush('no-disponible'); return; }
      if (!admitePush()) { setPush('no-soportado'); return; }
      if (Notification.permission === 'denied') { setPush('bloqueado'); return; }

      const reg = await registro();
      const sub = await reg?.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        // Ya estaba activado: se confirma al servidor por si en este dispositivo
        // entró otra persona o cambió de empresa desde la última vez.
        await guardarSuscripcion(sub).catch(() => {});
        setPush('activo');
      } else {
        setPush('inactivo');
      }
    } catch {
      setPush('inactivo');
    }
  }, []);

  async function abrir(e: React.MouseEvent<HTMLElement>) {
    const boton = e.currentTarget;
    setAncla(boton);
    void mirarPush();
    // Al abrir se pide la lista fresca: es el momento en que se mira.
    const fresco = await mutate();
    if (!fresco) return;
    setRecientes(new Set(fresco.items.filter((i) => i.noLeida).map((i) => i.id)));
    if (fresco.noLeidas > 0) {
      void fetch('/api/notificaciones/leidas', { method: 'POST' }).then((r) => {
        if (r.ok) {
          void mutate({ ...fresco, noLeidas: 0, items: fresco.items.map((i) => ({ ...i, noLeida: false })) }, { revalidate: false });
        }
      }).catch(() => {});
    }
  }

  async function activar() {
    const clave = clavePush.current;
    if (!clave || !admitePush()) return;
    setPush('trabajando');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') { setPush(permiso === 'denied' ? 'bloqueado' : 'inactivo'); return; }

      await navigator.serviceWorker.register('/sw-avisos.js', { scope: '/' });
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(clave) });
      setPush((await guardarSuscripcion(sub)) ? 'activo' : 'inactivo');
    } catch {
      setPush('inactivo');
    }
  }

  async function desactivar() {
    setPush('trabajando');
    try {
      const reg = await registro();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/notificaciones/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setPush('inactivo');
    } catch {
      setPush('activo');
    }
  }

  if (!puede) return null;

  const titulo = noLeidas === 0
    ? 'Notificaciones'
    : `${noLeidas} ${noLeidas === 1 ? 'notificación nueva' : 'notificaciones nuevas'}`;
  const cerrar = () => { setAncla(null); setFiltro('todas'); };

  return (
    <>
      <Tooltip title={ancla ? '' : titulo} placement="bottom">
        <IconButton onClick={abrir} size="small" aria-label={titulo} aria-haspopup="dialog" aria-expanded={Boolean(ancla)}
          sx={{ position: 'relative', color: noLeidas > 0 ? '#dc2626' : 'text.secondary' }}>
          <Bell style={{ width: 20, height: 20 }} />
          {noLeidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums ring-2 ring-white">
              {noLeidas > 99 ? '99+' : noLeidas}
            </span>
          )}
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(ancla)}
        anchorEl={ancla}
        onClose={cerrar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: {
          width: 400, maxWidth: 'calc(100vw - 16px)', mt: 1, borderRadius: '16px', overflow: 'hidden',
          border: '1px solid #e5e7eb', boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.06)',
        } } }}
      >
        <div role="dialog" aria-label="Notificaciones" className="flex max-h-[min(640px,calc(100vh-96px))] flex-col bg-white">
          <div className="border-b border-gray-100 px-4 pb-2.5 pt-3.5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-gray-900">Notificaciones</p>
              {recientes.size > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-zero-700">
                  <CheckCheck className="h-3.5 w-3.5" />Marcadas como leídas
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-1.5" role="tablist">
              {([['todas', 'Todas'], ['no-leidas', `No leídas${recientes.size ? ` · ${recientes.size}` : ''}`]] as const).map(([id, texto]) => (
                <button key={id} type="button" role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)}
                  className={`h-8 rounded-full px-3 text-sm font-semibold transition-colors ${
                    filtro === id ? 'bg-zero-50 text-zero-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {texto}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
            {items.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <Bell className="h-6 w-6 text-gray-400" />
                </span>
                <p className="text-sm font-semibold text-gray-900">
                  {filtro === 'no-leidas' ? 'No tienes notificaciones sin leer' : 'Nada nuevo por ahora'}
                </p>
                <p className="mx-auto mt-1 max-w-[260px] text-xs text-gray-500">
                  Aquí llegan los pagos que mandan las familias y lo que pasa en tus tareas.
                </p>
              </div>
            ) : items.map((i) => {
              const t = i.titulo.startsWith('URGENTE') ? URGENTE : (TIPO[i.tipo] ?? TIPO_OTRO);
              const Icono = t.icono;
              const nuevo = recientes.has(i.id) || i.noLeida;
              return (
                <Link key={i.id} href={i.enlace} onClick={cerrar}
                  className={`group relative flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors ${
                    nuevo ? 'bg-zero-50/60 hover:bg-zero-50' : 'hover:bg-gray-50'}`}>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${t.circulo}`}>
                    <Icono className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 pr-4">
                    <span className={`block text-sm leading-snug ${nuevo ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                      {i.titulo}
                    </span>
                    {i.detalle && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-gray-600">{i.detalle}</span>}
                    <span className="mt-1 flex items-center gap-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${t.etiquetaClase}`}>{t.etiqueta}</span>
                      <span className={`tabular-nums ${nuevo ? 'font-semibold text-zero-700' : 'text-gray-500'}`}>{cuandoLlego(i.creadoEn)}</span>
                    </span>
                  </span>
                  {nuevo && <span className="absolute right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-zero-600" aria-label="Sin leer" />}
                </Link>
              );
            })}
            {filtro === 'todas' && hayMas && (
              <button type="button" onClick={() => void verAnteriores()} disabled={cargandoMas}
                className="my-1.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-800 hover:bg-gray-200 disabled:opacity-60">
                {cargandoMas && <Loader2 className="h-4 w-4 animate-spin" />}Ver anteriores
              </button>
            )}
          </div>

          {push !== 'sin-mirar' && push !== 'no-disponible' && (
            <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
              {push === 'activo' ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <BellRing className="h-4 w-4" /> Avisos activados en este dispositivo
                  </span>
                  <button type="button" onClick={desactivar}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900">
                    <BellOff className="h-3.5 w-3.5" /> Desactivar
                  </button>
                </div>
              ) : push === 'bloqueado' ? (
                <p className="text-xs text-gray-500">
                  Los avisos están bloqueados en este navegador. Permítelos desde la configuración del sitio y vuelve a abrir esta campana.
                </p>
              ) : push === 'no-soportado' ? (
                <p className="text-xs text-gray-500">
                  Este navegador no admite avisos. En iPhone, agrega Zero a la pantalla de inicio y actívalos desde allí.
                </p>
              ) : (
                <button type="button" onClick={activar} disabled={push === 'trabajando'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60">
                  <BellRing className="h-4 w-4" />
                  {push === 'trabajando' ? 'Un momento…' : 'Recibir avisos en este dispositivo'}
                </button>
              )}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
