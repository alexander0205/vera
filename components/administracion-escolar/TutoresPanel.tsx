'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, X, Loader2, Search, Link2, Building2 } from 'lucide-react';

export interface TutorVinculo {
  id: number;
  tutorId: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  clientId: number | null;
  clienteRazonSocial: string | null;
  relacion: string;
  responsablePago: boolean;
}

interface TutorTeam {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  clientId: number | null;
  clienteRazonSocial: string | null;
}

interface Cliente { id: number; razonSocial: string; rnc: string | null; email: string | null; telefono: string | null; }

const RELACIONES = [
  { value: 'padre', label: 'Padre' },
  { value: 'madre', label: 'Madre' },
  { value: 'tutor', label: 'Tutor' },
  { value: 'cuidador', label: 'Cuidador' },
  { value: 'otro', label: 'Otro' },
];

const EMPTY_NUEVO = { nombre: '', documento: '', telefono: '', email: '', direccion: '' };

interface Props {
  estudianteId: number;
  tutores: TutorVinculo[];
  onChange: () => void;
}

export function TutoresPanel({ estudianteId, tutores, onChange }: Props) {
  const [tutoresTeam, setTutoresTeam] = useState<TutorTeam[]>([]);
  const [showForm, setShowForm]       = useState(false);
  const [editVinculo, setEditVinculo] = useState<TutorVinculo | null>(null);
  const [modoNuevo, setModoNuevo]     = useState(true);
  const [tutorSeleccionado, setTutorSeleccionado] = useState('');
  const [nuevo, setNuevo]             = useState(EMPTY_NUEVO);
  const [relacion, setRelacion]       = useState('tutor');
  const [responsablePago, setResponsablePago] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [quitarTarget, setQuitarTarget] = useState<TutorVinculo | null>(null);
  const [quitando, setQuitando]       = useState(false);

  // Vínculo opcional con un contacto/cliente (para el comprobante fiscal).
  const [clienteVinculado, setClienteVinculado] = useState<Cliente | null>(null);
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteResultados, setClienteResultados] = useState<Cliente[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  const cargarTutoresTeam = useCallback(async () => {
    const data = await fetch('/api/administracion-escolar/tutores').then((r) => r.json());
    setTutoresTeam(data.tutores ?? []);
  }, []);

  useEffect(() => { if (showForm) cargarTutoresTeam(); }, [showForm, cargarTutoresTeam]);

  // Búsqueda de clientes con debounce (solo en modo nuevo tutor, sin cliente ya elegido).
  useEffect(() => {
    if (!showForm || editVinculo || !modoNuevo || clienteVinculado) return;
    const q = clienteQuery.trim();
    if (!q) { setClienteResultados([]); return; }
    setBuscandoCliente(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`).then((r) => r.json());
        setClienteResultados(data.clientes ?? []);
      } finally {
        setBuscandoCliente(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [clienteQuery, showForm, editVinculo, modoNuevo, clienteVinculado]);

  function elegirCliente(c: Cliente) {
    setClienteVinculado(c);
    setClienteResultados([]);
    setClienteQuery('');
    // Prellenar datos vacíos del tutor con los del cliente.
    setNuevo((f) => ({
      ...f,
      nombre: f.nombre.trim() || c.razonSocial,
      telefono: f.telefono.trim() || (c.telefono ?? ''),
      email: f.email.trim() || (c.email ?? ''),
    }));
  }

  const yaVinculados = new Set(tutores.map((t) => t.tutorId));
  const disponibles = tutoresTeam.filter((t) => !yaVinculados.has(t.id));

  function abrirNuevo() {
    setEditVinculo(null);
    setModoNuevo(disponibles.length === 0);
    setTutorSeleccionado('');
    setNuevo(EMPTY_NUEVO);
    setRelacion('tutor');
    setResponsablePago(false);
    setClienteVinculado(null);
    setClienteQuery('');
    setClienteResultados([]);
    setError(null);
    setShowForm(true);
  }

  function abrirEdicion(v: TutorVinculo) {
    setEditVinculo(v);
    setRelacion(v.relacion);
    setResponsablePago(v.responsablePago);
    setClienteVinculado(null);
    setClienteQuery('');
    setClienteResultados([]);
    setError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    setSaving(true);
    setError(null);
    try {
      let tutorId: number;
      if (editVinculo) {
        tutorId = editVinculo.tutorId;
      } else if (modoNuevo) {
        if (!nuevo.nombre.trim()) throw new Error('El nombre del tutor es obligatorio');
        const res = await fetch('/api/administracion-escolar/tutores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...nuevo, clientId: clienteVinculado?.id ?? null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Error creando tutor');
        tutorId = data.tutor.id;
      } else {
        if (!tutorSeleccionado) throw new Error('Selecciona un tutor');
        tutorId = parseInt(tutorSeleccionado);
      }

      const res2 = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}/tutores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId, relacion, responsablePago }),
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
        <h2 className="text-base font-semibold text-gray-900">Tutores</h2>
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
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Relación</th>
                <th className="px-3 py-2 font-medium">Teléfono</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
                <th className="px-3 py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tutores.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-gray-900">{t.nombre}</span>
                    {t.clientId && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-teal-700" title={`Contacto: ${t.clienteRazonSocial}`}>
                        <Link2 className="h-3 w-3" />Contacto
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 capitalize">{t.relacion}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.telefono ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.email ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {t.responsablePago
                      ? <Badge className="bg-teal-50 text-teal-700 border-teal-200">Pago</Badge>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicion(t)}>
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setQuitarTarget(t)}>
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
          <DialogHeader>
            <DialogTitle>{editVinculo ? `Editar — ${editVinculo.nombre}` : 'Agregar tutor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
            )}

            {!editVinculo && (
              <>
                {disponibles.length > 0 && (
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

                {!modoNuevo ? (
                  <div className="space-y-1.5">
                    <Label>Tutor *</Label>
                    <Select value={tutorSeleccionado} onValueChange={setTutorSeleccionado}>
                      <SelectTrigger><SelectValue placeholder="Selecciona un tutor" /></SelectTrigger>
                      <SelectContent>
                        {disponibles.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.nombre}{t.clientId ? ` · ${t.clienteRazonSocial}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    {/* Vínculo opcional con un contacto/cliente existente */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />Contacto / cliente (para facturar)
                      </Label>
                      {clienteVinculado ? (
                        <div className="flex items-center justify-between gap-2 border border-teal-200 bg-teal-50 rounded-lg px-3 py-2">
                          <span className="text-sm font-medium text-teal-800 truncate">{clienteVinculado.razonSocial}</span>
                          <button onClick={() => setClienteVinculado(null)}
                            className="text-teal-600 hover:text-teal-800 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input className="pl-8" placeholder="Buscar cliente (opcional)…"
                            value={clienteQuery} onChange={(e) => setClienteQuery(e.target.value)} />
                          {(buscandoCliente || clienteResultados.length > 0) && (
                            <div className="absolute z-10 left-0 right-0 mt-1 border border-gray-200 bg-white rounded-lg shadow-sm max-h-40 overflow-y-auto">
                              {buscandoCliente ? (
                                <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-teal-600" /></div>
                              ) : clienteResultados.map((c) => (
                                <button key={c.id} onClick={() => elegirCliente(c)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                                  <p className="font-medium text-gray-900">{c.razonSocial}</p>
                                  <p className="text-xs text-gray-400">{c.rnc ?? c.email ?? '—'}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>Nombre *</Label>
                      <Input value={nuevo.nombre}
                        onChange={(e) => setNuevo((f) => ({ ...f, nombre: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Teléfono</Label>
                        <Input value={nuevo.telefono}
                          onChange={(e) => setNuevo((f) => ({ ...f, telefono: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Documento</Label>
                        <Input value={nuevo.documento}
                          onChange={(e) => setNuevo((f) => ({ ...f, documento: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input type="email" value={nuevo.email}
                        onChange={(e) => setNuevo((f) => ({ ...f, email: e.target.value }))} />
                    </div>
                  </>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Relación</Label>
                <Select value={relacion} onValueChange={setRelacion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELACIONES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={responsablePago}
                    onChange={(e) => setResponsablePago(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  Responsable de pago
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar quitar */}
      <Dialog open={!!quitarTarget} onOpenChange={(o: boolean) => { if (!o) setQuitarTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Quitar tutor?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-700 py-2">
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
