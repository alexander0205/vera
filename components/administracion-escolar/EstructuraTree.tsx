'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, Trash2, X, CalendarDays, Layers, GraduationCap, DoorOpen, CheckCircle2, Pencil, Check,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import {
  Agarradera, Fila, Nombre, Plegador, Resumen, SANGRIA, Tanda, plural, porOrden,
} from './arbol';
import { fechasDesdeNombre } from '@/lib/administracion-escolar/anio-escolar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Periodo {
  id: number; nombre: string; activo: boolean;
  /** De aquí sale cuántas cuotas caben en el año: agosto a junio son once. */
  fechaInicio: string | null; fechaFin: string | null;
}
interface Servicio { id: number; periodoId: number; nombre: string; tanda: string | null; orden: number }
interface Curso { id: number; servicioId: number; nombre: string; orden: number }   // = grado
interface Seccion { id: number; gradoId: number; nombre: string; orden: number }    // = cursos físicos

type AddNivel = 'periodo' | 'servicio' | 'curso' | 'seccion';
interface AddState { nivel: AddNivel; parentId: number; nombre: string; tanda: string }

/**
 * Renombrar existe en los cuatro niveles; la tanda solo en el servicio y las
 * fechas solo en el período.
 */
type EditNivel = 'periodo' | 'servicio' | 'grado' | 'seccion';
interface EditState {
  nivel: EditNivel; id: number; nombre: string; tanda: string;
  fechaInicio: string; fechaFin: string;
}

/** Ruta de la API y clave de la fila que devuelve, por nivel. */
const RUTA_EDIT: Record<EditNivel, { recurso: string; clave: string }> = {
  periodo:  { recurso: 'periodos',  clave: 'periodo'  },
  servicio: { recurso: 'servicios', clave: 'servicio' },
  grado:    { recurso: 'grados',    clave: 'grado'    },
  seccion:  { recurso: 'cursos',    clave: 'curso'    },
};

/** "1 ago 2026 – 30 jun 2027", o nulo si al año le falta alguna punta. */
function rango(p: { fechaInicio: string | null; fechaFin: string | null }): string | null {
  if (!p.fechaInicio || !p.fechaFin) return null;
  const corta = (iso: string) => {
    const [a, m, d] = iso.split('-');
    return `${Number(d)} ${MESES_CORTOS[Number(m) - 1]} ${a}`;
  };
  return `${corta(p.fechaInicio)} – ${corta(p.fechaFin)}`;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (url: string, body: unknown) =>
  fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Campos de renombrado en línea. A nivel de módulo por lo mismo que `FilaAdd`:
 * dentro del árbol cada tecla lo remontaría y el autoFocus robaría el foco.
 */
function CamposEdicion({ edicion, setEdicion, onGuardar }: {
  edicion: EditState;
  setEdicion: React.Dispatch<React.SetStateAction<EditState | null>>;
  onGuardar: () => void;
}) {
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onGuardar(); }
    if (e.key === 'Escape') setEdicion(null);
  };
  return (
    <>
      <Input autoFocus className="h-7 min-w-0 flex-1" value={edicion.nombre}
        onChange={(e) => setEdicion((x) => x && ({ ...x, nombre: e.target.value }))}
        onKeyDown={teclas} />
      {edicion.nivel === 'servicio' && (
        <Input className="h-7 w-32 shrink-0" placeholder="Tanda" value={edicion.tanda}
          onChange={(e) => setEdicion((x) => x && ({ ...x, tanda: e.target.value }))}
          onKeyDown={teclas} />
      )}
      {/* Las fechas del año escolar se editan aquí y no en una pantalla aparte
          porque son del año, no de otra cosa, y hasta ahora no había DÓNDE
          tocarlas: la API las validaba y nadie las podía escribir. De ellas
          sale cuántas cuotas genera el calendario de cobro. */}
      {edicion.nivel === 'periodo' && (
        <>
          <span className="shrink-0 text-xs text-gray-400">del</span>
          <Input type="date" className="h-7 w-[8.5rem] shrink-0" aria-label="Fecha de inicio"
            value={edicion.fechaInicio}
            onChange={(e) => setEdicion((x) => x && ({ ...x, fechaInicio: e.target.value }))}
            onKeyDown={teclas} />
          <span className="shrink-0 text-xs text-gray-400">al</span>
          <Input type="date" className="h-7 w-[8.5rem] shrink-0" aria-label="Fecha de fin"
            value={edicion.fechaFin}
            onChange={(e) => setEdicion((x) => x && ({ ...x, fechaFin: e.target.value }))}
            onKeyDown={teclas} />
        </>
      )}
      <button type="button" className="shrink-0 text-zero-600 hover:text-zero-700" title="Guardar"
        onClick={onGuardar}><Check className="h-4 w-4" /></button>
      <button type="button" className="shrink-0 text-gray-400 hover:text-gray-600" title="Cancelar"
        onClick={() => setEdicion(null)}><X className="h-3.5 w-3.5" /></button>
    </>
  );
}

/** Subir/bajar un nodo entre sus hermanos. Sin flecha en los extremos. */
function Mover({ arriba, abajo }: { arriba?: () => void; abajo?: () => void }) {
  const cls = 'shrink-0 rounded text-gray-300 enabled:hover:bg-gray-200 enabled:hover:text-gray-700 disabled:opacity-30';
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" className={cls} disabled={!arriba} onClick={arriba} title="Subir">
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={cls} disabled={!abajo} onClick={abajo} title="Bajar">
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/**
 * Formulario inline de alta (una fila). Definido a nivel de módulo (identidad
 * estable): si viviera dentro de EstructuraTree, cada tecla lo remontaría y el
 * autoFocus del primer campo robaría el foco (al escribir la tanda saltaba al
 * nombre).
 */
function FilaAdd({
  sangria, add, setAdd, onGuardar, ocupado,
}: {
  sangria: number;
  add: AddState;
  setAdd: React.Dispatch<React.SetStateAction<AddState | null>>;
  onGuardar: () => void;
  ocupado: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: 8 + sangria * SANGRIA }}>
      <Input autoFocus className="h-8 max-w-52"
        placeholder={add.nivel === 'periodo' ? 'Año escolar (ej. 2026-2027)' : add.nivel === 'servicio' ? 'Servicio (ej. Secundario)' : add.nivel === 'curso' ? 'Grado (ej. Primero)' : 'Sección (ej. A)'}
        value={add.nombre} onChange={(e) => setAdd((a) => a && ({ ...a, nombre: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onGuardar(); } }} />
      {add.nivel === 'servicio' && (
        <Input className="h-8 max-w-40" placeholder="Tanda (ej. Matutina)" value={add.tanda}
          onChange={(e) => setAdd((a) => a && ({ ...a, tanda: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onGuardar(); } }} />
      )}
      <Button size="sm" className="h-8 bg-zero-600 hover:bg-zero-700" onClick={onGuardar} disabled={ocupado || !add.nombre.trim()}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => setAdd(null)}>Cancelar</Button>
    </div>
  );
}

/**
 * La estructura académica como UN árbol plegable:
 *   Período → Servicio (tanda) → Grado → Sección.
 * Todo inline y de un clic para agregar/quitar. Altas optimistas (sin recargar).
 *
 * Se pliega porque un colegio real no cabe abierto: cuatro servicios con sus
 * grados y secciones pasan de sesenta filas, y todo lo que va debajo del árbol
 * —empezando por el botón de crear el año escolar— quedaba fuera de la
 * pantalla. Al abrir solo se despliega el año activo, con sus servicios
 * cerrados: el resumen de cada rama dice lo que hay dentro sin abrirla.
 */
export function EstructuraTree() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);       // grados
  const [secciones, setSecciones] = useState<Seccion[]>([]); // admin_escolar_cursos
  const [porBorrar, setPorBorrar] = useState<{ url: string; msg: string } | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState<AddState | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [edicion, setEdicion] = useState<EditState | null>(null);
  /** Ramas desplegadas, por clave `p:1` / `s:5` / `g:27`. */
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const esta = (clave: string) => abiertos.has(clave);
  const alternar = (clave: string) => setAbiertos((s) => {
    const n = new Set(s);
    if (!n.delete(clave)) n.add(clave);
    return n;
  });
  const desplegar = (...claves: string[]) => setAbiertos((s) => new Set([...s, ...claves]));

  // `spinner` solo en la primera carga: al agregar/eliminar revalidamos en
  // silencio para que el árbol no parpadee (nada de "recargar" en cada acción).
  //
  // Las lecturas van con `no-store`. El servidor ya cachea por etiqueta y la
  // invalida al escribir, pero el navegador tiene su PROPIO caché HTTP, y ahí
  // se quedaba la estructura vieja: tras reordenar, una recarga devolvía el
  // orden anterior, el estado local lo adoptaba y el siguiente movimiento lo
  // guardaba de verdad — el árbol se "desordenaba solo".
  const cargar = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    try {
      const [p, sv, g, sec] = await Promise.all([
        fetch('/api/administracion-escolar/periodos', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/administracion-escolar/servicios', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/administracion-escolar/grados', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/administracion-escolar/cursos', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      const listaPeriodos: Periodo[] = p.periodos ?? [];
      setPeriodos(listaPeriodos);
      setServicios(sv.servicios ?? []);
      setCursos(g.grados ?? []);
      setSecciones(sec.cursos ?? []);
      // Solo en la primera carga: el año en curso abierto, sus servicios
      // cerrados. Revalidar después no debe replegar lo que el usuario abrió.
      if (spinner) {
        const activo = listaPeriodos.find((x) => x.activo) ?? listaPeriodos[0];
        if (activo) setAbiertos(new Set([`p:${activo.id}`]));
      }
    } finally { if (spinner) setLoading(false); }
  }, []);
  useEffect(() => { void cargar(true); }, [cargar]);

  // Agregar despliega la rama de destino: si no, la fila del formulario nace
  // dentro de una rama cerrada y parece que el botón no hizo nada.
  const abrir = (nivel: AddNivel, parentId = 0) => {
    if (nivel === 'servicio') desplegar(`p:${parentId}`);
    if (nivel === 'curso')    desplegar(`s:${parentId}`);
    if (nivel === 'seccion')  desplegar(`g:${parentId}`);
    setAdd({ nivel, parentId, nombre: '', tanda: '' });
  };

  // Alta optimista: insertamos la fila que devuelve el POST en el estado local,
  // sin volver a bajar todo. Instantáneo y sin parpadeo.
  async function guardarAdd() {
    if (!add || !add.nombre.trim()) return;
    const nombre = add.nombre.trim();
    setOcupado(true);
    try {
      if (add.nivel === 'periodo') {
        // "2026-2027" ya dice cuándo empieza y cuándo acaba el año escolar
        // dominicano. Rellenarlas aquí evita que el año nazca sin fechas y que
        // el calendario de cobro se quede sin saber cuántas cuotas caben; si el
        // colegio tiene otro calendario, las corrige con el lápiz.
        const r = await post('/api/administracion-escolar/periodos', {
          nombre, ...(fechasDesdeNombre(nombre) ?? {}),
        });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }
        setPeriodos((xs) => [...xs, j.periodo as Periodo]);
      } else if (add.nivel === 'servicio') {
        const r = await post('/api/administracion-escolar/servicios', { periodoId: add.parentId, nombre, tanda: add.tanda.trim() || null, orden: servicios.filter((s) => s.periodoId === add.parentId).length });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }
        setServicios((xs) => [...xs, j.servicio as Servicio]);
      } else if (add.nivel === 'curso') {
        const r = await post('/api/administracion-escolar/grados', { servicioId: add.parentId, nombre, orden: cursos.filter((c) => c.servicioId === add.parentId).length });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }
        setCursos((xs) => [...xs, j.grado as Curso]);
      } else {
        const r = await post('/api/administracion-escolar/cursos', { gradoId: add.parentId, nombre, orden: secciones.filter((s) => s.gradoId === add.parentId).length });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo agregar la sección.'); return; }
        setSecciones((xs) => [...xs, j.curso as Seccion]);
      }
      setAdd(null);
    } finally { setOcupado(false); }
  }

  // Abre el alta de sección con la SIGUIENTE letra libre como sugerencia
  // (editable). No crea nada hasta que el usuario confirma.
  function abrirSeccion(gradoId: number) {
    const usadas = secciones.filter((s) => s.gradoId === gradoId).map((s) => s.nombre.toUpperCase());
    let letra = 'A';
    for (let i = 0; i < 26; i++) { const L = String.fromCharCode(65 + i); if (!usadas.includes(L)) { letra = L; break; } }
    desplegar(`g:${gradoId}`);
    setAdd({ nivel: 'seccion', parentId: gradoId, nombre: letra, tanda: '' });
  }

  /**
   * Lleva un nodo a una posición concreta entre sus hermanos.
   *
   * Renumera la lista ENTERA de 0..n-1 en vez de tocar solo los dos afectados.
   * Lo que bajó de SIGERD viene con empates —en Secundario había dos grados en
   * orden 0 y otros dos en el 1— y ahí un intercambio no mueve nada: los deja
   * igual de empatados, desempatando por nombre como antes. Renumerando, el
   * primer movimiento arregla de paso el desorden heredado.
   *
   * Solo se mandan al servidor las filas cuyo `orden` cambió de verdad.
   */
  async function reordenar<T extends { id: number; orden: number; nombre: string }>(
    hermanos: T[],
    id: number,
    destino: number,
    nivel: 'servicio' | 'grado',
    aplicar: (nuevos: Map<number, number>) => void,
  ) {
    const i = hermanos.findIndex((x) => x.id === id);
    if (i < 0) return;
    const d = Math.max(0, Math.min(hermanos.length - 1, destino));
    if (i === d) return;

    const lista = [...hermanos];
    const [movido] = lista.splice(i, 1);
    lista.splice(d, 0, movido);

    const cambios = new Map<number, number>();
    lista.forEach((x, k) => { if (x.orden !== k) cambios.set(x.id, k); });
    if (cambios.size === 0) return;

    aplicar(cambios);  // optimista: la fila salta al instante
    // Una sola llamada, no una por fila: reordenar es una operación aunque
    // toque a varios hermanos, y en paralelo el caché de la estructura se
    // quedaba con la lista a medio renumerar.
    const r = await patch('/api/administracion-escolar/orden', {
      nivel,
      items: [...cambios].map(([hijoId, orden]) => ({ id: hijoId, orden })),
    });
    // Si falló, el estado local quedó mintiendo: se vuelve a bajar todo.
    if (!r.ok) { alert('No se pudo guardar el orden.'); await cargar(); }
  }

  const hermanosServicio = (periodoId: number) =>
    servicios.filter((s) => s.periodoId === periodoId).sort(porOrden);
  const hermanosGrado = (servicioId: number) =>
    cursos.filter((c) => c.servicioId === servicioId).sort(porOrden);

  const colocarServicio = (periodoId: number, id: number, destino: number) => reordenar(
    hermanosServicio(periodoId), id, destino, 'servicio',
    (c) => setServicios((xs) => xs.map((x) => (c.has(x.id) ? { ...x, orden: c.get(x.id)! } : x))),
  );

  const colocarGrado = (servicioId: number, id: number, destino: number) => reordenar(
    hermanosGrado(servicioId), id, destino, 'grado',
    (c) => setCursos((xs) => xs.map((x) => (c.has(x.id) ? { ...x, orden: c.get(x.id)! } : x))),
  );

  /**
   * Arrastre nativo del navegador, sin librería: la lista es plana dentro de
   * cada padre y solo hace falta reordenar hermanos. `sobre` guarda encima de
   * qué fila está el cursor y de qué lado, para pintar la línea de destino.
   */
  const [arrastre, setArrastre] = useState<{ nivel: 'servicio' | 'grado'; padreId: number; id: number } | null>(null);
  const [sobre, setSobre] = useState<{ id: number; lado: 'arriba' | 'abajo' } | null>(null);

  const puedeSoltar = (nivel: 'servicio' | 'grado', padreId: number) =>
    arrastre?.nivel === nivel && arrastre.padreId === padreId;

  /** Props que convierten una fila en arrastrable y en zona de destino. */
  function dnd(nivel: 'servicio' | 'grado', padreId: number, id: number) {
    return {
      // Con una edición abierta no se arrastra: dentro de una fila
      // `draggable` no se puede seleccionar el texto del input.
      draggable: edicion === null,
      onDragStart: (e: React.DragEvent) => {
        setArrastre({ nivel, padreId, id });
        e.dataTransfer.effectAllowed = 'move';
        // Firefox no inicia el arrastre si no se escribe algo en dataTransfer.
        e.dataTransfer.setData('text/plain', String(id));
      },
      onDragOver: (e: React.DragEvent) => {
        if (!puedeSoltar(nivel, padreId) || arrastre?.id === id) return;
        e.preventDefault();          // sin esto el navegador no permite soltar
        e.dataTransfer.dropEffect = 'move';
        const caja = e.currentTarget.getBoundingClientRect();
        const lado = e.clientY < caja.top + caja.height / 2 ? 'arriba' : 'abajo';
        setSobre((s) => (s?.id === id && s.lado === lado ? s : { id, lado }));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const dest = sobre;
        const orig = arrastre;
        setArrastre(null); setSobre(null);
        if (!orig || !dest || !puedeSoltar(nivel, padreId)) return;

        const lista = nivel === 'servicio' ? hermanosServicio(padreId) : hermanosGrado(padreId);
        const iOrig = lista.findIndex((x) => x.id === orig.id);
        const iSobre = lista.findIndex((x) => x.id === dest.id);
        if (iOrig < 0 || iSobre < 0) return;
        // Índice de inserción en la lista YA sin el elemento arrastrado: si
        // venía de más arriba, todo lo de abajo subió un puesto.
        let destino = dest.lado === 'arriba' ? iSobre : iSobre + 1;
        if (iOrig < destino) destino -= 1;

        void (nivel === 'servicio'
          ? colocarServicio(padreId, orig.id, destino)
          : colocarGrado(padreId, orig.id, destino));
      },
      onDragEnd: () => { setArrastre(null); setSobre(null); },
    };
  }

  /** Marca de destino y atenuado de la fila que se está arrastrando. */
  const pistas = (nivel: 'servicio' | 'grado', padreId: number, id: number) => ({
    marca: puedeSoltar(nivel, padreId) && sobre?.id === id ? sobre.lado : null,
    arrastrando: arrastre?.id === id && arrastre.nivel === nivel,
  });

  const editando = (nivel: EditNivel, id: number) => edicion?.nivel === nivel && edicion.id === id;
  const abrirEdicion = (
    nivel: EditNivel, id: number, nombre: string,
    tanda: string | null = '', fechas: { inicio: string | null; fin: string | null } | null = null,
  ) => setEdicion({
    nivel, id, nombre, tanda: tanda ?? '',
    fechaInicio: fechas?.inicio ?? '', fechaFin: fechas?.fin ?? '',
  });

  /** Renombra en cualquiera de los cuatro niveles. Un solo camino de guardado. */
  async function guardarEdicion() {
    if (!edicion || !edicion.nombre.trim()) return;
    const { nivel, id, nombre, tanda, fechaInicio, fechaFin } = edicion;
    const { recurso, clave } = RUTA_EDIT[nivel];
    // Una sola fecha no sirve de nada: el calendario necesita el rango entero
    // para saber cuántos meses tiene el año. El servidor lo rechaza igual, pero
    // decirlo aquí evita el viaje.
    if (nivel === 'periodo' && Boolean(fechaInicio) !== Boolean(fechaFin)) {
      alert('Pon las dos fechas del año escolar, o ninguna.');
      return;
    }
    const r = await patch(`/api/administracion-escolar/${recurso}/${id}`, {
      nombre: nombre.trim(),
      ...(nivel === 'servicio' ? { tanda: tanda.trim() || null } : {}),
      ...(nivel === 'periodo' ? { fechaInicio: fechaInicio || null, fechaFin: fechaFin || null } : {}),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }

    // Se toma lo que devolvió el servidor: él normaliza (recorta, pasa la
    // tanda vacía a NULL) y así la pantalla no queda diciendo otra cosa.
    const fila = j[clave] ?? {};
    const nom = String(fila.nombre ?? nombre).trim();
    if (nivel === 'periodo')  setPeriodos((xs) => xs.map((x) => (x.id === id ? {
      ...x, nombre: nom,
      fechaInicio: fila.fechaInicio ?? (fechaInicio || null),
      fechaFin:    fila.fechaFin    ?? (fechaFin || null),
    } : x)));
    if (nivel === 'servicio') setServicios((xs) => xs.map((x) => (x.id === id
      ? { ...x, nombre: nom, tanda: fila.tanda ?? (tanda.trim() || null) } : x)));
    if (nivel === 'grado')    setCursos((xs) => xs.map((x) => (x.id === id ? { ...x, nombre: nom } : x)));
    if (nivel === 'seccion')  setSecciones((xs) => xs.map((x) => (x.id === id ? { ...x, nombre: nom } : x)));
    setEdicion(null);
  }

  async function activarPeriodo(id: number) {
    // Optimista: marca uno activo y apaga los demás sin recargar.
    setPeriodos((xs) => xs.map((p) => ({ ...p, activo: p.id === id })));
    await patch(`/api/administracion-escolar/periodos/${id}`, { activo: true });
    await Promise.all(periodos.filter((p) => p.id !== id && p.activo).map((p) => patch(`/api/administracion-escolar/periodos/${p.id}`, { activo: false })));
  }

  /**
   * Pide confirmación de un borrado. Ya no con `window.confirm`.
   *
   * En el navegador embebido de la app `confirm()` devuelve `false` al instante
   * y sin enseñar nada, así que TODOS los borrados de este árbol no hacían
   * nada: se pulsaba la X y no pasaba absolutamente nada, ni error ni aviso.
   * El diálogo propio se ve siempre y además dice qué se va a borrar.
   */
  function borrar(url: string, msg: string) {
    setPorBorrar({ url, msg });
  }

  async function confirmarBorrado() {
    if (!porBorrar) return;
    setBorrando(true);
    try {
      const r = await fetch(porBorrar.url, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErrorBorrado(j.error ?? 'No se pudo eliminar.');
        return;
      }
      setPorBorrar(null);
      setErrorBorrado(null);
      await cargar();
    } finally {
      setBorrando(false);
    }
  }

  const btnAdd = 'shrink-0 inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-zero-400 hover:text-zero-600';
  const btnDel = 'shrink-0 text-gray-300 hover:text-red-500';

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* El alta del año escolar vive en el encabezado y no al pie del árbol:
          abajo quedaba enterrada bajo decenas de filas y no se encontraba. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Layers className="h-4 w-4 text-zero-600" /> Estructura escolar
        </h2>
        <span className="text-xs text-gray-400">Período → Servicio → Grado → Sección</span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 gap-1.5"
          onClick={() => abrir('periodo')} disabled={add?.nivel === 'periodo'}>
          <Plus className="h-4 w-4" /> Nuevo año escolar
        </Button>
      </div>

      <div className="px-2 py-1.5">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : (
          <>
            {periodos.length === 0 && add?.nivel !== 'periodo' && (
              <p className="px-2 py-3 text-center text-sm text-gray-400">
                Sin años escolares. Crea el primero con <span className="font-medium text-gray-500">Nuevo año escolar</span>, arriba.
              </p>
            )}

            {periodos.map((p) => {
              const svs = servicios.filter((s) => s.periodoId === p.id).sort(porOrden);
              const clave = `p:${p.id}`;
              const abierto = esta(clave);
              const seccDelPeriodo = svs.reduce((n, sv) => n + cursos
                .filter((c) => c.servicioId === sv.id)
                .reduce((m, c) => m + secciones.filter((s) => s.gradoId === c.id).length, 0), 0);
              return (
              <div key={p.id}>
                <Fila sangria={0}>
                  <Plegador abierto={abierto} vacio={svs.length === 0} onClick={() => alternar(clave)} />
                  <CalendarDays className="h-4 w-4 shrink-0 text-zero-600" />
                  {editando('periodo', p.id) && edicion ? (
                    <CamposEdicion edicion={edicion} setEdicion={setEdicion} onGuardar={guardarEdicion} />
                  ) : (<>
                  <Nombre className="font-semibold text-gray-900"
                    onClick={() => { if (svs.length) alternar(clave); }}>{p.nombre}</Nombre>
                  {p.activo
                    ? <Badge className="border-zero-200 bg-zero-50 text-zero-700">Activo</Badge>
                    : <button onClick={() => activarPeriodo(p.id)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-zero-600"><CheckCircle2 className="h-3.5 w-3.5" />Activar</button>}
                  {/* Las fechas se enseñan en la fila, no solo al editar: sin
                      ellas el calendario de cobro no sabe cuántas cuotas caben
                      en el año, y el aviso tiene que verse antes de llegar a
                      configurar los conceptos. */}
                  <span className={`shrink-0 text-xs ${rango(p) ? 'text-gray-400' : 'text-amber-600'}`}>
                    {rango(p) ?? 'sin fechas'}
                  </span>
                  {!abierto && svs.length > 0 && (
                    <Resumen partes={[plural(svs.length, 'servicio', 'servicios'), plural(seccDelPeriodo, 'sección', 'secciones')]} />
                  )}
                  <button className={btnDel} title="Renombrar y fechar el año escolar"
                    onClick={() => abrirEdicion('periodo', p.id, p.nombre, '', { inicio: p.fechaInicio, fin: p.fechaFin })}><Pencil className="h-3.5 w-3.5" /></button>
                  <button className={btnAdd} onClick={() => abrir('servicio', p.id)}><Plus className="h-3 w-3" /> Servicio</button>
                  <button className={btnDel} title="Eliminar período" onClick={() => borrar(`/api/administracion-escolar/periodos/${p.id}`, `¿Eliminar el período "${p.nombre}"?`)}><Trash2 className="h-4 w-4" /></button>
                  </>)}
                </Fila>

                {abierto && svs.map((sv, iSv) => {
                  const grs = cursos.filter((c) => c.servicioId === sv.id).sort(porOrden);
                  const claveS = `s:${sv.id}`;
                  const abiertoS = esta(claveS);
                  const seccDelServicio = grs.reduce((m, c) => m + secciones.filter((s) => s.gradoId === c.id).length, 0);
                  return (
                  <div key={sv.id}>
                    <Fila sangria={1} {...dnd('servicio', p.id, sv.id)} {...pistas('servicio', p.id, sv.id)}>
                      <Plegador abierto={abiertoS} vacio={grs.length === 0} onClick={() => alternar(claveS)} />
                      <Agarradera />
                      <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      {editando('servicio', sv.id) && edicion ? (
                        <CamposEdicion edicion={edicion} setEdicion={setEdicion} onGuardar={guardarEdicion} />
                      ) : (<>
                      <Nombre className="text-sm font-medium text-gray-800"
                        onClick={() => { if (grs.length) alternar(claveS); }}>{sv.nombre}</Nombre>
                      {sv.tanda && <Tanda>{sv.tanda}</Tanda>}
                      {!abiertoS && grs.length > 0 && (
                        <Resumen partes={[plural(grs.length, 'grado', 'grados'), plural(seccDelServicio, 'sección', 'secciones')]} />
                      )}
                      <Mover
                        arriba={iSv > 0 ? () => void colocarServicio(p.id, sv.id, iSv - 1) : undefined}
                        abajo={iSv < svs.length - 1 ? () => void colocarServicio(p.id, sv.id, iSv + 1) : undefined} />
                      <button className={btnDel} title="Renombrar servicio" onClick={() => abrirEdicion('servicio', sv.id, sv.nombre, sv.tanda)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className={btnAdd} onClick={() => abrir('curso', sv.id)}><Plus className="h-3 w-3" /> Grado</button>
                      <button className={btnDel} title="Eliminar servicio" onClick={() => borrar(`/api/administracion-escolar/servicios/${sv.id}`, `¿Eliminar el servicio "${sv.nombre}"?`)}><X className="h-3.5 w-3.5" /></button>
                      </>)}
                    </Fila>

                    {abiertoS && grs.map((c, iGr) => {
                      // Por `orden` como los otros dos niveles, no por nombre: era el
                      // único escalón del árbol que se ordenaba distinto.
                      const secs = secciones.filter((s) => s.gradoId === c.id).sort(porOrden);
                      const claveG = `g:${c.id}`;
                      const abiertoG = esta(claveG);
                      return (
                      <div key={c.id}>
                        <Fila sangria={2} {...dnd('grado', sv.id, c.id)} {...pistas('grado', sv.id, c.id)}>
                          <Plegador abierto={abiertoG} vacio={secs.length === 0} onClick={() => alternar(claveG)} />
                          <Agarradera />
                          <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          {editando('grado', c.id) && edicion ? (
                            <CamposEdicion edicion={edicion} setEdicion={setEdicion} onGuardar={guardarEdicion} />
                          ) : (<>
                          <Nombre className="text-sm text-gray-800"
                            onClick={() => { if (secs.length) alternar(claveG); }}>{c.nombre}</Nombre>
                          {!abiertoG && secs.length > 0 && (
                            <Resumen partes={[`Secciones ${secs.map((s) => s.nombre).join(', ')}`]} />
                          )}
                          <Mover
                            arriba={iGr > 0 ? () => void colocarGrado(sv.id, c.id, iGr - 1) : undefined}
                            abajo={iGr < grs.length - 1 ? () => void colocarGrado(sv.id, c.id, iGr + 1) : undefined} />
                          <button className={btnDel} title="Renombrar grado" onClick={() => abrirEdicion('grado', c.id, c.nombre)}><Pencil className="h-3.5 w-3.5" /></button>
                          <button className={btnAdd} onClick={() => abrirSeccion(c.id)}><Plus className="h-3 w-3" /> Sección</button>
                          <button className={btnDel} title="Eliminar grado" onClick={() => borrar(`/api/administracion-escolar/grados/${c.id}`, `¿Eliminar el grado "${c.nombre}"?`)}><X className="h-3.5 w-3.5" /></button>
                          </>)}
                        </Fila>
                        {abiertoG && secs.map((s) => (
                          <Fila key={s.id} sangria={3}>
                            <DoorOpen className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                            {editando('seccion', s.id) && edicion ? (
                              <>
                                <span className="shrink-0 text-sm text-gray-500">Sección</span>
                                <CamposEdicion edicion={edicion} setEdicion={setEdicion} onGuardar={guardarEdicion} />
                              </>
                            ) : (
                              <>
                                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">Sección {s.nombre}</span>
                                <button className={btnDel} title="Renombrar sección" onClick={() => abrirEdicion('seccion', s.id, s.nombre)}><Pencil className="h-3.5 w-3.5" /></button>
                                <button className={btnDel} title="Eliminar sección" onClick={() => borrar(`/api/administracion-escolar/cursos/${s.id}`, `¿Eliminar la sección "${s.nombre}"?`)}><X className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                          </Fila>
                        ))}
                        {add?.nivel === 'seccion' && add.parentId === c.id && <FilaAdd sangria={3} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />}
                      </div>
                      );
                    })}
                    {add?.nivel === 'curso' && add.parentId === sv.id && <FilaAdd sangria={2} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />}
                  </div>
                  );
                })}
                {abierto && add?.nivel === 'servicio' && add.parentId === p.id && <FilaAdd sangria={1} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />}
              </div>
              );
            })}

            {add?.nivel === 'periodo' && <FilaAdd sangria={0} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />}
          </>
        )}
      </div>

      <ConfirmDialog
        open={porBorrar !== null}
        onOpenChange={(o: boolean) => { if (!o) { setPorBorrar(null); setErrorBorrado(null); } }}
        title="Eliminar"
        description={
          <>
            {porBorrar?.msg}
            {errorBorrado && (
              <span className="mt-2 block rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                {errorBorrado}
              </span>
            )}
          </>
        }
        confirmLabel="Eliminar"
        destructive
        loading={borrando}
        onConfirm={() => void confirmarBorrado()} />
    </div>
  );
}
