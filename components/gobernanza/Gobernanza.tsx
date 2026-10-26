'use client';

/**
 * Mostrar u ocultar por rol las pantallas de Gobernanza (colegio) y de
 * Facturación. Catálogo en lib/config/pantallas.ts.
 *
 *  - `PantallasDelRol`     → el bloque «Pantallas» dentro del editor de un rol
 *    (Roles y permisos → el rol): por módulo y sección, con «Todas» / «Ninguna».
 *  - `AtajoPantallaRoles`  → el atajo Alt+Shift+R en cualquier módulo: «elige
 *    una pantalla → qué roles la ven». Es la misma información vista por
 *    pantalla en vez de por rol. Solo lo monta quien gestiona el equipo.
 *  - `GuardPantalla`       → si la pantalla en la que se está quedó oculta para
 *    el rol, enseña «no está disponible para ti». Cubre también la llegada por URL.
 *
 * El menú se filtra por lo mismo (server en /escolar, /api/user en
 * Facturación). Tras cada cambio se refresca la ruta y se vuelve a pedir
 * /api/user para que lo tome al momento.
 *
 * Una pantalla oculta no se puede abrir: además de este aviso en el cliente, el
 * proxy no la sirve (lib/auth/pantallas-proxy.ts).
 */

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR, { mutate as mutarGlobal } from 'swr';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';
import ButtonBase from '@mui/material/ButtonBase';
import { Lock, ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/hooks/usePermissions';
import {
  MODULOS_PANTALLAS, agruparPantallas, pantallaDeRuta, primeraVisible, veLaPantalla,
  type ModuloId, type PantallaDef,
} from '@/lib/config/pantallas';

interface RolPantallas { id: number; key: string; label: string; ocultas: string[] }
interface Datos { pantallas: PantallaDef[]; roles: RolPantallas[] }

const URL_API = '/api/equipo/pantallas';
const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

/** Lee las pantallas por rol y devuelve con qué cambiarlas. */
function usePantallasPorRol(activo = true) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<Datos>(activo ? URL_API : null, fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);

  const fijar = useCallback(async (rol: RolPantallas, ids: string[], visible: boolean) => {
    if (!ids.length) return;
    setGuardando(`${rol.id}:${ids.join(',')}`);
    // Optimista: el interruptor responde ya; si el servidor dice que no, se revierte.
    const ocultas = visible
      ? rol.ocultas.filter(p => !ids.includes(p))
      : [...new Set([...rol.ocultas, ...ids])];
    mutate(d => d && { ...d, roles: d.roles.map(r => (r.id === rol.id ? { ...r, ocultas } : r)) }, false);
    try {
      const res = await fetch(URL_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: rol.id, pantalla: ids, visible }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo guardar');
      router.refresh();
      // El menú de Facturación y de los demás módulos sale de /api/user (con y
      // sin clave propia): sin esto seguía igual hasta recargar la página.
      void mutarGlobal(k => k === '/api/user' || (Array.isArray(k) && k[0] === '/api/user'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(null);
      mutate();
    }
  }, [mutate, router]);

  return { data, error, isLoading, fijar, guardando, reintentar: () => mutate() };
}

// ─── Bloqueo ──────────────────────────────────────────────────────────────────

export function GuardPantalla({ ocultas, inicio, puede, children }: {
  ocultas: string[];
  inicio?: string;
  /** Si se sabe, qué rutas deja abrir el permiso: el «Ir a…» no manda a otra pared. */
  puede?: (href: string) => boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const pantalla = ocultas.length ? pantallaDeRuta(pathname, inicio) : null;
  const oculta = !!pantalla && ocultas.includes(pantalla.id);
  // Adónde puede ir: la primera pantalla del mismo módulo que sí ve.
  const alternativa = oculta ? primeraVisible(pantalla.modulo, ocultas, puede) : null;
  // La portada (a donde se entra, o se rebota por permisos) no se queda en el
  // aviso: quien entra a Facturación sin Dashboard va directo a lo que ve.
  const seguir = oculta && pantalla.portada && alternativa ? alternativa.href : null;

  useEffect(() => {
    if (seguir) router.replace(seguir);
  }, [seguir, router]);

  if (!oculta) return <>{children}</>;
  if (seguir) return null;
  return <AvisoPantallaOculta pantalla={pantalla} alternativa={alternativa} />;
}

/**
 * Lo que ve quien llega a una pantalla que su empresa no le puso en el menú.
 * Lo pinta `GuardPantalla` en el cliente y, antes, la página `pantalla-oculta`
 * que el proxy sirve en lugar de la pantalla (ver lib/auth/pantallas-proxy.ts):
 * el mismo aviso por las dos puertas.
 *
 * El tono importa: «no está disponible para ti» con un candado en ámbar se leía
 * como un rechazo a la persona. Esto es organización del trabajo, y se dice así,
 * sin candado ni color de alerta.
 */
export function AvisoPantallaOculta({ pantalla, alternativa }: {
  pantalla: Pick<PantallaDef, 'label'>;
  alternativa: Pick<PantallaDef, 'label' | 'href'> | null;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: 2, sm: 6 } }}>
      <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', bgcolor: '#eef2fe', color: '#3658e1', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <LayoutGrid size={22} aria-hidden />
        </Box>
        <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: '#111827' }}>
          Esta pantalla no está en tu menú
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: '#6b7280' }}>
          Cada persona ve las pantallas que usa en su trabajo. Si necesitas «{pantalla.label}»,
          pide al administrador de la empresa que te la active.
        </Typography>
        {alternativa && (
          <Box sx={{ mt: 3 }}>
            <Button asChild variant="outline" size="sm">
              <Link href={alternativa.href}>Ir a {alternativa.label}</Link>
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ─── Interruptor de una pantalla para un rol ─────────────────────────────────

function Interruptor({ visible, disabled, etiqueta, onChange }: {
  visible: boolean;
  disabled?: boolean;
  etiqueta: string;
  onChange: (visible: boolean) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Typography sx={{ fontSize: '0.75rem', color: visible ? '#047857' : '#6b7280', fontWeight: 500, width: 50, textAlign: 'right' }}>
        {visible ? 'La ve' : 'Oculta'}
      </Typography>
      <Switch
        size="small"
        checked={visible}
        disabled={disabled}
        onChange={(_, v) => onChange(v)}
        slotProps={{ input: { 'aria-label': etiqueta } }}
      />
    </Box>
  );
}

// ─── Dentro del editor de un rol ──────────────────────────────────────────────

/**
 * Las pantallas que este rol ve, por módulo y sección, con un interruptor cada
 * una. Solo las de los módulos que tiene la empresa. Cambia al instante (no
 * pasa por «Guardar cambios», que es de los permisos), y lo dice.
 */
export function PantallasDelRol({ roleId }: { roleId: number }) {
  const { modules } = usePermissions();
  const { data, isLoading, fijar, guardando } = usePantallasPorRol();
  const rol = data?.roles.find(r => r.id === roleId);
  const modulos = MODULOS_PANTALLAS.filter(m => (modules as string[]).includes(m.id));
  if (isLoading || !rol || modulos.length === 0) return null;

  const esOwner = rol.key === 'owner';
  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6' }}>
        <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
          Pantallas
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
          Muestra u oculta pantallas para este rol. Una pantalla oculta sale del menú y no se puede
          abrir ni escribiendo su dirección. Se aplica en unos segundos.
        </Typography>
      </Box>
      {modulos.map((m, i) => (
        <SeccionModulo
          key={m.id}
          moduloId={m.id}
          etiqueta={m.label}
          pantallas={(data?.pantallas ?? []).filter(p => p.modulo === m.id)}
          rol={rol}
          esOwner={esOwner}
          guardando={guardando}
          primero={i === 0}
          onFijar={(ids, v) => fijar(rol, ids, v)}
        />
      ))}
      {esOwner && (
        <Box sx={{ px: 2, py: 1, borderTop: '1px solid #f3f4f6', fontSize: '0.75rem', color: '#6b7280' }}>
          El Propietario siempre ve todas las pantallas.
        </Box>
      )}
    </Paper>
  );
}

function SeccionModulo({ moduloId, etiqueta, pantallas, rol, esOwner, guardando, primero, onFijar }: {
  moduloId: ModuloId;
  etiqueta: string;
  pantallas: PantallaDef[];
  rol: RolPantallas;
  esOwner: boolean;
  guardando: string | null;
  primero: boolean;
  onFijar: (ids: string[], visible: boolean) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const idPanel = useId();
  const ids = pantallas.map(p => p.id);
  const visibles = pantallas.filter(p => veLaPantalla(rol, p.id)).length;
  const ocupado = guardando !== null;

  return (
    <Box sx={{ borderTop: primero ? 'none' : '1px solid #f3f4f6' }}>
      <ButtonBase
        onClick={() => setAbierta(a => !a)}
        aria-expanded={abierta}
        aria-controls={idPanel}
        sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 1, px: 2, py: 1.25, textAlign: 'left', '&:hover': { bgcolor: '#f9fafb' } }}
      >
        {abierta ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <Typography component="span" sx={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
          {etiqueta}
        </Typography>
        <Typography component="span" sx={{ fontSize: '0.8125rem', color: visibles === pantallas.length ? '#6b7280' : '#92400e', fontWeight: 500 }}>
          {esOwner ? 'Todas' : `Ve ${visibles} de ${pantallas.length}`}
        </Typography>
      </ButtonBase>

      {abierta && (
        <Box id={idPanel} sx={{ pb: 1 }}>
          {!esOwner && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 2, pb: 0.5 }}>
              <Button variant="outline" size="sm" disabled={ocupado || visibles === pantallas.length} onClick={() => onFijar(ids, true)}>
                Mostrar todas
              </Button>
              <Button variant="outline" size="sm" disabled={ocupado || visibles === 0} onClick={() => onFijar(ids, false)}>
                Ocultar todas
              </Button>
            </Box>
          )}
          {agruparPantallas(pantallas).map(g => (
            <Box key={g.nombre ?? moduloId}>
              {g.nombre && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1, pb: 0.25 }}>
                  <Typography component="h3" sx={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>
                    {g.nombre}
                  </Typography>
                  {!esOwner && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <ButtonBase disabled={ocupado} onClick={() => onFijar(g.items.map(p => p.id), true)} aria-label={`Mostrar todas las pantallas de ${g.nombre}`}
                        sx={{ px: 0.75, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#2a45c4', '&:hover': { bgcolor: '#eef2fe' } }}>
                        Todas
                      </ButtonBase>
                      <ButtonBase disabled={ocupado} onClick={() => onFijar(g.items.map(p => p.id), false)} aria-label={`Ocultar todas las pantallas de ${g.nombre}`}
                        sx={{ px: 0.75, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', '&:hover': { bgcolor: '#f1f5f9' } }}>
                        Ninguna
                      </ButtonBase>
                    </Box>
                  )}
                </Box>
              )}
              {g.items.map(p => (
                <Box
                  key={p.id}
                  component="label"
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 0.75,
                    cursor: esOwner ? 'default' : 'pointer',
                    '&:hover': esOwner ? undefined : { bgcolor: '#f9fafb' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{p.label}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{p.descripcion}</Typography>
                    {p.aviso && !veLaPantalla(rol, p.id) && (
                      <Typography sx={{ mt: 0.25, fontSize: '0.75rem', color: '#92400e' }}>{p.aviso}</Typography>
                    )}
                  </Box>
                  <Interruptor
                    visible={veLaPantalla(rol, p.id)}
                    disabled={esOwner || guardando === `${rol.id}:${p.id}`}
                    etiqueta={`${p.label} (${etiqueta})`}
                    onChange={v => onFijar([p.id], v)}
                  />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Comando global ───────────────────────────────────────────────────────────

/** `e.code` y no `e.key`: con Alt, en Mac la R escribe «®» y en otros teclados cambia. */
function esAtajo(e: KeyboardEvent) {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR';
}

/**
 * El comando: **Alt+Shift+R** en CUALQUIER pantalla de cualquier módulo. Se elige una pantalla (la del sitio
 * donde estás sale ya elegida) y se ve qué roles la ven. Solo lo monta quien
 * gestiona el equipo (ModuleShell y el layout de Facturación).
 */
export function AtajoPantallaRoles({ inicio }: { inicio?: string } = {}) {
  const pathname = usePathname();
  const { modules } = usePermissions();
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const { data, error, isLoading, fijar, guardando, reintentar } = usePantallasPorRol(abierto);
  const aqui = pantallaDeRuta(pathname, inicio);
  const idSelect = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!esAtajo(e)) return;
      e.preventDefault();
      // Con la tecla sostenida el navegador repite el evento: abría y cerraba.
      if (e.repeat) return;
      setAbierto(a => !a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Al abrir, la pantalla de este sitio sale elegida; si este sitio no se puede
  // ocultar (Usuarios, Roles…), no sale ninguna: elegir una al azar engaña.
  useEffect(() => {
    if (abierto) setElegida(aqui?.id ?? null);
  }, [abierto, aqui]);

  // Solo las de los módulos de la empresa; mientras cargan, todas.
  const pantallas = (data?.pantallas ?? []).filter(p => modules.length === 0 || (modules as string[]).includes(p.modulo));
  const actual = pantallas.find(p => p.id === elegida);

  return (
    <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="xs" aria-labelledby="atajo-pantalla-titulo">
      <DialogTitle id="atajo-pantalla-titulo" sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          Mostrar u ocultar pantallas por rol
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', fontWeight: 400 }}>
          Elige una pantalla y apágala para los roles que no deben entrar. Sale del menú y no se puede
          abrir ni por su dirección. Se aplica en unos segundos.
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && !data ? (
          <Box sx={{ py: 2.5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: '#b91c1c' }}>No se pudieron cargar las pantallas.</Typography>
            <Box sx={{ mt: 1.5 }}>
              <Button variant="outline" size="sm" onClick={() => reintentar()}>Reintentar</Button>
            </Box>
          </Box>
        ) : isLoading || !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3, color: '#6b7280' }}>
            <CircularProgress size={18} color="inherit" />
          </Box>
        ) : (
          <>
            <Box component="label" htmlFor={idSelect} sx={{ display: 'block', mt: 1, mb: 0.5, fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
              Pantalla
            </Box>
            <Box
              component="select"
              id={idSelect}
              value={actual?.id ?? ''}
              onChange={e => setElegida(e.target.value || null)}
              sx={{ width: '100%', height: 38, px: 1, borderRadius: '8px', border: '1px solid #d1d5db', bgcolor: '#fff', fontSize: '0.875rem', color: '#111827', '&:focus': { outline: '2px solid #3658e1', outlineOffset: 1 } }}
            >
              <option value="" disabled>Elige una pantalla…</option>
              {MODULOS_PANTALLAS.filter(m => pantallas.some(p => p.modulo === m.id)).map(m => (
                <optgroup key={m.id} label={m.label}>
                  {pantallas.filter(p => p.modulo === m.id).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.grupo ? `${p.grupo} · ` : ''}{p.label}{p.id === aqui?.id ? '  (estás aquí)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Box>
            <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#6b7280' }}>
              {actual
                ? actual.descripcion
                : aqui
                  ? ''
                  : 'Esta pantalla no se puede ocultar (Usuarios y Roles siempre se ven). Elige otra de la lista.'}
            </Typography>
            {actual?.aviso && (
              <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#92400e' }}>{actual.aviso}</Typography>
            )}

            {actual && <Box sx={{ mt: 1.5 }}>
              {data.roles.map(rol => {
                const esOwner = rol.key === 'owner';
                return (
                  <Box key={rol.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #f9fafb' }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>{rol.label}</Typography>
                      {esOwner && <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Siempre ve todo</Typography>}
                    </Box>
                    {esOwner ? (
                      <Lock size={15} style={{ color: '#6b7280' }} aria-label="Siempre la ve" />
                    ) : (
                      <Interruptor
                        visible={veLaPantalla(rol, actual.id)}
                        disabled={guardando === `${rol.id}:${actual.id}`}
                        etiqueta={`${rol.label} ve ${actual.label} (${actual.moduloLabel})`}
                        onChange={v => fijar(rol, [actual.id], v)}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>}
          </>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Alt + Shift + R, desde cualquier pantalla</Typography>
          <Link
            href="/cuenta/roles"
            onClick={() => setAbierto(false)}
            style={{ fontSize: '0.8125rem', color: '#3658e1', fontWeight: 500 }}
          >
            Roles y permisos →
          </Link>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
