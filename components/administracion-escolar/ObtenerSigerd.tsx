'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ShieldCheck, TriangleAlert, DownloadCloud } from 'lucide-react';

/**
 * Estado de la última descarga de Sigerd.
 *
 * Va por SWR y no por `fetch` suelto porque varias tarjetas lo necesitan: el
 * resumen de lo ya guardado y el botón de sincronizar. Con `fetch` cada una
 * pedía lo suyo y se montaban a la vez, así que la pantalla hacía dos
 * peticiones idénticas en paralelo.
 */
export const CLAVE_ESTADO_SIGERD = '/api/sigerd/obtener';
export const traerEstadoSigerd = (url: string) => fetch(url).then((r) => r.json());

// ─── Obtener información (todo el centro → nuestras tablas) ─────────────────

export interface EstadoObtener {
  estado: 'ninguno' | 'pendiente' | 'corriendo' | 'error' | 'completado';
  mensaje: string | null;
  /** Hay una descarga buena guardada, aunque el último intento de actualizar falló. */
  conDescarga: boolean;
  /** Año académico (id de SIGERD) de la última descarga. */
  anoAcademico: number | null;
  nEstudiantes: number | null;
  nSecciones: number | null;
  nEmpleados: number | null;
  completadoEn: string | null;
  /** Mientras corre por tandas: cuántas fichas van de cuántas. */
  progreso: { hechos: number; total: number } | null;
}

/** Lo que responden `POST /api/sigerd/obtener` y `/obtener/continuar`. */
interface RespuestaObtener {
  estado?: 'completado' | 'corriendo' | 'error';
  mensaje?: string;
  error?: string;
  codigo?: string;
  hechos?: number;
  total?: number;
  nEstudiantes?: number;
  nSecciones?: number;
  nEmpleados?: number;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Años de reserva, SOLO para cuando el portal no contesta.
 *
 * Eran la lista entera, escrita a mano. El problema: las etiquetas son una
 * suposición sobre qué año significa cada id de SIGERD, y la pantalla enseñaba
 * la nuestra en vez de la suya — el colegio elegía «2025-2026» sin manera de
 * saber que el portal llama a ese id de otra forma. Ahora se piden a
 * `/api/sigerd/anios` y esto queda como red para no dejar el desplegable vacío.
 */
const ANIOS_RESERVA = [
  { value: '24', label: 'Año académico 24' },
  { value: '23', label: 'Año académico 23' },
];

interface AniosResp { anios?: { id: number; nombre: string }[] }

/**
 * Un solo botón. Trae TODO el centro de SIGERD y lo guarda en nuestras tablas.
 * Una sincronización por colegio a la vez; el servidor rechaza si hay otra en
 * curso o si SIGERD está caído (con mensaje para reintentar).
 *
 * Vive aquí, compartido, porque lo usan dos pantallas: `/escolar/sigerd` y el
 * paso «Plan» del asistente de Configuración → SIGERD. Antes solo existía en la
 * primera, que no tiene enlace en ningún menú, y el asistente decía «corre
 * Obtener información en la pantalla de SIGERD» sin forma de llegar a ella.
 */
export function ObtenerSigerd({ onCompletado }: {
  /** Tras guardar la información: el asistente recarga su plan aquí. */
  onCompletado?: () => void;
} = {}) {
  /**
   * Los años que ofrece EL PORTAL para este centro, con SU nombre. Si no
   * contesta —sin credenciales, SIGERD caído— se usan los de reserva y se dice.
   */
  const { data: aniosResp, error: errorAnios } = useSWR<AniosResp>('/api/sigerd/anios', traerEstadoSigerd, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  // Misma clave que el resumen de arriba: SWR la comparte, así que la pantalla
  // pide el estado una sola vez. Mientras el servidor está descargando se
  // vuelve a preguntar cada cinco segundos; sin eso, quien recargaba la página
  // con una sincronización en marcha se quedaba en «Sincronizando…» para
  // siempre, aunque ya hubiese terminado.
  const { data: estado, mutate: refrescarEstado } = useSWR<EstadoObtener>(
    CLAVE_ESTADO_SIGERD,
    traerEstadoSigerd,
    { refreshInterval: (d) => (d?.estado === 'corriendo' ? 5000 : 0) },
  );

  const delPortal = (aniosResp?.anios ?? []).map((a) => ({ value: String(a.id), label: a.nombre }));
  const sonDeReserva = delPortal.length === 0;
  const baseAnios = sonDeReserva ? ANIOS_RESERVA : delPortal;

  // El año que ya se bajó. Volver a bajar es refrescar ESE año: por defecto el
  // desplegable arrancaba en el primero del portal, que puede ser otro, y la
  // «actualización» terminaba guardando un año distinto al que el colegio usa.
  const descargado = estado?.anoAcademico != null ? String(estado.anoAcademico) : '';
  const anios = descargado && !baseAnios.some((a) => a.value === descargado)
    ? [{ value: descargado, label: `Año académico ${descargado}` }, ...baseAnios]
    : baseAnios;

  // Vacío hasta que se sepan los años: el portal manda cuál es el primero, y
  // fijar '24' a mano era justo lo que hacía elegir un año equivocado.
  const [anio, setAnio] = useState('');
  const elegido = anio || descargado || anios[0]?.value || '';
  const [lanzando, setLanzando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargarEstado = useCallback(() => refrescarEstado(), [refrescarEstado]);
  const corriendo = lanzando || estado?.estado === 'corriendo';
  /** Fichas traídas de cuántas, mientras la descarga va por tandas. */
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const progreso = avance ?? estado?.progreso ?? null;
  /** Hay un bucle de tandas vivo en ESTA pestaña: no se arranca otro. */
  const enBucle = useRef(false);
  // Con una descarga ya guardada el botón no «obtiene»: la REPITE. Antes de
  // esto quedaba el mismo texto, y sobre todo, el colegio no tenía forma de ver
  // lo que SIGERD cambió después (alumnos nuevos, cambios de sección).
  const yaHayDescarga = estado?.estado === 'completado' || estado?.conDescarga === true;
  const setCorriendo = setLanzando;

  /**
   * Cierra una respuesta del servidor. `true` si hay que pedir otra tanda.
   * Un centro grande no cabe en una llamada (300 s en Vercel): el servidor
   * responde `corriendo` con el avance y aquí se sigue pidiendo.
   */
  async function atender(r: Response, d: RespuestaObtener): Promise<boolean> {
    if (r.status === 409 && d.codigo === 'tanda-en-curso') {
      // Otra pestaña la está avanzando; esta solo espera a que termine.
      await esperar(5000);
      return true;
    }
    if (r.status === 409) {
      // otra en curso / ya corriendo / nada que seguir
      if (d.codigo !== 'nada-en-curso') setError(d.error ?? 'Hay otra sincronización en curso. Espera.');
      return false;
    }
    if (!r.ok) {
      setError(d.error ?? 'No se pudo obtener la información.');
      return false;
    }
    if (d.estado === 'error') {
      setError(d.mensaje ?? 'SIGERD no disponible. Continuaremos cuando vuelva.');
      return false;
    }
    if (d.estado === 'corriendo') {
      if (d.total != null) setAvance({ hechos: d.hechos ?? 0, total: d.total });
      return true;
    }
    setOk(`Información guardada: ${d.nEstudiantes} estudiantes · ${d.nSecciones} secciones · ${d.nEmpleados} empleados.`);
    return false;
  }

  /** Pide tandas hasta que el servidor diga que terminó (o falle). */
  async function seguirTandas() {
    while (true) {
      const r = await fetch('/api/sigerd/obtener/continuar', { method: 'POST' });
      const d: RespuestaObtener = await r.json().catch(() => ({}));
      if (!(await atender(r, d))) break;
    }
  }

  async function correr(primera: () => Promise<boolean>) {
    if (enBucle.current) return;
    enBucle.current = true;
    setCorriendo(true);
    setError(null);
    setOk(null);
    try {
      if (await primera()) await seguirTandas();
      await cargarEstado();
      onCompletado?.();
    } catch {
      setError('Se interrumpió la conexión. Lo ya descargado se guarda: vuelve a abrir esta pantalla para seguir.');
    } finally {
      enBucle.current = false;
      setAvance(null);
      setCorriendo(false);
    }
  }

  function obtener() {
    void correr(async () => {
      const r = await fetch('/api/sigerd/obtener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anoAcademico: Number(elegido) }),
      });
      const d: RespuestaObtener = await r.json().catch(() => ({}));
      return atender(r, d);
    });
  }

  // Al volver a la pantalla con una descarga a medias, se sigue sola: sin
  // esto quedaba esperando una pestaña que ya no existe hasta que el candado
  // venciera. Si otra pestaña la está llevando, el servidor responde
  // `tanda-en-curso` y esta solo espera.
  const aMedias = estado?.estado === 'corriendo' && estado.progreso != null;
  useEffect(() => {
    if (aMedias && !enBucle.current) void correr(async () => true);
    // `correr` cambia en cada render; lo que decide es si hay una a medias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aMedias]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {yaHayDescarga
          ? 'Vuelve a traer los datos de tu centro para ver lo que cambió en SIGERD desde la última vez. Reemplaza la descarga anterior de ese año; no borra nada de lo que ya tienes en Zero.'
          : 'Trae todos los datos de tu centro en SIGERD (cursos, estudiantes, condición, personal) y los guarda aquí. Con una sola vez basta; luego no hace falta reconectar.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={elegido} onValueChange={setAnio} disabled={corriendo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anios.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={obtener} disabled={corriendo}>
          {corriendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
          {corriendo ? 'Sincronizando…' : yaHayDescarga ? 'Volver a bajar de SIGERD' : 'Obtener información'}
        </Button>
      </div>

      {sonDeReserva && aniosResp !== undefined && (
        <p className="text-xs text-amber-700">
          No se pudo leer del portal la lista de años académicos
          {errorAnios ? '' : ' (¿credenciales sin probar?)'}: se muestran los conocidos por su
          número. Comprueba en SIGERD cuál corresponde antes de descargar.
        </p>
      )}

      {corriendo && (
        <p className="text-sm text-muted-foreground">
          {progreso
            ? `Descargando las fichas de SIGERD: ${progreso.hechos} de ${progreso.total}. Deja esta pantalla abierta hasta que termine.`
            : 'Sincronizando con SIGERD… puede tardar unos minutos. Deja esta pantalla abierta.'}
        </p>
      )}

      {ok && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!corriendo && !ok && !error && estado && estado.estado === 'completado' && (
        <p className="text-xs text-muted-foreground">
          Última sincronización: {estado.nEstudiantes} estudiantes · {estado.nSecciones} secciones ·{' '}
          {estado.nEmpleados} empleados.
        </p>
      )}
      {!corriendo && !error && estado && estado.estado === 'error' && estado.mensaje && (
        <p className="text-xs text-destructive">{estado.mensaje}</p>
      )}
    </div>
  );
}
