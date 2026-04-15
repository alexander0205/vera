'use client';
import { useState, useEffect } from 'react';
import { Shield, Smartphone, Key, AlertTriangle, Check, Copy } from 'lucide-react';

export default function SecurityPage() {
  const [user, setUser] = useState<{ twoFactorEnabled: boolean; emailVerified: boolean; email: string } | null>(null);
  const [qrUri, setQrUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser);
  }, []);

  async function startSetup() {
    const res = await fetch('/api/auth/2fa/setup');
    const data = await res.json();
    setSecret(data.secret);
    setQrUri(data.uri);
    setSetupMode(true);
  }

  async function verifyAndEnable() {
    setLoading(true); setError('');
    const res = await fetch('/api/auth/2fa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setSetupMode(false);
    setSuccess('2FA activado correctamente');
    setUser(u => u ? { ...u, twoFactorEnabled: true } : u);
    setLoading(false);
  }

  async function disable2FA() {
    setLoading(true); setError('');
    const res = await fetch('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: disablePassword }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setDisableMode(false);
    setSuccess('2FA desactivado');
    setUser(u => u ? { ...u, twoFactorEnabled: false } : u);
    setLoading(false);
  }

  async function sendVerification() {
    await fetch('/api/auth/send-verification', { method: 'POST' });
    setSuccess('Email de verificación enviado. Revisa tu bandeja de entrada.');
  }

  function copySecret() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Seguridad</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona la seguridad de tu cuenta</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
          <Check className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Email verification */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
              <Shield className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Verificación de email</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {user?.email}
              </p>
            </div>
          </div>
          {user?.emailVerified ? (
            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
              <Check className="h-3 w-3" /> Verificado
            </span>
          ) : (
            <button onClick={sendVerification}
              className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
              Enviar verificación
            </button>
          )}
        </div>
      </div>

      {/* 2FA */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Autenticación en dos pasos (2FA)</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {user?.twoFactorEnabled
                  ? 'Activa — tu cuenta está protegida con TOTP'
                  : 'Usa una app como Google Authenticator o Authy'}
              </p>
            </div>
          </div>
          {user?.twoFactorEnabled ? (
            <button onClick={() => setDisableMode(true)}
              className="text-xs text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
              Desactivar
            </button>
          ) : (
            <button onClick={startSetup}
              className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
              Activar 2FA
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        {setupMode && (
          <div className="space-y-4 border-t pt-4">
            <p className="text-sm text-gray-700 font-medium">1. Escanea el código QR con tu app de autenticación</p>
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUri)}`}
                alt="QR Code 2FA"
                className="border rounded-lg"
                width={140}
                height={140}
              />
              <div>
                <p className="text-xs text-gray-500 mb-2">O ingresa este código manualmente:</p>
                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 rounded px-2 py-1 text-xs font-mono break-all">{secret}</code>
                  <button onClick={copySecret} className="text-gray-400 hover:text-gray-600">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-700 font-medium">2. Ingresa el código de 6 dígitos</p>
            <div className="flex gap-3">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 font-mono text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
                maxLength={6}
              />
              <button onClick={verifyAndEnable} disabled={loading || code.length !== 6}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {loading ? 'Verificando...' : 'Activar 2FA'}
              </button>
              <button onClick={() => setSetupMode(false)}
                className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {disableMode && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Desactivar 2FA reduce la seguridad de tu cuenta
            </div>
            <div className="flex gap-3">
              <input type="password" value={disablePassword}
                onChange={e => setDisablePassword(e.target.value)}
                placeholder="Confirma tu contraseña"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button onClick={disable2FA} disabled={loading}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {loading ? 'Desactivando...' : 'Desactivar'}
              </button>
              <button onClick={() => setDisableMode(false)}
                className="text-gray-500 px-3 py-2 rounded-lg text-sm hover:bg-gray-100">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change password link */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
            <Key className="h-5 w-5 text-teal-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Contraseña</p>
            <p className="text-xs text-gray-500">Cambia tu contraseña regularmente</p>
          </div>
          <a href="/forgot-password" className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
            Cambiar
          </a>
        </div>
      </div>
    </div>
  );
}
