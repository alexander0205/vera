'use client';

import { useEffect, useState } from 'react';
import { Plus, Copy, Check, Loader2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import { fmtFechaHora } from '@/lib/utils/format';

interface ApiKeyRow {
  id: number;
  nombre: string;
  keyPrefix: string;
  permisos: string;
  ultimoUsoAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [porRevocar, setPorRevocar] = useState<ApiKeyRow | null>(null);
  const [revocando, setRevocando] = useState(false);
  const [revocarError, setRevocarError] = useState<string | null>(null);

  function cargarKeys() {
    fetch('/api/api-keys')
      .then((r) => r.json())
      .then((data: ApiKeyRow[]) => setKeys(data))
      .catch(() => setLoadError('No se pudo cargar la lista de keys'));
  }

  useEffect(() => {
    cargarKeys();
  }, []);

  function abrirCrear() {
    setNombre('');
    setCreateError(null);
    setRawKey(null);
    setDialogOpen(true);
  }

  async function handleCrear() {
    setCreating(true);
    setCreateError(null);
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, permisos: 'read' }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setCreateError(data.error ?? 'No se pudo crear la key');
      return;
    }
    setRawKey(data.rawKey);
  }

  function copyRawKey() {
    if (!rawKey) return;
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function cerrarDialogCrear() {
    setDialogOpen(false);
    setRawKey(null);
    cargarKeys();
  }

  async function handleRevocar() {
    if (!porRevocar) return;
    setRevocando(true);
    setRevocarError(null);
    const res = await fetch(`/api/api-keys/${porRevocar.id}`, { method: 'DELETE' });
    setRevocando(false);
    if (!res.ok) {
      setRevocarError('No se pudo revocar la key');
      return;
    }
    setKeys((prev) => (prev ? prev.filter((k) => k.id !== porRevocar.id) : prev));
    setPorRevocar(null);
  }

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1">
            Keys de solo lectura para conectar herramientas externas (ej. un asistente de IA) a tu cuenta.
          </p>
        </div>
        <Button className="bg-zero-600 hover:bg-zero-700" onClick={abrirCrear}>
          <Plus className="h-4 w-4 mr-2" />Crear key
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Keys activas</h2>
            {keys && (
              <Badge variant="outline" className="text-zero-700 border-zero-200 bg-zero-50">
                {keys.length} key{keys.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {loadError ? (
            <div className="text-center py-16">
              <KeyRound className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-red-600 font-medium">{loadError}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => { setLoadError(null); cargarKeys(); }}>
                Reintentar
              </Button>
            </div>
          ) : keys === null ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
          ) : keys.length === 0 ? (
            <div className="text-center py-16">
              <KeyRound className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Aún no has creado ninguna key</p>
              <Button className="mt-4 bg-zero-600 hover:bg-zero-700" size="sm" onClick={abrirCrear}>
                <Plus className="h-4 w-4 mr-1" />Crear key
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">Prefijo</th>
                    <th className="px-3 py-2 font-medium">Creada</th>
                    <th className="px-3 py-2 font-medium">Último uso</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{k.nombre}</td>
                      <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{k.keyPrefix}…</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtFechaHora(k.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtFechaHora(k.ultimoUsoAt)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Button variant="outline" size="sm" onClick={() => { setPorRevocar(k); setRevocarError(null); }}>
                          Revocar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Crear key */}
      <Dialog open={dialogOpen} onOpenChange={(o: boolean) => { if (!o) cerrarDialogCrear(); }}>
        <DialogContent className="max-w-md">
          {rawKey ? (
            <>
              <ModalHeader title="Key creada" subtitle="Copia el valor ahora — no se vuelve a mostrar." />
              <div className="space-y-4 px-6 py-4">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <code className="flex-1 break-all font-mono text-xs">{rawKey}</code>
                  <button
                    type="button"
                    onClick={copyRawKey}
                    className={`shrink-0 ${copied ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                    aria-label="Copiar key"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <DialogFooter>
                <Button className="bg-zero-600 hover:bg-zero-700" onClick={cerrarDialogCrear}>Listo</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <ModalHeader title="Crear key" subtitle="Solo lectura. Podrás revocarla cuando quieras." />
              <div className="space-y-4 px-6 py-4">
                {createError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{createError}</div>
                )}
                <div className="space-y-1.5">
                  <Label>Nombre</Label>
                  <Input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Asistente de IA"
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>Cancelar</Button>
                <Button
                  className="bg-zero-600 hover:bg-zero-700"
                  onClick={handleCrear}
                  disabled={creating || nombre.trim().length === 0}
                >
                  {creating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creando…</> : 'Crear'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revocar */}
      <Dialog open={porRevocar !== null} onOpenChange={(o: boolean) => { if (!o) setPorRevocar(null); }}>
        <DialogContent className="max-w-md">
          <ModalHeader title="Revocar key" subtitle="Cualquier integración que la use dejará de funcionar de inmediato." />
          <div className="space-y-4 px-6 py-4">
            {revocarError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{revocarError}</div>
            )}
            {porRevocar && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                <p className="font-medium text-gray-900">{porRevocar.nombre}</p>
                <p className="text-gray-600 font-mono text-xs">{porRevocar.keyPrefix}…</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPorRevocar(null)} disabled={revocando}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleRevocar} disabled={revocando}>
              {revocando ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Revocando…</> : 'Revocar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
