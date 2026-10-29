'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate as mutarGlobal } from 'swr';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Bell, BellOff, BellRing, CreditCard, ListChecks, Receipt } from 'lucide-react';
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
interface Respuesta { items: Item[]; noLeidas: number; puede?: boolean }

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

const ICONO: Record<string, typeof Receipt> = { comprobante: Receipt, pago_en_linea: CreditCard, tarea: ListChecks };

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

  const noLeidas = data?.noLeidas ?? 0;
  const items = data?.items ?? [];

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

  return (
    <>
      <Tooltip title={ancla ? '' : titulo} placement="bottom">
        <IconButton onClick={abrir} size="small" aria-label={titulo} aria-haspopup="true" aria-expanded={Boolean(ancla)}
          sx={{ position: 'relative', color: noLeidas > 0 ? '#dc2626' : 'text.secondary' }}>
          <Bell style={{ width: 20, height: 20 }} />
          {noLeidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
              {noLeidas > 99 ? '99+' : noLeidas}
            </span>
          )}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={ancla}
        open={Boolean(ancla)}
        onClose={() => setAncla(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 24px)', mt: 0.5, borderRadius: '12px' } }, list: { sx: { p: 0 } } }}
      >
        <div className="border-b border-gray-100 px-4 py-3" role="presentation">
          <p className="text-sm font-semibold text-gray-900">Notificaciones</p>
        </div>

        <div className="max-h-[420px] overflow-y-auto" role="presentation">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center" role="presentation">
              <Bell className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">Nada nuevo por ahora</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Aquí llegan los pagos de las familias y las respuestas en tus tareas por revisar.
              </p>
            </div>
          ) : items.map((i) => {
            const Icono = ICONO[i.tipo] ?? Receipt;
            const nuevo = recientes.has(i.id);
            return (
              <MenuItem key={i.id} component={Link} href={i.enlace} onClick={() => setAncla(null)}
                sx={{ alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.25, whiteSpace: 'normal', borderBottom: '1px solid #f3f4f6', bgcolor: nuevo ? '#eff6ff' : undefined }}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${i.tipo === 'comprobante' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  <Icono className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">{i.titulo}</span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-500">{cuandoLlego(i.creadoEn)}</span>
                  </span>
                  {i.detalle && <span className="mt-0.5 block text-xs text-gray-600">{i.detalle}</span>}
                </span>
                {nuevo && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Nuevo" />}
              </MenuItem>
            );
          })}
        </div>

        {push !== 'sin-mirar' && push !== 'no-disponible' && (
          <div className="border-t border-gray-100 px-4 py-3" role="presentation">
            {push === 'activo' ? (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <BellRing className="h-4 w-4" /> Avisos activados
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
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60">
                <BellRing className="h-4 w-4" />
                {push === 'trabajando' ? 'Un momento…' : 'Activar avisos en este dispositivo'}
              </button>
            )}
          </div>
        )}
      </Menu>
    </>
  );
}
