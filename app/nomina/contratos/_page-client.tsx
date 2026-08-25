'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { FileText, Loader2, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { VARIABLES_CONTRATO, PLANTILLA_EJEMPLO } from '@/lib/nomina/contratos';

interface Plantilla {
  id: number;
  nombre: string;
  cuerpo: string;
  activa: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ContratosClient() {
  const { can } = usePermissions();
  const puedeConfig = can('nomina:configurar');
  const { data, isLoading, mutate } = useSWR<{ plantillas: Plantilla[] }>('/api/nomina/contratos/plantillas', fetcher);

  const [dlg, setDlg] = useState<{ abierto: boolean; editando: Plantilla | null }>({ abierto: false, editando: null });
  const [form, setForm] = useState({ nombre: '', cuerpo: '' });
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Plantilla | null>(null);

  const plantillas = data?.plantillas ?? [];

  function abrirNueva() {
    setForm({ nombre: '', cuerpo: '' });
    setDlg({ abierto: true, editando: null });
  }
  function abrirEditar(p: Plantilla) {
    setForm({ nombre: p.nombre, cuerpo: p.cuerpo });
    setDlg({ abierto: true, editando: p });
  }

  async function guardar() {
    if (!form.nombre.trim()) { toast.error('Ponle un nombre a la plantilla'); return; }
    if (!form.cuerpo.trim()) { toast.error('El cuerpo no puede estar vacío'); return; }
    setGuardando(true);
    try {
      const editando = dlg.editando;
      const res = await fetch('/api/nomina/contratos/plantillas', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? { id: editando.id, ...form } : form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'No se pudo guardar');
      }
      toast.success(editando ? 'Plantilla actualizada' : 'Plantilla creada');
      setDlg({ abierto: false, editando: null });
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!aBorrar) return;
    try {
      const res = await fetch(`/api/nomina/contratos/plantillas?id=${aBorrar.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo borrar');
      toast.success('Plantilla borrada');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setABorrar(null);
    }
  }

  /** Inserta un marcador al final del cuerpo (ayuda rápida). */
  function insertarMarcador(clave: string) {
    setForm((f) => ({ ...f, cuerpo: `${f.cuerpo}{{${clave}}}` }));
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileText className="h-6 w-6 text-zero-600" /> Plantillas de contrato
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contratos pregrabados con marcadores que se llenan solos con los datos del empleado.
          </p>
        </div>
        {puedeConfig && (
          <Button onClick={abrirNueva} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nueva plantilla
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : plantillas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p>Aún no hay plantillas de contrato.</p>
          {puedeConfig && (
            <Button variant="outline" onClick={abrirNueva} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" /> Crear la primera
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {plantillas.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.nombre}</span>
                    {!p.activa && <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.cuerpo.replace(/\s+/g, ' ').slice(0, 90)}…
                  </div>
                </div>
                {puedeConfig && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => abrirEditar(p)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setABorrar(p)} aria-label="Borrar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor */}
      <Dialog open={dlg.abierto} onOpenChange={(o) => setDlg((d) => ({ ...d, abierto: o }))}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{dlg.editando ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
            <DialogDescription>
              Escribe el contrato usando marcadores como <code>{'{{nombre}}'}</code>. Se reemplazan solos al generar el contrato de cada empleado.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nombre de la plantilla</Label>
              <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Contrato por tiempo indefinido" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Cuerpo del contrato</Label>
                {!form.cuerpo.trim() && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setForm((f) => ({ ...f, cuerpo: PLANTILLA_EJEMPLO }))}>
                    <Sparkles className="h-3.5 w-3.5" /> Usar plantilla de ejemplo
                  </Button>
                )}
              </div>
              <Textarea
                value={form.cuerpo}
                onChange={(e) => setForm((f) => ({ ...f, cuerpo: e.target.value }))}
                rows={14}
                className="font-mono text-xs"
                placeholder="CONTRATO DE TRABAJO…"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Marcadores disponibles (clic para insertar)</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {VARIABLES_CONTRATO.map((v) => (
                  <button
                    key={v.clave}
                    type="button"
                    onClick={() => insertarMarcador(v.clave)}
                    title={v.descripcion}
                    className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground transition hover:bg-muted"
                  >
                    {'{{'}{v.clave}{'}}'}
                  </button>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg({ abierto: false, editando: null })} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando} className="gap-1.5">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {dlg.editando ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(o) => !o && setABorrar(null)}
        title="Borrar plantilla"
        description={aBorrar ? `Se borrará "${aBorrar.nombre}". Los contratos ya generados con ella se conservan.` : ''}
        confirmLabel="Borrar"
        onConfirm={borrar}
        destructive
      />
    </div>
  );
}
