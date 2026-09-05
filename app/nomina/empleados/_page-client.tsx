'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import {
  Users, Search, Loader2, IdCard, Phone, Briefcase,
  Plus, Pencil, Trash2, UserPlus, GraduationCap, Check, FileText,
} from 'lucide-react';
import {
  Empleado, fetcher, pesos, nombreCompleto, iniciales, esActivo, LABEL_FRECUENCIA,
} from './shared';

export default function EmpleadosClient({ tieneEscolar = false }: { tieneEscolar?: boolean }) {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeGestionar = can('empleados:gestionar');
  const { data, isLoading, mutate } = useSWR<{ empleados: Empleado[] }>('/api/nomina/empleados', fetcher);

  const [busca, setBusca] = useState('');
  const [aEliminar, setAEliminar] = useState<Empleado | null>(null);
  const [importAbierto, setImportAbierto] = useState(false);

  const empleados = data?.empleados ?? [];
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return empleados;
    return empleados.filter((e) =>
      nombreCompleto(e).toLowerCase().includes(q) ||
      (e.cedula ?? '').includes(q) ||
      (e.cargo ?? '').toLowerCase().includes(q),
    );
  }, [empleados, busca]);

  const activos = empleados.filter((e) => esActivo(e.estado)).length;
  const masaSalarial = empleados
    .filter((e) => esActivo(e.estado))
    .reduce((sum, e) => sum + (e.salarioBaseCents ?? 0), 0);

  // Alta, edición y contrato viven en su propia página (no modal): cerrar por
  // accidente no borra lo tecleado (pedido de Alex).
  const irNuevo = () => router.push('/nomina/empleados/nuevo');
  const irEditar = (id: number) => router.push(`/nomina/empleados/${id}/editar`);
  const irContrato = (id: number) => router.push(`/nomina/empleados/${id}/contrato`);

  async function eliminar() {
    if (!aEliminar) return;
    try {
      const res = await fetch(`/api/nomina/empleados/${aEliminar.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo dar de baja');
      toast.success('Empleado dado de baja');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setAEliminar(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-6 w-6 text-zero-600" /> Empleados
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El directorio del personal. Sobre estas fichas corren las nóminas.
          </p>
        </div>
        {puedeGestionar && (
          <div className="flex flex-wrap gap-2">
            {tieneEscolar && (
              <Button variant="outline" onClick={() => setImportAbierto(true)} className="gap-1.5">
                <GraduationCap className="h-4 w-4" /> Importar del colegio
              </Button>
            )}
            <Button onClick={irNuevo} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nuevo empleado
            </Button>
          </div>
        )}
      </div>

      {/* Totales */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Activos</div>
          <div className="mt-1 text-xl font-semibold">{activos}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total registrados</div>
          <div className="mt-1 text-xl font-semibold">{empleados.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Masa salarial (activos)</div>
          <div className="mt-1 text-xl font-semibold">{pesos(masaSalarial)}</div>
        </CardContent></Card>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, cédula o cargo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <UserPlus className="h-8 w-8" />
          <p>{empleados.length === 0 ? 'Aún no hay empleados registrados.' : 'Ningún empleado coincide con la búsqueda.'}</p>
          {puedeGestionar && empleados.length === 0 && (
            <Button variant="outline" onClick={irNuevo} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" /> Agregar el primero
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((e) => (
            <Card key={e.id} className={esActivo(e.estado) ? '' : 'opacity-60'}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zero-100 text-sm font-semibold text-zero-700">
                  {iniciales(e)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{nombreCompleto(e)}</span>
                    {!esActivo(e.estado) && <Badge variant="secondary">Inactivo</Badge>}
                    {e.origen === 'escolar' && (
                      <Badge variant="outline" className="gap-1"><GraduationCap className="h-3 w-3" /> Del colegio</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {e.cargo && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{e.cargo}</span>}
                    {e.cedula && <span className="flex items-center gap-1"><IdCard className="h-3 w-3" />{e.cedula}</span>}
                    {e.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{e.telefono}</span>}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="font-medium">{pesos(e.salarioBaseCents)}</div>
                  <div className="text-xs text-muted-foreground">{LABEL_FRECUENCIA[e.frecuenciaPago] ?? e.frecuenciaPago}</div>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => irContrato(e.id)} aria-label="Contrato" title="Contrato">
                    <FileText className="h-4 w-4" />
                  </Button>
                  {puedeGestionar && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => irEditar(e.id)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {esActivo(e.estado) && (
                        <Button variant="ghost" size="icon" onClick={() => setAEliminar(e)} aria-label="Dar de baja">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tieneEscolar && (
        <ImportarEscolarDialog
          open={importAbierto}
          onOpenChange={setImportAbierto}
          onImportado={() => { setImportAbierto(false); mutate(); }}
        />
      )}

      <ConfirmDialog
        open={!!aEliminar}
        onOpenChange={(o) => !o && setAEliminar(null)}
        title="Dar de baja al empleado"
        description={aEliminar ? `${nombreCompleto(aEliminar)} pasará a inactivo y no entrará en nóminas nuevas. Su historia se conserva.` : ''}
        confirmLabel="Dar de baja"
        onConfirm={eliminar}
        destructive
      />
    </div>
  );
}

// ── Importar personal del colegio ─────────────────────────────────────────────
// Trae el personal del módulo escolar (SIGERD + agregados a mano) y crea
// empleados de nómina. Snapshot: copia la identidad; el salario nace en 0 y se
// completa después. Idempotente: las ya importadas salen marcadas y bloqueadas.

interface PersonaImportable {
  ref: string;
  origen: 'sigerd' | 'manual';
  cedula: string | null;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  esProfesor: boolean;
  activo: boolean;
  yaImportada: boolean;
  cedulaOcupada: boolean;
}

function nombrePersona(p: PersonaImportable): string {
  return [p.nombres, p.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

function ImportarEscolarDialog({
  open, onOpenChange, onImportado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImportado: () => void;
}) {
  const { data, isLoading } = useSWR<{ disponible: boolean; personas: PersonaImportable[] }>(
    open ? '/api/nomina/empleados/importar-escolar' : null,
    fetcher,
  );
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState('');

  const personas = useMemo(() => data?.personas ?? [], [data]);
  const importables = personas.filter((p) => !p.yaImportada);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return personas;
    return personas.filter((p) =>
      nombrePersona(p).toLowerCase().includes(q) ||
      (p.cedula ?? '').includes(q) ||
      (p.cargo ?? '').toLowerCase().includes(q),
    );
  }, [personas, busca]);

  function toggle(ref: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(ref)) n.delete(ref); else n.add(ref);
      return n;
    });
  }
  const todosSel = importables.length > 0 && importables.every((p) => sel.has(p.ref));
  function toggleTodos() {
    setSel(todosSel ? new Set() : new Set(importables.map((p) => p.ref)));
  }

  async function importar() {
    if (sel.size === 0) return;
    setImportando(true);
    try {
      const res = await fetch('/api/nomina/empleados/importar-escolar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs: [...sel] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo importar');
      toast.success(j.creados ? `${j.creados} empleado(s) importado(s)` : (j.mensaje ?? 'Nada que importar'));
      setSel(new Set());
      onImportado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar');
    } finally {
      setImportando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-zero-600" /> Importar personal del colegio
          </DialogTitle>
          <DialogDescription>
            Trae al personal del módulo escolar como empleados. Se copia su identidad;
            el salario y la cuenta de banco los completas después en cada ficha.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, cédula o cargo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading || !data ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : personas.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No hay personal en el colegio. Corre “Obtener información” en SIGERD o agrégalo a mano en Personal.
            </p>
          ) : importables.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Todo el personal del colegio ya está en la nómina.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={toggleTodos}
                  disabled={importables.length === 0}
                  className="font-medium text-zero-600 hover:underline disabled:opacity-50"
                >
                  {todosSel ? 'Quitar selección' : 'Seleccionar todos los que faltan'}
                </button>
                <span>{sel.size} seleccionado(s) · {importables.length} sin importar</span>
              </div>
              <div className="max-h-[22rem] space-y-1 overflow-auto pr-1">
                {filtradas.map((p) => {
                  const marcado = sel.has(p.ref);
                  const bloqueado = p.yaImportada;
                  return (
                    <button
                      key={p.ref}
                      type="button"
                      onClick={() => !bloqueado && toggle(p.ref)}
                      disabled={bloqueado}
                      className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition ${
                        bloqueado ? 'opacity-60' : marcado ? 'border-zero-500 bg-zero-50' : 'hover:bg-muted/50'
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        marcado || bloqueado ? 'border-zero-500 bg-zero-500 text-white' : 'border-muted-foreground/40'
                      }`}>
                        {(marcado || bloqueado) && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{nombrePersona(p)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.cargo ?? '—'}{p.cedula ? ` · ${p.cedula}` : ''}
                        </span>
                      </span>
                      {p.esProfesor && <Badge variant="secondary" className="shrink-0">Maestro</Badge>}
                      {bloqueado ? (
                        <Badge variant="outline" className="shrink-0">Ya en nómina</Badge>
                      ) : p.cedulaOcupada ? (
                        <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700">Cédula repetida</Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importando}>Cerrar</Button>
          <Button onClick={importar} disabled={importando || sel.size === 0} className="gap-1.5">
            {importando && <Loader2 className="h-4 w-4 animate-spin" />}
            Importar {sel.size > 0 ? `(${sel.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
