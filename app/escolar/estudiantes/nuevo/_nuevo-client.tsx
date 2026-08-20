'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Search, Users, Wallet } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useVolver } from '@/lib/hooks/useVolver';
import {
  Categoria, Field, DatosEstudiante, CamposSigerd, camposExtraVacios,
} from '@/components/administracion-escolar/FormularioEstudiante';
import { BuscarSigerdDialog } from '@/components/administracion-escolar/BuscarSigerdDialog';
import { TutoresPanel, type TutorVinculo } from '@/components/administracion-escolar/TutoresPanel';
import { ResponsablePagoDialog, type Contacto } from '@/components/administracion-escolar/ResponsablePagoDialog';


export default function NuevoEstudianteClient() {
  const router = useRouter();
  const volver = useVolver('/escolar/estudiantes');
  const { permissions } = usePermissions();


  const [form, setForm] = useState({
    nombres: '', apellidos: '', sexo: '', fechaNacimiento: '',
    codigoMatricula: '',
  });
  const [buscarSigerd, setBuscarSigerd] = useState(false);
  /**
   * Id del alumno en SIGERD, si vino del buscador del portal.
   *
   * Va aparte del formulario porque no se teclea: o lo trae el portal o no
   * existe. Es lo que después permite reconocer a este mismo alumno en una
   * sincronización futura sin crear una ficha duplicada.
   */
  const [sigerdId, setSigerdId] = useState<number | null>(null);
  // Ficha extendida (opcional). Estado aparte del núcleo obligatorio.
  const [extra, setExtra] = useState<Record<string, string>>(camposExtraVacios);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  /**
   * Qué falta, para poder pintarlo en rojo donde está.
   *
   * El aviso solo vive arriba del formulario, y el formulario es largo: al
   * pulsar «Crear estudiante» desde abajo no pasaba nada visible y parecía que
   * el botón estaba roto. Ahora el mensaje se busca solo y el campo se marca.
   */
  const [campoError, setCampoError] = useState<'nombres' | 'apellidos' | 'tutores' | 'responsable' | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  function fallar(mensaje: string, campo: typeof campoError) {
    setError(mensaje);
    setCampoError(campo);
    // Al siguiente pintado, cuando el aviso ya existe en el árbol.
    requestAnimationFrame(() => {
      avisoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /**
   * Los tutores del alumno, en el aire hasta que se guarde.
   *
   * El TUTOR sí se crea de verdad al añadirlo —vive en el colegio, no en el
   * alumno, y así se puede reutilizar en el hermano—. Lo que espera es el
   * vínculo con este alumno, que todavía no existe.
   */
  const [tutores, setTutores] = useState<TutorVinculo[]>([]);

  /**
   * El contacto al que se le facturará. Va aparte de los tutores a propósito:
   * el tutor es quien responde por el alumno y el responsable es a quien se le
   * cobra, y no siempre son la misma persona.
   */
  const [responsable, setResponsable] = useState<{ id: number; nombre: string; rnc: string | null } | null>(null);
  /** La cédula del que paga: con ella la tabla de tutores señala cuál es. */
  const responsableDoc = responsable?.rnc ?? null;
  const [responsableAbierto, setResponsableAbierto] = useState(false);
  const [responsablePrefill, setResponsablePrefill] = useState<Record<string, string> | undefined>();
  const [responsableModo, setResponsableModo] = useState<'buscar' | 'crear'>('buscar');
  /** El contacto que ya tenía esa cédula, para ofrecerlo en vez de duplicarlo. */
  const [responsableExistente, setResponsableExistente] = useState<Contacto | null>(null);

  /**
   * Convertir un tutor en el responsable de pago.
   *
   * Siempre se abre «Nuevo contacto» con sus datos ya puestos, y de paso se
   * busca su cédula en Contactos comparando SOLO los dígitos —el mismo
   * documento está escrito con guiones en un sitio y sin ellos en otro, y por
   * ese guion se acaba creando al mismo padre dos veces—. Si ya existe, sale
   * arriba con un «Usar este» en vez de asignarse solo: así se ve de quién se
   * trata antes de que la pantalla cambie.
   */
  async function hacerResponsable(t: TutorVinculo) {
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
  }

  function agregarTutor(v: TutorVinculo) {
    setTutores((prev) => [...prev.filter((t) => t.tutorId !== v.tutorId), v]);
  }

  async function guardar() {
    if (!form.nombres.trim()) {
      fallar('Escribe los nombres del estudiante', 'nombres'); return;
    }
    if (!form.apellidos.trim()) {
      fallar('Escribe los apellidos del estudiante', 'apellidos'); return;
    }
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
      const res = await fetch('/api/administracion-escolar/estudiantes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres: form.nombres, apellidos: form.apellidos,
          sexo: form.sexo || null, fechaNacimiento: form.fechaNacimiento || null,
          sigerdId,
          ...extra, // ficha extendida (la API recorta/ignora lo vacío)
          tutores: tutores.map((t) => ({ tutorId: t.tutorId, relacion: t.relacion })),
          facturarAClientId: responsable.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando estudiante');
      // Sin matrícula el alumno no cobra ni aparece en un curso, así que se
      // entra derecho a ponérsela. `?matricular=1` abre el diálogo solo.
      router.push(`/escolar/estudiantes/${data.estudiante.id}?matricular=1`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando estudiante');
      setSaving(false);
    }
  }

  const setExtraCampo = (key: string, v: string) => setExtra((x) => ({ ...x, [key]: v }));

  return (
    <section className="mx-auto max-w-4xl space-y-5 p-6">
      <button type="button" onClick={volver}
        className="inline-flex items-center gap-1 self-start text-sm text-gray-500 transition-colors hover:text-zero-600">
        <ArrowLeft className="h-4 w-4" />Volver a estudiantes
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Nuevo estudiante</h1>
          <p className="mt-1 text-sm text-gray-500">
            Obligatorios: el nombre y al menos un tutor con su responsable de pago. Al guardar se pasa
            a matricularlo — ahí se eligen período y curso, y sale el código.
          </p>
        </div>
        {/* Antes que teclear: si el alumno está en el padrón del MINERD, sus
            datos vienen ya escritos como el ministerio los tiene. Una letra
            distinta aquí es un alumno que después no cruza con SIGERD. */}
        <Button variant="outline" className="shrink-0" onClick={() => setBuscarSigerd(true)}>
          <Search className="mr-1.5 h-4 w-4" />Buscar en SIGERD
        </Button>
      </header>

      <BuscarSigerdDialog
        open={buscarSigerd}
        onClose={() => setBuscarSigerd(false)}
        onElegir={(e) => {
          setForm((f) => ({
            ...f,
            nombres: e.nombres || f.nombres,
            apellidos: e.apellidos || f.apellidos,
            sexo: e.sexo || f.sexo,
            fechaNacimiento: e.fechaNacimiento || f.fechaNacimiento,
            // El colegio usa el RNE como código de matrícula cuando no lleva uno
            // propio. Solo se pone si el campo está vacío: lo que ya escribió
            // una persona manda sobre lo que sugiere el portal.
            codigoMatricula: f.codigoMatricula || e.codigoSugerido,
          }));
          // La ficha del portal: dirección, acta, teléfonos, programa. Solo
          // pisa lo que esté vacío — quien ya escribió algo a mano lo hizo por
          // algo, y el portal no siempre está al día.
          setExtra((x) => {
            const y: Record<string, string> = { ...x, codigoRne: x.codigoRne || e.codigoRne };
            for (const [k, v] of Object.entries(e.campos)) {
              if (!y[k]?.trim()) y[k] = v;
            }
            return y;
          });
          // Los responsables que el portal tenía. Ninguno llega marcado como
          // responsable de pago —SIGERD no sabe de contactos de Facturación—,
          // así que eso lo decide el usuario. Se añaden a los que ya hubiera.
          if (e.tutores.length > 0) {
            setTutores((prev) => {
              const ya = new Set(prev.map((t) => t.tutorId));
              const nuevos = e.tutores
                .filter((t) => !ya.has(t.tutorId))
                .map((t) => ({
                  id: -t.tutorId,
                  tutorId: t.tutorId,
                  nombre: t.nombre,
                  documento: t.documento,
                  telefono: t.telefono,
                  whatsapp: null,
                  email: t.email,
                  imagen: null,
                  relacion: t.relacion,
                }));
              return [...prev, ...nuevos];
            });
          }
          setSigerdId(e.sigerdId);
        }}
      />

      <div className="space-y-5">
          {error && (
            <div ref={avisoRef}
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── Datos del estudiante (obligatorio) ── */}
          <DatosEstudiante
            form={form}
            campoError={campoError === 'nombres' || campoError === 'apellidos' ? campoError : null}
            onChange={(parche) => {
              // Escribir borra la marca: si el usuario ya está corrigiendo, el
              // rojo deja de ser información y pasa a ser un reproche.
              if (campoError) { setCampoError(null); setError(null); }
              setForm((f) => ({ ...f, ...parche }));
            }} />

          {/* ── Primera inscripción (obligatorio) ── */}

          {/* ── Tutores ──────────────────────────────────────────────────
              Obligatorio, y por eso va antes de las categorías opcionales: el
              responsable de pago es el comprador de todas las facturas del
              alumno. Un alumno sin tutor no se puede cobrar ni avisar, y
              arreglarlo después obliga a volver a su ficha.

              Es el MISMO panel de la ficha, en modo borrador: aquí no hay
              alumno al que atar nada todavía. */}
          <Categoria icon={Users} titulo="Tutores" hint="Quién responde por el alumno" requerido
            resaltado={campoError === 'tutores'}>
            <div className="sm:col-span-2 lg:col-span-3">
              <TutoresPanel
                estudianteId={null}
                tutores={tutores}
                onChange={() => {}}
                responsableDocumento={responsableDoc}
                onHacerResponsable={(t) => void hacerResponsable(t)}
                onVincularBorrador={agregarTutor}
                onQuitarBorrador={(tutorId) => setTutores((p) => p.filter((t) => t.tutorId !== tutorId))}
              />
            </div>
          </Categoria>

          {/* ── Responsable de pago ──────────────────────────────────────
              Debajo de Tutores porque se lee en ese orden: primero quién
              responde por el alumno, después a quién se le cobra. Es un
              contacto de Facturación, no un tutor. */}
          <Categoria icon={Wallet} titulo="Responsable de pago" hint="A quién se le factura" requerido
            resaltado={campoError === 'responsable'}>
            <div className="sm:col-span-2 lg:col-span-3">
              {responsable ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{responsable.nombre}</p>
                    <p className="text-xs text-gray-500">Recibirá las facturas de este alumno</p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0"
                    onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('buscar'); setResponsableAbierto(true); }}>
                    Cambiar
                  </Button>
                </div>
              ) : (
                <Button variant="outline"
                  onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('buscar'); setResponsableAbierto(true); }}>
                  <Wallet className="mr-1.5 h-4 w-4" />Asignar responsable de pago
                </Button>
              )}
            </div>
          </Categoria>

          {/* ── Categorías opcionales (una tarjeta por categoría) ── */}
          <CamposSigerd valores={extra} onChange={setExtraCampo} />

          {/* ── Acciones ── */}
          <div className="flex items-center justify-end gap-2 pt-1">
            {/* El `router.back()` pelado que había aquí podía devolver al sitio
                de donde se llegó a la app —o a ninguno, si el alta se abrió en
                pestaña nueva—. Ahora el listado hace de red. */}
            <Button variant="outline" onClick={volver} disabled={saving}>Cancelar</Button>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={guardar} disabled={saving}>
              {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</> : 'Crear estudiante'}
            </Button>
          </div>
      </div>
      <ResponsablePagoDialog
        open={responsableAbierto}
        onOpenChange={setResponsableAbierto}
        prefill={responsablePrefill}
        modoInicial={responsableModo}
        existente={responsableExistente}
        onElegir={(c: Contacto) => {
          setResponsable({ id: c.id, nombre: c.razonSocial, rnc: c.rnc });
          if (campoError === 'responsable') { setCampoError(null); setError(null); }
        }}
        onCreado={(clientId, nombre) => {
          // Recién creado no sabemos con qué cédula quedó —el formulario pudo
          // corregirla—, y de ella depende que la tabla de tutores lo señale.
          setResponsable({ id: clientId, nombre, rnc: null });
          void fetch(`/api/clientes/${clientId}`)
            .then((r) => r.json())
            .then((j) => setResponsable((prev) =>
              prev && prev.id === clientId ? { ...prev, rnc: j.cliente?.rnc ?? null } : prev))
            .catch(() => { /* sin cédula solo se pierde el distintivo */ });
          if (campoError === 'responsable') { setCampoError(null); setError(null); }
        }}
      />
    </section>
  );
}
