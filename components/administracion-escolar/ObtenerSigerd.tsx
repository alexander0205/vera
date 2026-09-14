'use client';

import { useCallback, useState } from 'react';
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
  nEstudiantes: number | null;
  nSecciones: number | null;
  nEmpleados: number | null;
  completadoEn: string | null;
}

const ANIOS = [
  { value: '24', label: '2025-2026' },
  { value: '23', label: '2024-2025' },
];

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
  const [anio, setAnio] = useState('24');
  const [lanzando, setLanzando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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

  const cargarEstado = useCallback(() => refrescarEstado(), [refrescarEstado]);
  const corriendo = lanzando || estado?.estado === 'corriendo';
  const setCorriendo = setLanzando;

  async function obtener() {
    setCorriendo(true);
    setError(null);
    setOk(null);
    try {
      const r = await fetch('/api/sigerd/obtener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anoAcademico: Number(anio) }),
      });
      const d = await r.json();

      if (r.status === 409) {
        // otra en curso / ya corriendo → hay que esperar
        setError(d.error ?? 'Hay otra sincronización en curso. Espera.');
        return;
      }
      if (!r.ok) {
        setError(d.error ?? 'No se pudo obtener la información.');
        return;
      }
      if (d.estado === 'error') {
        setError(d.mensaje ?? 'SIGERD no disponible. Continuaremos cuando vuelva.');
        return;
      }
      setOk(`Información guardada: ${d.nEstudiantes} estudiantes · ${d.nSecciones} secciones · ${d.nEmpleados} empleados.`);
      await cargarEstado();
      onCompletado?.();
    } catch {
      setError('Se interrumpió la conexión. Vuelve a intentarlo.');
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Trae todos los datos de tu centro en SIGERD (cursos, estudiantes, condición, personal) y los
        guarda aquí. Con una sola vez basta; luego no hace falta reconectar.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={anio} onValueChange={setAnio} disabled={corriendo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANIOS.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={obtener} disabled={corriendo}>
          {corriendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
          {corriendo ? 'Sincronizando…' : 'Obtener información'}
        </Button>
      </div>

      {corriendo && (
        <p className="text-sm text-muted-foreground">
          Sincronizando con SIGERD… puede tardar cerca de un minuto. No cierres la página.
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
