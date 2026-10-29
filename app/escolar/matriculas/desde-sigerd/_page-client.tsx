'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import Drawer from '@mui/material/Drawer';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, DownloadCloud, GitCompareArrows, GraduationCap,
  Layers, Loader2, Pencil, RotateCcw, Search, Tag, UserCheck, UserMinus, UserX, Users, X, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ConceptosYTarifasDialog } from '@/components/administracion-escolar/ConceptosYTarifasDialog';
import { FamiliaDelAlumno } from '@/components/administracion-escolar/FamiliaDelAlumno';
import { aBorrador, deBorrador, estaVacio, type EstadoLote } from '@/lib/administracion-escolar/borrador-lote';
import { PagosDelAlumno } from '@/components/administracion-escolar/PagosDelAlumno';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { fmtDOP, hoyRD } from '@/lib/utils/format';
import {
  PlanCobroSelector, escritoDesdeTarifa, modoPrecio, obligatoriosPrimero, type LineaPlan,
} from '@/components/administracion-escolar/PlanCobroSelector';
import {
  cambioDeMatricula, conConcepto, conPaquete, conPrecio, conceptosDeSeccion, cuentaDe, igualASeccion,
  seccionConConcepto,
} from '@/lib/administracion-escolar/matricular-sigerd-plan';
import {
  Chip, cobraEnSeccion, esMatriculado, iniciales, norm, rdCorto, titulo, tono,
  type Ajuste, type Alumno, type Grupo, type PlanSeccion,
} from './_compartido';
import { BarraLote, type ConceptoDelLote } from './_barra-lote';
import { VistaAlumnos } from './_vista-alumnos';
import { VistaConceptos } from './_vista-conceptos';

/**
 * Matricular de una vez a los alumnos que SIGERD ya tiene en su grado y
 * sección, revisándolos antes.
 *
 * Todos entran marcados y con lo que cobra su sección. Lo que se puede tocar:
 *  - quitar a un alumno (no se matricula ahora);
 *  - quitar un concepto a toda una sección (sus chips, arriba de la lista);
 *  - abrir a un alumno y quitarle un concepto o cambiarle el precio — es el
 *    mismo `PlanCobroSelector` de «Nueva matrícula», con las mismas reglas.
 *
 * Los montos de la lista salen del plan de cobro de cada sección (la misma
 * ruta que usa «Nueva matrícula») y de `cuotasAlMatricular`, que es el corte
 * con el que el servidor crea los cargos: lo que se ve es lo que queda.
 *
 * Lo mismo se ve de tres formas: por sección (la de siempre, la que abre),
 * por alumno (una tabla para marcar varios y cambiarlos juntos) y por concepto
 * (uno a la vez y quién lo lleva). Las tres tocan el mismo estado: lo de cada
 * sección (`cambiadosSeccion`) y lo propio de cada alumno (`ajustes`).
 *
 * Al confirmar se matricula sección por sección —una petición cada una— para
 * ver el avance y no chocar con el tiempo máximo de una petición. Debajo es el
 * mismo `matricularLote` de «Matricular en lote».
 */

interface Omitido { nombre: string; ubicacion: string }
interface Pendientes {
  disponible: boolean;
  motivo?: string;
  periodo: { id: number; nombre: string; fechaInicio: string | null } | null;
  anoAcademico: number | null;
  descargadaEl: string | null;
  grupos: Grupo[];
  porMatricular: number;
  /** Cuántos de los grupos ya tienen matrícula activa (salen para editarlos). */
  enMatricula?: number;
  yaMatriculados: number;
  sinEstudiante: Omitido[];
  sinSeccion: Omitido[];
}

interface ResultadoAlumno {
  estudianteId: number; nombre: string;
  resultado: 'crear' | 'creada' | 'conflicto' | 'invalido' | 'error';
  motivo?: string;
}
interface Avance {
  cursoId: number;
  curso: string;
  alumnos: number;
  estado: 'esperando' | 'corriendo' | 'hecho' | 'fallo';
  creadas?: number;
  conflicto?: number;
  error?: number;
  mensaje?: string;
  /** Lo que pasó, sin ser error (cargos anulados y creados al editar). */
  nota?: string;
  problemas?: ResultadoAlumno[];
}

/** Lo que se manda a «Servicios por alumno» para los ya matriculados. */
interface CambioMatriculado { matriculaId: number; estudianteId: number; nombre: string; agregar: number[]; quitar: number[] }

/** La fila del avance que no es una sección: los cambios a los ya matriculados. */
const CAMBIOS = -1;

type Filtro = 'todos' | 'por-matricular' | 'matriculados' | 'cambios' | 'fuera' | 'sin-responsable';
type Vista = 'seccion' | 'alumno' | 'concepto';

const VISTAS: Array<{ id: Vista; etiqueta: string; icono: ReactNode; ayuda: string }> = [
  { id: 'seccion', etiqueta: 'Por sección', icono: <Layers className="h-4 w-4" />, ayuda: 'Cada sección con lo que cobra y sus alumnos' },
  { id: 'alumno', etiqueta: 'Por alumno', icono: <Users className="h-4 w-4" />, ayuda: 'Todos en una tabla: marca varios para cambiarlos juntos' },
  { id: 'concepto', etiqueta: 'Por concepto', icono: <Tag className="h-4 w-4" />, ayuda: 'Elige un concepto y marca quién lo lleva' },
];

export type PasoAlumno = 'familia' | 'conceptos' | 'pagos';
const PASOS_ALUMNO: Array<{ id: PasoAlumno; etiqueta: string }> = [
  { id: 'familia', etiqueta: 'Familia y quién paga' },
  { id: 'conceptos', etiqueta: 'Cargos del año' },
  { id: 'pagos', etiqueta: 'Pagos' },
];

// Las tres alturas del árbol: nivel → grado → sección. La clave de cada nodo
// es lo que se guarda como «lo que se está viendo».
const claveNivel = (g: Grupo) => `n:${g.servicio}${g.tanda ? ` · ${g.tanda}` : ''}`;
const claveGrado = (g: Grupo) => `g:${claveNivel(g)}|${g.grado}`;
const claveSeccion = (g: Grupo) => `s:${g.cursoId}`;
const enAlcance = (g: Grupo, alcance: string | null) =>
  !alcance || alcance === claveNivel(g) || alcance === claveGrado(g) || alcance === claveSeccion(g);

export default function MatricularDesdeSigerd() {
  const { can, isLoading: cargandoPermisos } = usePermissions();
  const puedePrecios = can('administracion-escolar:configurar');
  // Mover a un alumno de sección es de configurar, igual que cambiar tarifas.
  const puedeRevisarCambios = puedePrecios;

  const [datos, setDatos] = useState<Pendientes | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  /**
   * La inscripción es, salvo que se cambie, el INICIO del año escolar: quien
   * viene de SIGERD está en el colegio desde agosto y le tocan las diez cuotas,
   * no solo las que quedan desde hoy (antes se omitían las ya emitidas). Lo ya
   * vencido se carga hoy como pendiente (`corte`); lo demás, el devengo.
   */
  const [fechaElegida, setFecha] = useState<string | null>(null);
  const [planes, setPlanes] = useState<Map<number, PlanSeccion>>(new Map());
  /** Conceptos y tarifas abierto encima; al cerrarlo se vuelven a pedir los planes. */
  const [conceptosAbierto, setConceptosAbierto] = useState(false);
  const [recargarPlanes, setRecargarPlanes] = useState(0);

  const [fuera, setFuera] = useState<Set<number>>(new Set());
  /** Paquetes del colegio (Configuración › Paquetes): aplicar uno a toda una sección. */
  const { data: dataPaquetes } = useSWR<{ paquetes: { id: number; nombre: string; conceptosIds: number[] }[] }>(
    '/api/administracion-escolar/paquetes',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { paquetes: [] })),
    { revalidateOnFocus: false },
  );
  const paquetes = dataPaquetes?.paquetes ?? [];
  /** Por sección, los conceptos alternados a mano respecto de lo de por defecto (`cobraEnSeccion`). */
  const [cambiadosSeccion, setCambiadosSeccion] = useState<Map<number, Set<number>>>(new Map());
  const [ajustes, setAjustes] = useState<Map<number, Ajuste>>(new Map());

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  /** El nivel, grado o sección elegido en la tabla de la izquierda. `null` = todo. */
  const [alcance, setAlcance] = useState<string | null>(null);
  const [verOmitidos, setVerOmitidos] = useState(false);
  const [editando, setEditando] = useState<{ alumno: Alumno; grupo: Grupo } | null>(null);
  /** El paso del alumno abierto. Arranca en sus cargos, que es lo que se revisa siempre. */
  const [paso, setPaso] = useState<PasoAlumno>('conceptos');
  // Cambios en el panel sin «Guardar»: cerrar pregunta antes de perderlos.
  const [editorSucio, setEditorSucio] = useState(false);
  const [avisoSalir, setAvisoSalir] = useState(false);
  useEffect(() => { if (!editando) setEditorSucio(false); }, [editando]);
  const cerrarEditor = useCallback(() => {
    if (editorSucio) setAvisoSalir(true);
    else setEditando(null);
  }, [editorSucio]);
  /** Lo que se guardó en «Familia» se ve ya en la lista, sin volver a leer SIGERD. */
  const marcarResponsable = useCallback((id: number, tiene: boolean) => {
    setDatos((d) => d && {
      ...d,
      grupos: d.grupos.map((g) => (g.estudiantes.some((e) => e.id === id)
        ? { ...g, estudiantes: g.estudiantes.map((e) => (e.id === id ? { ...e, sinResponsable: !tiene } : e)) }
        : g)),
    });
    setEditando((x) => (x && x.alumno.id === id ? { ...x, alumno: { ...x.alumno, sinResponsable: !tiene } } : x));
  }, []);
  const deshacerAjuste = useCallback((id: number) => {
    setAjustes((m) => { const n = new Map(m); n.delete(id); return n; });
  }, []);
  const [confirmar, setConfirmar] = useState(false);
  const [avance, setAvance] = useState<Avance[] | null>(null);
  const corriendo = avance?.some((a) => a.estado === 'esperando' || a.estado === 'corriendo') ?? false;

  const hoy = hoyRD();
  const fecha = fechaElegida ?? datos?.periodo?.fechaInicio ?? hoy;
  const corte = fecha > hoy ? fecha : hoy;

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const res = await fetch('/api/administracion-escolar/matriculas/desde-sigerd?matriculados=1');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo leer SIGERD');
      setDatos(d);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'No se pudo leer SIGERD');
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  /*
   * Autoguardado: lo decidido aquí (cambios por alumno, chips de sección,
   * quién no entra ahora, la fecha) se guarda solo en la base, uno por colegio
   * y año, para que recargar o abrirlo en otra computadora vuelva al mismo
   * punto. Al entrar se recupera; se borra al terminar de matricular.
   * La familia y los pagos no pasan por aquí: se guardan al momento.
   */
  const [borrador, setBorrador] = useState<{
    estado: 'cargando' | 'listo' | 'guardando' | 'guardado' | 'error';
    actualizado?: string | null; por?: string | null; recuperado?: boolean;
  }>({ estado: 'cargando' });
  const borradorExiste = useRef(false);
  const datosRef = useRef(datos);
  datosRef.current = datos;
  const periodoBorrador = datos?.periodo?.id ?? null;
  useEffect(() => {
    const d0 = datosRef.current;
    if (!periodoBorrador || !d0) return;
    let vigente = true;
    fetch(`/api/administracion-escolar/matriculas/desde-sigerd/borrador?periodoId=${periodoBorrador}`)
      .then((r) => (r.ok ? r.json() : { datos: null }))
      .then((d) => {
        if (!vigente) return;
        const e = d.datos ? deBorrador(d.datos, {
          alumnos: new Set(d0.grupos.flatMap((g) => g.estudiantes.map((x) => x.id))),
          secciones: new Set(d0.grupos.map((g) => g.cursoId)),
        }) : null;
        borradorExiste.current = !!d.datos;
        if (e && !estaVacio(e)) {
          setAjustes(e.ajustes);
          setCambiadosSeccion(e.cambiadosSeccion);
          setFuera(e.fuera);
          if (e.fecha) setFecha(e.fecha);
          setBorrador({ estado: 'guardado', actualizado: d.actualizado, por: d.por, recuperado: true });
        } else {
          setBorrador({ estado: 'listo' });
        }
      })
      .catch(() => { if (vigente) setBorrador({ estado: 'listo' }); });
    return () => { vigente = false; };
  }, [periodoBorrador]);
  const estadoLote = useMemo<EstadoLote>(
    () => ({ fecha: fechaElegida, fuera, cambiadosSeccion, ajustes }), [fechaElegida, fuera, cambiadosSeccion, ajustes]);
  const pendienteRef = useRef<EstadoLote | null>(null);
  const guardarBorrador = useCallback(async (e: EstadoLote, alSalir = false) => {
    if (!periodoBorrador) return;
    pendienteRef.current = null;
    const vacio = estaVacio(e);
    if (vacio && !borradorExiste.current) return;
    if (!alSalir) setBorrador((b) => ({ ...b, estado: 'guardando' }));
    try {
      const url = '/api/administracion-escolar/matriculas/desde-sigerd/borrador';
      const r = vacio
        ? await fetch(`${url}?periodoId=${periodoBorrador}`, { method: 'DELETE', keepalive: alSalir })
        : await fetch(url, {
            method: 'PUT', keepalive: alSalir, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ periodoId: periodoBorrador, datos: aBorrador(e) }),
          });
      if (!r.ok) throw new Error();
      borradorExiste.current = !vacio;
      if (!alSalir) setBorrador({ estado: vacio ? 'listo' : 'guardado', actualizado: new Date().toISOString(), por: null });
    } catch {
      if (!alSalir) setBorrador((b) => ({ ...b, estado: 'error' }));
    }
  }, [periodoBorrador]);
  // Un segundo después del último cambio, como un documento que se guarda solo.
  // Lo que se acaba de recuperar no se vuelve a mandar.
  const recienRecuperado = useRef(true);
  useEffect(() => {
    if (borrador.estado === 'cargando') return;
    if (recienRecuperado.current) { recienRecuperado.current = false; return; }
    pendienteRef.current = estadoLote;
    const t = setTimeout(() => void guardarBorrador(estadoLote), 1000);
    return () => clearTimeout(t);
    // Solo cuando cambia lo decidido: que el indicador pase a «Guardando…» no es un cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoLote, guardarBorrador, borrador.estado === 'cargando']);
  // Si se cierra la pestaña antes de ese segundo, se manda igual.
  useEffect(() => {
    const alSalir = () => { if (pendienteRef.current) void guardarBorrador(pendienteRef.current, true); };
    window.addEventListener('pagehide', alSalir);
    return () => window.removeEventListener('pagehide', alSalir);
  }, [guardarBorrador]);
  /** Empezar de cero: lo decidido se descarta, aquí y en el borrador. */
  const descartarBorrador = () => {
    setAjustes(new Map()); setCambiadosSeccion(new Map()); setFuera(new Set()); setFecha(null);
  };


  // El plan de cada sección, con la fecha elegida: la fecha decide qué cuotas
  // ya tocan y cuáles espera el devengo.
  useEffect(() => {
    if (!datos?.periodo || datos.grupos.length === 0) return;
    let vigente = true;
    const periodoId = String(datos.periodo.id);
    setPlanes(new Map(datos.grupos.map((g) => [g.cursoId, { estado: 'cargando' } as PlanSeccion])));
    for (const g of datos.grupos) {
      const params = new URLSearchParams({ periodoId, cursoId: String(g.cursoId), desde: fecha, otros: '1' });
      fetch(`/api/administracion-escolar/matriculas/plan-cobro?${params}`)
        .then(async (res) => {
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? 'No se pudo calcular');
          return {
            estado: 'listo',
            lineas: obligatoriosPrimero(d.lineas as LineaPlan[]),
            otros: (d.otros ?? []) as LineaPlan[],
          } as PlanSeccion;
        })
        .catch((e: unknown) => ({ estado: 'error', mensaje: e instanceof Error ? e.message : 'Error' } as PlanSeccion))
        .then((p) => { if (vigente) setPlanes((m) => new Map(m).set(g.cursoId, p)); });
    }
    return () => { vigente = false; };
  }, [datos, fecha, recargarPlanes]);

  /** Lo que ya tiene guardado la matrícula de quien ya está matriculado. */
  const guardados = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const g of datos?.grupos ?? []) {
      for (const e of g.estudiantes) if (esMatriculado(e)) m.set(e.id, e.conceptos ?? []);
    }
    return m;
  }, [datos]);

  /**
   * Los conceptos que se le cobran a un alumno si nadie lo abrió: los de su
   * matrícula si ya la tiene; si no, los de su sección.
   */
  const conceptosDe = useCallback((alumnoId: number, cursoId: number): number[] | null => {
    const a = ajustes.get(alumnoId);
    if (a) return a.conceptos;
    const g = guardados.get(alumnoId);
    if (g) return g;
    const p = planes.get(cursoId);
    if (p?.estado !== 'listo') return null;
    const cambiados = cambiadosSeccion.get(cursoId);
    return p.lineas.filter((l) => cobraEnSeccion(l, cambiados)).map((l) => l.conceptoId);
  }, [ajustes, guardados, planes, cambiadosSeccion]);

  // Por sección: cada alumno con su cuenta. Es lo que pinta la lista y lo que
  // suma el resumen.
  const cuentas = useMemo(() => {
    const m = new Map<number, { hoy: number; cargos: number; anio: number }>();
    if (!datos) return m;
    for (const g of datos.grupos) {
      const p = planes.get(g.cursoId);
      if (p?.estado !== 'listo') continue;
      for (const e of g.estudiantes) {
        // Al matriculado ya se le cargó lo suyo: aquí solo cuenta lo que se va a crear.
        if (esMatriculado(e)) continue;
        const conceptos = conceptosDe(e.id, g.cursoId) ?? [];
        // Con lo de otros grados que se le haya dado en «Ver más».
        m.set(e.id, cuentaDe([...p.lineas, ...p.otros], conceptos, ajustes.get(e.id)?.precios ?? [], corte));
      }
    }
    return m;
  }, [datos, planes, conceptosDe, ajustes, corte]);

  const resumen = useMemo(() => {
    const r = { alumnos: 0, secciones: 0, hoy: 0, anio: 0, cargos: 0, sinResponsable: 0, conCambios: ajustes.size };
    for (const g of datos?.grupos ?? []) {
      const dentro = g.estudiantes.filter((e) => !esMatriculado(e) && !fuera.has(e.id));
      if (dentro.length > 0) r.secciones++;
      for (const e of dentro) {
        r.alumnos++;
        if (e.sinResponsable) r.sinResponsable++;
        const c = cuentas.get(e.id);
        if (c) { r.hoy += c.hoy; r.anio += c.anio; r.cargos += c.cargos; }
      }
    }
    return r;
  }, [datos, fuera, cuentas, ajustes]);

  const planesListos = datos?.grupos.every((g) => planes.get(g.cursoId)?.estado === 'listo') ?? false;

  /**
   * Lo que cambia en las matrículas que ya existen, para guardarlo al final.
   * Solo se quita lo que la pantalla enseña (lo que tiene tarifa en su
   * sección): un concepto guardado que aquí no sale no se toca, porque quitarlo
   * anularía sus cargos sin que nadie lo haya visto.
   */
  const cambioDe = useCallback((e: Alumno, cursoId: number) => {
    const c = cambioDeMatricula(e.conceptos ?? [], ajustes.get(e.id));
    if (!c) return null;
    const p = planes.get(cursoId);
    const enPantalla = new Set(p?.estado === 'listo' ? [...p.lineas, ...p.otros].map((l) => l.conceptoId) : []);
    const quitar = c.quitar.filter((id) => enPantalla.has(id));
    return c.agregar.length + quitar.length > 0 ? { agregar: c.agregar, quitar } : null;
  }, [ajustes, planes]);
  const cambiosMatriculados = useMemo(() => {
    const lista: CambioMatriculado[] = [];
    for (const g of datos?.grupos ?? []) {
      for (const e of g.estudiantes) {
        if (!esMatriculado(e)) continue;
        const c = cambioDe(e, g.cursoId);
        if (c) lista.push({ matriculaId: e.matriculaId!, estudianteId: e.id, nombre: e.nombre, ...c });
      }
    }
    return lista;
  }, [datos, cambioDe]);

  // Lo que se ve con la búsqueda y el filtro. La sección se queda si le queda alguien.
  const q = norm(busqueda.trim());
  const visibles = useMemo(() => (datos?.grupos ?? [])
    .filter((g) => enAlcance(g, alcance))
    .map((g) => ({
      ...g,
      estudiantes: g.estudiantes.filter((e) => {
        if (q && !norm(e.nombre).includes(q)) return false;
        if (filtro === 'por-matricular') return !esMatriculado(e);
        if (filtro === 'matriculados') return esMatriculado(e);
        if (filtro === 'cambios') return ajustes.has(e.id);
        if (filtro === 'fuera') return fuera.has(e.id);
        if (filtro === 'sin-responsable') return e.sinResponsable;
        return true;
      }),
    }))
    .filter((g) => g.estudiantes.length > 0), [datos, alcance, q, filtro, ajustes, fuera]);

  function alternarFuera(ids: number[], sacar: boolean) {
    setFuera((s) => {
      const n = new Set(s);
      for (const id of ids) { if (sacar) n.add(id); else n.delete(id); }
      return n;
    });
  }

  /**
   * Quitar (o volver a poner) un concepto a toda la sección. A quien ya se le
   * había abierto también se le aplica: «a la sección» es a todos.
   */
  function alternarConceptoSeccion(g: Grupo, linea: LineaPlan) {
    fijarConceptoSeccion(g, linea.conceptoId, !cobraEnSeccion(linea, cambiadosSeccion.get(g.cursoId)));
  }

  /**
   * Aplicar un paquete a toda la sección: la sección cobra justo sus conceptos
   * (los que tengan tarifa aquí), y a quien ya se le había abierto el cajón se
   * le cambian también los conceptos; sus precios propios se quedan.
   */
  function aplicarPaqueteSeccion(g: Grupo, lineas: LineaPlan[], conceptosDelPaquete: number[]) {
    const quiere = new Set(conceptosDelPaquete);
    setCambiadosSeccion((m) => {
      const n = new Map(m);
      n.set(g.cursoId, new Set(lineas.filter((l) => cobraEnSeccion(l) !== quiere.has(l.conceptoId)).map((l) => l.conceptoId)));
      return n;
    });
    const conceptos = lineas.filter((l) => quiere.has(l.conceptoId)).map((l) => l.conceptoId);
    setAjustes((m) => {
      const n = new Map(m);
      for (const e of g.estudiantes) {
        const a = n.get(e.id);
        if (esMatriculado(e)) {
          // A los ya matriculados también: «a la sección» es a todos.
          const ajuste = conPaquete(lineas, conceptosDelPaquete, a?.precios ?? []);
          if (igualASeccion(e.conceptos ?? [], ajuste)) n.delete(e.id); else n.set(e.id, ajuste);
        } else if (a) n.set(e.id, { ...a, conceptos });
      }
      return n;
    });
  }

  /** Lo que cobra la sección según sus chips; `null` mientras no llega su plan. */
  const deSeccion = useCallback((cursoId: number): number[] | null => {
    const p = planes.get(cursoId);
    return p?.estado === 'listo' ? conceptosDeSeccion(p.lineas, cambiadosSeccion.get(cursoId)) : null;
  }, [planes, cambiadosSeccion]);

  /**
   * Guarda lo decidido para uno o varios alumnos. Quien queda igual que su
   * punto de partida —su matrícula si ya la tiene, si no su sección— y sin
   * precios propios vuelve a «sin cambios».
   */
  const ponerAjustes = useCallback((lista: { alumnoId: number; cursoId: number; ajuste: Ajuste }[]) => {
    if (lista.length === 0) return;
    setAjustes((m) => {
      const n = new Map(m);
      for (const { alumnoId, cursoId, ajuste } of lista) {
        if (igualASeccion(guardados.get(alumnoId) ?? deSeccion(cursoId), ajuste)) n.delete(alumnoId); else n.set(alumnoId, ajuste);
      }
      return n;
    });
  }, [deSeccion, guardados]);

  /** Lo que devuelve el cajón de un alumno. */
  const guardarAjuste = useCallback((alumnoId: number, cursoId: number, a: Ajuste) => {
    ponerAjustes([{ alumnoId, cursoId, ajuste: a }]);
  }, [ponerAjustes]);

  const lineaDe = useCallback((cursoId: number, conceptoId: number) => {
    const p = planes.get(cursoId);
    return p?.estado === 'listo' ? p.lineas.find((l) => l.conceptoId === conceptoId) ?? null : null;
  }, [planes]);

  /**
   * Dar o quitar un concepto a unos alumnos sueltos. Solo a quien lo puede
   * llevar: su sección tiene tarifa de ese concepto.
   */
  const fijarConcepto = useCallback((alumnos: { id: number; cursoId: number }[], conceptoId: number, cobrar: boolean) => {
    ponerAjustes(alumnos.flatMap(({ id, cursoId }) => {
      if (!lineaDe(cursoId, conceptoId)) return [];
      const ajuste = conConcepto(conceptosDe(id, cursoId) ?? [], ajustes.get(id)?.precios ?? [], conceptoId, cobrar);
      return ajuste ? [{ alumnoId: id, cursoId, ajuste }] : [];
    }));
  }, [ponerAjustes, lineaDe, conceptosDe, ajustes]);

  /**
   * Toda la sección con o sin un concepto: cambia lo de la sección y, a quien
   * ya tenía lo suyo, también se lo da o se lo quita.
   */
  const fijarConceptoSeccion = useCallback((g: Grupo, conceptoId: number, cobrar: boolean) => {
    const p = planes.get(g.cursoId);
    if (p?.estado !== 'listo') return;
    const deLaSeccion = new Map(g.estudiantes.flatMap((e) => {
      const a = ajustes.get(e.id);
      return a ? [[e.id, a] as const] : [];
    }));
    const matriculados = new Map(g.estudiantes.flatMap((e) => (esMatriculado(e) ? [[e.id, e.conceptos ?? []] as const] : [])));
    const r = seccionConConcepto(p.lineas, cambiadosSeccion.get(g.cursoId), deLaSeccion, conceptoId, cobrar, matriculados);
    if (!r) return;
    setCambiadosSeccion((m) => new Map(m).set(g.cursoId, r.cambiados));
    setAjustes((m) => {
      const n = new Map(m);
      for (const [id, a] of r.ajustes) { if (a) n.set(id, a); else n.delete(id); }
      return n;
    });
  }, [planes, cambiadosSeccion, ajustes]);

  /** Un paquete a unos alumnos: llevan justo sus conceptos que tengan tarifa en su sección. */
  const aplicarPaqueteAlumnos = useCallback((alumnos: { id: number; cursoId: number }[], conceptosDelPaquete: number[]) => {
    ponerAjustes(alumnos.flatMap(({ id, cursoId }) => {
      const p = planes.get(cursoId);
      if (p?.estado !== 'listo') return [];
      return [{ alumnoId: id, cursoId, ajuste: conPaquete(p.lineas, conceptosDelPaquete, ajustes.get(id)?.precios ?? []) }];
    }));
  }, [ponerAjustes, planes, ajustes]);

  /**
   * Un precio propio para un concepto, a los que lo llevan, escrito como en
   * «Cambiar precio» del alumno (lo de cada cuota). Si es la tarifa de su
   * sección, se les quita el precio propio.
   */
  const fijarPrecio = useCallback((alumnos: { id: number; cursoId: number }[], conceptoId: number, escritoCentavos: number) => {
    ponerAjustes(alumnos.flatMap(({ id, cursoId }) => {
      const linea = lineaDe(cursoId, conceptoId);
      const ajuste = linea && conPrecio(linea, conceptosDe(id, cursoId) ?? [], ajustes.get(id)?.precios ?? [], escritoCentavos);
      return ajuste ? [{ alumnoId: id, cursoId, ajuste }] : [];
    }));
  }, [ponerAjustes, lineaDe, conceptosDe, ajustes]);

  // ── Vistas y alumnos marcados (vista por alumno) ─────────────────────
  const [vista, setVista] = useState<Vista>('seccion');
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const marcar = useCallback((ids: number[], si: boolean) => {
    setMarcados((s) => {
      const n = new Set(s);
      for (const id of ids) { if (si) n.add(id); else n.delete(id); }
      return n;
    });
  }, []);
  const cambiarVista = (v: Vista) => {
    if (v === vista) return;
    if (editando) {
      // Cambiar de vista cierra el plan abierto: si tiene cambios, primero se pregunta.
      if (editorSucio) { setAvisoSalir(true); return; }
      setEditando(null);
    }
    setVista(v);
  };

  /*
   * Lo que se está viendo vive en la URL (`?vista=`, `?en=` y `?alumno=`):
   * recargar, volver atrás o pasarle el enlace a otra persona deja la pantalla
   * donde estaba, con el mismo alumno abierto. Se lee una vez al entrar; el
   * alumno, cuando llega la lista. Hasta entonces no se escribe, para no
   * borrar lo que traía el enlace.
   */
  const alumnoDeLaUrl = useRef<number | null>(null);
  const [urlLista, setUrlLista] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get('vista');
    if (v && VISTAS.some((x) => x.id === v)) setVista(v as Vista);
    const en = q.get('en');
    if (en) setAlcance(en);
    const pasoUrl = q.get('paso');
    if (pasoUrl === 'familia' || pasoUrl === 'pagos') setPaso(pasoUrl);
    const alumno = Number(q.get('alumno'));
    if (Number.isInteger(alumno) && alumno > 0) alumnoDeLaUrl.current = alumno;
    else setUrlLista(true);
  }, []);
  useEffect(() => {
    if (alumnoDeLaUrl.current == null || (!datos && !errorCarga)) return;
    const id = alumnoDeLaUrl.current;
    alumnoDeLaUrl.current = null;
    const grupo = datos?.grupos.find((g) => g.estudiantes.some((e) => e.id === id));
    const alumno = grupo?.estudiantes.find((e) => e.id === id);
    if (grupo && alumno) setEditando({ alumno, grupo });
    setUrlLista(true);
  }, [datos, errorCarga]);
  useEffect(() => {
    if (!urlLista) return;
    const q = new URLSearchParams(window.location.search);
    const poner = (k: string, v: string | null) => { if (v) q.set(k, v); else q.delete(k); };
    poner('vista', vista === 'seccion' ? null : vista);
    poner('en', alcance);
    poner('alumno', editando ? String(editando.alumno.id) : null);
    poner('paso', editando && paso !== 'conceptos' ? paso : null);
    const destino = `${window.location.pathname}${q.size ? `?${q}` : ''}`;
    if (destino !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, '', destino);
    }
  }, [urlLista, vista, alcance, editando, paso]);

  /** Cada alumno con su sección entera, para encontrarlo por id. */
  const grupoDe = useMemo(() => {
    const m = new Map<number, Grupo>();
    for (const g of datos?.grupos ?? []) for (const e of g.estudiantes) m.set(e.id, g);
    return m;
  }, [datos]);
  const completos = useMemo(() => new Map((datos?.grupos ?? []).map((g) => [g.cursoId, g])), [datos]);
  const marcadosDentro = useMemo(() => [...marcados]
    .filter((id) => !fuera.has(id) && grupoDe.has(id))
    .map((id) => ({ id, cursoId: grupoDe.get(id)!.cursoId })), [marcados, fuera, grupoDe]);
  const hayMarcadosFuera = [...marcados].some((id) => fuera.has(id));
  // Precios y «No matricular» son de los que faltan; a los ya matriculados, por
  // ahora, solo se les dan o quitan conceptos.
  const marcadosPorMatricular = useMemo(
    () => marcadosDentro.filter((a) => !guardados.has(a.id)), [marcadosDentro, guardados]);

  /** Los conceptos que pueden llevar unos alumnos marcados, para la barra de arriba. */
  const conceptosDe_ = useCallback((alumnos: { id: number; cursoId: number }[]) => {
    const m = new Map<number, ConceptoDelLote & { tarifas: Set<number> }>();
    for (const { id, cursoId } of alumnos) {
      const p = planes.get(cursoId);
      if (p?.estado !== 'listo') continue;
      const suyos = conceptosDe(id, cursoId) ?? [];
      for (const l of p.lineas) {
        const c = m.get(l.conceptoId) ?? {
          conceptoId: l.conceptoId, nombre: l.nombre, aplican: 0, tienen: 0,
          tarifaEscrita: null, modo: modoPrecio(l), cuotas: l.cuotas.length, tarifas: new Set<number>(),
        };
        c.aplican++;
        if (suyos.includes(l.conceptoId)) c.tienen++;
        // La tarifa como se escribe en el diálogo: lo de cada cuota, salvo que se escriba el total.
        c.tarifas.add(escritoDesdeTarifa(l, l.montoCentavos));
        m.set(l.conceptoId, c);
      }
    }
    return [...m.values()]
      .map(({ tarifas, ...c }) => ({ ...c, tarifaEscrita: tarifas.size === 1 ? [...tarifas][0] : null }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [planes, conceptosDe]);
  const conceptosDelLote = useMemo(() => conceptosDe_(marcadosDentro), [conceptosDe_, marcadosDentro]);
  const conceptosParaPrecio = useMemo(() => conceptosDe_(marcadosPorMatricular), [conceptosDe_, marcadosPorMatricular]);

  async function matricular() {
    if (!datos) return;
    setConfirmar(false);
    const porSeccion = datos.grupos
      .map((g) => ({ g, alumnos: g.estudiantes.filter((e) => !esMatriculado(e) && !fuera.has(e.id)) }))
      .filter((x) => x.alumnos.length > 0);
    const cambios = cambiosMatriculados;
    setAvance([
      ...porSeccion.map(({ g, alumnos }) => ({
        cursoId: g.cursoId, curso: g.curso, alumnos: alumnos.length, estado: 'esperando' as const,
      })),
      ...(cambios.length > 0
        ? [{ cursoId: CAMBIOS, curso: 'Cambios a los ya matriculados', alumnos: cambios.length, estado: 'esperando' as const }]
        : []),
    ]);
    const marcar = (cursoId: number, cambio: Partial<Avance>) =>
      setAvance((av) => av?.map((a) => (a.cursoId === cursoId ? { ...a, ...cambio } : a)) ?? av);

    for (const { g, alumnos } of porSeccion) {
      marcar(g.cursoId, { estado: 'corriendo' });
      try {
        const res = await fetch('/api/administracion-escolar/matriculas/desde-sigerd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cursoId: g.cursoId,
            fechaInscripcion: fecha,
            alumnos: alumnos.map((e) => ({
              estudianteId: e.id,
              conceptos: conceptosDe(e.id, g.cursoId) ?? [],
              precios: ajustes.get(e.id)?.precios ?? [],
            })),
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? 'No se pudo matricular esta sección');
        const nombres = new Map(alumnos.map((e) => [e.id, e.nombre]));
        marcar(g.cursoId, {
          estado: 'hecho', creadas: d.creadas, conflicto: d.conflicto, error: d.error,
          problemas: (d.resultados as ResultadoAlumno[])
            .filter((r) => r.resultado !== 'creada')
            .map((r) => ({ ...r, nombre: nombres.get(r.estudianteId) ?? r.nombre })),
        });
      } catch (e) {
        marcar(g.cursoId, { estado: 'fallo', mensaje: e instanceof Error ? e.message : 'Error' });
      }
    }

    // Los ya matriculados: lo mismo que «Servicios por alumno». Lo quitado anula
    // sus cargos sin facturar ni pagar; lo agregado carga ya lo que venció.
    if (cambios.length > 0 && datos.periodo) {
      marcar(CAMBIOS, { estado: 'corriendo' });
      // Lo que se les da de otros grados: su tarifa propia va ANTES, porque es
      // lo único que se lo cobra y el devengo de «Servicios» la busca. Si su
      // matrícula no se guarda, se quita.
      const tarifasEscritas = new Map<number, number[]>();
      const quitarTarifas = async (matriculaIds: Iterable<number>) => {
        for (const id of matriculaIds) {
          for (const precioId of tarifasEscritas.get(id) ?? []) {
            await fetch(`/api/administracion-escolar/concepto-precios?id=${precioId}`, { method: 'DELETE' }).catch(() => null);
          }
          tarifasEscritas.delete(id);
        }
      };
      try {
        for (const c of cambios) {
          const precios = (ajustes.get(c.estudianteId)?.precios ?? []).filter((p) => c.agregar.includes(p.conceptoId));
          const curso = grupoDe.get(c.estudianteId)?.cursoId;
          const p = curso != null ? planes.get(curso) : undefined;
          for (const precio of precios) {
            const linea = p?.estado === 'listo' ? p.otros.find((l) => l.conceptoId === precio.conceptoId) : undefined;
            const r = await fetch('/api/administracion-escolar/concepto-precios', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conceptoId: precio.conceptoId,
                periodoId: datos.periodo.id,
                objetivoTipo: 'estudiante',
                objetivoId: c.estudianteId,
                monto: precio.montoCentavos / 100,
                ...(linea?.productId != null ? { productId: linea.productId } : {}),
                // Los cargos los crea «Servicios» al agregarlo, con lo ya vencido.
                devengar: false,
              }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(`${c.nombre}: ${d.error ?? 'no se pudo guardar el precio de lo de otros grados'}`);
            if (d.precio?.id) tarifasEscritas.set(c.matriculaId, [...(tarifasEscritas.get(c.matriculaId) ?? []), d.precio.id as number]);
          }
        }
        const res = await fetch('/api/administracion-escolar/matriculas/servicios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            periodoId: datos.periodo.id,
            cambios: cambios.map(({ matriculaId, agregar, quitar }) => ({ matriculaId, agregar, quitar })),
            anularSinFacturar: true,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? 'No se pudieron guardar los cambios');
        const porMatricula = new Map(cambios.map((c) => [c.matriculaId, c]));
        const conError = (d.conError ?? []) as { matriculaId: number; error?: string }[];
        await quitarTarifas(conError.map((r) => r.matriculaId));
        marcar(CAMBIOS, {
          estado: 'hecho', creadas: d.guardados, error: conError.length,
          nota: `${d.anulados ?? 0} cargo(s) anulado(s) · ${d.cargosCreados ?? 0} cargo(s) creado(s)`
            + (d.devengoPendiente ? ' · los que faltan los crea el cobro de la noche' : ''),
          problemas: conError.map((r) => ({
            estudianteId: porMatricula.get(r.matriculaId)?.estudianteId ?? r.matriculaId,
            nombre: porMatricula.get(r.matriculaId)?.nombre ?? `Matrícula #${r.matriculaId}`,
            resultado: 'error' as const, motivo: r.error,
          })),
        });
      } catch (e) {
        await quitarTarifas([...tarifasEscritas.keys()]);
        marcar(CAMBIOS, { estado: 'fallo', mensaje: e instanceof Error ? e.message : 'Error' });
      }
    }

    // Ya se matriculó: el borrador hablaba de alumnos que ahora tienen su
    // matrícula, y recuperarlo los pintaría con cambios que ya no son.
    pendienteRef.current = null;
    borradorExiste.current = false;
    await fetch(`/api/administracion-escolar/matriculas/desde-sigerd/borrador?periodoId=${datos.periodo?.id}`, { method: 'DELETE' })
      .catch(() => null);
  }

  // ── Estados de la página ──────────────────────────────────────────────
  const volver = (
    <Link href="/escolar/matriculas"
      className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-zero-600">
      <ArrowLeft className="h-4 w-4" aria-hidden />Matriculación
    </Link>
  );

  if (errorCarga) {
    return (
      <section className="space-y-5 p-4 sm:p-6">
        {volver}
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-800">No se pudo leer lo que dice SIGERD.</p>
          <p className="mt-1 text-sm text-red-700">{errorCarga}</p>
          <div className="mt-3"><Button variant="outline" onClick={() => void cargar()}>Intentar otra vez</Button></div>
        </div>
      </section>
    );
  }

  if (!datos || cargandoPermisos) {
    return (
      <section className="space-y-5 p-4 sm:p-6">
        {volver}
        <div role="status" className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-zero-600" aria-hidden />
          <span className="sr-only">Cargando…</span>
        </div>
      </section>
    );
  }

  if (avance) return <Progreso avance={avance} corriendo={corriendo} volver={volver} periodo={datos.periodo?.nombre ?? ''} />;

  if (!datos.disponible || (datos.porMatricular === 0 && !datos.enMatricula)) {
    return (
      <section className="space-y-5 p-4 sm:p-6">
        {volver}
        <div className="flex flex-col items-center rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zero-50 text-zero-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-4 text-base font-semibold text-gray-900">
            {datos.disponible ? 'No hay alumnos de SIGERD por matricular' : datos.motivo}
          </p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            {datos.disponible
              ? `Los ${datos.yaMatriculados} que SIGERD tiene en ${datos.periodo?.nombre} ya tienen su matrícula.`
              : 'Descarga los datos del centro en Configuración › SIGERD y vuelve aquí.'}
          </p>
          {!datos.disponible && (
            <Link href="/escolar/configuracion/sigerd" className="mt-4 text-sm font-medium text-zero-700 hover:underline">
              Ir a Configuración › SIGERD
            </Link>
          )}
          {datos.disponible && puedeRevisarCambios && (
            <>
              <p className="mt-3 max-w-md text-xs text-gray-400">
                Quien ya tiene matrícula no sale aquí aunque SIGERD lo haya cambiado de sección.
              </p>
              <Link href="/escolar/configuracion/sigerd/cambios"
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-zero-700 hover:underline">
                <GitCompareArrows className="h-4 w-4" /> Revisar cambios de SIGERD
              </Link>
            </>
          )}
        </div>
      </section>
    );
  }

  const omitidos = [...datos.sinSeccion, ...datos.sinEstudiante];
  const descargada = datos.descargadaEl
    ? new Date(datos.descargadaEl).toLocaleString('es-DO', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santo_Domingo',
      })
    : null;
  const filtros: Array<{ id: Filtro; etiqueta: string; n: number }> = [
    { id: 'todos', etiqueta: 'Todos', n: datos.porMatricular + (datos.enMatricula ?? 0) },
    ...(datos.enMatricula ? [
      { id: 'por-matricular' as const, etiqueta: 'Por matricular', n: datos.porMatricular },
      { id: 'matriculados' as const, etiqueta: 'Matriculados', n: datos.enMatricula },
    ] : []),
    { id: 'cambios', etiqueta: 'Con cambios', n: ajustes.size },
    { id: 'fuera', etiqueta: 'No se matriculan', n: fuera.size },
    { id: 'sin-responsable', etiqueta: 'Sin responsable', n: datos.grupos.reduce((n, g) => n + g.estudiantes.filter((e) => e.sinResponsable).length, 0) },
  ];

  const textoGuardar = resumen.alumnos > 0 && cambiosMatriculados.length > 0
    ? `Matricular ${resumen.alumnos} y guardar ${cambiosMatriculados.length} cambio(s)`
    : resumen.alumnos > 0 ? `Matricular ${resumen.alumnos}` : `Guardar ${cambiosMatriculados.length} cambio(s)`;

  // El plan del alumno abierto: el mismo en el cajón y debajo de su fila.
  const editorDelAlumno = editando && datos.periodo ? (
    <EditorAlumno
      key={editando.alumno.id}
      alumno={editando.alumno}
      grupo={editando.grupo}
      periodoId={datos.periodo.id}
      fecha={fecha}
      corte={corte}
      inicial={{
        conceptos: conceptosDe(editando.alumno.id, editando.grupo.cursoId) ?? undefined,
        precios: ajustes.get(editando.alumno.id)?.precios ?? [],
      }}
      // A los ya matriculados solo se les pone precio a lo que se les da de
      // otros grados: lo suyo ya tiene cargos y se cambia en Tarifas.
      puedePrecios={puedePrecios}
      recargar={recargarPlanes}
      onAbrirConceptos={puedePrecios ? () => setConceptosAbierto(true) : undefined}
      paso={paso}
      onPaso={setPaso}
      onResponsable={(tiene) => marcarResponsable(editando.alumno.id, tiene)}
      onGuardar={(a) => { guardarAjuste(editando.alumno.id, editando.grupo.cursoId, a); setEditando(null); }}
      onRestablecer={() => {
        deshacerAjuste(editando.alumno.id);
        setEditando(null);
      }}
      onSacar={() => { alternarFuera([editando.alumno.id], true); setEditando(null); }}
      onCerrar={cerrarEditor}
      onSucio={setEditorSucio}
      conCambios={ajustes.has(editando.alumno.id)}
    />
  ) : null;

  return (
    <section className="space-y-5 p-4 pb-0 sm:p-6 sm:pb-0">
      {volver}

      {/* ── Encabezado ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zero-600 text-white shadow-sm">
            <DownloadCloud className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Matricular desde SIGERD</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Cada alumno entra en el grado y la sección que tiene en SIGERD; los ya matriculados salen para cambiarles lo que llevan · {datos.periodo?.nombre}
              {descargada && <span className="text-gray-400"> · datos descargados el {descargada}</span>}
            </p>
            {puedeRevisarCambios && (
              <Link href="/escolar/configuracion/sigerd/cambios"
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-zero-700 hover:underline">
                <GitCompareArrows className="h-3.5 w-3.5" /> Revisar cambios de SIGERD
                <span className="font-normal text-gray-400">(quien ya está matriculado y cambió de sección)</span>
              </Link>
            )}
            <EstadoBorrador b={borrador} hayCambios={!estaVacio(estadoLote)} onDescartar={descartarBorrador} />
          </div>
        </div>
        <label className="flex flex-col gap-1 self-start lg:self-auto">
          <span className="text-xs font-medium text-gray-600">Fecha de inscripción</span>
          <input type="date" value={fecha} max="2100-12-31"
            onChange={(e) => { if (e.target.value) setFecha(e.target.value); }}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
          <span className="text-[11px] text-gray-500">Desde esta fecha se le cobran las cuotas; lo ya vencido se carga hoy</span>
        </label>
      </div>

      {/* Sin tarjetas de resumen: cuántos alumnos, en cuántas secciones y
          cuánto se carga hoy ya lo dice la barra de abajo, junto al botón que
          matricula. Arriba solo quedaba repetido (pedido del usuario, 24-10). */}

      {/* ── Avisos ─────────────────────────────────────────────────── */}
      {(resumen.sinResponsable > 0 || omitidos.length > 0) && (
        <div className="space-y-2">
          {resumen.sinResponsable > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                <span className="font-medium">{resumen.sinResponsable} alumno(s) sin responsable de pago.</span>{' '}
                Se matriculan igual, pero sus cargos no se facturan ni les llegan avisos hasta asignarles uno en su ficha.
              </p>
              <button type="button" onClick={() => setFiltro('sin-responsable')}
                className="ml-auto shrink-0 text-xs font-medium text-amber-800 hover:underline">Ver</button>
            </div>
          )}
          {omitidos.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white">
              <button type="button" onClick={() => setVerOmitidos((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
                <UserX className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="flex-1 text-gray-700">
                  <span className="font-medium text-gray-900">{omitidos.length} quedan fuera</span> — no se pueden
                  matricular sin adivinar ({datos.sinEstudiante.length} sin cruzar con un estudiante,{' '}
                  {datos.sinSeccion.length} sin sección clara)
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${verOmitidos ? 'rotate-90' : ''}`} />
              </button>
              {verOmitidos && (
                <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto border-t border-gray-100">
                  {omitidos.map((o, i) => (
                    <li key={`${o.nombre}-${i}`} className="flex flex-col gap-0.5 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-gray-900">{o.nombre}</span>
                      <span className="text-xs text-gray-500">{o.ubicacion}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Cómo verlo ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Cómo ver la lista"
          className="inline-flex gap-1 self-start overflow-x-auto rounded-xl bg-gray-100 p-1">
          {VISTAS.map((v) => (
            <button key={v.id} type="button" onClick={() => cambiarVista(v.id)}
              aria-pressed={vista === v.id} title={v.ayuda}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                vista === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <span className={vista === v.id ? 'text-zero-600' : 'text-gray-400'}>{v.icono}</span>{v.etiqueta}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">{VISTAS.find((v) => v.id === vista)?.ayuda}</p>
          {puedePrecios && (
            <Button variant="outline" size="sm" onClick={() => setConceptosAbierto(true)}>
              <Tag className="mr-1.5 h-4 w-4" />Conceptos y tarifas
            </Button>
          )}
        </div>
      </div>

      {/* ── Lista ──────────────────────────────────────────────────── */}
      <div className={vista === 'seccion' ? 'grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]' : ''}>
        {/* Nivel → grado → sección, como tabla: cuántos entran y cuánto se carga hoy. */}
        {vista === 'seccion' && (
          <aside className="hidden lg:block">
            <ArbolSecciones
              grupos={datos.grupos} fuera={fuera} cuentas={cuentas}
              alcance={alcance} onAlcance={setAlcance}
              onIncluir={alternarFuera} />
          </aside>
        )}

        <div className="min-w-0 space-y-4">
          {/* Buscar y filtrar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar un alumno…"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-zero-500 focus:outline-none focus:ring-2 focus:ring-zero-100" />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
              {filtros.map((f) => (
                <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
                  className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    filtro === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                  {f.etiqueta} <span className="tabular-nums text-gray-400">{f.n}</span>
                </button>
              ))}
            </div>
          </div>

          {alcance && (() => {
            const g = datos.grupos.find((x) => enAlcance(x, alcance));
            const que = !g ? '' : alcance.startsWith('n:') ? claveNivel(g).slice(2)
              : alcance.startsWith('g:') ? `${claveNivel(g).slice(2)} › ${g.grado}` : titulo(g);
            return (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Viendo <span className="font-medium text-gray-900">{que}</span></span>
                <button type="button" onClick={() => setAlcance(null)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-zero-700 hover:bg-zero-50">
                  <X className="h-3 w-3" />Ver todas
                </button>
              </div>
            );
          })()}

          {vista === 'alumno' && marcados.size > 0 && (
            <div className="sticky top-2 z-10">
              <BarraLote
                n={marcados.size} conceptos={conceptosDelLote} conceptosPrecio={conceptosParaPrecio}
                paquetes={paquetes} puedePrecios={puedePrecios}
                hayDentro={marcadosDentro.length > 0} hayPorMatricular={marcadosPorMatricular.length > 0}
                hayFuera={hayMarcadosFuera}
                onAgregar={(c) => fijarConcepto(marcadosDentro, c, true)}
                onQuitar={(c) => fijarConcepto(marcadosDentro, c, false)}
                onPaquete={(ids) => aplicarPaqueteAlumnos(marcadosDentro, ids)}
                onPrecio={(c, monto) => fijarPrecio(marcadosPorMatricular, c, monto)}
                onSacar={() => { alternarFuera(marcadosPorMatricular.map((a) => a.id), true); setMarcados(new Set()); }}
                onIncluir={() => alternarFuera([...marcados].filter((id) => fuera.has(id)), false)}
                onLimpiar={() => setMarcados(new Set())} />
            </div>
          )}

          {vista === 'alumno' && (
            <VistaAlumnos
              grupos={visibles} planes={planes} cambiadosSeccion={cambiadosSeccion}
              fuera={fuera} ajustes={ajustes} cuentas={cuentas} conceptosDe={conceptosDe}
              seleccion={marcados} onMarcar={marcar}
              editandoId={editando?.alumno.id ?? null} editor={editorDelAlumno}
              onEditar={(alumno, cursoId) => {
                if (editando?.alumno.id === alumno.id) { cerrarEditor(); return; }
                if (editando && editorSucio) { setAvisoSalir(true); return; }
                const grupo = completos.get(cursoId);
                if (grupo) setEditando({ alumno, grupo });
              }}
              onSacar={(id) => { alternarFuera([id], true); if (editando?.alumno.id === id) setEditando(null); }}
              onIncluir={(id) => alternarFuera([id], false)}
              onDeshacer={deshacerAjuste} />
          )}

          {vista === 'concepto' && (
            <VistaConceptos
              grupos={visibles} completos={completos} planes={planes}
              fuera={fuera} ajustes={ajustes} conceptosDe={conceptosDe} corte={corte}
              onFijarAlumno={fijarConcepto} onFijarSeccion={fijarConceptoSeccion} />
          )}

          {vista === 'seccion' && visibles.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
              Ningún alumno coincide.
            </p>
          )}

          {vista === 'seccion' && visibles.map((g) => {
            const completo = datos.grupos.find((x) => x.cursoId === g.cursoId)!;
            const plan = planes.get(g.cursoId);
            const cambiados = cambiadosSeccion.get(g.cursoId);
            // La casilla y la cuenta son de los que faltan; los ya matriculados se editan.
            const porMatricular = completo.estudiantes.filter((e) => !esMatriculado(e));
            const nMatriculados = completo.estudiantes.length - porMatricular.length;
            const dentro = porMatricular.filter((e) => !fuera.has(e.id));
            const todosDentro = dentro.length === porMatricular.length;
            const hoySeccion = dentro.reduce((s, e) => s + (cuentas.get(e.id)?.hoy ?? 0), 0);
            return (
              <article key={g.cursoId} id={`seccion-${g.cursoId}`}
                className="scroll-mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <header className="space-y-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={porMatricular.length > 0 && todosDentro}
                      disabled={porMatricular.length === 0}
                      ref={(el) => { if (el) el.indeterminate = dentro.length > 0 && !todosDentro; }}
                      onChange={() => alternarFuera(porMatricular.map((e) => e.id), todosDentro)}
                      aria-label={`Matricular a todos los que faltan en ${titulo(g)}`}
                      className="h-4 w-4 shrink-0 accent-zero-600 disabled:opacity-30" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold text-gray-900">{titulo(g)}</h2>
                      <p className="text-xs text-gray-500">
                        {g.tanda ? `${g.tanda} · ` : ''}
                        {porMatricular.length > 0 && `${dentro.length} de ${porMatricular.length} se matriculan`}
                        {porMatricular.length > 0 && nMatriculados > 0 && ' · '}
                        {nMatriculados > 0 && `${nMatriculados} ya matriculado(s)`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-gray-900">
                        {plan?.estado === 'listo' ? fmtDOP(hoySeccion) : '…'}
                      </p>
                      <p className="text-[11px] text-gray-500">se carga hoy</p>
                    </div>
                  </div>

                  {/* Conceptos de la sección: quitar uno aquí es quitárselo a todos. */}
                  {plan?.estado === 'cargando' && (
                    <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Calculando lo que cobra la sección…</p>
                  )}
                  {plan?.estado === 'error' && <p className="text-xs text-red-600">{plan.mensaje}</p>}
                  {plan?.estado === 'listo' && (plan.lineas.length === 0 ? (
                    <p className="text-xs text-amber-700">Esta sección no tiene tarifas: las matrículas se crean sin cargos.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {paquetes.length > 0 && (
                        <select value="" aria-label="Aplicar un paquete a toda la sección"
                          onChange={(e) => {
                            const pq = paquetes.find((x) => x.id === Number(e.target.value));
                            if (pq) aplicarPaqueteSeccion(completo, plan.lineas, pq.conceptosIds);
                          }}
                          className="mr-1 h-7 rounded-md border border-zero-200 bg-white px-1.5 text-xs text-zero-700 focus:border-zero-500 focus:outline-none">
                          <option value="">Aplicar paquete…</option>
                          {paquetes.map((pq) => <option key={pq.id} value={pq.id}>{pq.nombre}</option>)}
                        </select>
                      )}
                      <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Cobra</span>
                      {plan.lineas.map((l) => {
                        const activo = cobraEnSeccion(l, cambiados);
                        return (
                          <button key={l.conceptoId} type="button"
                            onClick={() => alternarConceptoSeccion(completo, l)}
                            title={activo ? 'Quitar a toda la sección' : l.opcional ? 'Opcional: cobrar a toda la sección' : 'Volver a cobrar a toda la sección'}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              activo
                                ? 'border-zero-200 bg-white text-gray-800 hover:border-zero-300'
                                : 'border-dashed border-gray-300 bg-transparent text-gray-400 line-through'}`}>
                            {activo ? <Check className="h-3 w-3 text-zero-600" /> : <X className="h-3 w-3" />}
                            {l.nombre}
                            <span className="tabular-nums text-gray-500">
                              {fmtDOP(l.montoCentavos)}{l.cuotas.length > 1 ? (l.precioPorCuota ? '/cuota' : ' en el año') : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </header>

                <ul className="divide-y divide-gray-100">
                  {g.estudiantes.map((e) => {
                    const sale = fuera.has(e.id);
                    const c = cuentas.get(e.id);
                    const a = ajustes.get(e.id);
                    const suyos = new Set(conceptosDe(e.id, g.cursoId) ?? []);
                    // Con lo de otros grados que lleve, para nombrarlo en «+».
                    const lineas = plan?.estado === 'listo'
                      ? [...plan.lineas, ...plan.otros.filter((l) => suyos.has(l.conceptoId))] : [];
                    const sinEstos = lineas.filter((l) => !suyos.has(l.conceptoId) && cobraEnSeccion(l, cambiados));
                    // Lo que lleva y su sección no cobra (lo marcado en la vista por concepto, por ejemplo).
                    const conMas = lineas.filter((l) => suyos.has(l.conceptoId) && !cobraEnSeccion(l, cambiados));
                    const matriculado = esMatriculado(e);
                    // Al ya matriculado se le enseña qué cambia en su matrícula, no contra la sección.
                    const cambio = matriculado ? cambioDe(e, g.cursoId) : null;
                    const nombreDe = (id: number) => lineas.find((l) => l.conceptoId === id)?.nombre ?? 'Concepto';
                    return (
                      <li key={e.id}
                        className={`group flex items-center gap-3 px-4 py-2.5 transition-colors ${sale ? 'bg-gray-50' : 'hover:bg-zero-50/40'}`}>
                        {matriculado ? (
                          <span title="Ya está matriculado: aquí se le cambia lo que lleva" className="flex h-4 w-4 shrink-0 items-center justify-center text-zero-600">
                            <GraduationCap className="h-4 w-4" aria-hidden />
                          </span>
                        ) : (
                          <input type="checkbox" checked={!sale}
                            onChange={() => alternarFuera([e.id], !sale)}
                            aria-label={`Matricular a ${e.nombre}`}
                            className="h-4 w-4 shrink-0 accent-zero-600" />
                        )}
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${sale ? 'bg-gray-200 text-gray-400' : tono(e.id)}`}>
                          {iniciales(e.nombre)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm ${sale ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.nombre}</p>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {sale && <Chip tono="gris">No se matricula ahora</Chip>}
                            {matriculado && <Chip tono="azul">Matriculado</Chip>}
                            {matriculado && cambio && (
                              <>
                                <Chip tono="verde"><Check className="mr-0.5 h-3 w-3" />Cambios por guardar</Chip>
                                {cambio.agregar.map((id) => <Chip key={`+${id}`} tono="azul">+ {nombreDe(id)}</Chip>)}
                                {cambio.quitar.map((id) => <Chip key={`-${id}`} tono="gris">Quitar {nombreDe(id)}</Chip>)}
                              </>
                            )}
                            {!matriculado && !sale && a && <Chip tono="verde"><Check className="mr-0.5 h-3 w-3" />Plan cambiado</Chip>}
                            {!sale && a?.precios.map((p) => {
                              const l = lineas.find((x) => x.conceptoId === p.conceptoId);
                              return <Chip key={p.conceptoId} tono="ambar">{l?.nombre ?? 'Concepto'}: {fmtDOP(p.montoCentavos)}</Chip>;
                            })}
                            {!sale && !cambio && sinEstos.map((l) => <Chip key={l.conceptoId} tono="gris">Sin {l.nombre}</Chip>)}
                            {!sale && !cambio && conMas.map((l) => <Chip key={l.conceptoId} tono="azul">+ {l.nombre}</Chip>)}
                            {!sale && e.sinResponsable && <Chip tono="rojo">Sin responsable de pago</Chip>}
                          </div>
                        </div>
                        {!sale && !matriculado && (
                          <div className="hidden text-right sm:block">
                            <p className="text-sm tabular-nums text-gray-900">{c ? fmtDOP(c.hoy) : '…'}</p>
                            <p className="text-[11px] tabular-nums text-gray-500">{c ? `${fmtDOP(c.anio)} el año` : ''}</p>
                          </div>
                        )}
                        <div className="flex shrink-0 items-center gap-1">
                          {sale ? (
                            <button type="button" onClick={() => alternarFuera([e.id], false)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zero-700 hover:bg-zero-50">
                              <RotateCcw className="h-3.5 w-3.5" />Incluir
                            </button>
                          ) : (
                            <>
                              <button type="button" onClick={() => setEditando({ alumno: e, grupo: completo })}
                                disabled={plan?.estado !== 'listo'}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-zero-300 hover:text-zero-700 disabled:opacity-40">
                                <Pencil className="h-3.5 w-3.5" />Editar
                              </button>
                              {a && (
                                <button type="button" onClick={() => deshacerAjuste(e.id)}
                                  title={matriculado ? 'Deshacer los cambios: queda como su matrícula' : 'Deshacer los cambios: vuelve a lo de su sección'}
                                  aria-label={`Deshacer los cambios de ${e.nombre}`}
                                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                              )}
                              {!matriculado && (
                                <button type="button" onClick={() => alternarFuera([e.id], true)}
                                  title="No matricular a este alumno ahora" aria-label={`No matricular a ${e.nombre}`}
                                  className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                                  <UserMinus className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </div>

      {/* ── Barra de acción ────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-gray-200 bg-white/90 backdrop-blur sm:-mx-6">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{resumen.alumnos}</span> alumno(s) por matricular en{' '}
            <span className="font-semibold text-gray-900">{resumen.secciones}</span> sección(es)
            {planesListos && resumen.alumnos > 0 && <> · se cargan hoy <span className="font-semibold text-gray-900">{fmtDOP(resumen.hoy)}</span></>}
            {cambiosMatriculados.length > 0 && (
              <> · <span className="font-semibold text-gray-900">{cambiosMatriculados.length}</span> matriculado(s) con cambios</>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/escolar/matriculas">Cancelar</Link></Button>
            <Button className="bg-zero-600 hover:bg-zero-700"
              disabled={(resumen.alumnos === 0 && cambiosMatriculados.length === 0) || !planesListos}
              onClick={() => setConfirmar(true)}>
              <GraduationCap className="mr-2 h-4 w-4" />{textoGuardar}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirmar} onOpenChange={setConfirmar}
        title={resumen.alumnos > 0 ? `¿Matricular a ${resumen.alumnos} alumno(s)?` : `¿Guardar los cambios de ${cambiosMatriculados.length} matrícula(s)?`}
        icon={<GraduationCap className="h-5 w-5 text-zero-600" />}
        description={(
          <>
            {resumen.alumnos > 0 && (
              <>
                Se crean {resumen.alumnos} matrícula(s) en {resumen.secciones} sección(es) con fecha de inscripción{' '}
                {fecha.split('-').reverse().join('/')}, y {resumen.cargos} cargo(s) pendientes por {fmtDOP(resumen.hoy)}.
                No se cobra nada ahora.
                {fuera.size > 0 && ` ${fuera.size} alumno(s) se quedan sin matricular.`}
              </>
            )}
            {cambiosMatriculados.length > 0 && (
              <span className="mt-2 block">
                A {cambiosMatriculados.length} alumno(s) ya matriculado(s) se les cambia lo que llevan
                ({cambiosMatriculados.reduce((n, c) => n + c.agregar.length, 0)} concepto(s) que se agregan y{' '}
                {cambiosMatriculados.reduce((n, c) => n + c.quitar.length, 0)} que se quitan). Lo que se quita anula sus
                cargos que nadie ha facturado ni pagado; lo que se agrega carga hoy lo que ya venció.
              </span>
            )}
          </>
        )}
        confirmLabel={resumen.alumnos > 0 ? (cambiosMatriculados.length > 0 ? 'Sí, matricular y guardar' : 'Sí, matricular') : 'Sí, guardar'}
        onConfirm={() => void matricular()} />

      {/* En la vista por alumno el plan se abre debajo de su fila; en las demás, en el cajón. */}
      <ConceptosYTarifasDialog open={conceptosAbierto}
        onCerrar={() => { setConceptosAbierto(false); setRecargarPlanes((n) => n + 1); }} />

      <Drawer anchor="right" open={!!editando && vista !== 'alumno'} onClose={cerrarEditor} keepMounted={false}
        slotProps={{
          backdrop: { sx: { backdropFilter: 'blur(2px)' } },
          // Ancho: la tabla de cargos (concepto, cuotas, por cuota, total y
          // acciones) se lee en una línea sin apretar. Lo pidió Alex.
          paper: { sx: { width: { xs: '100%', sm: 760, lg: 1000, xl: 1120 }, borderTopLeftRadius: { sm: 16 }, borderBottomLeftRadius: { sm: 16 } } },
        }}>
        {vista !== 'alumno' && editorDelAlumno}
      </Drawer>

      <ConfirmDialog open={avisoSalir} onOpenChange={setAvisoSalir}
        title="Tienes cambios sin guardar"
        description="Cambiaste los conceptos o los precios de este alumno y todavía no los has guardado. Si sales ahora, se pierden."
        confirmLabel="Salir sin guardar"
        cancelLabel="Seguir editando"
        destructive
        onConfirm={() => { setAvisoSalir(false); setEditando(null); }} />
    </section>
  );
}

/**
 * La estructura de lo que se va a matricular, como tabla con hijos: nivel →
 * grado → sección. Cada fila dice cuántos entran de cuántos y cuánto se les
 * carga hoy; su casilla mete o saca a todos los de debajo, y pulsar el nombre
 * deja la lista solo con esa parte.
 */
function ArbolSecciones({ grupos, fuera, cuentas, alcance, onAlcance, onIncluir }: {
  grupos: Grupo[];
  fuera: Set<number>;
  cuentas: Map<number, { hoy: number }>;
  alcance: string | null;
  onAlcance: (clave: string | null) => void;
  onIncluir: (ids: number[], sacar: boolean) => void;
}) {
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());

  const niveles = useMemo(() => {
    const m = new Map<string, { clave: string; nombre: string; grados: Map<string, { clave: string; nombre: string; grupos: Grupo[] }> }>();
    for (const g of grupos) {
      const kn = claveNivel(g);
      const nivel = m.get(kn) ?? { clave: kn, nombre: kn.slice(2), grados: new Map() };
      const kg = claveGrado(g);
      const grado = nivel.grados.get(kg) ?? { clave: kg, nombre: g.grado, grupos: [] };
      grado.grupos.push(g);
      nivel.grados.set(kg, grado);
      m.set(kn, nivel);
    }
    return [...m.values()].map((n) => ({ ...n, grados: [...n.grados.values()] }));
  }, [grupos]);

  const suma = (gs: Grupo[]) => {
    let total = 0, dentro = 0, hoy = 0;
    const ids: number[] = [];
    for (const g of gs) {
      for (const e of g.estudiantes) {
        // La tabla cuenta a los que faltan: los ya matriculados no entran de nuevo.
        if (esMatriculado(e)) continue;
        total++; ids.push(e.id);
        if (!fuera.has(e.id)) { dentro++; hoy += cuentas.get(e.id)?.hoy ?? 0; }
      }
    }
    return { total, dentro, hoy, ids };
  };

  const plegar = (clave: string) => setCerrados((s) => {
    const n = new Set(s);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  const fila = ({ clave, hondura, etiqueta, gs, plegable }: {
    clave: string | null; hondura: 0 | 1 | 2 | 3; etiqueta: string; gs: Grupo[]; plegable: boolean;
  }) => {
    const t = suma(gs);
    const todos = t.dentro === t.total;
    const elegida = alcance === clave;
    const abierta = clave == null || !cerrados.has(clave);
    return (
      <tr key={clave ?? 'todo'}
        className={`group border-t border-gray-100 first:border-t-0 ${elegida ? 'bg-zero-50' : 'hover:bg-gray-50'}`}>
        <td className="py-1.5 pr-2" style={{ paddingLeft: 8 + Math.max(hondura - 1, 0) * 16 }}>
          <div className="flex min-w-0 items-center gap-1.5">
            {plegable && clave ? (
              <button type="button" onClick={() => plegar(clave)} aria-label={abierta ? `Plegar ${etiqueta}` : `Desplegar ${etiqueta}`}
                aria-expanded={abierta}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700">
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${abierta ? 'rotate-90' : ''}`} />
              </button>
            ) : <span className="w-5 shrink-0" />}
            <input type="checkbox" checked={t.total > 0 && todos} disabled={t.total === 0}
              ref={(el) => { if (el) el.indeterminate = t.dentro > 0 && !todos; }}
              onChange={() => onIncluir(t.ids, todos)}
              aria-label={`Matricular a todos los que faltan en ${etiqueta}`}
              className="h-3.5 w-3.5 shrink-0 accent-zero-600 disabled:opacity-30" />
            <button type="button" onClick={() => onAlcance(elegida ? null : clave)} title={etiqueta}
              className={`min-w-0 truncate text-left ${
                hondura <= 1 ? 'font-semibold text-gray-900' : hondura === 2 ? 'font-medium text-gray-800' : 'text-gray-600'
              } ${elegida ? 'text-zero-800' : ''} hover:text-zero-700`}>
              {etiqueta}
            </button>
          </div>
        </td>
        <td className="py-1.5 text-center">
          {t.total === 0 ? (
            <span className="text-[11px] text-gray-400" title="Ya están todos matriculados">—</span>
          ) : (
            <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${
              todos ? 'bg-gray-100 text-gray-600' : t.dentro === 0 ? 'bg-red-50 text-red-600' : 'bg-amber-100 text-amber-800'}`}>
              {t.dentro}/{t.total}
            </span>
          )}
        </td>
        <td className="py-1.5 pr-3 text-right text-xs tabular-nums text-gray-700">{rdCorto(t.hoy)}</td>
      </tr>
    );
  };

  return (
    <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full table-fixed text-[13px]">
        <colgroup><col /><col className="w-16" /><col className="w-24" /></colgroup>
        <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="py-2 pl-3 text-left font-medium">Nivel · grado · sección</th>
            <th className="py-2 text-center font-medium">Entran</th>
            <th className="py-2 pr-3 text-right font-medium">Hoy</th>
          </tr>
        </thead>
        <tbody>
          {fila({ clave: null, hondura: 0, etiqueta: 'Todas las secciones', gs: grupos, plegable: false })}
          {niveles.flatMap((n) => {
            const filas = [fila({ clave: n.clave, hondura: 1, etiqueta: n.nombre, gs: n.grados.flatMap((g) => g.grupos), plegable: true })];
            if (cerrados.has(n.clave)) return filas;
            for (const gr of n.grados) {
              filas.push(fila({ clave: gr.clave, hondura: 2, etiqueta: gr.nombre, gs: gr.grupos, plegable: true }));
              if (cerrados.has(gr.clave)) continue;
              for (const g of gr.grupos) {
                filas.push(fila({
                  clave: claveSeccion(g), hondura: 3,
                  etiqueta: g.seccion ? `Sección ${g.seccion}` : g.curso, gs: [g], plegable: false,
                }));
              }
            }
            return filas;
          })}
        </tbody>
      </table>
    </div>
  );
}

/** El cajón de un alumno: sus conceptos y sus precios, con el selector de «Nueva matrícula». */
function EditorAlumno({
  alumno, grupo, periodoId, fecha, corte, inicial, puedePrecios, conCambios, recargar, onAbrirConceptos,
  paso, onPaso, onResponsable, onGuardar, onRestablecer, onSacar, onCerrar, onSucio,
}: {
  alumno: Alumno;
  grupo: Grupo;
  periodoId: number;
  fecha: string;
  corte: string;
  inicial: { conceptos?: number[]; precios: Ajuste['precios'] };
  puedePrecios: boolean;
  conCambios: boolean;
  /** Cambia al cerrar «Conceptos y tarifas»: el selector vuelve a pedir el plan. */
  recargar?: number;
  /** Abre «Conceptos y tarifas» encima, para crear o corregir sin salir. */
  onAbrirConceptos?: () => void;
  /** Qué parte se ve: los padres y quién paga, o sus cargos del año. Vive en la URL (`?paso=`). */
  paso: PasoAlumno;
  onPaso: (p: PasoAlumno) => void;
  /** Se le puso (o cambió) el responsable de pago desde «Familia». */
  onResponsable: (tiene: boolean) => void;
  onGuardar: (a: Ajuste) => void;
  onRestablecer: () => void;
  onSacar: () => void;
  onCerrar: () => void;
  /** Avisa si hay cambios sin guardar, para preguntar antes de cerrar. */
  onSucio?: (sucio: boolean) => void;
}) {
  // Lo que el selector va diciendo. Antes de que llegue el plan su lista de
  // conceptos va vacía sin querer decir «ninguno»: hasta entonces no se guarda.
  const [cargado, setCargado] = useState(false);
  const [conceptos, setConceptos] = useState<number[]>([]);
  const [precios, setPrecios] = useState<Ajuste['precios']>(inicial.precios);
  const [inicialFijo] = useState(inicial);

  // Lo que había al abrir, para saber si se tocó algo. El selector avisa del
  // plan (`onPlan`) ANTES de mandar la primera lista de conceptos y precios,
  // así que lo primero que llega después de cargar es el punto de partida.
  const cargadoRef = useRef(false);
  const base = useRef<{ conceptos: string | null; precios: string | null }>({ conceptos: null, precios: null });

  const alLlegarPlan = useCallback(() => { cargadoRef.current = true; setCargado(true); }, []);
  const alCambiar = useCallback((ids: number[]) => {
    setConceptos(ids);
    if (cargadoRef.current && base.current.conceptos === null) base.current.conceptos = claveIds(ids);
  }, []);
  const alCambiarPrecios = useCallback((ps: { conceptoId: number; montoCentavos: number }[]) => {
    const limpios = ps.map((p) => ({ conceptoId: p.conceptoId, montoCentavos: p.montoCentavos }));
    setPrecios(limpios);
    if (cargadoRef.current && base.current.precios === null) base.current.precios = clavePrecios(limpios);
  }, []);

  const sucio = cargado && base.current.conceptos !== null && (
    claveIds(conceptos) !== base.current.conceptos
    || (base.current.precios !== null && clavePrecios(precios) !== base.current.precios)
  );
  useEffect(() => { onSucio?.(sucio); }, [sucio, onSucio]);
  const [pagosVisto, setPagosVisto] = useState(paso === 'pagos');
  useEffect(() => { if (paso === 'pagos') setPagosVisto(true); }, [paso]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${tono(alumno.id)}`}>
          {iniciales(alumno.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-gray-900">{alumno.nombre}</h2>
          <p className="text-xs text-gray-500">{titulo(grupo)}{grupo.tanda ? ` · ${grupo.tanda}` : ''}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primero quién es su familia y quién paga, después lo que se le cobra:
          el orden del formulario de migración. Los dos pasos quedan montados
          para no perder lo marcado al ir y volver. */}
      <div role="tablist" aria-label="Partes del alumno" className="flex gap-1 border-b border-gray-100 px-5">
        {PASOS_ALUMNO.map((p, i) => (
          <button key={p.id} type="button" role="tab" aria-selected={paso === p.id} onClick={() => onPaso(p.id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-2 py-2.5 text-sm font-medium ${
              paso === p.id ? 'border-zero-600 text-zero-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
              paso === p.id ? 'bg-zero-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
            {p.etiqueta}
            {p.id === 'familia' && alumno.sinResponsable && (
              <span className="h-2 w-2 rounded-full bg-amber-500" title="Sin responsable de pago" />
            )}
          </button>
        ))}
      </div>

      <div className={`flex-1 overflow-y-auto px-5 py-4 ${paso === 'familia' ? '' : 'hidden'}`}>
        <FamiliaDelAlumno estudianteId={alumno.id} onResponsable={onResponsable} />
      </div>

      {/* Se monta la primera vez que se entra: abrir un alumno no pide sus cargos. */}
      {(paso === 'pagos' || pagosVisto) && (
        <div className={`flex-1 overflow-y-auto px-5 py-4 ${paso === 'pagos' ? '' : 'hidden'}`}>
          {alumno.matriculaId != null ? (
            <PagosDelAlumno estudianteId={alumno.id} matriculaId={alumno.matriculaId} />
          ) : (
            <p className="text-sm text-gray-500">
              Sus cargos nacen al matricularlo. Matricúlalo y vuelve aquí para anotar lo que ya pagó.
            </p>
          )}
        </div>
      )}

      <div className={`flex-1 space-y-4 overflow-y-auto px-5 py-4 ${paso === 'conceptos' ? '' : 'hidden'}`}>
        {esMatriculado(alumno) && (
          <div className="flex gap-2 rounded-lg border border-zero-200 bg-zero-50 px-3 py-2 text-xs text-zero-900">
            <GraduationCap className="h-4 w-4 shrink-0 text-zero-600" />
            Ya está matriculado. Lo que le cambies aquí se guarda en su matrícula al final, con «Guardar»:
            lo que se quita anula sus cargos sin facturar ni pagar y lo que se agrega carga lo que ya venció.
          </div>
        )}
        {alumno.sinResponsable && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            No tiene responsable de pago: sus cargos no se facturarán hasta asignarle uno en
            <button type="button" onClick={() => onPaso('familia')} className="font-medium underline">Familia</button>.
          </div>
        )}
        <PlanCobroSelector
          periodoId={String(periodoId)}
          cursoId={String(grupo.cursoId)}
          desde={fecha}
          corte={corte}
          estudianteId={alumno.id}
          inicial={inicialFijo}
          conOtros
          preciosSoloOtros={esMatriculado(alumno)}
          recargar={recargar}
          onPlan={alLlegarPlan}
          onCambio={alCambiar}
          onPrecios={puedePrecios ? alCambiarPrecios : undefined}
        />
        {onAbrirConceptos && (
          <button type="button" onClick={onAbrirConceptos}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zero-700 hover:text-zero-800">
            <Tag className="h-3.5 w-3.5" />¿Falta un concepto o un precio? Abrir conceptos y tarifas
          </button>
        )}
        {(!puedePrecios || esMatriculado(alumno)) && (
          <p className="text-xs text-gray-500">
            {!puedePrecios
              ? 'Cambiar el precio de un alumno lo hace quien puede tocar Tarifas. Aquí puedes darle o quitarle conceptos.'
              : 'El precio de lo que ya lleva se cambia en Tarifas: tiene cargos hechos. Lo que le des de otros grados lleva aquí su precio.'}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {!esMatriculado(alumno) && (
            <button type="button" onClick={onSacar}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
              <UserMinus className="h-4 w-4" />No matricular ahora
            </button>
          )}
          {conCambios && (
            <button type="button" onClick={onRestablecer}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
              <RotateCcw className="h-4 w-4" />{esMatriculado(alumno) ? 'Como su matrícula' : 'Lo de su sección'}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          {paso === 'familia' ? (
            // La familia ya quedó guardada: lo que sigue es su plan.
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={() => onPaso('conceptos')}>
              Siguiente: cargos del año
            </Button>
          ) : (
            <Button className="bg-zero-600 hover:bg-zero-700" disabled={!cargado}
              onClick={() => onGuardar({ conceptos, precios })}>
              Guardar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mientras se matricula, y cuando termina: sección por sección. */
function Progreso({ avance, corriendo, volver, periodo }: {
  avance: Avance[]; corriendo: boolean; volver: ReactNode; periodo: string;
}) {
  const hechas = avance.filter((a) => a.estado === 'hecho' || a.estado === 'fallo').length;
  const secciones = avance.filter((a) => a.cursoId !== CAMBIOS);
  const creadas = secciones.reduce((n, a) => n + (a.creadas ?? 0), 0);
  const editados = avance.find((a) => a.cursoId === CAMBIOS)?.creadas ?? 0;
  const conflicto = avance.reduce((n, a) => n + (a.conflicto ?? 0), 0);
  const conError = avance.reduce((n, a) => n + (a.error ?? 0) + (a.estado === 'fallo' ? a.alumnos : 0), 0);
  const pct = Math.round((hechas / Math.max(avance.length, 1)) * 100);

  return (
    <section className="space-y-5 p-4 sm:p-6">
      {!corriendo && volver}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${corriendo ? 'bg-zero-50 text-zero-600' : conError > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {corriendo ? <Loader2 className="h-5 w-5 animate-spin" /> : conError > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {corriendo ? 'Guardando…' : conError > 0 ? 'Terminado, con avisos'
                : secciones.length > 0 ? 'Listo: alumnos matriculados' : 'Listo: cambios guardados'}
            </h1>
            <p className="text-sm text-gray-500">
              {corriendo ? `Paso ${Math.min(hechas + 1, avance.length)} de ${avance.length}. No cierres esta página.`
                : `${periodo} · ${secciones.length} sección(es)${editados > 0 ? ` · ${editados} matrícula(s) cambiada(s)` : ''}`}
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-zero-600 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {!corriendo && (
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Kpi icono={<UserCheck className="h-4 w-4" />} etiqueta="Matriculados" valor={String(creadas)} destacado />
            {editados > 0
              ? <Kpi icono={<Pencil className="h-4 w-4" />} etiqueta="Matrículas cambiadas" valor={String(editados)} />
              : <Kpi icono={<Check className="h-4 w-4" />} etiqueta="Ya tenían matrícula" valor={String(conflicto)} />}
            <Kpi icono={<XCircle className="h-4 w-4" />} etiqueta="Con error" valor={String(conError)} />
          </div>
        )}
      </div>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {avance.map((a) => (
          <li key={a.cursoId} className="px-4 py-3">
            <div className="flex items-center gap-3">
              {a.estado === 'corriendo' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zero-600" />
                : a.estado === 'esperando' ? <span className="h-4 w-4 shrink-0 rounded-full border-2 border-gray-200" />
                : a.estado === 'fallo' || (a.error ?? 0) > 0 ? <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                : (a.conflicto ?? 0) > 0 ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{a.curso}</span>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">
                {a.estado === 'hecho' ? `${a.creadas} de ${a.alumnos}` : a.estado === 'fallo' ? 'no se matriculó' : `${a.alumnos} alumno(s)`}
              </span>
            </div>
            {a.mensaje && <p className="mt-1 pl-7 text-xs text-red-600">{a.mensaje}</p>}
            {a.nota && <p className="mt-1 pl-7 text-xs text-gray-500">{a.nota}</p>}
            {a.problemas && a.problemas.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 pl-7">
                {a.problemas.map((p) => (
                  <li key={p.estudianteId} className="text-xs text-gray-600">
                    <span className="text-gray-900">{p.nombre}</span> — {p.motivo ?? p.resultado}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {!corriendo && (
        <div className="flex justify-end">
          <Button className="bg-zero-600 hover:bg-zero-700" asChild>
            <Link href="/escolar/matriculas">Ver matrículas</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function Kpi({ icono, etiqueta, valor, nota, destacado }: {
  icono: ReactNode; etiqueta: string; valor: string; nota?: string; destacado?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${destacado ? 'border-zero-200 bg-zero-50' : 'border-gray-200 bg-white'}`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide ${destacado ? 'text-zero-700' : 'text-gray-500'}`}>
        {icono}{etiqueta}
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${destacado ? 'text-zero-800' : 'text-gray-900'}`}>{valor}</p>
      {nota && <p className="mt-0.5 truncate text-[11px] text-gray-500">{nota}</p>}
    </div>
  );
}

const claveIds = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');
const clavePrecios = (ps: { conceptoId: number; montoCentavos: number }[]) =>
  ps.map((p) => `${p.conceptoId}:${p.montoCentavos}`).sort().join(',');

/** Junto al título: si lo decidido está guardado, y de cuándo es lo recuperado. */
function EstadoBorrador({ b, hayCambios, onDescartar }: {
  b: { estado: string; actualizado?: string | null; por?: string | null; recuperado?: boolean };
  hayCambios: boolean;
  onDescartar: () => void;
}) {
  if (b.estado === 'cargando' || (!hayCambios && b.estado !== 'error')) return null;
  const cuando = b.actualizado
    ? new Date(b.actualizado).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
      {b.estado === 'guardando' && <><Loader2 className="h-3 w-3 animate-spin" />Guardando…</>}
      {b.estado === 'error' && <span className="text-red-600">No se pudo guardar lo último: revisa la conexión.</span>}
      {(b.estado === 'guardado' || b.estado === 'listo') && (
        <span className="inline-flex items-center gap-1">
          <Check className="h-3 w-3 text-emerald-600" />
          {b.recuperado
            ? <>Seguimos donde se quedó{cuando ? ` el ${cuando}` : ''}{b.por ? ` (${b.por})` : ''}</>
            : 'Guardado solo'}
        </span>
      )}
      {hayCambios && b.estado !== 'guardando' && (
        <button type="button" onClick={onDescartar} className="font-medium text-gray-500 underline hover:text-gray-700">
          Empezar de cero
        </button>
      )}
    </p>
  );
}
