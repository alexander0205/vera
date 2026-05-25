'use client';

import { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import type { ImportResult, ImportRow, RowAction } from '@/lib/import/csv';

export interface ImportColumn {
  key: string;
  label: string;
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Endpoint que acepta multipart {file, mode}. */
  endpoint: string;
  title: string;
  /** Accept del input. Default '.csv'. */
  accept?: string;
  /** Columnas a mostrar en la vista previa, leídas de row.data. */
  columns: ImportColumn[];
  /** Texto de ayuda bajo el selector. */
  helpText?: string;
  /** Se llama tras commit exitoso (recargar lista). */
  onDone?: () => void;
}

const ACTION_STYLE: Record<RowAction, string> = {
  create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update: 'bg-amber-50 text-amber-700 border-amber-200',
  skip:   'bg-gray-100 text-gray-500 border-gray-200',
};

const ACTION_LABEL: Record<RowAction, string> = {
  create: 'Nuevo',
  update: 'Actualiza',
  skip:   'Omitir',
};

export function ImportModal({
  open, onClose, endpoint, title, accept = '.csv', columns, helpText, onDone,
}: ImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [preview, setPreview]   = useState<ImportResult<Record<string, unknown>> | null>(null);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState<ImportResult<Record<string, unknown>> | null>(null);

  function reset() {
    setFile(null); setPreview(null); setError(null); setDone(null); setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function send(mode: 'preview' | 'commit', f: File) {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('mode', mode);
    const res  = await fetch(endpoint, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error procesando el archivo');
    return data as ImportResult<Record<string, unknown>>;
  }

  async function onPick(f: File | null) {
    setError(null); setPreview(null); setDone(null);
    setFile(f);
    if (!f) return;
    setBusy(true);
    try {
      setPreview(await send('preview', f));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en vista previa');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const result = await send('commit', file);
      setDone(result);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error importando');
    } finally {
      setBusy(false);
    }
  }

  const willImport = preview ? preview.created + preview.updated : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Resultado final */}
        {done ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-lg font-semibold text-gray-900">Importación completada</p>
            <p className="text-sm text-gray-600">
              {done.created} creados · {done.updated} actualizados · {done.skipped} omitidos
            </p>
            {done.errors.length > 0 && (
              <p className="text-xs text-amber-600">{done.errors.length} con advertencias</p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Selector de archivo */}
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-teal-300 hover:bg-teal-50/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-7 w-7 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">
                {file ? file.name : 'Haz clic para seleccionar un archivo'}
              </p>
              {helpText && <p className="text-xs text-gray-400 text-center">{helpText}</p>}
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </div>

            {busy && !preview && (
              <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analizando archivo…</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Vista previa */}
            {preview && (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Chip className="bg-emerald-50 text-emerald-700 border-emerald-200">{preview.created} nuevos</Chip>
                  <Chip className="bg-amber-50 text-amber-700 border-amber-200">{preview.updated} actualizar</Chip>
                  <Chip className="bg-gray-100 text-gray-500 border-gray-200">{preview.skipped} omitir</Chip>
                  <Chip className="bg-blue-50 text-blue-700 border-blue-200">{preview.total} total</Chip>
                </div>

                {preview.errors.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 space-y-0.5 max-h-28 overflow-y-auto">
                    {preview.errors.slice(0, 30).map((e, i) => <div key={i}>• {e}</div>)}
                    {preview.errors.length > 30 && <div>… y {preview.errors.length - 30} más</div>}
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">#</th>
                          <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Acción</th>
                          {columns.map((c) => (
                            <th key={c.key} className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.rows.slice(0, 200).map((r: ImportRow<Record<string, unknown>>, i) => (
                          <tr key={i} className={r.action === 'skip' ? 'opacity-60' : ''}>
                            <td className="px-3 py-1.5 text-xs text-gray-400 font-mono">{r.ref}</td>
                            <td className="px-3 py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${ACTION_STYLE[r.action]}`}>
                                {ACTION_LABEL[r.action]}
                              </span>
                              {r.reason && <span className="ml-1 text-[10px] text-gray-400">{r.reason}</span>}
                            </td>
                            {columns.map((c) => (
                              <td key={c.key} className="px-3 py-1.5 text-gray-700 truncate max-w-[180px]">
                                {fmt(r.data[c.key])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.rows.length > 200 && (
                    <div className="bg-gray-50 px-3 py-1.5 text-[11px] text-gray-400 border-t">
                      Mostrando 200 de {preview.rows.length} filas
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleClose}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={busy}>Cancelar</Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                onClick={onConfirm}
                disabled={busy || !preview || willImport === 0}
              >
                {busy && preview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Importar {willImport > 0 ? `(${willImport})` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`px-2 py-0.5 rounded-full border font-medium ${className}`}>{children}</span>;
}

function fmt(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return String(v);
  return String(v);
}
