'use client';

/**
 * Gobernanza del colegio: qué ve y qué puede hacer cada rol en Administración
 * Escolar, en UN solo sitio.
 *
 *  - `ColegioDelRol`       → la tarjeta dentro del editor de un rol (Equipo →
 *    Permisos → el rol): entra o no al colegio, qué pantallas ve y qué puede
 *    hacer (crear/editar, cobrar). Todo se guarda al instante.
 *  - `MatrizPantallas`     → vista general pantallas × roles para comparar.
 *  - `AtajoPantallaRoles`  → Alt+Shift+R abre, sobre la pantalla en la que se
 *    está, la lista de roles con un interruptor cada uno. Solo lo monta el
 *    layout para quien gestiona el equipo.
 *  - `GuardPantalla`       → si la pantalla en la que se está quedó apagada
 *    para el rol, enseña «no está disponible para ti». Cubre la llegada por URL.
 *
 * Detrás hay dos mecanismos que el usuario no tiene que distinguir: una lista
 * de pantallas apagadas por rol y los permisos de siempre (entrar, configurar,
 * crear/editar, cobrar). Configuración y Documentos las manda el permiso
 * «configurar»: ver `permiso` en lib/config/pantallas.ts.
 *
 * El menú se filtra en el servidor (ver app/escolar/layout.tsx). Tras cada
 * cambio se refresca la ruta para que menú y bloqueo lo tomen al momento.
 */

import { useCallback, useEffect, useState, type ElementType } from 'react';
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
  Settings, GraduationCap, Eye, EyeOff, DoorOpen, Pencil, Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ACCESO_COLEGIO, PANTALLAS_ESCOLAR, PERMISO_CONFIGURAR, pantallaDeRuta, veLaPantalla,
  type PantallaDef,
} from '@/lib/config/pantallas';

export interface RolPantallas {
  id: number;
  key: string;
  label: string;
  ocultas: string[];
  /** Permisos del colegio que tiene el rol (acciones y «configurar»). */
  permisos: string[];
  /** ¿Entra al colegio? Sin eso nada de lo demás aplica. */
  tieneModulo: boolean;
}
export interface DatosPantallas { pantallas: PantallaDef[]; roles: RolPantallas[] }

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
};

/** Las dos cosas que un rol puede HACER en el colegio (el resto es ver). */
const ACCIONES: { permiso: string; label: string; descripcion: string; icono: ElementType }[] = [
  { permiso: 'administracion-escolar:gestionar', label: 'Crear y editar', descripcion: 'Estudiantes, tutores, cursos y matrículas', icono: Pencil },
  { permiso: 'administracion-escolar:pagos', label: 'Cobrar', descripcion: 'Registrar pagos escolares', icono: Banknote },
];

/** Cuántas pantallas ve el rol. */
export function pantallasVisibles(rol: RolPantallas, pantallas: PantallaDef[]) {
  return pantallas.filter(p => veLaPantalla(rol, p)).length;
}

/**
 * Lee el colegio por rol y devuelve con qué cambiarlo.
 *
 * `onPermisos` avisa de los permisos que cambiaron: el editor del rol guarda
 * su propia copia de los permisos hasta «Guardar cambios», y sin el aviso
 * ese guardado deshacería lo que aquí ya se aplicó.
 */
export function usePantallasPorRol(
  activo = true,
  onPermisos?: (permisos: string[], activo: boolean) => void,
) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<DatosPantallas>(activo ? URL_API : null, fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);

  /** Optimista: el interruptor responde ya; si el servidor dice que no, se revierte. */
  const aplicar = useCallback(async (
    rol: RolPantallas,
    clave: string,
    cambio: (r: RolPantallas) => RolPantallas,
    body: Record<string, unknown>,
    permisosCambiados?: { permisos: string[]; activo: boolean },
  ) => {
    setGuardando(`${rol.id}:${clave}`);
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(null);
      mutate();
    }
  }, [mutate, router, onPermisos]);

  /** Pantallas de la lista de apagadas (las que no las manda un permiso). */
  const fijarVarias = useCallback((rol: RolPantallas, ids: string[], visible: boolean) => {
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

  /** Un permiso suelto del colegio. */
  const fijarPermiso = useCallback((rol: RolPantallas, permiso: string, on: boolean) => aplicar(
    rol, permiso,
    r => ({ ...r, permisos: on ? [...new Set([...r.permisos, permiso])] : r.permisos.filter(p => p !== permiso) }),
    { permiso, activo: on },
    { permisos: [permiso], activo: on },
  ), [aplicar]);

  /** Abre o cierra el colegio para un rol (módulo + ver). */
  const fijarAcceso = useCallback((rol: RolPantallas, on: boolean) => aplicar(
    rol, 'acceso',
    r => ({ ...r, tieneModulo: on }),
    { acceso: on },
    { permisos: [...ACCESO_COLEGIO], activo: on },
  ), [aplicar]);

  /** Una pantalla: por su permiso si lo tiene, por la lista de apagadas si no. */
  const fijarPantalla = useCallback((rol: RolPantallas, p: PantallaDef, visible: boolean) => (
    p.permiso ? fijarPermiso(rol, p.permiso, visible) : fijarVarias(rol, [p.id], visible)
  ), [fijarPermiso, fijarVarias]);

  /** «Todas» / «Ninguna». */
  const fijarTodas = useCallback(async (rol: RolPantallas, pantallas: PantallaDef[], visible: boolean) => {
    await fijarVarias(rol, pantallas.filter(p => !p.permiso).map(p => p.id), visible);
    if (pantallas.some(p => p.permiso === PERMISO_CONFIGURAR)) await fijarPermiso(rol, PERMISO_CONFIGURAR, visible);
  }, [fijarVarias, fijarPermiso]);

  return { data, isLoading, guardando, fijarPantalla, fijarTodas, fijarPermiso, fijarAcceso };
}

// ─── Bloqueo ──────────────────────────────────────────────────────────────────

export function GuardPantalla({ ocultas, children }: { ocultas: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const pantalla = ocultas.length ? pantallaDeRuta(pathname) : null;
  if (!pantalla || !ocultas.includes(pantalla.id)) return <>{children}</>;

  const otras = PANTALLAS_ESCOLAR.filter(p => !ocultas.includes(p.id));
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: 2, sm: 6 } }}>
      <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', bgcolor: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <Lock size={22} />
        </Box>
        <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: '#111827' }}>
          {pantalla.label} no está disponible para ti
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: '#6b7280' }}>
          El administrador del colegio la desactivó. Si la necesitas, pídele que te la habilite.
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
  const { data, isLoading, fijarPantalla, fijarAcceso, guardando } = usePantallasPorRol(abierto);
  const pantalla = pantallaDeRuta(pathname);

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
    <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 0.5 }}>
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
        {!pantalla ? (
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', py: 1 }}>
            Esta pantalla no se puede apagar por rol. Las que sí, están en la lista completa.
          </Typography>
        ) : isLoading || !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3, color: '#9ca3af' }}>
            <CircularProgress size={18} color="inherit" />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
            {data.roles.map(rol => (
              <FilaRol
                key={rol.id}
                rol={rol}
                visible={veLaPantalla(rol, pantalla)}
                ocupado={guardando?.startsWith(`${rol.id}:`) ?? false}
                onCambiar={visible => fijarPantalla(rol, pantalla, visible)}
                onDarAcceso={() => fijarAcceso(rol, true)}
              />
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid #f3f4f6' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Alt + Shift + R</Typography>
          <Link
            href="/dashboard/equipo/permisos"
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

function FilaRol({ rol, visible, ocupado, onCambiar, onDarAcceso }: {
  rol: RolPantallas;
  visible: boolean;
  ocupado: boolean;
  onCambiar: (visible: boolean) => void;
  onDarAcceso: () => void;
}) {
  const esOwner = rol.key === 'owner';
  const sinModulo = !rol.tieneModulo && !esOwner;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #f9fafb' }}>
      <Box>
        <Typography sx={{ fontSize: '0.875rem', color: sinModulo ? '#9ca3af' : '#111827' }}>{rol.label}</Typography>
        {(esOwner || sinModulo) && (
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {esOwner ? 'Siempre ve todo' : 'No entra al colegio'}
          </Typography>
        )}
      </Box>
      {sinModulo ? (
        <Button variant="outline" size="sm" disabled={ocupado} onClick={onDarAcceso}>Dar acceso</Button>
      ) : esOwner ? (
        <Lock size={15} style={{ color: '#9ca3af' }} />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: '0.75rem', color: visible ? '#059669' : '#9ca3af', fontWeight: 500, width: 44, textAlign: 'right' }}>
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

// ─── Tarjeta dentro del editor de un rol ──────────────────────────────────────

/** Fila con icono, título, descripción y un interruptor. */
function FilaOpcion({ icono: Icono, titulo, descripcion, nota, on, disabled, estado = true, onChange }: {
  icono: ElementType;
  titulo: string;
  descripcion: string;
  nota?: string;
  on: boolean;
  disabled?: boolean;
  /** Muestra «La ve / Oculta» junto al interruptor. */
  estado?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderTop: '1px solid #f9fafb' }}>
      <Box sx={{ display: 'flex', height: 30, width: 30, alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: on ? '#f3f4f6' : '#fafafa', color: on ? '#4b5563' : '#d1d5db', flexShrink: 0 }}>
        <Icono size={16} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: on ? '#111827' : '#9ca3af' }}>{titulo}</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {descripcion}{nota ? ` · ${nota}` : ''}
        </Typography>
      </Box>
      {estado && (
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: on ? '#059669' : '#9ca3af', width: 44, textAlign: 'right' }}>
          {on ? 'La ve' : 'Oculta'}
        </Typography>
      )}
      <Switch
        size="small"
        checked={on}
        disabled={disabled}
        onChange={(_, v) => onChange(v)}
        slotProps={{ input: { 'aria-label': titulo } }}
      />
    </Box>
  );
}

function Subtitulo({ children, derecha }: { children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 0.75, bgcolor: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9ca3af' }}>
        {children}
      </Typography>
      {derecha}
    </Box>
  );
}

/**
 * Todo lo del colegio para UN rol: si entra, qué ve y qué puede hacer. Cambia
 * al instante (no pasa por «Guardar cambios») y lo dice. `onPermisos` mantiene
 * al día la copia de permisos del editor (ver `usePantallasPorRol`).
 */
export function ColegioDelRol({ roleId, onPermisos }: {
  roleId: number;
  onPermisos: (permisos: string[], activo: boolean) => void;
}) {
  const { data, isLoading, guardando, fijarPantalla, fijarTodas, fijarPermiso, fijarAcceso } =
    usePantallasPorRol(true, onPermisos);
  const rol = data?.roles.find(r => r.id === roleId);
  if (isLoading || !data || !rol) return null;

  const esOwner = rol.key === 'owner';
  const entra = esOwner || rol.tieneModulo;
  const visibles = pantallasVisibles(rol, data.pantallas);
  const ocupado = guardando !== null;

  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: '#eef2fe', color: '#2a45c4', flexShrink: 0 }}>
          <GraduationCap size={17} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
            Administración Escolar
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Qué ve y qué puede hacer este rol en el colegio. Los cambios se guardan al instante.
          </Typography>
        </Box>
      </Box>

      <FilaOpcion
        icono={DoorOpen}
        titulo="Entra al colegio"
        descripcion={entra ? 'Ve el módulo y puede mirar sus datos' : 'Apagado: no ve nada del colegio. Enciéndelo para elegir pantallas y acciones.'}
        on={entra}
        estado={false}
        disabled={esOwner || ocupado}
        onChange={on => fijarAcceso(rol, on)}
      />

      {entra && (
        <>
          <Subtitulo
            derecha={!esOwner && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Ve <b style={{ color: '#111827' }}>{visibles}</b> de {data.pantallas.length}
                </Typography>
                <Button variant="outline" size="sm" disabled={ocupado || visibles === data.pantallas.length} onClick={() => fijarTodas(rol, data.pantallas, true)}>
                  <Eye size={14} className="mr-1" />Todas
                </Button>
                <Button variant="outline" size="sm" disabled={ocupado || visibles === 0} onClick={() => fijarTodas(rol, data.pantallas, false)}>
                  <EyeOff size={14} className="mr-1" />Ninguna
                </Button>
              </Box>
            )}
          >
            Pantallas que ve
          </Subtitulo>
          {data.pantallas.map(p => {
            const otras = p.permiso
              ? data.pantallas.filter(x => x.permiso === p.permiso && x.id !== p.id).map(x => x.label)
              : [];
            return (
              <FilaOpcion
                key={p.id}
                icono={ICONOS[p.id] ?? FileText}
                titulo={p.label}
                descripcion={p.descripcion}
                nota={otras.length ? `va junto con ${otras.join(', ')}` : undefined}
                on={veLaPantalla(rol, p)}
                disabled={esOwner || ocupado}
                onChange={on => fijarPantalla(rol, p, on)}
              />
            );
          })}

          <Subtitulo>Qué puede hacer</Subtitulo>
          {ACCIONES.map(a => (
            <FilaOpcion
              key={a.permiso}
              icono={a.icono}
              titulo={a.label}
              descripcion={a.descripcion}
              on={esOwner || rol.permisos.includes(a.permiso)}
              estado={false}
              disabled={esOwner || ocupado}
              onChange={on => fijarPermiso(rol, a.permiso, on)}
            />
          ))}
          {esOwner && (
            <Box sx={{ px: 2, py: 1, borderTop: '1px solid #f3f4f6', fontSize: '0.75rem', color: '#9ca3af' }}>
              El Propietario siempre ve y puede todo.
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}

// ─── Resumen para la lista de roles ───────────────────────────────────────────

/** «6 de 8 pantallas»; `null` si el rol ni entra al colegio. */
export function ResumenPantallas({ rol, pantallas }: { rol: RolPantallas; pantallas: PantallaDef[] }) {
  if (!rol.tieneModulo && rol.key !== 'owner') return null;
  const total = pantallas.length;
  const n = pantallasVisibles(rol, pantallas);
  const completo = n === total;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.6875rem', fontWeight: 500,
        borderRadius: '9999px', px: 1, py: 0.25,
        bgcolor: completo ? '#f3f4f6' : '#fffbeb', color: completo ? '#6b7280' : '#92400e',
      }}
    >
      <GraduationCap size={11} />
      {completo ? 'Todas las pantallas' : `${n} de ${total} pantallas`}
    </Box>
  );
}

// ─── Vista general (Equipo → Permisos) ────────────────────────────────────────

/**
 * Pantallas × roles para comparar de un vistazo. Para cambiar a fondo un rol
 * está su editor; aquí el encabezado de cada rol lleva a él.
 */
export function MatrizPantallas({ onAbrirRol }: { onAbrirRol?: (roleId: number) => void }) {
  const { data, isLoading, fijarPantalla, fijarAcceso, guardando } = usePantallasPorRol();

  return (
    <Paper id="pantallas" variant="outlined" sx={{ borderRadius: '12px', borderColor: '#e5e7eb', overflow: 'hidden', scrollMarginTop: 24 }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: '#eef2fe', color: '#2a45c4', flexShrink: 0 }}>
          <GraduationCap size={17} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
            Pantallas del colegio · vista general
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Enciende o apaga cada pantalla por rol: apagada, sale de su menú y no puede abrirla. Los roles
            sin acceso al colegio traen un botón para dárselo. Atajo: Alt + Shift + R en cualquier pantalla.
          </Typography>
        </Box>
      </Box>
      {isLoading || !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4, color: '#9ca3af' }}>
          <CircularProgress size={18} color="inherit" />
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                <Box component="th" sx={{ textAlign: 'left', px: 2, py: 1, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, bgcolor: '#fff' }}>
                  Pantalla
                </Box>
                {data.roles.map(r => {
                  const esOwner = r.key === 'owner';
                  const sinModulo = !r.tieneModulo && !esOwner;
                  return (
                    <Box component="th" key={r.id} sx={{ px: 1, py: 0.75, textAlign: 'center', fontWeight: 500, verticalAlign: 'top' }}>
                      <ButtonBase
                        disabled={!onAbrirRol || esOwner}
                        onClick={() => onAbrirRol?.(r.id)}
                        sx={{ flexDirection: 'column', borderRadius: '6px', px: 1, py: 0.5, color: sinModulo ? '#9ca3af' : '#374151', '&:hover': { bgcolor: '#f3f4f6' } }}
                      >
                        <span style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', fontWeight: 500 }}>{r.label}</span>
                        {!sinModulo && (
                          <span style={{ fontSize: '0.6875rem', color: '#9ca3af', fontWeight: 400 }}>
                            {esOwner ? 'siempre todo' : `${pantallasVisibles(r, data.pantallas)}/${data.pantallas.length}`}
                          </span>
                        )}
                      </ButtonBase>
                      {sinModulo && (
                        <Box sx={{ mt: 0.25 }}>
                          <Button variant="outline" size="sm" disabled={guardando === `${r.id}:acceso`} onClick={() => fijarAcceso(r, true)}>
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
              {data.pantallas.map(p => {
                const Icono = ICONOS[p.id] ?? FileText;
                return (
                  <Box component="tr" key={p.id} sx={{ borderTop: '1px solid #f3f4f6', '&:hover': { bgcolor: '#fafafa' } }}>
                    <Box component="td" sx={{ px: 2, py: 0.75, whiteSpace: 'nowrap', position: 'sticky', left: 0, bgcolor: 'inherit' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#111827' }}>
                        <Icono size={15} style={{ color: '#9ca3af' }} />
                        {p.label}
                      </Box>
                    </Box>
                    {data.roles.map(r => {
                      const esOwner = r.key === 'owner';
                      const sinModulo = !r.tieneModulo && !esOwner;
                      return (
                        <Box component="td" key={r.id} sx={{ textAlign: 'center', py: 0.5 }}>
                          {sinModulo ? (
                            <span style={{ color: '#d1d5db' }}>—</span>
                          ) : esOwner ? (
                            <Lock size={14} style={{ color: '#c7cbd1', margin: '0 auto' }} />
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
