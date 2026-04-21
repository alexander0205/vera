'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Upload, CheckCircle, AlertTriangle, Loader2, Shield,
  X, Eye, EyeOff, FileKey, Calendar, User, Hash,
  ShieldCheck, ShieldAlert, CloudUpload, RefreshCw, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CertInfo {
  tieneCertificado: boolean;
  errorLectura?: boolean;
  titular?:     string;
  vencimiento?: string; // ISO string
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
  if (diff < 90 * 86400e3) return 'warning'; // < 90 días
  return 'ok';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerifRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <CheckCircle className="h-4 w-4 text-teal-500 shrink-0" />
        : <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
      }
      <p className="text-xs text-gray-700">{label}</p>
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value, valueClass = 'text-gray-900',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-sm font-medium break-all ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Left panel: current cert status ─────────────────────────────────────────

function CertStatusPanel({
  certInfo,
  loading,
  onReload,
  onDelete,
  deleting,
}: {
  certInfo: CertInfo | null;
  loading: boolean;
  onReload: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (loading) {
    return (
      <div className="flex items-center justify-center h-52 rounded-xl border border-gray-200 bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!certInfo?.tieneCertificado) {
    return (
      <div className="flex flex-col items-center justify-center h-52 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center px-6">
        <FileKey className="h-10 w-10 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Sin certificado configurado</p>
        <p className="text-xs text-gray-400 mt-1">Sube tu P12 para poder emitir comprobantes</p>
      </div>
    );
  }

  if (certInfo.errorLectura) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm font-semibold text-amber-800">Certificado con problemas</p>
        </div>
        <p className="text-xs text-amber-700">
          No se pudo leer el certificado. La contraseña guardada puede ser incorrecta
          o el archivo está dañado. Sube el certificado nuevamente.
        </p>
        <button
          onClick={onReload}
          className="text-xs text-amber-700 underline underline-offset-2 flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Reintentar
        </button>
      </div>
    );
  }

  const status = getCertStatus(certInfo.vencimiento);

  const headerColors = {
    ok:      'bg-teal-50 border-teal-100',
    warning: 'bg-amber-50 border-amber-100',
    expired: 'bg-red-50 border-red-100',
  };
  const iconColors = {
    ok: 'text-teal-600', warning: 'text-amber-500', expired: 'text-red-500',
  };
  const titleColors = {
    ok: 'text-teal-800', warning: 'text-amber-800', expired: 'text-red-800',
  };
  const statusLabels = {
    ok: 'Certificado activo', warning: 'Próximo a vencer', expired: 'Certificado vencido',
  };
  const venceClass = {
    ok: 'text-gray-900', warning: 'text-amber-600', expired: 'text-red-600',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header coloreado según estado */}
      <div className={`px-5 py-4 border-b flex items-center gap-2 ${headerColors[status]}`}>
        <ShieldCheck className={`h-5 w-5 shrink-0 ${iconColors[status]}`} />
        <p className={`text-sm font-semibold ${titleColors[status]}`}>
          {statusLabels[status]}
        </p>
      </div>

      {/* Datos del certificado */}
      <div className="px-5 py-4 space-y-3.5">
        {certInfo.titular && (
          <InfoRow icon={User} label="Titular" value={certInfo.titular} />
        )}
        {certInfo.vencimiento && (
          <InfoRow
            icon={Calendar}
            label="Vencimiento"
            value={fmtDate(certInfo.vencimiento)}
            valueClass={venceClass[status]}
          />
        )}
        {certInfo.serial && (
          <InfoRow
            icon={Hash}
            label="Número de serie"
            value={certInfo.serial.length > 24
              ? certInfo.serial.slice(0, 24) + '…'
              : certInfo.serial}
          />
        )}
      </div>

      {/* Checklist de verificaciones */}
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
          Verificaciones
        </p>
        <VerifRow ok label="Certificado cargado" />
        <VerifRow ok label="Archivo P12 legible" />
        <VerifRow ok={status !== 'expired'} label="Certificado vigente" />
      </div>

      {/* Eliminar certificado */}
      <div className="px-5 py-4 border-t border-gray-100">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar certificado
          </button>
        ) : (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
            <p className="text-xs font-medium text-red-800">
              ¿Eliminar el certificado? No podrás emitir comprobantes hasta cargar uno nuevo.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                {deleting
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Eliminando...</>
                  : <><Trash2 className="h-3 w-3" />Sí, eliminar</>
                }
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-100 text-xs text-gray-600 font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Right panel: upload form ─────────────────────────────────────────────────

function UploadForm({
  hasCert,
  onSuccess,
}: {
  hasCert: boolean;
  onSuccess: (info: CertInfo) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file,         setFile]         = useState<File | null>(null);
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dragging,     setDragging]     = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  function handleFile(f: File) {
    if (!f.name.match(/\.(p12|pfx)$/i)) {
      setError('El archivo debe tener extensión .p12 o .pfx');
      return;
    }
    if (f.size > 1_500_000) {
      setError('El archivo no puede superar 1.5 MB');
      return;
    }
    setFile(f);
    setError(null);
    setSuccess(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !password) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const buf    = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

      const res  = await fetch('/api/equipo/certificado', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ certP12: base64, certPassword: password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Error al guardar el certificado');
        return;
      }

      setSuccess(true);
      setFile(null);
      setPassword('');
      onSuccess(data as CertInfo);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = !!file && !!password && !uploading;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Drop zone / file chip */}
      <div>
        <Label className="text-sm mb-2 block">
          Certificado <span className="text-red-500">*</span>
        </Label>

        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              rounded-xl border-2 border-dashed transition-colors cursor-pointer
              flex flex-col items-center gap-3 py-10 px-6 text-center
              ${dragging
                ? 'border-teal-400 bg-teal-50'
                : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'}
            `}
          >
            <CloudUpload className={`h-10 w-10 ${dragging ? 'text-teal-500' : 'text-gray-400'}`} />
            <div>
              <p className="text-sm font-medium text-gray-700">Arrastra el archivo aquí</p>
              <p className="text-xs text-gray-400 mt-0.5">Formato PFX o P12</p>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-teal-600 hover:text-teal-700 underline-offset-2 hover:underline"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Selecciónalo desde tu computador
              </button>
            </div>
          </div>
        ) : (
          /* Chip del archivo seleccionado */
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
            <FileKey className="h-5 w-5 text-teal-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => { setFile(null); setError(null); }}
              className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".p12,.pfx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Campo contraseña */}
      <div>
        <Label className="text-sm mb-2 block">
          Clave del certificado <span className="text-red-500">*</span>
        </Label>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="Contraseña del P12"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Se usa únicamente para firmar documentos en el servidor
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Éxito */}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 p-3">
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm font-medium text-green-800">
            Certificado guardado correctamente
          </p>
        </div>
      )}

      {/* Botón */}
      <Button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" />
            {hasCert ? 'Reemplazar certificado' : 'Guardar certificado'}
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificadoPage() {
  const [certInfo,     setCertInfo]     = useState<CertInfo | null>(null);
  const [loadingInfo,  setLoadingInfo]  = useState(true);
  const [deleting,     setDeleting]     = useState(false);

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

  function handleUploadSuccess(newInfo: CertInfo) {
    setCertInfo(newInfo);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch('/api/equipo/certificado', { method: 'DELETE' });
      if (res.ok) {
        setCertInfo({ tieneCertificado: false });
      }
    } catch {
      // silencioso — el usuario puede reintentar
    } finally {
      setDeleting(false);
    }
  }

  const hasCert = !!certInfo?.tieneCertificado;

  return (
    <section className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Certificado Digital</h1>
        <p className="text-sm text-gray-500 mt-1">
          Requerido para firmar y emitir comprobantes fiscales electrónicos ante la DGII
        </p>
      </div>

      {/* Layout dos columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Columna izquierda: estado actual ── */}
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Estado actual
          </h2>

          <CertStatusPanel
            certInfo={certInfo}
            loading={loadingInfo}
            onReload={loadCertInfo}
            onDelete={handleDelete}
            deleting={deleting}
          />

          {/* Info: cómo obtener el P12 */}
          <div className="rounded-xl border border-teal-100 bg-teal-50 p-4 flex gap-3">
            <Shield className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
            <div className="text-xs text-teal-800 space-y-1">
              <p className="font-semibold">¿Cómo obtener el certificado P12?</p>
              <p className="text-teal-700">
                Solicitado a entidades autorizadas por INDOTEL:
              </p>
              <ul className="space-y-0.5 text-teal-700 pl-1">
                <li>· Viafirma</li>
                <li>· Cámara de Comercio RD</li>
                <li>· DigiCert</li>
              </ul>
              <p className="text-teal-600 pt-0.5">
                El archivo debe tener extensión{' '}
                <code className="bg-teal-100 px-1 rounded font-mono">.p12</code> o{' '}
                <code className="bg-teal-100 px-1 rounded font-mono">.pfx</code>
              </p>
            </div>
          </div>
        </div>

        {/* ── Columna derecha: formulario de subida ── */}
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {hasCert ? 'Reemplazar certificado' : 'Subir certificado'}
          </h2>

          <UploadForm
            hasCert={hasCert}
            onSuccess={handleUploadSuccess}
          />
        </div>
      </div>
    </section>
  );
}
