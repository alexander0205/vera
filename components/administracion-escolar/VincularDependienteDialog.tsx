'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Search, ArrowLeft } from 'lucide-react';

interface Cliente { id: number; razonSocial: string; rnc: string | null; email: string | null; }
interface Dependiente { id: number; nombre: string; apellido: string; }

interface Props {
  estudianteId: number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Vincula el estudiante a un `dependiente` de Contactos (padre/tutor = cliente).
 * Flujo: buscar cliente → elegir/crear dependiente bajo ese cliente → PATCH
 * estudiante.dependienteId. El mismo dependiente puede reusarse si ya existe
 * (ej. otro hijo del mismo cliente).
 */
export function VincularDependienteDialog({ estudianteId, open, onClose, onSaved }: Props) {
  const [query, setQuery]           = useState('');
  const [clientes, setClientes]     = useState<Cliente[]>([]);
  const [buscando, setBuscando]     = useState(false);
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [dependientes, setDependientes] = useState<Dependiente[]>([]);
  const [cargandoDeps, setCargandoDeps] = useState(false);
  const [nuevoNombre, setNuevoNombre]     = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setClientes([]); setClienteSel(null); setDependientes([]);
    setNuevoNombre(''); setNuevoApellido(''); setError(null);
  }, [open]);

  const buscarClientes = useCallback(async (q: string) => {
    setBuscando(true);
    try {
      const data = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setClientes(data.clientes ?? []);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (!open || clienteSel) return;
    const t = setTimeout(() => { if (query.trim()) buscarClientes(query); else setClientes([]); }, 300);
    return () => clearTimeout(t);
  }, [query, open, clienteSel, buscarClientes]);

  async function elegirCliente(c: Cliente) {
    setClienteSel(c);
    setCargandoDeps(true);
    try {
      const data = await fetch(`/api/clientes/${c.id}/dependientes`).then((r) => r.json());
      setDependientes(data.dependientes ?? []);
    } finally {
      setCargandoDeps(false);
    }
  }

  async function vincular(dependienteId: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/estudiantes/${estudianteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependienteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error vinculando');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error vinculando');
    } finally {
      setSaving(false);
    }
  }

  async function crearYVincular() {
    if (!clienteSel) return;
    if (!nuevoNombre.trim() || !nuevoApellido.trim()) {
      setError('Nombre y apellido son obligatorios'); return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clienteSel.id}/dependientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoNombre, apellido: nuevoApellido }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando dependiente');
      await vincular(data.dependiente.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando dependiente');
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular a Contactos</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}

          {!clienteSel ? (
            <>
              <div className="space-y-1.5">
                <Label>Buscar cliente/tutor</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input className="pl-8" placeholder="Nombre, RNC o email…" autoFocus
                    value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              </div>
              {buscando ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>
              ) : clientes.length > 0 ? (
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {clientes.map((c) => (
                    <button key={c.id} onClick={() => elegirCliente(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                      <p className="font-medium text-gray-900">{c.razonSocial}</p>
                      <p className="text-xs text-gray-400">{c.rnc ?? c.email ?? '—'}</p>
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin resultados</p>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">Escribe para buscar un cliente/tutor existente</p>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { setClienteSel(null); setDependientes([]); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" />{clienteSel.razonSocial}
              </button>

              {cargandoDeps ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>
              ) : (
                <>
                  {dependientes.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Dependientes existentes de este cliente</Label>
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                        {dependientes.map((d) => (
                          <button key={d.id} onClick={() => vincular(d.id)} disabled={saving}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                            {d.nombre} {d.apellido}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5 border-t border-gray-100 pt-3">
                    <Label>{dependientes.length > 0 ? 'O crear un dependiente nuevo' : 'Crear dependiente'}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Nombre" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
                      <Input placeholder="Apellido" value={nuevoApellido} onChange={(e) => setNuevoApellido(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {clienteSel && (
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={crearYVincular} disabled={saving || cargandoDeps}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear y vincular'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
