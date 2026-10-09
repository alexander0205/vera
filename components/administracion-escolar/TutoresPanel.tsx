'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CapturaFoto } from '@/components/fotos/CapturaFoto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeader } from '@/components/ui/modal-header';
import { Plus, Pencil, X, Loader2, Camera, User, Wallet } from 'lucide-react';

export interface TutorVinculo {
  id: number;
  tutorId: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  /** Por donde el colegio le escribe de verdad. */
  whatsapp: string | null;
  email: string | null;
  imagen: string | null;
  relacion: string;
}

interface TutorTeam {
  id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  imagen: string | null;
}

const RELACIONES = [
  { value: 'padre', label: 'Padre' },
  { value: 'madre', label: 'Madre' },
  { value: 'tutor', label: 'Tutor' },
  { value: 'cuidador', label: 'Cuidador' },
  { value: 'otro', label: 'Otro' },
];

const EMPTY_NUEVO = { nombre: '', documento: '', telefono: '', whatsapp: '', email: '', direccion: '', imagen: '' };

const IMG_MAX_BYTES = 800_000; // ~800KB, mismo tope que logo/producto.

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Avatar del tutor: foto si existe, o iniciales. */
function TutorAvatar({ nombre, imagen, size = 'md' }: { nombre: string; imagen: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  if (imagen) {
    return <img src={imagen} alt={nombre} className={`${cls} rounded-full object-cover shrink-0 border border-gray-200`} />;
  }
  return (
    <span className={`${cls} rounded-full bg-zero-100 text-zero-700 flex items-center justify-center font-semibold shrink-0`}>
      {iniciales || <User className="h-1/2 w-1/2" />}
    </span>
  );
}

interface Props {
  /**
   * El alumno al que se atan los tutores. `null` = todavía no existe (el alta
   * de estudiante): entonces el tutor SÍ se crea de verdad —vive en el team, no
   * en el alumno— pero el vínculo se queda en el aire y lo entrega
   * `onVincularBorrador` para que el formulario lo mande junto con el alta.
   */
  estudianteId: number | null;
  tutores: TutorVinculo[];
  onChange: () => void;
  /**
   * Convertir a este tutor en el responsable de pago.
   *
   * El tutor no es un cliente, pero muchas veces es la misma persona: esto
   * evita volver a teclear su cédula y su teléfono en Contactos, que es como se
   * acaba con dos fichas del mismo padre escritas distinto.
   */
  onHacerResponsable?: (t: TutorVinculo) => void;
  /**
   * La cédula/RNC del responsable de pago del alumno.
   *
   * Sirve para decir en la tabla cuál de estos tutores ES el que paga. Casi
   * siempre lo es uno de ellos —el padre o la madre—, pero como el responsable
   * vive en Contactos y el tutor aquí, la fila no lo decía y el mismo señor
   * aparecía dos veces en la pantalla sin ninguna relación aparente.
   *
   * Se comparan solo los dígitos: el mismo documento está escrito con guiones
   * en un sitio y sin ellos en el otro.
   */
  responsableDocumento?: string | null;
  /** Solo en borrador: un tutor recién elegido o creado. */
  onVincularBorrador?: (vinculo: TutorVinculo) => void;
  /** Solo en borrador: quitar uno de la lista antes de guardar. */
  onQuitarBorrador?: (tutorId: number) => void;
}

export function TutoresPanel({
  estudianteId, tutores, onChange, onHacerResponsable, responsableDocumento,
  onVincularBorrador, onQuitarBorrador,
}: Props) {
  const borrador = estudianteId == null;
  const docResponsable = (responsableDocumento ?? '').replace(/\D/g, '');
  const esResponsable = (t: TutorVinculo) =>
    docResponsable.length >= 7 && (t.documento ?? '').replace(/\D/g, '') === docResponsable;
  const [tutoresTeam, setTutoresTeam] = useState<TutorTeam[]>([]);
  const [showForm, setShowForm]       = useState(false);
  const [editVinculo, setEditVinculo] = useState<TutorVinculo | null>(null);
  const [modoNuevo, setModoNuevo]     = useState(true);
  const [tutorSeleccionado, setTutorSeleccionado] = useState('');
  const [nuevo, setNuevo]             = useState(EMPTY_NUEVO);
  const [relacion, setRelacion]       = useState('tutor');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [imgError, setImgError]       = useState<string | null>(null);
  const [quitarTarget, setQuitarTarget] = useState<TutorVinculo | null>(null);
  const [quitando, setQuitando]       = useState(false);

  const cargarTutoresTeam = useCallback(async () => {
    const data = await fetch('/api/administracion-escolar/tutores').then((r) => r.json());
    setTutoresTeam(data.tutores ?? []);
  }, []);

  useEffect(() => { if (showForm) cargarTutoresTeam(); }, [showForm, cargarTutoresTeam]);

  async function handleImagen(file: File) {
    if (!file.type.startsWith('image/')) { setImgError('Solo se aceptan imágenes'); return; }
    if (file.size > IMG_MAX_BYTES) { setImgError('Imagen demasiado grande (máx 800 KB)'); return; }
    setImgError(null);
    const b64 = await fileToBase64(file);
    setNuevo((f) => ({ ...f, imagen: b64 }));
  }

  const yaVinculados = new Set(tutores.map((t) => t.tutorId));
  const disponibles = tutoresTeam.filter((t) => !yaVinculados.has(t.id));
  const tutorPreview = tutoresTeam.find((t) => String(t.id) === tutorSeleccionado) ?? null;

  function abrirNuevo() {
    setEditVinculo(null);
    setModoNuevo(disponibles.length === 0);
    setTutorSeleccionado('');
    setNuevo(EMPTY_NUEVO);
    setRelacion('tutor');
    setError(null); setImgError(null);
    setShowForm(true);
  }

  function abrirEdicion(v: TutorVinculo) {
    setEditVinculo(v);
    setNuevo({
      nombre: v.nombre, documento: v.documento ?? '', telefono: v.telefono ?? '',
      whatsapp: v.whatsapp ?? '', email: v.email ?? '', direccion: '', imagen: v.imagen ?? '',
    });
    setRelacion(v.relacion);
    setError(null); setImgError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    // La cédula identifica a la persona y es lo que impide que la misma madre
    // entre dos veces: la base tiene un único por (colegio, documento). Sin
    // ella, el año que viene se crea otra fila y el histórico queda partido.
    if ((editVinculo || modoNuevo) && !nuevo.documento.trim()) {
      setError('La cédula del tutor es obligatoria.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let tutorId: number;
      if (editVinculo) {
        // Editar datos del tutor (afecta al tutor en todo el sistema).
        if (!nuevo.nombre.trim()) throw new Error('El nombre del tutor es obligatorio');
        const res = await fetch(`/api/administracion-escolar/tutores/${editVinculo.tutorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nuevo),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Error actualizando tutor');
        tutorId = editVinculo.tutorId;
      } else if (modoNuevo) {
        if (!nuevo.nombre.trim()) throw new Error('El nombre del tutor es obligatorio');
        const res = await fetch('/api/administracion-escolar/tutores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nuevo),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Error creando tutor');
        tutorId = data.tutor.id;
      } else {
        if (!tutorSeleccionado) throw new Error('Selecciona un tutor');
        tutorId = parseInt(tutorSeleccionado);
      }

      // Sin alumno todavía no hay a qué atarlo: el vínculo se devuelve y lo
      // guarda el formulario del alta. El id va en negativo porque aún no
      // existe la fila y hace falta algo único para pintar la lista.
      if (borrador) {
        onVincularBorrador?.({
          id: -tutorId,
          tutorId,
          nombre: (editVinculo || modoNuevo) ? nuevo.nombre.trim() : (tutorPreview?.nombre ?? ''),
          documento: (editVinculo || modoNuevo) ? (nuevo.documento || null) : (tutorPreview?.documento ?? null),
          telefono: (editVinculo || modoNuevo) ? (nuevo.telefono || null) : (tutorPreview?.telefono ?? null),
          whatsapp: (editVinculo || modoNuevo) ? (nuevo.whatsapp || null) : (tutorPreview?.whatsapp ?? null),
          email: (editVinculo || modoNuevo) ? (nuevo.email || null) : (tutorPreview?.email ?? null),
          imagen: (editVinculo || modoNuevo) ? (nuevo.imagen || null) : (tutorPreview?.imagen ?? null),
          relacion,
        });
        setShowForm(false);
        return;
      }

      const res2 = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/tutores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId, relacion }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error ?? 'Error asociando tutor');

      setShowForm(false);
      onChange();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuitar() {
    if (!quitarTarget) return;
    setQuitando(true);
    try {
      if (borrador) {
        onQuitarBorrador?.(quitarTarget.tutorId);
        setQuitarTarget(null);
        return;
      }
      await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/tutores/${quitarTarget.tutorId}`, {
        method: 'DELETE',
      });
      setQuitarTarget(null);
      onChange();
    } finally {
      setQuitando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {!borrador && <h2 className="text-base font-semibold text-gray-900">Tutores</h2>}
        {borrador && <span className="text-sm text-gray-500">Al menos uno, y marca quién paga</span>}
        <Button size="sm" variant="outline" onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-1" />Agregar tutor
        </Button>
      </div>

      {tutores.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          Sin tutores asociados
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Tutor</th>
                <th className="px-3 py-2 font-medium">Relación</th>
                {!borrador && <th className="px-3 py-2 font-medium">Teléfono</th>}
                {!borrador && <th className="px-3 py-2 font-medium">Email</th>}
                {!borrador && <th className="px-3 py-2 font-medium">WhatsApp</th>}
                <th className="px-3 py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tutores.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <TutorAvatar nombre={t.nombre} imagen={t.imagen} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">{t.nombre}</span>
                          {/* El que paga, dicho donde se le mira. */}
                          {/* Un <span> y no el Badge (que es un Chip de MUI):
                              dentro de una celda estrecha el Chip parte la
                              etiqueta en dos líneas y se monta sobre el nombre. */}
                          {esResponsable(t) && (
                            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-zero-200 bg-zero-50 px-2 py-0.5 text-[10px] font-medium text-zero-700">
                              <Wallet className="h-3 w-3" />Responsable de pago
                            </span>
                          )}
                        </div>
                        {t.documento && <span className="text-xs text-gray-400">Cédula: {t.documento}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 capitalize">{t.relacion}</td>
                  {!borrador && <td className="px-3 py-2.5 text-gray-600">{t.telefono ?? '—'}</td>}
                  {!borrador && <td className="px-3 py-2.5 text-gray-600">{t.email ?? '—'}</td>}
                  {!borrador && <td className="px-3 py-2.5 text-gray-600">{t.whatsapp ?? '—'}</td>}
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {/* Al que ya paga no se le ofrece: pulsarlo no haría nada
                          y deja pensando si se hizo algo. */}
                      {onHacerResponsable && !esResponsable(t) && (
                        <Button variant="ghost" size="sm" title="Hacer responsable de pago"
                          onClick={() => onHacerResponsable(t)}>
                          <Wallet className="h-3.5 w-3.5 text-gray-400" />
                          <span className="ml-1 hidden text-xs sm:inline">Hacer responsable</span>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicion(t)} title="Editar tutor">
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setQuitarTarget(t)} title="Quitar del estudiante">
                        <X className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal agregar/editar tutor */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-md">
          <ModalHeader title={editVinculo ? `Editar — ${editVinculo.nombre}` : 'Agregar tutor'}
            subtitle="Vincula un responsable de pago al estudiante." />
          <div className="space-y-4 px-6 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
            )}

            {!editVinculo && disponibles.length > 0 && (
              <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
                <button
                  className={`flex-1 rounded-md py-1.5 transition-colors ${!modoNuevo ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500'}`}
                  onClick={() => setModoNuevo(false)}>
                  Tutor existente
                </button>
                <button
                  className={`flex-1 rounded-md py-1.5 transition-colors ${modoNuevo ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500'}`}
                  onClick={() => setModoNuevo(true)}>
                  Nuevo tutor
                </button>
              </div>
            )}

            {(!editVinculo && !modoNuevo) ? (
              <div className="space-y-1.5">
                <Label>Tutor *</Label>
                <NativeSelect value={tutorSeleccionado} onChange={(e) => setTutorSeleccionado(e.target.value)}>
                  <option value="" disabled>Selecciona un tutor</option>
                  {disponibles.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.nombre}{t.documento ? ` · ${t.documento}` : ''}
                    </option>
                  ))}
                </NativeSelect>
                {/* Preview del tutor elegido: foto + cédula + contacto */}
                {tutorPreview && (
                  <div className="mt-2 flex items-center gap-3 border border-gray-200 rounded-lg p-3">
                    <TutorAvatar nombre={tutorPreview.nombre} imagen={tutorPreview.imagen} size="lg" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{tutorPreview.nombre}</p>
                      <p className="text-xs text-gray-500">Cédula: {tutorPreview.documento || '—'}</p>
                      {tutorPreview.telefono && <p className="text-xs text-gray-500">{tutorPreview.telefono}</p>}
                      {tutorPreview.whatsapp && (
                        <p className="text-xs text-gray-500">WhatsApp: {tutorPreview.whatsapp}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Foto + datos del tutor */}
                <div className="flex gap-3">
                  {/* Con el tutor ya guardado se usa el mismo componente de QR
                      que el estudiante: quien toma la foto está delante del
                      padre, con el teléfono en la mano, no delante del PC.
                      Al CREAR todavía no hay id al que colgar la foto, así que
                      ahí sigue el selector de archivo: el QR necesita saber a
                      quién se la está tomando. */}
                  {editVinculo ? (
                    <div className="space-y-1.5">
                      <Label>Foto</Label>
                      <CapturaFoto
                        entidad="tutor"
                        entidadId={editVinculo.tutorId}
                        nombre={editVinculo.nombre}
                        tamano={92}
                        forma="cuadrada"
                      />
                    </div>
                  ) : (
                    <ImagenTutorBox imagen={nuevo.imagen}
                      onPick={handleImagen}
                      onClear={() => setNuevo((f) => ({ ...f, imagen: '' }))} />
                  )}
                  <div className="flex-1 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Nombre *</Label>
                      <Input value={nuevo.nombre}
                        onChange={(e) => setNuevo((f) => ({ ...f, nombre: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cédula *</Label>
                      <Input value={nuevo.documento} placeholder="000-0000000-0"
                        error={!!error && !nuevo.documento.trim()}
                        onChange={(e) => setNuevo((f) => ({ ...f, documento: e.target.value }))} />
                    </div>
                  </div>
                </div>
                {imgError && <p className="text-xs text-red-600">{imgError}</p>}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Teléfono</Label>
                    <Input value={nuevo.telefono} placeholder="809-000-0000"
                      onChange={(e) => setNuevo((f) => ({ ...f, telefono: e.target.value }))} />
                  </div>
                  {/* Aparte del teléfono a propósito: en muchas casas el fijo y
                      el número por el que contestan no son el mismo, y los
                      avisos del colegio salen por WhatsApp. */}
                  <div className="space-y-1.5">
                    <Label>WhatsApp</Label>
                    <Input value={nuevo.whatsapp} placeholder="809-000-0000"
                      onChange={(e) => setNuevo((f) => ({ ...f, whatsapp: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={nuevo.email}
                      onChange={(e) => setNuevo((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Relación</Label>
              <NativeSelect value={relacion} onChange={(e) => setRelacion(e.target.value)}>
                {RELACIONES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={handleGuardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar quitar */}
      <Dialog open={!!quitarTarget} onOpenChange={(o: boolean) => { if (!o) setQuitarTarget(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader title="¿Quitar tutor?" />
          <p className="text-sm text-gray-700 px-6 py-2">
            Vas a desvincular a <strong>{quitarTarget?.nombre}</strong> de este estudiante. El tutor no se elimina del sistema.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuitarTarget(null)} disabled={quitando}>Cancelar</Button>
            <Button variant="destructive" onClick={handleQuitar} disabled={quitando}>
              {quitando ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Quitando…</> : 'Sí, quitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Caja cuadrada para subir/quitar la foto del tutor. */
function ImagenTutorBox({ imagen, onPick, onClear }: {
  imagen: string; onPick: (f: File) => void; onClear: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Foto</Label>
      <label className="relative flex h-[92px] w-[92px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300">
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
        {imagen ? (
          <>
            <img src={imagen} alt="Tutor" className="h-full w-full rounded-lg object-cover" />
            <button type="button" onClick={(e) => { e.preventDefault(); onClear(); }}
              className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-gray-600 shadow hover:bg-white">
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <Camera className="h-6 w-6" />
            <span className="text-[10px] text-center leading-tight">Foto<br />máx 800 KB</span>
          </>
        )}
      </label>
    </div>
  );
}
