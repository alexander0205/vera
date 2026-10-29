'use client';

import { useCallback, useEffect, useState } from 'react';
import { DownloadCloud, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TutoresPanel, type TutorVinculo } from './TutoresPanel';
import { ResponsablePagoDialog, type Contacto } from './ResponsablePagoDialog';

/**
 * Padres, tutores y quién paga de un alumno que ya existe, en un panel estrecho.
 *
 * Es lo mismo que la tarjeta «Tutores» y «Responsable de pago» de Editar
 * alumno —los mismos componentes y las mismas rutas—, pensado para el panel
 * del alumno en «Matricular desde SIGERD»: en la migración de un colegio los
 * padres se completan ahí mismo, alumno por alumno, sin ir a su ficha.
 *
 * Todo se guarda al momento, como en Editar alumno: el alumno ya existe y no
 * hay nada que esperar.
 *
 * «Traer de SIGERD» lee la ficha del alumno en el portal (el PDF, que es lo que
 * trae padre y madre con cédula) y ata los que no tenga. Lo que el portal no
 * traiga se agrega a mano con «+ Madre», «+ Padre» u «+ Otro».
 */
export function FamiliaDelAlumno({ estudianteId, onResponsable }: {
  estudianteId: number;
  /** Cambió quién paga: la lista de fuera deja de decir «Sin responsable». */
  onResponsable?: (tiene: boolean) => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [tutores, setTutores] = useState<TutorVinculo[]>([]);
  const [responsable, setResponsable] = useState<{ id: number; nombre: string; rnc: string | null } | null>(null);
  const [sigerdId, setSigerdId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trayendo, setTrayendo] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'ambar'; texto: string } | null>(null);

  const [dialogo, setDialogo] = useState(false);
  const [modo, setModo] = useState<'buscar' | 'crear' | 'editar'>('buscar');
  const [prefill, setPrefill] = useState<Record<string, string> | undefined>();
  const [existente, setExistente] = useState<Contacto | null>(null);

  const cargarTutores = useCallback(async () => {
    const d = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/tutores`).then((r) => r.json());
    setTutores(d.tutores ?? []);
    return (d.tutores ?? []) as TutorVinculo[];
  }, [estudianteId]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}`).then((r) => r.json());
      const est = d.estudiante;
      setSigerdId(est?.sigerdId ?? null);
      setResponsable(est?.responsable
        ? { id: est.responsable.clientId, nombre: est.responsable.razonSocial, rnc: est.responsable.rnc }
        : null);
      await cargarTutores();
    } catch {
      setError('No se pudo leer la familia del alumno');
    } finally {
      setCargando(false);
    }
  }, [estudianteId, cargarTutores]);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Como en Editar alumno: se guarda al elegirlo. */
  const guardarResponsable = useCallback(async (clientId: number, nombre: string, rnc?: string | null) => {
    setError(null);
    const res = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/facturar-a`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'No se pudo asignar el responsable');
      return;
    }
    // La cédula, para marcar en la tabla cuál tutor es el que paga.
    let doc = rnc ?? null;
    if (rnc === undefined) {
      doc = await fetch(`/api/clientes/${clientId}`)
        .then((r) => r.json()).then((j) => j.cliente?.rnc ?? null).catch(() => null);
    }
    setResponsable({ id: clientId, nombre, rnc: doc });
    onResponsable?.(true);
  }, [estudianteId, onResponsable]);

  /**
   * Un tutor pasa a pagar: el formulario abre con sus datos y, si su cédula ya
   * está en Contactos, ese contacto sale arriba con «Usar este» (no se crean
   * dos fichas del mismo padre).
   */
  const hacerResponsable = useCallback(async (t: TutorVinculo) => {
    const digitos = (t.documento ?? '').replace(/\D/g, '');
    let hallado: Contacto | null = null;
    if (digitos.length >= 7) {
      try {
        const j = await fetch(`/api/clientes?q=${encodeURIComponent(digitos)}`).then((r) => r.json());
        hallado = (j.clientes ?? []).find((c: Contacto) => (c.rnc ?? '').replace(/\D/g, '') === digitos) ?? null;
      } catch { /* sin red: se sigue por el camino de crear */ }
    }
    setExistente(hallado);
    setPrefill({
      razonSocial: t.nombre, rnc: t.documento ?? '', telefono: t.telefono ?? '',
      whatsapp: t.whatsapp ?? '', email: t.email ?? '',
    });
    setModo('crear');
    setDialogo(true);
  }, []);

  const abrirResponsable = (m: 'buscar' | 'editar') => {
    setPrefill(undefined); setExistente(null); setModo(m); setDialogo(true);
  };

  async function traerDeSigerd() {
    if (!sigerdId) return;
    setTrayendo(true); setAviso(null); setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/tutores/desde-sigerd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idEstudianteSigerd: sigerdId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'No se pudo consultar SIGERD');
      // Como todo lo que pasa por `conSesionSigerdAuto`, viene envuelto en `datos`.
      const traidos = (d.datos?.tutores ?? []) as Array<{ tutorId: number; relacion: string }>;
      const ya = new Set(tutores.map((t) => t.tutorId));
      const nuevos = traidos.filter((t) => !ya.has(t.tutorId));
      for (const t of nuevos) {
        await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/tutores`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorId: t.tutorId, relacion: t.relacion }),
        });
      }
      await cargarTutores();
      setAviso(traidos.length === 0
        ? { tono: 'ambar', texto: 'SIGERD no tiene padres registrados para este alumno. Agrégalos a mano.' }
        : nuevos.length === 0
          ? { tono: 'ok', texto: 'Lo que tiene SIGERD ya estaba aquí.' }
          : { tono: 'ok', texto: `Se agregaron ${nuevos.length} de SIGERD. Revisa su teléfono y marca quién paga.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar SIGERD');
    } finally {
      setTrayendo(false);
    }
  }

  if (cargando) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />Cargando la familia…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">Lo que cambies aquí se guarda al momento en la ficha del alumno.</p>
        <Button variant="outline" size="sm" onClick={() => void traerDeSigerd()} disabled={!sigerdId || trayendo}
          title={sigerdId ? 'Traer padre, madre o tutor de la ficha del alumno en SIGERD' : 'Este alumno no está enlazado con SIGERD'}>
          {trayendo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-1.5 h-4 w-4" />}
          Traer de SIGERD
        </Button>
      </div>

      {aviso && (
        <p className={`rounded-lg border px-3 py-2 text-xs ${aviso.tono === 'ok'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {aviso.texto}
        </p>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <TutoresPanel
        estudianteId={estudianteId}
        tutores={tutores}
        responsableDocumento={responsable?.rnc}
        onChange={() => void cargarTutores()}
        onHacerResponsable={(t) => void hacerResponsable(t)}
        compacto
      />

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-900">Responsable de pago</h3>
        {responsable ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{responsable.nombre}</p>
              <p className="text-xs text-gray-500">Recibe las facturas de este alumno</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => abrirResponsable('editar')}>Editar</Button>
              <Button variant="outline" size="sm" onClick={() => abrirResponsable('buscar')}>Cambiar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2.5">
            <p className="text-xs text-amber-900">
              Sin responsable de pago sus cargos no se facturan. Usa «Hacer responsable» en un tutor, o busca otra
              persona o una empresa.
            </p>
            <Button variant="outline" size="sm" onClick={() => abrirResponsable('buscar')}>
              <Wallet className="mr-1.5 h-4 w-4" />Asignar
            </Button>
          </div>
        )}
      </div>

      <ResponsablePagoDialog
        open={dialogo}
        onOpenChange={setDialogo}
        prefill={prefill}
        modoInicial={modo}
        clienteId={responsable?.id}
        existente={existente}
        onElegir={(c: Contacto) => void guardarResponsable(c.id, c.razonSocial, c.rnc)}
        onCreado={(clientId, nombre) => void guardarResponsable(clientId, nombre)}
        onActualizado={() => { void cargar(); }}
      />
    </div>
  );
}
