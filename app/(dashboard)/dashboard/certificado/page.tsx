'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Upload, CheckCircle, AlertTriangle, Loader2, Shield } from 'lucide-react';

export default function CertificadoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !password) return;

    setLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const res = await fetch('/api/equipo/certificado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certP12: base64, certPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Error al guardar el certificado');
        return;
      }

      setSuccess(true);
      setPassword('');
      setFile(null);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Certificado Digital</h1>
        <p className="text-sm text-gray-500 mt-1">
          Requerido para firmar y emitir comprobantes fiscales electrónicos
        </p>
      </div>

      {/* Info box */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex gap-3">
        <Shield className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-teal-800">
          <p className="font-medium">¿Cómo obtener tu certificado P12?</p>
          <ul className="mt-1 space-y-1 text-teal-700">
            <li>1. Solicítalo a una entidad certificadora autorizada por INDOTEL</li>
            <li>2. Entidades autorizadas: Viafirma, Cámara de Comercio RD, DigiCert</li>
            <li>3. El archivo debe tener extensión <code className="bg-teal-100 px-1 rounded">.p12</code> o <code className="bg-teal-100 px-1 rounded">.pfx</code></li>
          </ul>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <p className="text-sm text-green-800 font-medium">
            Certificado guardado correctamente. Ya puedes emitir comprobantes.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-teal-700" />
            Subir certificado P12
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Archivo de certificado (.p12 / .pfx)</Label>
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
                onClick={() => document.getElementById('cert-file')?.click()}
              >
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-teal-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Haz clic para seleccionar el archivo</p>
                    <p className="text-xs text-gray-400 mt-1">.p12 o .pfx — máx. 1 MB</p>
                  </>
                )}
              </div>
              <input
                id="cert-file"
                type="file"
                accept=".p12,.pfx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="space-y-2">
              <Label>Contraseña del certificado</Label>
              <Input
                type="password"
                placeholder="Contraseña del P12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-gray-400">
                Se almacena de forma segura y solo se usa para firmar documentos en el servidor.
              </p>
            </div>

            <Button
              type="submit"
              disabled={!file || !password || loading}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Guardar certificado
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
