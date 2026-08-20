'use client';

import { useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { Upload, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import type { ImportResult, ImportRow, RowAction } from '@/lib/import/csv';

export interface ImportColumn {
  key: string;
  label: string;
  /** Formato custom del valor de la celda (ej. boolean → 'Cobrada'/'Pendiente'). */
  format?: (value: unknown) => string;
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

const ACTION_STYLE: Record<RowAction, { bgcolor: string; color: string; borderColor: string }> = {
  create: { bgcolor: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' },
  update: { bgcolor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' },
  skip:   { bgcolor: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' },
};

const ACTION_LABEL: Record<RowAction, string> = {
  create: 'Nuevo',
  update: 'Actualiza',
  skip:   'Omitir',
};

const TH_SX = {
  textAlign: 'left',
  px: 1.5,
  py: 1,
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  bgcolor: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
} as const;

const TD_SX = {
  px: 1.5,
  py: 0.75,
  fontSize: '0.75rem',
  color: '#374151',
  borderBottom: '1px solid #f3f4f6',
} as const;

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
    <Dialog
      open={open}
      onClose={handleClose}
      slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: '48rem', width: '100%', maxHeight: '85vh' } } as object }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1.125rem' }}>{title}</DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column' }}>
        {/* Resultado final */}
        {done ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1.5, textAlign: 'center' }}>
            <CheckCircle2 style={{ width: 48, height: 48, color: '#10b981' }} />
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>Importación completada</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>
              {done.created} creados · {done.updated} actualizados · {done.skipped} omitidos
            </Typography>
            {done.errors.length > 0 && (
              <Typography sx={{ fontSize: '0.75rem', color: '#d97706' }}>{done.errors.length} con advertencias</Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Selector de archivo */}
            <Box
              onClick={() => fileRef.current?.click()}
              sx={{
                border: '2px dashed #e5e7eb',
                borderRadius: '12px',
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                cursor: 'pointer',
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': { borderColor: '#a5b4f9', bgcolor: 'rgba(240,253,250,0.3)' },
              }}
            >
              <Upload style={{ width: 28, height: 28, color: '#9ca3af' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                {file ? file.name : 'Haz clic para seleccionar un archivo'}
              </Typography>
              {helpText && <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>{helpText}</Typography>}
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </Box>

            {busy && !preview && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 3, color: '#6b7280' }}>
                <CircularProgress size={16} sx={{ color: 'inherit' }} />
                <Typography sx={{ fontSize: '0.875rem' }}>Analizando archivo…</Typography>
              </Box>
            )}

            {error && (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, borderRadius: '8px', bgcolor: '#fef2f2', border: '1px solid #fecaca', px: 1.5, py: 1, fontSize: '0.875rem', color: '#b91c1c' }}>
                <AlertTriangle style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
                <Box component="span">{error}</Box>
              </Box>
            )}

            {/* Vista previa */}
            {preview && (
              <>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Chip size="small" label={`${preview.created} nuevos`} sx={{ height: 22, fontSize: '0.75rem', fontWeight: 500, bgcolor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }} />
                  <Chip size="small" label={`${preview.updated} actualizar`} sx={{ height: 22, fontSize: '0.75rem', fontWeight: 500, bgcolor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }} />
                  <Chip size="small" label={`${preview.skipped} omitir`} sx={{ height: 22, fontSize: '0.75rem', fontWeight: 500, bgcolor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }} />
                  <Chip size="small" label={`${preview.total} total`} sx={{ height: 22, fontSize: '0.75rem', fontWeight: 500, bgcolor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }} />
                </Box>

                {preview.errors.length > 0 && (
                  <Box sx={{ borderRadius: '8px', bgcolor: '#fffbeb', border: '1px solid #fde68a', px: 1.5, py: 1, fontSize: '0.75rem', color: '#b45309', maxHeight: 112, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {preview.errors.slice(0, 30).map((e, i) => <Box key={i}>• {e}</Box>)}
                    {preview.errors.length > 30 && <Box>… y {preview.errors.length - 30} más</Box>}
                  </Box>
                )}

                <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                  <Box sx={{ maxHeight: 288, overflowY: 'auto' }}>
                    <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: '#f3f4f6' } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={TH_SX}>#</TableCell>
                          <TableCell sx={TH_SX}>Acción</TableCell>
                          {columns.map((c) => (
                            <TableCell key={c.key} sx={TH_SX}>{c.label}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {preview.rows.slice(0, 200).map((r: ImportRow<Record<string, unknown>>, i) => (
                          <TableRow key={i} sx={{ opacity: r.action === 'skip' ? 0.6 : 1 }}>
                            <TableCell sx={{ ...TD_SX, color: '#9ca3af', fontFamily: 'monospace' }}>{r.ref}</TableCell>
                            <TableCell sx={TD_SX}>
                              <Chip
                                size="small"
                                label={ACTION_LABEL[r.action]}
                                sx={{
                                  height: 18,
                                  fontSize: '0.625rem',
                                  fontWeight: 500,
                                  border: '1px solid',
                                  ...ACTION_STYLE[r.action],
                                  '& .MuiChip-label': { px: 0.75 },
                                }}
                              />
                              {r.reason && <Box component="span" sx={{ ml: 0.5, fontSize: '0.625rem', color: '#9ca3af' }}>{r.reason}</Box>}
                            </TableCell>
                            {columns.map((c) => (
                              <TableCell key={c.key} sx={{ ...TD_SX, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.format ? c.format(r.data[c.key]) : fmt(r.data[c.key])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                  {preview.rows.length > 200 && (
                    <Box sx={{ bgcolor: '#f9fafb', px: 1.5, py: 0.75, fontSize: '0.6875rem', color: '#9ca3af', borderTop: '1px solid #e5e7eb' }}>
                      Mostrando 200 de {preview.rows.length} filas
                    </Box>
                  )}
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {done ? (
          <Button
            variant="contained"
            disableElevation
            onClick={handleClose}
            sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}
          >
            Cerrar
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              onClick={handleClose}
              disabled={busy}
              sx={{ textTransform: 'none', borderRadius: '8px', color: '#4b5563', borderColor: '#e5e7eb', '&:hover': { borderColor: '#d1d5db', bgcolor: 'transparent' } }}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              disableElevation
              onClick={onConfirm}
              disabled={busy || !preview || willImport === 0}
              startIcon={busy && preview ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <FileText style={{ width: 16, height: 16 }} />}
              sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' }, '&.Mui-disabled': { bgcolor: '#3658e180', color: '#fff' } }}
            >
              Importar {willImport > 0 ? `(${willImport})` : ''}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function fmt(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return String(v);
  return String(v);
}
