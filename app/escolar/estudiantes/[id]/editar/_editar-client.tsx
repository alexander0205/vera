'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Search, Users, Wallet } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useVolver } from '@/lib/hooks/useVolver';
import {
  Categoria, DatosEstudiante, CamposSigerd, camposExtraVacios, camposExtraDe,
} from '@/components/administracion-escolar/FormularioEstudiante';
import { BuscarSigerdDialog } from '@/components/administracion-escolar/BuscarSigerdDialog';
import { TutoresPanel, type TutorVinculo } from '@/components/administracion-escolar/TutoresPanel';
import { ResponsablePagoDialog, type Contacto } from '@/components/administracion-escolar/ResponsablePagoDialog';
import { CLAVES_SIGERD_ESTUDIANTE } from '@/lib/administracion-escolar/estudiante-sigerd-campos';

/**
 * Editar la ficha del estudiante: LAS MISMAS secciones que el alta.
 *
 * Antes eran dos pantallas distintas para lo mismo. El alta pedía tutores y
 * responsable de pago —sin ellos no se puede avisar ni cobrar— y la edición no
 * los enseñaba siquiera: un alumno importado de SIGERD, que llega sin ninguno
 * de los dos, no había forma de completarlo desde aquí. Tampoco tenía «Buscar
 * en SIGERD», así que la dirección y el acta solo entraban tecleadas a mano.
 *
 * Lo único que cambia respecto al alta, y a propósito:
 *   · el estado del alumno (activo/retirado/graduado), que solo tiene sentido
 *     sobre alguien que ya existe;
 *   · tutores y responsable se guardan al momento —el alumno ya está creado, no
 *     hay nada que esperar—, mientras que en el alta viajan con el formulario.
 *
 * La matrícula (curso y período) NO se toca aquí. Se edita desde el perfil, en
 * el período que le toca, porque cambiar de curso es un hecho con fecha y no un
 * dato de la ficha.
 */

interface Estudiante {
  id: number;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  sexo: string | null;
  fechaNacimiento: string | null;
  estado: string;
  sigerdId: number | null;
  responsable: {
    clientId: number;
    razonSocial: string;
    rnc: string | null;
  } | null;
}

export default function EditarEstudianteClient({ id }: { id: number }) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  const volverAlListado = useVolver('/escolar/estudiantes');
  const volverAlPerfil  = useVolver(`/escolar/estudiantes/${id}`);

  const [codigo, setCodigo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noExiste, setNoExiste] = useState(false);
  const [form, setForm] = useState({ nombres: '', apellidos: '', sexo: '', fechaNacimiento: '' });
  const [estado, setEstado] = useState('activo');
  const [extra, setExtra] = useState<Record<string, string>>(camposExtraVacios);
  const [sigerdId, setSigerdId] = useState<number | null>(null);
  const [buscarSigerd, setBuscarSigerd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Qué falta, para poder pintarlo en rojo donde está (igual que el alta). */
  const [campoError, setCampoError] = useState<'nombres' | 'apellidos' | 'tutores' | 'responsable' | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  const [tutores, setTutores] = useState<TutorVinculo[]>([]);
  const [responsable, setResponsable] = useState<{ id: number; nombre: string; rnc: string | null } | null>(null);
  /** El contacto que ya tenía esa cédula, para ofrecerlo en vez de duplicarlo. */
  const [responsableExistente, setResponsableExistente] = useState<Contacto | null>(null);
  const [responsableAbierto, setResponsableAbierto] = useState(false);
  const [responsablePrefill, setResponsablePrefill] = useState<Record<string, string> | undefined>();
  const [responsableModo, setResponsableModo] = useState<'buscar' | 'crear' | 'editar'>('buscar');

  function fallar(mensaje: string, campo: typeof campoError) {
    setError(mensaje);
    setCampoError(campo);
    requestAnimationFrame(() => {
      avisoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  const cargarTutores = useCallback(async () => {
    const data = await fetch(`/api/administracion-escolar/estudiantes/${id}/tutores`).then((r) => r.json());
    setTutores(data.tutores ?? []);
  }, [id]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(`/api/administracion-escolar/estudiantes/${id}`).then((r) => r.json());
      const est: Estudiante | undefined = data.estudiante;
      if (!est) { setNoExiste(true); return; }
      setCodigo(est.codigo);
      setForm({
        nombres: est.nombres,
        apellidos: est.apellidos,
        sexo: est.sexo ?? '',
        fechaNacimiento: est.fechaNacimiento ?? '',
      });
      setEstado(est.estado);
      setSigerdId(est.sigerdId ?? null);
      setExtra(camposExtraDe(data.estudiante));
      setResponsable(est.responsable
        ? { id: est.responsable.clientId, nombre: est.responsable.razonSocial, rnc: est.responsable.rnc }
        : null);
      await cargarTutores();
    } finally {
      setLoading(false);
    }
  }, [id, cargarTutores]);

  useEffect(() => { cargar(); }, [cargar]);

  /**
   * Asignar el responsable de pago se guarda AL MOMENTO.
   *
   * El alumno ya existe, así que no hay nada que esperar; y dejarlo pendiente
   * del botón «Guardar cambios» significaba perderlo si alguien cerraba la
   * pantalla después de elegirlo, que es justo lo que parece hecho.
   */
  const guardarResponsable = useCallback(async (clientId: number, nombre: string, rnc?: string | null) => {
    const res = await fetch(`/api/administracion-escolar/estudiantes/${id}/facturar-a`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'No se pudo asignar el responsable');
      return;
    }
    // La cédula, para poder señalar en la tabla cuál de los tutores es el que
    // paga. Cuando el contacto se acaba de crear no la traemos de vuelta, así
    // que se pregunta — una sola vez, y solo en ese caso.
    let doc = rnc ?? null;
    if (rnc === undefined) {
      doc = await fetch(`/api/clientes/${clientId}`)
        .then((r) => r.json())
        .then((j) => j.cliente?.rnc ?? null)
        .catch(() => null);
    }
    setResponsable({ id: clientId, nombre, rnc: doc });
    if (campoError === 'responsable') { setCampoError(null); setError(null); }
  }, [id, campoError]);

  /**
   * Un tutor pasa a ser el responsable de pago.
   *
   * Siempre se abre el formulario con sus datos ya puestos: antes, si su cédula
   * ya estaba en Contactos, se asignaba solo y la pantalla cambiaba sin que
   * nadie hubiera visto de quién se trataba. Ahora se enseña, y si ese contacto
   * existe sale arriba con un «Usar este» — que es lo que evita crear dos
   * fichas del mismo padre.
   */
  const hacerResponsable = useCallback(async (t: TutorVinculo) => {
    const digitos = (t.documento ?? '').replace(/\D/g, '');
    let hallado: Contacto | null = null;
    if (digitos.length >= 7) {
      try {
        const r = await fetch(`/api/clientes?q=${encodeURIComponent(digitos)}`);
        const j = await r.json();
        hallado = (j.clientes ?? []).find(
          (c: Contacto) => (c.rnc ?? '').replace(/\D/g, '') === digitos,
        ) ?? null;
      } catch { /* sin red: se sigue por el camino de crear */ }
    }
    setResponsableExistente(hallado);
    setResponsablePrefill({
      razonSocial: t.nombre,
      rnc: t.documento ?? '',
      telefono: t.telefono ?? '',
      whatsapp: t.whatsapp ?? '',
      email: t.email ?? '',
    });
    setResponsableModo('crear');
    setResponsableAbierto(true);
  }, []);

  async function guardar() {
    if (!form.nombres.trim()) { fallar('Escribe los nombres del estudiante', 'nombres'); return; }
    if (!form.apellidos.trim()) { fallar('Escribe los apellidos del estudiante', 'apellidos'); return; }
    // Las mismas dos reglas del alta. Aquí se pueden arreglar sin salir de la
    // pantalla: los dos bloques están debajo y guardan solos.
    if (tutores.length === 0) {
      fallar('Agrega al menos un tutor: sin él no se le puede avisar', 'tutores'); return;
    }
    if (!responsable) {
      fallar('Falta el responsable de pago: es a quien se le emiten las facturas', 'responsable'); return;
    }
    setSaving(true);
    setError(null);
    setCampoError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/estudiantes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres: form.nombres, apellidos: form.apellidos,
          sexo: form.sexo || null, fechaNacimiento: form.fechaNacimiento || null,
          estado,
          // El id del padrón del MINERD, si la ficha se cruzó con SIGERD desde
          // aquí. Es lo que permite reconocer al alumno en una sincronización
          // futura en vez de crear una segunda ficha del mismo niño.
          sigerdId,
          // Van TODAS las claves, también las vacías: es lo que permite borrar
          // un teléfono equivocado. La API convierte '' en null.
          ...Object.fromEntries(CLAVES_SIGERD_ESTUDIANTE.map((k) => [k, extra[k] ?? ''])),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      router.push(`/escolar/estudiantes/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>;
  }

  if (noExiste) {
    return (
      <section className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-gray-500">Ese estudiante no existe o no pertenece a este colegio.</p>
        <button type="button" onClick={volverAlListado} className="mt-3 inline-flex items-center gap-1 text-sm text-zero-600">
          <ArrowLeft className="h-4 w-4" />Volver a estudiantes
        </button>
      </section>
    );
  }

  if (!puedeGestionar) {
    return (
      <section className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-gray-500">No tienes permiso para editar estudiantes.</p>
        <button type="button" onClick={volverAlPerfil} className="mt-3 inline-flex items-center gap-1 text-sm text-zero-600">
          <ArrowLeft className="h-4 w-4" />Volver al perfil
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5 p-6">
      <button type="button" onClick={volverAlPerfil}
        className="inline-flex items-center gap-1 self-start text-sm text-gray-500 transition-colors hover:text-zero-600">
        <ArrowLeft className="h-4 w-4" />Volver al perfil
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Editar estudiante</h1>
          <p className="mt-1 text-sm text-gray-500">
            Código {codigo ?? '—'} · se genera automáticamente y no se edita.
            El curso y el período se cambian desde el perfil, en su matrícula.
          </p>
        </div>
        {/* También aquí, y no solo en el alta: los alumnos importados llegan sin
            dirección, sin acta y sin teléfonos, y sin este botón la única forma
            de completarlos era teclearlos uno a uno. */}
        <Button variant="outline" className="shrink-0" onClick={() => setBuscarSigerd(true)}>
          <Search className="mr-1.5 h-4 w-4" />Buscar en SIGERD
        </Button>
      </header>

      <BuscarSigerdDialog
        open={buscarSigerd}
        onClose={() => setBuscarSigerd(false)}
        onElegir={(e) => {
          // Solo se pisa lo que esté vacío: quien ya escribió algo a mano lo
          // hizo por algo, y el portal no siempre está al día.
          setForm((f) => ({
            ...f,
            nombres: f.nombres || e.nombres,
            apellidos: f.apellidos || e.apellidos,
            sexo: f.sexo || e.sexo,
            fechaNacimiento: f.fechaNacimiento || e.fechaNacimiento,
          }));
          setExtra((x) => {
            const y: Record<string, string> = { ...x, codigoRne: x.codigoRne || e.codigoRne };
            for (const [k, v] of Object.entries(e.campos)) {
              if (!y[k]?.trim()) y[k] = v;
            }
            return y;
          });
          // Los tutores del portal SÍ se atan ya: el alumno existe, así que no
          // hay borrador que esperar. Los que ya estaban no se tocan.
          if (e.tutores.length > 0) {
            void (async () => {
              const ya = new Set(tutores.map((t) => t.tutorId));
              for (const t of e.tutores) {
                if (ya.has(t.tutorId)) continue;
                await fetch(`/api/administracion-escolar/estudiantes/${id}/tutores`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tutorId: t.tutorId, relacion: t.relacion }),
                });
              }
              await cargarTutores();
            })();
          }
          setSigerdId(e.sigerdId);
        }}
      />

      <div className="space-y-5">
        {error && (
          <div ref={avisoRef}
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <DatosEstudiante
          form={form}
          campoError={campoError === 'nombres' || campoError === 'apellidos' ? campoError : null}
          onChange={(parche) => {
            if (campoError) { setCampoError(null); setError(null); }
            setForm((f) => ({ ...f, ...parche }));
          }}
          estado={estado}
          onEstadoChange={setEstado}
        />

        {/* ── Tutores ── El mismo panel del alta, pero atado al alumno: aquí
            cada cambio se guarda al momento. */}
        <Categoria icon={Users} titulo="Tutores" hint="Quién responde por el alumno" requerido
          resaltado={campoError === 'tutores'}>
          <div className="sm:col-span-2 lg:col-span-3">
            <TutoresPanel
              estudianteId={id}
              tutores={tutores}
              responsableDocumento={responsable?.rnc}
              onChange={() => { void cargarTutores(); if (campoError === 'tutores') { setCampoError(null); setError(null); } }}
              onHacerResponsable={(t) => void hacerResponsable(t)}
            />
          </div>
        </Categoria>

        {/* ── Responsable de pago ── Debajo de Tutores, igual que en el alta:
            primero quién responde por el alumno, después a quién se le cobra. */}
        <Categoria icon={Wallet} titulo="Responsable de pago" hint="A quién se le factura" requerido
          resaltado={campoError === 'responsable'}>
          <div className="sm:col-span-2 lg:col-span-3">
            {responsable ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{responsable.nombre}</p>
                  <p className="text-xs text-gray-500">Recibirá las facturas de este alumno</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm"
                    onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('editar'); setResponsableAbierto(true); }}>
                    Editar
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('buscar'); setResponsableAbierto(true); }}>
                    Cambiar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline"
                onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('buscar'); setResponsableAbierto(true); }}>
                <Wallet className="mr-1.5 h-4 w-4" />Asignar responsable de pago
              </Button>
            )}
          </div>
        </Categoria>

        <CamposSigerd valores={extra} onChange={(k, v) => setExtra((x) => ({ ...x, [k]: v }))} />

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => router.push(`/escolar/estudiantes/${id}`)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={guardar} disabled={saving}>
            {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</> : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      <ResponsablePagoDialog
        open={responsableAbierto}
        onOpenChange={setResponsableAbierto}
        prefill={responsablePrefill}
        modoInicial={responsableModo}
        clienteId={responsable?.id}
        existente={responsableExistente}
        onElegir={(c: Contacto) => void guardarResponsable(c.id, c.razonSocial, c.rnc)}
        onCreado={(clientId, nombre) => void guardarResponsable(clientId, nombre)}
        onActualizado={() => { void cargar(); }}
      />
    </section>
  );
}
