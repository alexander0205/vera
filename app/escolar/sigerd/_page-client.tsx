'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, LogOut, ShieldCheck, TriangleAlert, Link2, Search, ListTree, DownloadCloud,
  Database, CalendarClock, Trash2,
} from 'lucide-react';

/**
 * Estado de la última descarga de Sigerd.
 *
 * Va por SWR y no por `fetch` suelto porque dos tarjetas distintas de esta
 * pantalla lo necesitan: el resumen de lo ya guardado y el botón de sincronizar.
 * Con `fetch` cada una pedía lo suyo y se montaban a la vez, así que la pantalla
 * hacía dos peticiones idénticas en paralelo.
 */
const CLAVE_ESTADO_SIGERD = '/api/sigerd/obtener';
const traerEstado = (url: string) => fetch(url).then((r) => r.json());

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface Perfil {
  id: string;
  idCentro: number;
  idRol: number;
  idRegional: number;
  nombreRol: string;
  nombreCentro: string | null;
}

type Fase = 'cargando' | 'credenciales' | 'perfil' | 'conectado';

// ─── Página ────────────────────────────────────────────────────────────────

export default function SigerdPageClient() {
  const [fase, setFase] = useState<Fase>('cargando');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [perfilId, setPerfilId] = useState('');
  const [perfilActivo, setPerfilActivo] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargarEstado = useCallback(async () => {
    try {
      const r = await fetch('/api/sigerd/sesion');
      const d = await r.json();
      if (d.conectado) {
        setPerfilActivo(d.perfil ?? null);
        setFase('conectado');
      } else {
        setFase('credenciales');
      }
    } catch {
      setFase('credenciales');
    }
  }, []);

  useEffect(() => {
    void cargarEstado();
  }, [cargarEstado]);

  async function enviarCredenciales(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const r = await fetch('/api/sigerd/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? 'No se pudo iniciar sesión en SIGERD.');
        return;
      }

      if (d.estado === 'seleccion-perfil') {
        setPerfiles(d.perfiles);
        setPerfilId(d.perfiles[0]?.id ?? '');
        setFase('perfil');
        return;
      }

      setPerfilActivo(d.perfil ?? null);
      setPassword(''); // la clave ya no hace falta en memoria del navegador
      setFase('conectado');
    } catch {
      setError('Error de red al contactar SIGERD.');
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarPerfil() {
    setError(null);
    setOcupado(true);
    try {
      const r = await fetch('/api/sigerd/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perfilId, password }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? 'No se pudo fijar el perfil.');
        if (d.codigo === 'sesion-expirada') setFase('credenciales');
        return;
      }

      setPerfilActivo(d.perfil ?? null);
      setPassword('');
      setFase('conectado');
    } catch {
      setError('Error de red al contactar SIGERD.');
    } finally {
      setOcupado(false);
    }
  }

  async function desconectar() {
    setOcupado(true);
    try {
      await fetch('/api/sigerd/sesion', { method: 'DELETE' });
    } finally {
      setPerfilActivo(null);
      setPerfiles([]);
      setPassword('');
      setFase('credenciales');
      setOcupado(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (fase === 'cargando') {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Comprobando conexión con SIGERD…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">SIGERD</h1>
        <p className="text-sm text-muted-foreground">
          Conecta tu cuenta del portal del MINERD para consultar tus datos desde aquí.
        </p>
      </div>

      {/* Datos ya descargados: se ven sin reconectar (salen de la DB). */}
      <ResumenDatos />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {fase === 'conectado' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Conectado a SIGERD
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {perfilActivo ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{perfilActivo.nombreRol}</Badge>
                  {perfilActivo.nombreCentro && <span>{perfilActivo.nombreCentro}</span>}
                </div>
                <p className="text-muted-foreground">
                  Centro {perfilActivo.idCentro} · Regional {perfilActivo.idRegional}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sesión activa con perfil único.</p>
            )}

            <p className="text-xs text-muted-foreground">
              Tu contraseña no se guarda. La sesión caduca sola y puedes cerrarla cuando quieras.
            </p>

            <ObtenerInformacion />

            <Button variant="ghost" size="sm" onClick={desconectar} disabled={ocupado}>
              {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Cerrar sesión de SIGERD
            </Button>
          </CardContent>
        </Card>
      ) : fase === 'perfil' ? (
        <Card>
          <CardHeader>
            <CardTitle>Elige tu perfil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tu cuenta tiene {perfiles.length} perfiles en SIGERD. Elige con cuál quieres trabajar.
            </p>

            <Select value={perfilId} onValueChange={setPerfilId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un perfil" />
              </SelectTrigger>
              <SelectContent>
                {perfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombreRol}
                    {p.nombreCentro ? ` — ${p.nombreCentro}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button onClick={confirmarPerfil} disabled={ocupado || !perfilId}>
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continuar
              </Button>
              <Button variant="ghost" onClick={() => { setFase('credenciales'); setPassword(''); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión en SIGERD</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={enviarCredenciales} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sigerd-usuario">Usuario (cédula, sin guiones)</Label>
                <Input
                  id="sigerd-usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder=""
                  inputMode="numeric"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sigerd-password">Contraseña</Label>
                <Input
                  id="sigerd-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Tus credenciales viajan a SIGERD para abrir la sesión y no se almacenan. Solo se
                guarda, cifrada, la sesión del portal.
              </p>

              <Button type="submit" disabled={ocupado || !usuario || !password}>
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conectar
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Resumen de datos ya descargados (visible SIN reconectar) ──────────────

/**
 * Muestra lo que ya se bajó de SIGERD en la última sincronización — sale de la
 * DB, así que se ve aunque la sesión del portal haya caducado. La conexión solo
 * hace falta para VOLVER a sincronizar, no para ver lo guardado.
 */
function ResumenDatos() {
  const { data: estado, mutate } = useSWR<EstadoObtener>(CLAVE_ESTADO_SIGERD, traerEstado);
  const [borrando, setBorrando] = useState(false);
  /**
   * Confirmación propia, no `window.confirm`: en el navegador embebido de la
   * app devuelve `false` al instante y sin enseñar nada, así que este botón
   * —que borra TODO lo importado— no hacía absolutamente nada.
   */
  const [confirmando, setConfirmando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  async function eliminar() {
    setBorrando(true);
    try {
      const r = await fetch('/api/sigerd/obtener', { method: 'DELETE' });
      // Se revalida en vez de vaciar a mano: así la otra tarjeta que lee la
      // misma clave también se entera de que ya no hay datos.
      if (r.ok) { setConfirmando(false); setErrorBorrado(null); await mutate(); }
      else setErrorBorrado('No se pudieron eliminar los datos.');
    } catch {
      setErrorBorrado('No se pudieron eliminar los datos.');
    } finally {
      setBorrando(false);
    }
  }

  if (!estado || estado.estado !== 'completado') return null;

  const fecha = estado.completadoEn
    ? new Date(estado.completadoEn).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Database className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-900">Ya tienes los datos guardados</p>
            {fecha && (
              <p className="flex items-center gap-1 text-xs text-emerald-700">
                <CalendarClock className="h-3 w-3" /> Sincronizado el {fecha}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ResumenKpi label="Estudiantes" valor={estado.nEstudiantes} />
          <ResumenKpi label="Secciones" valor={estado.nSecciones} />
          <ResumenKpi label="Personal" valor={estado.nEmpleados} />
        </div>

        <p className="text-xs text-muted-foreground">
          Conéctate abajo solo si quieres volver a sincronizar con SIGERD.
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmando(true)}
          disabled={borrando}
          className="text-destructive hover:text-destructive"
        >
          {borrando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
          Eliminar datos guardados
        </Button>

        <ConfirmDialog
          open={confirmando}
          onOpenChange={(o: boolean) => { if (!o && !borrando) { setConfirmando(false); setErrorBorrado(null); } }}
          title="Eliminar los datos de SIGERD"
          description={
            <>
              Se borran los estudiantes, las secciones y el personal traídos del
              portal. No se puede deshacer: para recuperarlos hay que volver a
              conectarse y sincronizar.
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
          onConfirm={() => void eliminar()} />
      </CardContent>
    </Card>
  );
}

function ResumenKpi({ label, valor }: { label: string; valor: number | null }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-3 text-center">
      <p className="text-xl font-bold text-gray-900">{valor ?? '—'}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Obtener información (todo el centro → nuestras tablas) ─────────────────

interface EstadoObtener {
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
 */
function ObtenerInformacion() {
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
    traerEstado,
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
