'use client';

/**
 * GlobalSearch — el buscador de la cabecera.
 *
 * Antes vivía arrastrado a la esquina derecha como un icono de lupa con la
 * palabra «Buscar» al lado: parecía un adorno más de la barra y nadie lo
 * tocaba. Ahora es una caja de búsqueda de verdad —con su borde, su ancho y su
 * texto de ayuda— puesta en el centro, que es donde se busca un buscador.
 *
 * El componente monta DOS cosas: el disparador que se ve en la barra y el
 * cuadro modal donde de verdad se escribe. Se abre con clic, con ⌘K/Ctrl+K, o
 * desde el botón «Buscar» del menú lateral (que sigue disparando el botón
 * oculto `#global-search-trigger`).
 *
 * Los resultados salen agrupados por tipo, con tope por grupo, y todos de una
 * sola llamada a /api/buscar — que es quien comprueba empresa, módulos y
 * permisos. Aquí no se decide nada de eso.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { ModuleKey } from '@/lib/config/modules';
import { Command } from 'cmdk';
import {
  Search, FileText, Users, Package, Hash, Plus, LayoutDashboard,
  Settings, BarChart3, CreditCard, Shield, Activity, X, GraduationCap,
  Store, Receipt, Contact, ClipboardList, Wallet, Building2, UserCog,
} from 'lucide-react';

// MUI imports
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

import type { TipoResultado, GrupoResultados } from '@/lib/busqueda/tipos';

/**
 * Páginas y acciones que el buscador ofrece antes de escribir nada.
 *
 * Cada una declara a qué módulo pertenece: solo se enseñan las de los módulos
 * a los que este usuario entra (empresa ∩ rol, vía usePermissions). Antes la
 * lista era fija y de Facturación: en un colegio, abrir el buscador ofrecía
 * «Secuencias NCF» y ni una sola pantalla del centro.
 */
type ItemEstatico = {
  grupo: 'Páginas' | 'Acciones';
  modulo: ModuleKey;
  label: string;
  href: string;
  icon: typeof Users;
};

const STATIC_ITEMS: ItemEstatico[] = [
  // Facturación
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Inicio', href: '/dashboard', icon: LayoutDashboard },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Contactos', href: '/dashboard/clientes', icon: Users },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Facturas', href: '/dashboard/facturas', icon: FileText },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Cotizaciones', href: '/dashboard/cotizaciones', icon: FileText },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Productos', href: '/dashboard/productos', icon: Package },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Secuencias NCF', href: '/dashboard/secuencias', icon: Hash },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Reportes DGII', href: '/dashboard/reportes', icon: BarChart3 },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Configuración', href: '/dashboard/configuracion', icon: Settings },
  // Suscripción solo con billing activo (lib/config/billing).
  ...(BILLING_ENABLED
    ? [{ grupo: 'Páginas', modulo: 'facturacion', label: 'Suscripción', href: '/dashboard/suscripcion', icon: CreditCard } as ItemEstatico]
    : []),
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Seguridad', href: '/dashboard/security', icon: Shield },
  { grupo: 'Páginas', modulo: 'facturacion', label: 'Actividad', href: '/dashboard/activity', icon: Activity },
  { grupo: 'Acciones', modulo: 'facturacion', label: 'Nueva factura', href: '/dashboard/facturas/nueva', icon: Plus },
  { grupo: 'Acciones', modulo: 'facturacion', label: 'Nuevo cliente', href: '/dashboard/clientes/nuevo', icon: Plus },
  { grupo: 'Acciones', modulo: 'facturacion', label: 'Nueva cotización', href: '/dashboard/cotizaciones/nueva', icon: Plus },
  // Punto de Venta
  { grupo: 'Páginas', modulo: 'pos', label: 'Terminal de venta', href: '/pos', icon: Store },
  { grupo: 'Páginas', modulo: 'pos', label: 'Historial del turno', href: '/pos/historial', icon: Receipt },
  { grupo: 'Páginas', modulo: 'pos', label: 'Caja', href: '/pos/caja', icon: Wallet },
  // Colegios
  { grupo: 'Páginas', modulo: 'escolar', label: 'Panorama del colegio', href: '/escolar/dashboard', icon: GraduationCap },
  { grupo: 'Páginas', modulo: 'escolar', label: 'Matriculación', href: '/escolar/matriculas', icon: ClipboardList },
  { grupo: 'Páginas', modulo: 'escolar', label: 'Estudiantes y padres', href: '/escolar/estudiantes', icon: Users },
  { grupo: 'Páginas', modulo: 'escolar', label: 'Responsables', href: '/escolar/responsables', icon: Contact },
  { grupo: 'Páginas', modulo: 'escolar', label: 'Pagos del colegio', href: '/escolar/pagos', icon: Wallet },
  { grupo: 'Acciones', modulo: 'escolar', label: 'Nuevo estudiante', href: '/escolar/estudiantes/nuevo', icon: Plus },
  // Administración
  { grupo: 'Páginas', modulo: 'administracion', label: 'Mi empresa', href: '/cuenta/empresa', icon: Building2 },
  { grupo: 'Páginas', modulo: 'administracion', label: 'Usuarios', href: '/cuenta/usuarios', icon: UserCog },
  { grupo: 'Páginas', modulo: 'administracion', label: 'Roles y permisos', href: '/cuenta/roles', icon: Shield },
];

/** Icono con el que se pinta cada tipo de resultado. */
const ICONO_TIPO: Record<TipoResultado, typeof Users> = {
  cliente:     Users,
  factura:     FileText,
  cotizacion:  FileText,
  producto:    Package,
  venta:       Receipt,
  estudiante:  GraduationCap,
  responsable: Contact,
  usuario:     UserCog,
};

/** Módulo en el que estamos, deducido de la URL. Solo cambia el ORDEN de los grupos. */
function moduloDeRuta(pathname: string): ModuleKey {
  if (pathname.startsWith('/escolar')) return 'escolar';
  if (pathname.startsWith('/pos')) return 'pos';
  if (pathname.startsWith('/cuenta')) return 'administracion';
  return 'facturacion';
}

/** Lo que se le promete al usuario en el hueco de escribir, según dónde esté. */
const PLACEHOLDER: Record<ModuleKey, string> = {
  facturacion:    'Buscar facturas, clientes, productos…',
  pos:            'Buscar productos, ventas, clientes…',
  escolar:        'Buscar estudiantes, familias, facturas…',
  administracion: 'Buscar usuarios, clientes, facturas…',
};

const MIN_CARACTERES = 2;

/**
 * Ancho máximo del buscador. UN solo número para el campo y para su
 * desplegable: antes eran dos (460 el campo, 560 el panel) y el menú caía cien
 * píxeles más ancho que lo que lo había abierto, desalineado por los dos lados.
 *
 * Por debajo de este tope el campo crece con el hueco central del header
 * (`width: 100%`), que es lo que hace que no parezca un pellizco en una barra
 * de 1400. El tope existe porque más allá de ~680 px la línea de texto deja de
 * leerse de un vistazo y el campo se convierte en una franja vacía.
 */
export const ANCHO_BUSCADOR = 680;

/**
 * Tope del campo en MODO FOCO. No es un ancho: es «quítate de en medio». Lo que
 * de verdad limita al campo abierto es el hueco que dejan los vecinos al
 * apartarse; este número solo tiene que ser mayor que cualquier barra real,
 * y ser un número —y no `none`— para que la vuelta al cerrar se pueda animar.
 */
const ANCHO_FOCO = 1600;

/**
 * Cuánto dura el modo foco. Corto: es la respuesta a un clic, no un cambio de
 * pantalla. Es el mismo valor que usa el menú lateral al fijarse.
 */
export const MS_FOCO = 200;

/** Separación entre el campo y el desplegable que cuelga de él. */
const SEPARACION_PANEL = 6;

/** Dónde y con qué ancho cae el desplegable, medido del propio campo. */
interface CajaAnclaje {
  left: number;
  top: number;
  width: number;
}

// Estilos de los primitivos de cmdk (input/list/empty/item) — cmdk expone
// atributos `[cmdk-*]` para estilizar sus nodos internos. El item seleccionado
// por teclado lleva `data-selected="true"`.
const cmdkSx = {
  width: '100%',
  '& [cmdk-root]': { width: '100%' },
  '& [cmdk-input]': {
    flex: 1,
    fontSize: '0.875rem',
    outline: 'none',
    border: 'none',
    p: 0,
    m: 0,
    color: '#111827',
    bgcolor: 'transparent',
  },
  '& [cmdk-input]::placeholder': { color: '#9ca3af' },
  '& [cmdk-list]': { maxHeight: 380, overflowY: 'auto', p: 1 },
  '& [cmdk-empty]': { py: 3, textAlign: 'center', fontSize: '0.875rem', color: '#9ca3af' },
  '& [cmdk-item]': {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    borderRadius: '8px',
    cursor: 'pointer',
  },
  '& [cmdk-item]:hover': { bgcolor: '#f9fafb' },
  '& [cmdk-item][data-selected="true"]': { bgcolor: '#eef2fe' },
} as const;

/** Cabecera de grupo dentro de la lista. */
function Encabezado({ children }: { children: React.ReactNode }) {
  return (
    <Box component="span" sx={{
      display: 'block', fontSize: '0.75rem', color: '#9ca3af',
      textTransform: 'uppercase', letterSpacing: '0.025em', px: 1, pt: 0.75, pb: 0.25,
    }}>
      {children}
    </Box>
  );
}

export function GlobalSearch({
  modulo: moduloProp,
  /**
   * Avisa al header de que se entró o salió del modo foco, para que aparte a
   * los vecinos (empresa, módulos, avatar). Tiene que ser estable —el `set` de
   * un useState sirve— porque se llama desde un efecto.
   */
  onAbiertoChange,
}: {
  /**
   * En qué módulo estamos, dicho por quien lo sabe.
   *
   * Antes salía siempre de la URL, y en los subdominios el proxy sirve la
   * portada por rewrite: la ruta es `/` y la deducción caía al default,
   * `facturacion`. Entrar al POS y que el buscador ofreciera primero facturas
   * es justo lo contrario de lo que se pidió.
   *
   * Se sigue mirando la URL cuando no llega la prop, para las pantallas que
   * montan el buscador sin shell.
   */
  modulo?: ModuleKey;
  onAbiertoChange?: (abierto: boolean) => void;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { modules } = usePermissions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [grupos, setGrupos] = useState<GrupoResultados[]>([]);
  const [loading, setLoading] = useState(false);
  const disparadorRef = useRef<HTMLButtonElement | null>(null);
  /** Marca que el cierre vino de abrir un resultado, no de cancelar. */
  const navegandoRef = useRef(false);
  const [caja, setCaja] = useState<CajaAnclaje | null>(null);

  const modulo = moduloProp ?? moduloDeRuta(pathname ?? '');

  /**
   * Mide el campo para colgarle el desplegable con SU mismo borde izquierdo y
   * derecho. Se mide en vez de repetir el ancho porque el campo es elástico:
   * su ancho real depende del hueco que le deje el header, no de una constante.
   *
   * En móvil el campo está oculto por CSS (el disparador es un icono) y el
   * rect viene a cero: ahí no hay a qué anclarse y `null` deja el panel
   * centrado y a lo ancho de la pantalla, que es lo que toca.
   */
  const medir = useCallback(() => {
    const el = disparadorRef.current;
    if (!el) { setCaja(null); return; }
    const r = el.getBoundingClientRect();
    if (r.width < 160) { setCaja(null); return; }
    const nueva = { left: r.left, top: r.bottom + SEPARACION_PANEL, width: r.width };
    // Se compara antes de guardar porque esto se llama una vez por fotograma
    // mientras el campo crece: sin esto serían quince renders con el mismo dato.
    setCaja(prev => (prev && prev.left === nueva.left && prev.top === nueva.top && prev.width === nueva.width)
      ? prev
      : nueva);
  }, []);

  // Medir ANTES de abrir (no en un efecto): así el panel se pinta ya en su
  // sitio en vez de aparecer centrado y saltar al de al lado.
  const abrir = useCallback(() => { medir(); setOpen(true); }, [medir]);

  // Solo las páginas de los módulos a los que este usuario entra. Mientras
  // /api/user carga, `modules` viene vacío: se cae al módulo de la ruta, que ya
  // pasó por el gate de servidor del layout, para no enseñar una lista vacía.
  const estaticosVisibles = useMemo(() => {
    const permitidos = modules.length > 0 ? modules : [modulo];
    // Lo del módulo donde estás, primero: es lo que se va a pulsar.
    return STATIC_ITEMS
      .filter((i) => permitidos.includes(i.modulo))
      .sort((a, b) => Number(b.modulo === modulo) - Number(a.modulo === modulo));
  }, [modules, modulo]);

  // ⌘K / Ctrl+K abre y cierra.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        medir();
        setOpen(o => !o);
      }
    }
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [medir]);

  // Escape cierra.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // El campo es elástico: si la ventana cambia de tamaño con el panel abierto,
  // hay que volver a medir o se queda anclado donde el campo YA no está.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [open, medir]);

  /**
   * Volver a medir en cada fotograma mientras dura el modo foco.
   *
   * Al abrir, el campo NO tiene ya su ancho final: los vecinos se están
   * apartando durante 200 ms y el hueco crece con ellos. Una sola medida al
   * abrir dejaría el desplegable clavado al ancho de reposo mientras el campo
   * sigue creciendo por debajo. Midiendo por fotograma, el panel crece pegado
   * al campo y los dos llegan juntos.
   */
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const hasta = performance.now() + MS_FOCO + 120;
    const paso = () => {
      medir();
      if (performance.now() < hasta) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [open, medir]);

  // El header necesita saberlo para apartar a los vecinos.
  useEffect(() => { onAbiertoChange?.(open); }, [open, onAbiertoChange]);

  /**
   * Al cerrar, el foco vuelve al campo. Si no, se queda en el `body`: quien
   * cerró con Escape pulsaba Tab y aparecía al principio de la página, sin
   * ninguna pista de dónde estaba.
   *
   * No se devuelve cuando el cierre fue por ABRIR un resultado: ahí el usuario
   * ya se fue a otra pantalla y robarle el foco para traerlo de vuelta a la
   * barra es justo lo contrario de lo que pidió.
   */
  useEffect(() => {
    if (open) return;
    if (navegandoRef.current) { navegandoRef.current = false; return; }
    disparadorRef.current?.focus();
  }, [open]);

  /**
   * Búsqueda con freno: 300 ms de espera y mínimo dos letras.
   *
   * Detrás de cada llamada hay varias consultas —una por fuente— así que
   * disparar por pulsación multiplicaría eso por cada letra escrita. El
   * `AbortController` cancela la respuesta vieja: sin él, una consulta lenta
   * podía llegar después de una rápida y pintar resultados de un texto que ya
   * no está en la caja.
   */
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CARACTERES) { setGrupos([]); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/buscar?q=${encodeURIComponent(q)}&modulo=${modulo}`,
          { signal: ctrl.signal },
        );
        const data = r.ok ? await r.json() : null;
        setGrupos(data?.grupos ?? []);
      } catch {
        // Abortada o de red: se deja lo que hubiera y no se pinta un error.
        if (ctrl.signal.aborted) return;
        setGrupos([]);
      }
      setLoading(false);
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, modulo]);

  function navigate(href: string) {
    navegandoRef.current = true;
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  const hayResultados = grupos.some(g => g.items.length > 0);
  const buscando = query.trim().length >= MIN_CARACTERES;

  return (
    <>
      {/*
        El disparador. En escritorio es una caja con borde y ancho: tiene que
        leerse como «aquí se escribe», no como un icono más.

        No es un <input> de verdad a propósito — lo que escribe el usuario va en
        el input del modal, y tener dos cajas sincronizadas es la forma
        conocida de perder la primera letra. Va con `role="searchbox"` para que
        un lector de pantalla lo anuncie por lo que hace.
      */}
      <Box
        component="button"
        type="button"
        id="global-search-trigger"
        ref={disparadorRef}
        onClick={abrir}
        role="searchbox"
        aria-label="Buscar en todo el sistema"
        aria-keyshortcuts="Meta+K Control+K"
        aria-expanded={open}
        sx={{
          display:      { xs: 'none', sm: 'flex' },
          alignItems:   'center',
          gap:          1,
          // Ocupa el hueco central entero hasta el tope. El hueco lo pone
          // ModuleHeader; aquí solo se dice hasta dónde crecer. Abierto, el
          // tope se retira: manda el hueco, que para entonces es la barra
          // entera porque los vecinos se han apartado.
          width:        '100%',
          maxWidth:     open ? ANCHO_FOCO : ANCHO_BUSCADOR,
          height:       36,
          px:           1.5,
          borderRadius: '10px',
          bgcolor:      '#f9fafb',
          border:       '1px solid #e5e7eb',
          color:        'text.secondary',
          fontSize:     '0.875rem',
          fontFamily:   'inherit',
          textAlign:    'left',
          cursor:       'text',
          transition:   'border-color 0.15s, background-color 0.15s, box-shadow 0.15s',
          '&:hover':    { bgcolor: '#fff', borderColor: '#c7d2fe' },
          // Foco visible: se llega aquí con Tab y hay que verlo.
          '&:focus-visible': {
            outline:     'none',
            bgcolor:     '#fff',
            borderColor: 'primary.main',
            boxShadow:   '0 0 0 3px rgba(54,88,225,0.18)',
          },
        }}
      >
        <Search style={{ width: 16, height: 16, flexShrink: 0, color: '#9ca3af' }} />
        <Box component="span" sx={{
          flex: 1, minWidth: 0, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#9ca3af',
        }}>
          {PLACEHOLDER[modulo]}
        </Box>
        <Box
          component="kbd"
          sx={{
            display:      { xs: 'none', md: 'block' },
            flexShrink:   0,
            fontSize:     '0.6875rem',
            color:        '#9ca3af',
            bgcolor:      '#f3f4f6',
            border:       '1px solid #e5e7eb',
            borderRadius: '4px',
            px:           0.75,
            py:           0.125,
            fontFamily:   'monospace',
          }}
        >
          ⌘K
        </Box>
      </Box>

      {/*
        Móvil: la barra no da para una caja de 460 px sin aplastar el conmutador
        de empresa y el de módulos, así que aquí sí es un icono. Es el mismo
        modal al pulsarlo, y ese sí ocupa la pantalla entera.
      */}
      <IconButton
        onClick={abrir}
        size="small"
        aria-label="Buscar en todo el sistema"
        aria-expanded={open}
        sx={{ display: { xs: 'flex', sm: 'none' }, color: 'text.secondary' }}
      >
        <Search style={{ width: 20, height: 20 }} />
      </IconButton>

      {/* Desplegable */}
      {open && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <Box
            onClick={() => setOpen(false)}
            sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.4)' }}
          />
          {/*
            Colgado del campo: mismo borde izquierdo, mismo ancho. Va con
            posición fija y coordenadas medidas —y no `absolute` dentro del
            header— porque el header vive bajo un contenedor con
            `overflow: hidden` y el panel saldría recortado a los 56 px de la
            barra.

            Sin medida (móvil, donde el disparador es un icono) cae centrado y
            casi a pantalla completa, que es como se usa ahí.
          */}
          <Paper
            elevation={0}
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda global"
            sx={{
              position: 'absolute',
              ...(caja
                ? { left: caja.left, top: caja.top, width: caja.width }
                : { left: 16, right: 16, top: '6vh', mx: 'auto', maxWidth: ANCHO_BUSCADOR }),
              bgcolor: '#ffffff',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid #e5e7eb',
              boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            }}
          >
            <Box sx={cmdkSx}>
              {/* El filtrado lo hace el servidor; cmdk solo navega la lista. */}
              <Command shouldFilter={false} label="Búsqueda global">
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <Search style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
                  <Command.Input
                    value={query}
                    onValueChange={setQuery}
                    placeholder={PLACEHOLDER[modulo]}
                    autoFocus
                  />
                  {query && (
                    <IconButton
                      onClick={() => setQuery('')}
                      aria-label="Limpiar búsqueda"
                      sx={{ p: 0.25, color: '#9ca3af', '&:hover': { color: '#4b5563', bgcolor: 'transparent' } }}
                    >
                      <X style={{ width: 16, height: 16 }} />
                    </IconButton>
                  )}
                  <Box
                    component="kbd"
                    sx={{
                      display: { xs: 'none', sm: 'inline-flex' },
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      bgcolor: '#f3f4f6',
                      borderRadius: '4px',
                      px: 0.75,
                      py: 0.25,
                    }}
                  >
                    ESC
                  </Box>
                </Box>

                <Command.List>
                  {loading && !hayResultados && (
                    <Command.Empty>Buscando...</Command.Empty>
                  )}

                  {!loading && buscando && !hayResultados && (
                    <Command.Empty>
                      Sin resultados para &ldquo;{query}&rdquo;
                    </Command.Empty>
                  )}

                  {/* Resultados agrupados por tipo. El orden lo manda el
                      servidor: primero el módulo donde estás. */}
                  {hayResultados && grupos.map(g => {
                    const Icon = ICONO_TIPO[g.tipo] ?? FileText;
                    return (
                      <Command.Group key={g.tipo} heading={<Encabezado>{g.titulo}</Encabezado>}>
                        {g.items.map(r => (
                          <Command.Item
                            key={`${g.tipo}-${r.id}`}
                            value={`${g.tipo}-${r.id}`}
                            onSelect={() => navigate(r.href)}
                            style={{ padding: '10px 12px' }}
                          >
                            <Box sx={{ height: 28, width: 28, borderRadius: '6px', bgcolor: '#e0e7fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon style={{ width: 14, height: 14, color: '#3658e1' }} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{r.label}</Typography>
                              <Typography noWrap sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{r.sublabel}</Typography>
                            </Box>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    );
                  })}

                  {!buscando && (
                    <>
                      <Command.Group heading={<Encabezado>Páginas</Encabezado>}>
                        {estaticosVisibles.filter(i => i.grupo === 'Páginas').map(item => (
                          <Command.Item
                            key={item.href + item.label}
                            value={item.label}
                            onSelect={() => navigate(item.href)}
                            style={{ padding: '8px 12px' }}
                          >
                            <item.icon style={{ width: 16, height: 16, color: '#9ca3af' }} />
                            <Typography component="span" sx={{ fontSize: '0.875rem', color: '#374151' }}>{item.label}</Typography>
                          </Command.Item>
                        ))}
                      </Command.Group>
                      <Command.Group heading={<Encabezado>Acciones rápidas</Encabezado>}>
                        {estaticosVisibles.filter(i => i.grupo === 'Acciones').map(item => (
                          <Command.Item
                            key={item.href + item.label}
                            value={item.label}
                            onSelect={() => navigate(item.href)}
                            style={{ padding: '8px 12px' }}
                          >
                            <item.icon style={{ width: 16, height: 16, color: '#5b73ec' }} />
                            <Typography component="span" sx={{ fontSize: '0.875rem', color: '#374151' }}>{item.label}</Typography>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    </>
                  )}
                </Command.List>

                <Box
                  sx={{
                    borderTop: '1px solid #f3f4f6',
                    px: 2,
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                  }}
                >
                  <Box component="span"><Box component="kbd" sx={{ bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.5, py: 0.25 }}>↑↓</Box> navegar</Box>
                  <Box component="span"><Box component="kbd" sx={{ bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.5, py: 0.25 }}>↵</Box> abrir</Box>
                  <Box component="span"><Box component="kbd" sx={{ bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.5, py: 0.25 }}>Esc</Box> cerrar</Box>
                </Box>
              </Command>
            </Box>
          </Paper>
        </Box>
      )}
    </>
  );
}
