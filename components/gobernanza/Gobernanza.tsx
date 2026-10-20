'use client';

/**
 * Gobernanza por rol: qué módulos, qué pantallas y qué acciones tiene cada rol.
 * Se gobierna igual en cada módulo (Colegio, Facturación…): ENTRA, VE y HACE.
 * El catálogo de módulos vive en lib/config/pantallas.ts.
 *
 *  - `ModuloDelRol`        → la tarjeta de UN módulo dentro del editor de un rol
 *    (Equipo → Permisos → el rol): entra o no, qué pantallas ve y qué puede
 *    hacer. Todo se guarda al instante.
 *  - `MatrizPantallas`     → vista general pantallas × roles, un módulo a la vez.
 *  - `AtajoPantallaRoles`  → Alt+Shift+R abre, sobre la pantalla en la que se
 *    está, la lista de roles con un interruptor cada uno. Solo lo monta el
 *    layout para quien gestiona el equipo.
 *  - `GuardPantalla`       → si la pantalla en la que se está quedó apagada
 *    para el rol, enseña «no está disponible para ti». Cubre la llegada por URL.
 *
 * Detrás hay dos mecanismos que el usuario no tiene que distinguir: una lista
 * de pantallas apagadas por rol y los permisos de siempre. Hay pantallas que ya
 * las manda un permiso (`permiso` en el catálogo): apagarlas es quitárselo.
 *
 * El menú se filtra por lo mismo (server en /escolar, /api/user en
 * Facturación). Tras cada cambio se refresca la ruta para que lo tomen al
 * momento.
 */

import { useCallback, useEffect, useId, useRef, useState, type ElementType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
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
import {
  Lock, LayoutDashboard, ClipboardList, Users, FileText, Contact, Wallet, BellRing,
  Settings, GraduationCap, Eye, EyeOff, DoorOpen, Pencil, Banknote, Package,
  ShoppingCart, FileSearch, BarChart3, Receipt, FilePlus, Ban, Send, Download, CircleCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MODULOS, PANTALLAS, entraAlModulo, pantallaDeRuta, veLaPantalla,
  type ModuloDef, type ModuloId, type PantallaDef,
} from '@/lib/config/pantallas';

export interface RolGobernanza {
  id: number;
  key: string;
  label: string;
  ocultas: string[];
  /** Los permisos de la gobernanza que tiene el rol. */
  permisos: string[];
}
export interface DatosGobernanza { modulos: ModuloDef[]; roles: RolGobernanza[] }

const AZUL = '#3658e1';
const AZUL_OSCURO = '#2a45c4';
const AZUL_SUAVE = '#eef2fe';

const URL_API = '/api/equipo/pantallas';
const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r)));

const ICONOS: Record<string, ElementType> = {
  'escolar-panorama': LayoutDashboard,
  'escolar-matriculas': ClipboardList,
  'escolar-estudiantes': Users,
  'escolar-documentos': FileText,
  'escolar-responsables': Contact,
  'escolar-pagos': Wallet,
  'escolar-avisos': BellRing,
  'escolar-configuracion': Settings,
  'fact-dashboard': LayoutDashboard,
  'fact-contactos': Users,
  'fact-ingresos': FileText,
  'fact-inventario': Package,
  'fact-compras': ShoppingCart,
  'fact-caja': Wallet,
  'fact-comprobantes': FileSearch,
  'fact-reportes': BarChart3,
  'fact-configuracion': Settings,
};

const ICONOS_ACCION: Record<string, ElementType> = {
  'administracion-escolar:gestionar': Pencil,
  'administracion-escolar:pagos': Banknote,
  'facturas:crear': FilePlus,
  'facturas:editar': Pencil,
  'facturas:anular': Ban,
  'facturas:emitir-dgii': Send,
  'pagos:registrar': Banknote,
  'facturas:exportar': Download,
  'clientes:gestionar': Users,
  'productos:gestionar': Package,
};

const ICONO_MODULO: Record<ModuloId, ElementType> = { escolar: GraduationCap, facturacion: Receipt };
const ENTRA: Record<ModuloId, string> = { escolar: 'Entra al colegio', facturacion: 'Entra a Facturación' };

type EstadoGuardar = 'reposo' | 'guardando' | 'guardado';

/**
 * «Guardando… / Guardado» junto al título. `role="status"` lo anuncia a los
 * lectores de pantalla sin quitarle el foco a quien está tocando interruptores.
 */
function EstadoGuardado({ estado }: { estado: EstadoGuardar }) {
  return (
    <Typography
      role="status"
      aria-live="polite"
      sx={{ fontSize: '0.75rem', fontWeight: 500, color: estado === 'guardado' ? '#047857' : '#6b7280', minWidth: 72, textAlign: 'right' }}
    >
      {estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? '✓ Guardado' : ''}
    </Typography>
  );
}

/** Cuántas pantallas del módulo ve el rol. */
export function pantallasVisibles(rol: RolGobernanza, modulo: ModuloDef) {
  return modulo.pantallas.filter(p => veLaPantalla(rol, p)).length;
}

/** Cuántas acciones del módulo puede hacer el rol. */
export function accionesActivas(rol: RolGobernanza, modulo: ModuloDef) {
  return rol.key === 'owner'
    ? modulo.acciones.length
    : modulo.acciones.filter(a => rol.permisos.includes(a.permiso)).length;
}

/**
 * Lee la gobernanza por rol y devuelve con qué cambiarla.
 *
 * `onPermisos` avisa de los permisos que cambiaron: el editor del rol guarda
 * su propia copia de los permisos hasta «Guardar cambios», y sin el aviso
 * ese guardado deshacería lo que aquí ya se aplicó.
 */
export function useGobernanza(
  activo = true,
  onPermisos?: (permisos: string[], activo: boolean) => void,
) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<DatosGobernanza>(activo ? URL_API : null, fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);
  // «Guardando… / Guardado»: como todo se guarda al instante, hay que decirlo,
  // y decirlo también a quien no ve la pantalla (ver `EstadoGuardado`).
  const [estado, setEstado] = useState<EstadoGuardar>('reposo');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Optimista: el interruptor responde ya; si el servidor dice que no, se revierte. */
  const aplicar = useCallback(async (
    rol: RolGobernanza,
    clave: string,
    cambio: (r: RolGobernanza) => RolGobernanza,
    body: Record<string, unknown>,
    permisosCambiados?: { permisos: string[]; activo: boolean },
  ) => {
    setGuardando(`${rol.id}:${clave}`);
    setEstado('guardando');
    if (temporizador.current) clearTimeout(temporizador.current);
    mutate(d => d && { ...d, roles: d.roles.map(r => (r.id === rol.id ? cambio(r) : r)) }, false);
    try {
      const res = await fetch(URL_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: rol.id, ...body }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo guardar');
      if (permisosCambiados) onPermisos?.(permisosCambiados.permisos, permisosCambiados.activo);
      router.refresh();
      setEstado('guardado');
      temporizador.current = setTimeout(() => setEstado('reposo'), 2500);
    } catch (e) {
      setEstado('reposo');
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(null);
      mutate();
    }
  }, [mutate, router, onPermisos]);

  /** Pantallas de la lista de apagadas (las que no las manda un permiso). */
  const fijarVarias = useCallback((rol: RolGobernanza, ids: string[], visible: boolean) => {
    if (!ids.length) return Promise.resolve();
    return aplicar(
      rol, ids.join(','),
      r => ({
        ...r,
        ocultas: visible ? r.ocultas.filter(p => !ids.includes(p)) : [...new Set([...r.ocultas, ...ids])],
      }),
      { pantalla: ids, visible },
    );
  }, [aplicar]);

  /** Un permiso suelto de la gobernanza. */
  const fijarPermiso = useCallback((rol: RolGobernanza, permiso: string, on: boolean) => aplicar(
    rol, permiso,
    r => ({ ...r, permisos: on ? [...new Set([...r.permisos, permiso])] : r.permisos.filter(p => p !== permiso) }),
    { permiso, activo: on },
    { permisos: [permiso], activo: on },
  ), [aplicar]);

  /** Abre o cierra un módulo para un rol (sus permisos de entrada). */
  const fijarAcceso = useCallback((rol: RolGobernanza, modulo: ModuloDef, on: boolean) => aplicar(
    rol, `acceso-${modulo.id}`,
    r => ({
      ...r,
      permisos: on
        ? [...new Set([...r.permisos, ...modulo.acceso])]
        : r.permisos.filter(p => !modulo.acceso.includes(p)),
    }),
    { modulo: modulo.id, acceso: on },
    { permisos: [...modulo.acceso], activo: on },
  ), [aplicar]);

  /** Una pantalla: por su permiso si lo tiene, por la lista de apagadas si no. */
  const fijarPantalla = useCallback((rol: RolGobernanza, p: PantallaDef, visible: boolean) => (
    p.permiso ? fijarPermiso(rol, p.permiso, visible) : fijarVarias(rol, [p.id], visible)
  ), [fijarPermiso, fijarVarias]);

  /** «Todas» / «Ninguna» de un módulo. */
  const fijarTodas = useCallback(async (rol: RolGobernanza, modulo: ModuloDef, visible: boolean) => {
    await fijarVarias(rol, modulo.pantallas.filter(p => !p.permiso).map(p => p.id), visible);
    const permisos = [...new Set(modulo.pantallas.flatMap(p => (p.permiso ? [p.permiso] : [])))];
    for (const permiso of permisos) await fijarPermiso(rol, permiso, visible);
  }, [fijarVarias, fijarPermiso]);

  return { data, isLoading, guardando, estado, fijarPantalla, fijarTodas, fijarPermiso, fijarAcceso };
}

// ─── Bloqueo ──────────────────────────────────────────────────────────────────

export function GuardPantalla({ ocultas, children }: { ocultas: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const pantalla = ocultas.length ? pantallaDeRuta(pathname) : null;
  if (!pantalla || !ocultas.includes(pantalla.id)) return <>{children}</>;

  // Adónde puede ir: las demás pantallas del mismo módulo que sí ve.
  const otras = PANTALLAS.filter(p => p.modulo === pantalla.modulo && !ocultas.includes(p.id));
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: 2, sm: 6 } }}>
      <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '20px', bgcolor: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2.5, boxShadow: '0 0 0 8px #fffbeb' }}>
          <Lock size={28} aria-hidden />
        </Box>
        <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: '#111827' }}>
          {pantalla.label} no está disponible para ti
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: '#6b7280' }}>
          El administrador la desactivó para tu rol. Si la necesitas, pídele que te la habilite.
        </Typography>
        {otras.length > 0 && (
          <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
            {otras.map(p => (
              <Button key={p.id} asChild variant="outline" size="sm">
                <Link href={p.href}>{p.label}</Link>
              </Button>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ─── Atajo Alt+Shift+R ────────────────────────────────────────────────────────

/** `e.code` y no `e.key`: con Alt, en Mac la R escribe «®» y en otros teclados cambia. */
function esAtajo(e: KeyboardEvent) {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR';
}

export function AtajoPantallaRoles() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const { data, isLoading, fijarPantalla, fijarAcceso, guardando } = useGobernanza(abierto);
  const pantalla = pantallaDeRuta(pathname);
  const modulo = pantalla ? MODULOS.find(m => m.id === pantalla.modulo)! : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!esAtajo(e)) return;
      e.preventDefault();
      setAbierto(a => !a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="xs" aria-labelledby="atajo-pantalla-titulo" slotProps={{ paper: { sx: { borderRadius: '18px' } } }}>
      <DialogTitle id="atajo-pantalla-titulo" sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
          ¿Quién ve esta pantalla?
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {pantalla?.label ?? 'Esta pantalla'}
        </Typography>
        {pantalla && (
          <Typography component="span" sx={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', fontWeight: 400 }}>
            {pantalla.descripcion}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {!pantalla || !modulo ? (
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', py: 1 }}>
            Esta pantalla no se puede apagar por rol. Las que sí, están en Equipo → Permisos.
          </Typography>
        ) : isLoading || !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3, color: '#6b7280' }}>
            <CircularProgress size={18} color="inherit" />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
            {data.roles.map(rol => (
              <FilaRol
                key={rol.id}
                rol={rol}
                modulo={modulo}
                visible={veLaPantalla(rol, pantalla)}
                ocupado={guardando?.startsWith(`${rol.id}:`) ?? false}
                onCambiar={visible => fijarPantalla(rol, pantalla, visible)}
                onDarAcceso={() => fijarAcceso(rol, modulo, true)}
              />
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Alt + Shift + R</Typography>
          <Link
            href="/cuenta/roles"
            onClick={() => setAbierto(false)}
            style={{ fontSize: '0.8125rem', color: '#3658e1', fontWeight: 500 }}
          >
            Configurar por rol →
          </Link>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function FilaRol({ rol, modulo, visible, ocupado, onCambiar, onDarAcceso }: {
  rol: RolGobernanza;
  modulo: ModuloDef;
  visible: boolean;
  ocupado: boolean;
  onCambiar: (visible: boolean) => void;
  onDarAcceso: () => void;
}) {
  const esOwner = rol.key === 'owner';
  const sinModulo = !entraAlModulo(rol, modulo);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #f9fafb' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          component="span"
          aria-hidden
          sx={{
            display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
            bgcolor: sinModulo ? '#f1f5f9' : AZUL_SUAVE, color: sinModulo ? '#64748b' : AZUL_OSCURO,
            fontSize: '0.8125rem', fontWeight: 700, flexShrink: 0,
          }}
        >
          {rol.label.charAt(0).toUpperCase()}
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: sinModulo ? '#64748b' : '#111827' }}>{rol.label}</Typography>
          {(esOwner || sinModulo) && (
            <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
              {esOwner ? 'Siempre ve todo' : `No entra a ${modulo.corto}`}
            </Typography>
          )}
        </Box>
      </Box>
      {sinModulo ? (
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onDarAcceso}>Dar acceso</Button>
      ) : esOwner ? (
        <Lock size={15} style={{ color: '#6b7280' }} />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: '0.75rem', color: visible ? '#047857' : '#6b7280', fontWeight: 500, width: 44, textAlign: 'right' }}>
            {visible ? 'La ve' : 'Oculta'}
          </Typography>
          <Switch
            size="small"
            checked={visible}
            disabled={ocupado}
            onChange={(_, v) => onCambiar(v)}
            slotProps={{ input: { 'aria-label': `${rol.label} ve esta pantalla` } }}
          />
        </Box>
      )}
    </Box>
  );
}

// ─── Panel de un módulo dentro del editor de un rol ───────────────────────────

/**
 * Una opción como baldosa: icono, nombre, qué es y un interruptor. Toda la
 * baldosa es el objetivo del interruptor (label). Encendida se ve «con color»,
 * apagada se ve atenuada y con borde punteado: el estado se lee de un vistazo
 * sin depender solo del interruptor.
 */
function Baldosa({ icono: Icono, titulo, descripcion, nota, on, disabled, textoOn, textoOff, onChange }: {
  icono: ElementType;
  titulo: string;
  descripcion: string;
  nota?: string;
  on: boolean;
  disabled?: boolean;
  textoOn: string;
  textoOff: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex', flexDirection: 'column', gap: 1.25, p: 1.75, borderRadius: '14px',
        border: on ? '1px solid #c7d2fe' : '1px dashed #cbd5e1',
        bgcolor: on ? '#fff' : '#f8fafc',
        boxShadow: on ? '0 1px 3px rgba(54,88,225,0.10)' : 'none',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'border-color .15s, box-shadow .15s, background-color .15s',
        '&:hover': disabled ? undefined : { borderColor: on ? AZUL : '#94a3b8' },
        '&:focus-within': { outline: `2px solid ${AZUL}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{
          display: 'flex', height: 38, width: 38, alignItems: 'center', justifyContent: 'center',
          borderRadius: '10px', bgcolor: on ? AZUL_SUAVE : '#f1f5f9', color: on ? AZUL_OSCURO : '#94a3b8',
        }}>
          <Icono size={19} aria-hidden />
        </Box>
        <Switch
          checked={on}
          disabled={disabled}
          onChange={(_, v) => onChange(v)}
          slotProps={{ input: { 'aria-label': titulo } }}
        />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.25, color: on ? '#0f172a' : '#64748b' }}>
          {titulo}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: '0.8125rem', lineHeight: 1.35, color: '#64748b' }}>
          {descripcion}
        </Typography>
        {nota && (
          <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>{nota}</Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box component="span" aria-hidden sx={{ height: 8, width: 8, borderRadius: '50%', bgcolor: on ? '#10b981' : '#cbd5e1' }} />
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: on ? '#047857' : '#64748b' }}>
          {on ? textoOn : textoOff}
        </Typography>
      </Box>
    </Box>
  );
}

function SeccionPanel({ titulo, detalle, derecha, children }: {
  titulo: string;
  detalle?: string;
  derecha?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography component="h3" sx={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#475569' }}>
            {titulo}
          </Typography>
          {detalle && <Typography sx={{ fontSize: '0.8125rem', color: '#64748b' }}>{detalle}</Typography>}
        </Box>
        {derecha}
      </Box>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * Un módulo para UN rol: si entra, qué ve y qué puede hacer. Cambia al instante
 * (no pasa por «Guardar cambios») y lo dice. `onPermisos` mantiene al día la
 * copia de permisos del editor (ver `useGobernanza`).
 */
export function ModuloDelRol({ roleId, moduloId, onPermisos }: {
  roleId: number;
  moduloId: ModuloId;
  onPermisos: (permisos: string[], activo: boolean) => void;
}) {
  const { data, isLoading, guardando, estado, fijarPantalla, fijarTodas, fijarPermiso, fijarAcceso } =
    useGobernanza(true, onPermisos);
  const idTitulo = useId();
  const rol = data?.roles.find(r => r.id === roleId);
  const modulo = data?.modulos.find(m => m.id === moduloId);
  if (isLoading || !data || !rol || !modulo) return null;

  const esOwner = rol.key === 'owner';
  const entra = entraAlModulo(rol, modulo);
  const visibles = pantallasVisibles(rol, modulo);
  const ocupado = guardando !== null;
  const IconoModulo = ICONO_MODULO[modulo.id];

  return (
    <Box component="section" aria-labelledby={idTitulo} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography component="h2" id={idTitulo} sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
          {modulo.titulo}
        </Typography>
        <EstadoGuardado estado={estado} />
      </Box>

      {/* La puerta: si está cerrada, lo demás no aplica. */}
      <Box
        component="label"
        sx={{
          display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: '16px',
          border: '1px solid', borderColor: entra ? '#c7d2fe' : '#e2e8f0',
          background: entra ? 'linear-gradient(135deg, #f5f7ff 0%, #ffffff 70%)' : '#fff',
          cursor: esOwner ? 'default' : 'pointer',
          '&:focus-within': { outline: `2px solid ${AZUL}`, outlineOffset: 2 },
        }}
      >
        <Box sx={{
          display: 'flex', height: 46, width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: '12px',
          bgcolor: entra ? AZUL : '#e2e8f0', color: entra ? '#fff' : '#64748b', flexShrink: 0,
        }}>
          <IconoModulo size={22} aria-hidden />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{ENTRA[modulo.id]}</Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#64748b' }}>
            {esOwner
              ? 'El Propietario siempre entra y puede todo.'
              : entra
                ? 'Este rol ve el módulo y puede mirar sus datos. Elige abajo qué pantallas ve y qué puede hacer.'
                : 'Apagado: este rol no ve nada de este módulo. Enciéndelo para elegir pantallas y acciones.'}
          </Typography>
        </Box>
        <Typography sx={{
          fontSize: '0.75rem', fontWeight: 700, borderRadius: '9999px', px: 1.25, py: 0.4,
          bgcolor: entra ? '#d1fae5' : '#f1f5f9', color: entra ? '#047857' : '#64748b',
        }}>
          {entra ? 'Activo' : 'Sin acceso'}
        </Typography>
        <Switch
          checked={entra}
          disabled={esOwner || ocupado}
          onChange={(_, v) => fijarAcceso(rol, modulo, v)}
          slotProps={{ input: { 'aria-label': ENTRA[modulo.id] } }}
        />
      </Box>

      {entra && (
        <>
          <SeccionPanel
            titulo="Pantallas que ve"
            detalle={esOwner ? 'Todas, siempre.' : `Ve ${visibles} de ${modulo.pantallas.length}. Las apagadas salen de su menú y no puede abrirlas.`}
            derecha={!esOwner && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outline" size="sm" disabled={ocupado || visibles === modulo.pantallas.length} onClick={() => fijarTodas(rol, modulo, true)}>
                  <Eye size={14} className="mr-1" />Todas
                </Button>
                <Button variant="outline" size="sm" disabled={ocupado || visibles === 0} onClick={() => fijarTodas(rol, modulo, false)}>
                  <EyeOff size={14} className="mr-1" />Ninguna
                </Button>
              </Box>
            )}
          >
            {modulo.pantallas.map(p => {
              const otras = p.permiso
                ? modulo.pantallas.filter(x => x.permiso === p.permiso && x.id !== p.id).map(x => x.label)
                : [];
              return (
                <Baldosa
                  key={p.id}
                  icono={ICONOS[p.id] ?? FileText}
                  titulo={p.label}
                  descripcion={p.descripcion}
                  nota={otras.length ? `Va junto con ${otras.join(', ')}` : undefined}
                  on={veLaPantalla(rol, p)}
                  disabled={esOwner || ocupado}
                  textoOn="La ve"
                  textoOff="Oculta"
                  onChange={on => fijarPantalla(rol, p, on)}
                />
              );
            })}
          </SeccionPanel>

          <SeccionPanel
            titulo="Qué puede hacer"
            detalle="Acciones que cambian datos. Ver una pantalla no implica poder editarla."
          >
            {modulo.acciones.map(a => (
              <Baldosa
                key={a.permiso}
                icono={ICONOS_ACCION[a.permiso] ?? CircleCheck}
                titulo={a.label}
                descripcion={a.descripcion}
                on={esOwner || rol.permisos.includes(a.permiso)}
                disabled={esOwner || ocupado}
                textoOn="Permitido"
                textoOff="No permitido"
                onChange={on => fijarPermiso(rol, a.permiso, on)}
              />
            ))}
          </SeccionPanel>
        </>
      )}
    </Box>
  );
}

// ─── Resumen para la lista de roles ───────────────────────────────────────────

/** «Colegio 6/8 · Facturación 9/9»: por módulo al que el rol entra. */
export function ResumenGobernanza({ rol, modulos }: { rol: RolGobernanza; modulos: ModuloDef[] }) {
  const chips = modulos.filter(m => entraAlModulo(rol, m));
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map(m => {
        const n = pantallasVisibles(rol, m);
        const completo = n === m.pantallas.length;
        const Icono = ICONO_MODULO[m.id];
        return (
          <Box
            key={m.id}
            component="span"
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.6875rem', fontWeight: 500,
              borderRadius: '9999px', px: 1, py: 0.25,
              bgcolor: completo ? '#f3f4f6' : '#fffbeb', color: completo ? '#6b7280' : '#92400e',
            }}
          >
            <Icono size={11} />
            {m.corto} {n}/{m.pantallas.length}
          </Box>
        );
      })}
    </>
  );
}

// ─── Vista general (Equipo → Permisos) ────────────────────────────────────────

/**
 * Pantallas × roles para comparar de un vistazo, un módulo a la vez. Para
 * cambiar a fondo un rol está su editor; aquí el encabezado de cada rol lleva a
 * él. `modulosEmpresa`: los módulos que tiene esta empresa.
 */
export function MatrizPantallas({ modulosEmpresa, onAbrirRol }: {
  modulosEmpresa: ModuloId[];
  onAbrirRol?: (roleId: number) => void;
}) {
  const { data, isLoading, fijarPantalla, fijarAcceso, guardando, estado } = useGobernanza();
  const idTitulo = useId();
  const [elegido, setElegido] = useState<ModuloId | null>(null);
  const disponibles = (data?.modulos ?? []).filter(m => modulosEmpresa.includes(m.id));
  const modulo = disponibles.find(m => m.id === elegido) ?? disponibles[0];

  return (
    <Paper component="section" aria-labelledby={idTitulo} id="pantallas" variant="outlined" sx={{ borderRadius: '16px', borderColor: '#e5e7eb', overflow: 'hidden', scrollMarginTop: 24 }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <Typography component="h2" id={idTitulo} sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
            Quién ve qué · vista general
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Enciende o apaga cada pantalla por rol: apagada, sale de su menú y no puede abrirla. Atajo:
            Alt + Shift + R en cualquier pantalla.
          </Typography>
        </Box>
        <EstadoGuardado estado={estado} />
        {disponibles.length > 1 && (
          <Box role="group" aria-label="Módulo" sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: '#f3f4f6', borderRadius: '10px' }}>
            {disponibles.map(m => (
              <ButtonBase
                key={m.id}
                aria-pressed={m.id === modulo?.id}
                onClick={() => setElegido(m.id)}
                sx={{
                  px: 1.5, py: 0.5, borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 500,
                  color: m.id === modulo?.id ? '#111827' : '#6b7280',
                  bgcolor: m.id === modulo?.id ? '#fff' : 'transparent',
                  boxShadow: m.id === modulo?.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {m.corto}
              </ButtonBase>
            ))}
          </Box>
        )}
      </Box>
      {isLoading || !data || !modulo ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4, color: '#6b7280' }}>
          <CircularProgress size={18} color="inherit" />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <caption className="sr-only">
              Pantallas de {modulo.titulo} y qué roles las ven. Cada casilla enciende o apaga la pantalla para ese rol.
            </caption>
            <thead>
              <tr>
                <Box component="th" scope="col" sx={{ textAlign: 'left', px: 2, py: 1, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, bgcolor: '#fff' }}>
                  Pantalla
                </Box>
                {data.roles.map(r => {
                  const esOwner = r.key === 'owner';
                  const sinModulo = !entraAlModulo(r, modulo);
                  return (
                    <Box component="th" scope="col" key={r.id} sx={{ px: 1, py: 0.75, textAlign: 'center', fontWeight: 500, verticalAlign: 'top' }}>
                      <ButtonBase
                        aria-label={esOwner ? `${r.label}: siempre ve todo` : `Configurar el rol ${r.label}`}
                        disabled={!onAbrirRol || esOwner}
                        onClick={() => onAbrirRol?.(r.id)}
                        sx={{ flexDirection: 'column', borderRadius: '6px', px: 1, py: 0.5, color: sinModulo ? '#6b7280' : '#374151', '&:hover': { bgcolor: '#f3f4f6' } }}
                      >
                        <span style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', fontWeight: 500 }}>{r.label}</span>
                        {!sinModulo && (
                          <span style={{ fontSize: '0.6875rem', color: '#6b7280', fontWeight: 400 }}>
                            {esOwner ? 'siempre todo' : `${pantallasVisibles(r, modulo)}/${modulo.pantallas.length}`}
                          </span>
                        )}
                      </ButtonBase>
                      {sinModulo && (
                        <Box sx={{ mt: 0.25 }}>
                          <Button variant="outline" size="sm" disabled={guardando === `${r.id}:acceso-${modulo.id}`} onClick={() => fijarAcceso(r, modulo, true)}>
                            Dar acceso
                          </Button>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {modulo.pantallas.map(p => {
                const Icono = ICONOS[p.id] ?? FileText;
                return (
                  <Box component="tr" key={p.id} sx={{ borderTop: '1px solid #eef0f4', '&:nth-of-type(even)': { bgcolor: '#f8fafc' }, '&:hover': { bgcolor: '#f1f5ff' } }}>
                    <Box component="th" scope="row" sx={{ px: 2, py: 0.75, whiteSpace: 'nowrap', position: 'sticky', left: 0, bgcolor: 'inherit', textAlign: 'left', fontWeight: 400 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#111827' }}>
                        <Icono size={15} style={{ color: '#6b7280' }} />
                        {p.label}
                      </Box>
                    </Box>
                    {data.roles.map(r => {
                      const esOwner = r.key === 'owner';
                      const sinModulo = !entraAlModulo(r, modulo);
                      return (
                        <Box component="td" key={r.id} sx={{ textAlign: 'center', py: 0.5 }}>
                          {sinModulo ? (
                            <span role="img" aria-label="Sin acceso al módulo" style={{ color: '#9ca3af' }}>—</span>
                          ) : esOwner ? (
                            <span role="img" aria-label="Siempre la ve" style={{ display: 'inline-flex' }}>
                              <Lock size={14} style={{ color: '#6b7280' }} aria-hidden />
                            </span>
                          ) : (
                            <Switch
                              size="small"
                              checked={veLaPantalla(r, p)}
                              disabled={guardando?.startsWith(`${r.id}:`) ?? false}
                              onChange={(_, v) => fijarPantalla(r, p, v)}
                              slotProps={{ input: { 'aria-label': `${r.label} ve ${p.label}` } }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </tbody>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
