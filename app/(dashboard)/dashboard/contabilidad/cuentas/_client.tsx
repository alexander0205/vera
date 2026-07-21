'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Power, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { CuentaNodo, Cuenta } from '@/lib/contabilidad/cuentas';

const TIPOS = [
  { valor: 'activo',     label: 'Activo' },
  { valor: 'pasivo',     label: 'Pasivo' },
  { valor: 'patrimonio', label: 'Patrimonio' },
  { valor: 'ingreso',    label: 'Ingresos' },
  { valor: 'costo',      label: 'Costos' },
  { valor: 'gasto',      label: 'Gastos' },
] as const;

const TIPO_CLS: Record<string, string> = {
  activo:     'bg-blue-50 text-blue-700 border-blue-200',
  pasivo:     'bg-amber-50 text-amber-700 border-amber-200',
  patrimonio: 'bg-purple-50 text-purple-700 border-purple-200',
  ingreso:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  costo:      'bg-orange-50 text-orange-700 border-orange-200',
  gasto:      'bg-rose-50 text-rose-700 border-rose-200',
};

/** Naturaleza que le toca a la clase. Espeja `naturalezaPorTipo` del servidor. */
function naturalezaPorTipo(tipo: string) {
  return tipo === 'activo' || tipo === 'costo' || tipo === 'gasto' ? 'deudora' : 'acreedora';
}

interface FormState {
  id?:            number;
  codigo:         string;
  nombre:         string;
  tipo:           string;
  naturaleza:     string;
  cuentaPadreId:  number | null;
  imputable:      boolean;
}

const FORM_VACIO: FormState = {
  codigo: '', nombre: '', tipo: 'activo', naturaleza: 'deudora',
  cuentaPadreId: null, imputable: true,
};

export function CatalogoClient({
  cuentasIniciales,
  puedeConfigurar,
}: {
  cuentasIniciales: CuentaNodo[];
  puedeConfigurar: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [form, setForm]           = useState<FormState | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [colapsadas, setColapsadas] = useState<Set<number>>(new Set());
  const [verInactivas, setVerInactivas] = useState(false);

  /** Aplana el árbol respetando el colapso, para pintarlo como tabla indentada. */
  const filas = useMemo(() => {
    const out: CuentaNodo[] = [];
    const recorrer = (nodos: CuentaNodo[]) => {
      for (const n of nodos) {
        if (!verInactivas && !n.activa) continue;
        out.push(n);
        if (!colapsadas.has(n.id)) recorrer(n.hijas);
      }
    };
    recorrer(cuentasIniciales);
    return out;
  }, [cuentasIniciales, colapsadas, verInactivas]);

  /** Candidatas a cuenta padre: solo las de agrupación, y nunca la propia cuenta. */
  const padresPosibles = useMemo(() => {
    const out: { id: number; codigo: string; nombre: string }[] = [];
    const recorrer = (nodos: CuentaNodo[]) => {
      for (const n of nodos) {
        if (!n.imputable && n.id !== form?.id) {
          out.push({ id: n.id, codigo: n.codigo, nombre: n.nombre });
        }
        recorrer(n.hijas);
      }
    };
    recorrer(cuentasIniciales);
    return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [cuentasIniciales, form?.id]);

  function alternarColapso(id: number) {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function abrirNueva(padre?: CuentaNodo) {
    setError(null);
    setForm({
      ...FORM_VACIO,
      cuentaPadreId: padre?.id ?? null,
      tipo: padre?.tipo ?? 'activo',
      naturaleza: naturalezaPorTipo(padre?.tipo ?? 'activo'),
    });
  }

  function abrirEditar(c: Cuenta) {
    setError(null);
    setForm({
      id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo,
      naturaleza: c.naturaleza, cuentaPadreId: c.cuentaPadreId, imputable: c.imputable,
    });
  }

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setError(null);

    const esEdicion = form.id !== undefined;
    const res = await fetch(
      esEdicion ? `/api/contabilidad/cuentas/${form.id}` : '/api/contabilidad/cuentas',
      {
        method: esEdicion ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: form.codigo,
          nombre: form.nombre,
          tipo: form.tipo,
          naturaleza: form.naturaleza,
          cuentaPadreId: form.cuentaPadreId,
          imputable: form.imputable,
        }),
      },
    );

    setGuardando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo guardar la cuenta.');
      return;
    }

    setForm(null);
    startTransition(() => router.refresh());
  }

  async function alternarActiva(c: Cuenta) {
    setError(null);
    const res = await fetch(`/api/contabilidad/cuentas/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !c.activa }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo cambiar el estado de la cuenta.');
      return;
    }
    startTransition(() => router.refresh());
  }

  async function borrar(c: Cuenta) {
    if (!confirm(`¿Eliminar la cuenta ${c.codigo} ${c.nombre}?`)) return;
    setError(null);
    const res = await fetch(`/api/contabilidad/cuentas/${c.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo eliminar la cuenta.');
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={verInactivas}
            onChange={(e) => setVerInactivas(e.target.checked)}
            className="rounded border-gray-300"
          />
          Mostrar cuentas desactivadas
        </label>

        {puedeConfigurar && (
          <Button onClick={() => abrirNueva()} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nueva cuenta
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Naturaleza</th>
              <th className="px-4 py-3 font-medium">Movimientos</th>
              {puedeConfigurar && <th className="px-4 py-3 font-medium text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((c) => (
              <tr key={c.id} className={c.activa ? '' : 'bg-gray-50/60 text-gray-400'}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center" style={{ paddingLeft: `${c.nivel * 20}px` }}>
                    {c.hijas.length > 0 ? (
                      <button
                        onClick={() => alternarColapso(c.id)}
                        className="mr-1 rounded p-0.5 text-gray-400 hover:bg-gray-100"
                        aria-label={colapsadas.has(c.id) ? 'Expandir' : 'Colapsar'}
                      >
                        {colapsadas.has(c.id)
                          ? <ChevronRight className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : (
                      <span className="mr-1 w-5" />
                    )}
                    <span className="font-mono text-xs text-gray-500">{c.codigo}</span>
                    <span className={`ml-3 ${c.imputable ? '' : 'font-medium text-gray-900'}`}>
                      {c.nombre}
                    </span>
                    {!c.activa && (
                      <span className="ml-2 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        Desactivada
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded border px-2 py-0.5 text-xs ${TIPO_CLS[c.tipo]}`}>
                    {TIPOS.find((t) => t.valor === c.tipo)?.label ?? c.tipo}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {c.naturaleza === 'deudora' ? 'Deudora' : 'Acreedora'}
                  {/* Señal de cuenta de contrapartida: naturaleza invertida
                      respecto a su clase. Vale la pena que salte a la vista. */}
                  {c.naturaleza !== naturalezaPorTipo(c.tipo) && (
                    <span className="ml-1.5 text-xs text-amber-600">(invertida)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {c.imputable ? 'Acepta' : <span className="text-gray-400">Agrupa</span>}
                </td>
                {puedeConfigurar && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {!c.imputable && (
                        <button
                          onClick={() => abrirNueva(c)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Agregar cuenta hija"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => abrirEditar(c)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => alternarActiva(c)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title={c.activa ? 'Desactivar' : 'Activar'}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      {/* Las cuentas del catálogo base son estructurales; se
                          desactivan, no se borran. Borrar queda para las que
                          creó el usuario. */}
                      {!c.esBase && (
                        <button
                          onClick={() => borrar(c)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}

            {filas.length === 0 && (
              <tr>
                <td colSpan={puedeConfigurar ? 5 : 4} className="px-4 py-10 text-center text-sm text-gray-500">
                  No hay cuentas en el catálogo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Las cuentas que <strong>agrupan</strong> no reciben movimientos: su saldo es la suma
        de las que cuelgan de ellas. Los asientos van siempre en las cuentas que
        <strong> aceptan</strong> movimientos.
      </p>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="codigo">Código</Label>
                  <Input
                    id="codigo"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder="1101"
                    className="font-mono"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Caja chica"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tipo">Tipo</Label>
                  <select
                    id="tipo"
                    value={form.tipo}
                    onChange={(e) => setForm({
                      ...form,
                      tipo: e.target.value,
                      // Al cambiar la clase se repropone su naturaleza. Si el
                      // usuario la invierte después, esa elección se respeta.
                      naturaleza: naturalezaPorTipo(e.target.value),
                    })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    {TIPOS.map((t) => (
                      <option key={t.valor} value={t.valor}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="naturaleza">Naturaleza</Label>
                  <select
                    id="naturaleza"
                    value={form.naturaleza}
                    onChange={(e) => setForm({ ...form, naturaleza: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="deudora">Deudora</option>
                    <option value="acreedora">Acreedora</option>
                  </select>
                  {form.naturaleza !== naturalezaPorTipo(form.tipo) && (
                    <p className="text-xs text-amber-600">
                      Invertida respecto a su tipo. Es lo correcto para cuentas que
                      restan, como descuentos o devoluciones.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="padre">Cuenta padre</Label>
                <select
                  id="padre"
                  value={form.cuentaPadreId ?? ''}
                  onChange={(e) => setForm({
                    ...form,
                    cuentaPadreId: e.target.value ? Number(e.target.value) : null,
                  })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Ninguna (cuenta raíz)</option>
                  {padresPosibles.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  Solo aparecen las cuentas que agrupan. Una cuenta que acepta
                  movimientos no puede tener hijas.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.imputable}
                  onChange={(e) => setForm({ ...form, imputable: e.target.checked })}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  Acepta movimientos
                  <span className="block text-xs text-gray-500">
                    Desmárcalo si esta cuenta solo agrupa a otras.
                  </span>
                </span>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || pending}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
