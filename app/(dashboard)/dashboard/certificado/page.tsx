'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Upload, CheckCircle, AlertTriangle, Loader2, Shield,
  X, Eye, EyeOff, FileKey, Calendar, User, Hash,
  ShieldCheck, ShieldAlert, CloudUpload, RefreshCw, Trash2,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CertInfo {
  tieneCertificado: boolean;
  errorLectura?: boolean;
  titular?:     string;
  vencimiento?: string;
  subject?:     string;
  serial?:      string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

type CertStatus = 'expired' | 'warning' | 'ok';

function getCertStatus(vencimiento?: string): CertStatus {
  if (!vencimiento) return 'ok';
  const diff = new Date(vencimiento).getTime() - Date.now();
  if (diff < 0)            return 'expired';
  if (diff < 90 * 86400e3) return 'warning';
  return 'ok';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerifRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {ok
        ? <CheckCircle style={{ width: 14, height: 14, color: '#0d9488', flexShrink: 0 }} />
        : <AlertTriangle style={{ width: 14, height: 14, color: '#ef4444', flexShrink: 0 }} />
      }
      <Typography variant="caption" sx={{ color: 'text.primary' }}>{label}</Typography>
    </Box>
  );
}

function InfoRow({ icon: Icon, label, value, valueColor = 'text.primary' }: {
  icon: React.ElementType; label: string; value: string; valueColor?: string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <Icon style={{ width: 14, height: 14, color: '#9ca3af', marginTop: 3, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all', color: valueColor }}>{value}</Typography>
      </Box>
    </Box>
  );
}

// ─── Left panel: current cert status ─────────────────────────────────────────

function CertStatusPanel({ certInfo, loading, onReload, onDelete, deleting }: {
  certInfo: CertInfo | null; loading: boolean; onReload: () => void; onDelete: () => void; deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: 'grey.50' }}>
        <CircularProgress size={24} color="primary" />
      </Box>
    );
  }

  if (!certInfo?.tieneCertificado) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, borderRadius: '12px', border: '2px dashed #e5e7eb', bgcolor: 'grey.50', textAlign: 'center', px: 3 }}>
        <FileKey style={{ width: 40, height: 40, color: '#d1d5db', marginBottom: 12 }} />
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>Sin certificado configurado</Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5 }}>Sube tu P12 para poder emitir comprobantes</Typography>
      </Box>
    );
  }

  if (certInfo.errorLectura) {
    return (
      <Alert
        severity="warning"
        icon={<ShieldAlert style={{ width: 18, height: 18 }} />}
        sx={{ borderRadius: '12px' }}
        action={
          <MuiButton size="small" color="warning" onClick={onReload} startIcon={<RefreshCw style={{ width: 12, height: 12 }} />}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
            Reintentar
          </MuiButton>
        }
      >
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>Certificado con problemas</Typography>
        <Typography variant="caption">
          No se pudo leer el certificado. La contraseña guardada puede ser incorrecta o el archivo está dañado.
        </Typography>
      </Alert>
    );
  }

  const status = getCertStatus(certInfo.vencimiento);

  const headerSx = {
    ok:      { bgcolor: '#f0fdfa', borderColor: '#ccfbf1' },
    warning: { bgcolor: '#fffbeb', borderColor: '#fde68a' },
    expired: { bgcolor: '#fef2f2', borderColor: '#fecaca' },
  }[status];

  const iconColor = { ok: '#0d9488', warning: '#d97706', expired: '#dc2626' }[status];
  const titleColor = { ok: '#134e4a', warning: '#92400e', expired: '#991b1b' }[status];
  const statusLabel = { ok: 'Certificado activo', warning: 'Próximo a vencer', expired: 'Certificado vencido' }[status];
  const venceColor = { ok: 'text.primary', warning: '#d97706', expired: '#dc2626' }[status];

  return (
    <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', ...headerSx, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShieldCheck style={{ width: 18, height: 18, color: iconColor, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: titleColor }}>{statusLabel}</Typography>
      </Box>

      <CardContent sx={{ p: '16px 20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {certInfo.titular && <InfoRow icon={User} label="Titular" value={certInfo.titular} />}
        {certInfo.vencimiento && (
          <InfoRow icon={Calendar} label="Vencimiento" value={fmtDate(certInfo.vencimiento)} valueColor={venceColor} />
        )}
        {certInfo.serial && (
          <InfoRow icon={Hash} label="Número de serie" value={certInfo.serial.length > 24 ? certInfo.serial.slice(0, 24) + '…' : certInfo.serial} />
        )}
      </CardContent>

      <Box sx={{ px: 2.5, py: 1.5, bgcolor: 'grey.50', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled' }}>
          Verificaciones
        </Typography>
        <VerifRow ok label="Certificado cargado" />
        <VerifRow ok label="Archivo P12 legible" />
        <VerifRow ok={status !== 'expired'} label="Certificado vigente" />
      </Box>

      <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid #f3f4f6' }}>
        {!confirmDelete ? (
          <MuiButton size="small" variant="text" startIcon={<Trash2 style={{ width: 13, height: 13 }} />}
            onClick={() => setConfirmDelete(true)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
            Eliminar certificado
          </MuiButton>
        ) : (
          <Alert severity="error" sx={{ borderRadius: '8px' }}
            action={
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <MuiButton size="small" color="error" variant="contained" disableElevation onClick={() => { onDelete(); setConfirmDelete(false); }} disabled={deleting}
                  sx={{ textTransform: 'none', fontSize: '0.6875rem', borderRadius: '6px' }}>
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </MuiButton>
                <MuiButton size="small" onClick={() => setConfirmDelete(false)} disabled={deleting}
                  sx={{ textTransform: 'none', fontSize: '0.6875rem' }}>
                  Cancelar
                </MuiButton>
              </Box>
            }
          >
            <Typography variant="caption">¿Eliminar? No podrás emitir hasta cargar uno nuevo.</Typography>
          </Alert>
        )}
      </Box>
    </Card>
  );
}

// ─── Right panel: upload form ─────────────────────────────────────────────────

function UploadForm({ hasCert, onSuccess }: { hasCert: boolean; onSuccess: (info: CertInfo) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file,         setFile]         = useState<File | null>(null);
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dragging,     setDragging]     = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  function handleFile(f: File) {
    if (!f.name.match(/\.(p12|pfx)$/i)) { setError('El archivo debe tener extensión .p12 o .pfx'); return; }
    if (f.size > 1_500_000) { setError('El archivo no puede superar 1.5 MB'); return; }
    setFile(f); setError(null); setSuccess(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !password) return;
    setUploading(true); setError(null); setSuccess(false);
    try {
      const buf    = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res    = await fetch('/api/equipo/certificado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certP12: base64, certPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar el certificado'); return; }
      setSuccess(true); setFile(null); setPassword('');
      onSuccess(data as CertInfo);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = !!file && !!password && !uploading;

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Drop zone */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1, color: 'text.primary' }}>
          Certificado <Box component="span" sx={{ color: 'error.main' }}>*</Box>
        </Typography>

        {!file ? (
          <Box
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              borderRadius: '12px', border: '2px dashed', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 5, px: 3, textAlign: 'center',
              borderColor: dragging ? 'primary.main' : '#e5e7eb',
              bgcolor: dragging ? '#f0fdfa' : 'grey.50',
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'primary.light', bgcolor: 'grey.50' },
            }}
          >
            <CloudUpload style={{ width: 40, height: 40, color: dragging ? '#0d9488' : '#9ca3af' }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>Arrastra el archivo aquí</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>Formato PFX o P12</Typography>
              <MuiButton size="small" variant="text" color="primary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                sx={{ textTransform: 'none', fontSize: '0.75rem', mt: 0.5 }}>
                Selecciónalo desde tu computador
              </MuiButton>
            </Box>
          </Box>
        ) : (
          <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: 'grey.50', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <FileKey style={{ width: 18, height: 18, color: '#0d9488', flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtSize(file.size)}</Typography>
            </Box>
            <IconButton size="small" onClick={() => { setFile(null); setError(null); }} sx={{ flexShrink: 0, color: 'text.secondary' }}>
              <X style={{ width: 14, height: 14 }} />
            </IconButton>
          </Box>
        )}

        <input ref={fileInputRef} type="file" accept=".p12,.pfx" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </Box>

      {/* Password */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1, color: 'text.primary' }}>
          Clave del certificado <Box component="span" sx={{ color: 'error.main' }}>*</Box>
        </Typography>
        <MuiTextField
          type={showPassword ? 'text' : 'password'}
          placeholder="Contraseña del P12"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          size="small"
          fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          slotProps={{
            input: {
              endAdornment: (
                <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end" sx={{ color: 'text.secondary' }}>
                  {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </IconButton>
              ),
            },
          }}
        />
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
          Se usa únicamente para firmar documentos en el servidor
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" icon={<CheckCircle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Certificado guardado correctamente</Typography>
        </Alert>
      )}

      <MuiButton
        type="submit"
        variant="contained"
        color="primary"
        disableElevation
        fullWidth
        disabled={!canSubmit}
        startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <Upload style={{ width: 16, height: 16 }} />}
        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
      >
        {uploading ? 'Guardando...' : hasCert ? 'Reemplazar certificado' : 'Guardar certificado'}
      </MuiButton>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificadoPage() {
  const [certInfo,    setCertInfo]    = useState<CertInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [deleting,    setDeleting]    = useState(false);

  async function loadCertInfo() {
    setLoadingInfo(true);
    try {
      const res  = await fetch('/api/equipo/certificado');
      const data = await res.json();
      setCertInfo(data);
    } catch {
      setCertInfo({ tieneCertificado: false });
    } finally {
      setLoadingInfo(false);
    }
  }

  useEffect(() => { loadCertInfo(); }, []);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch('/api/equipo/certificado', { method: 'DELETE' });
      if (res.ok) setCertInfo({ tieneCertificado: false });
    } catch {
      // silencioso
    } finally {
      setDeleting(false);
    }
  }

  const hasCert = !!certInfo?.tieneCertificado;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Certificado Digital
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Requerido para firmar y emitir comprobantes fiscales electrónicos ante la DGII
        </Typography>
      </Box>

      {/* Layout dos columnas */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 4 }}>

        {/* ── Columna izquierda: estado actual ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
            Estado actual
          </Typography>

          <CertStatusPanel
            certInfo={certInfo}
            loading={loadingInfo}
            onReload={loadCertInfo}
            onDelete={handleDelete}
            deleting={deleting}
          />

          <Card elevation={0} sx={{ border: '1px solid #ccfbf1', bgcolor: '#f0fdfa', borderRadius: '12px' }}>
            <CardContent sx={{ p: '16px !important', display: 'flex', gap: 1.5 }}>
              <Shield style={{ width: 16, height: 16, color: '#0d9488', marginTop: 2, flexShrink: 0 }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#134e4a', mb: 0.5 }}>
                  ¿Cómo obtener el certificado P12?
                </Typography>
                <Typography variant="caption" sx={{ color: '#0f766e', display: 'block', mb: 0.5 }}>
                  Solicitado a entidades autorizadas por INDOTEL:
                </Typography>
                {['Viafirma', 'Cámara de Comercio RD', 'DigiCert'].map(e => (
                  <Typography key={e} variant="caption" sx={{ color: '#0f766e', display: 'block' }}>· {e}</Typography>
                ))}
                <Typography variant="caption" sx={{ color: '#0d9488', display: 'block', mt: 0.75 }}>
                  El archivo debe tener extensión{' '}
                  <Box component="code" sx={{ bgcolor: '#ccfbf1', px: 0.75, borderRadius: 0.5, fontFamily: 'monospace' }}>.p12</Box> o{' '}
                  <Box component="code" sx={{ bgcolor: '#ccfbf1', px: 0.75, borderRadius: 0.5, fontFamily: 'monospace' }}>.pfx</Box>
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* ── Columna derecha: formulario ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
            {hasCert ? 'Reemplazar certificado' : 'Subir certificado'}
          </Typography>
          <UploadForm hasCert={hasCert} onSuccess={setCertInfo} />
        </Box>
      </Box>
    </Box>
  );
}
