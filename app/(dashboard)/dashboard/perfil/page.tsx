'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Shield, CreditCard, Pencil, Check, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

const PLAN_BADGE: Record<string, { label: string; color: string }> = {
  starter:  { label: 'Starter',  color: 'bg-blue-50 text-blue-700 border-blue-200' },
  business: { label: 'Business', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  pro:      { label: 'Pro',      color: 'bg-purple-50 text-purple-700 border-purple-200' },
};

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function PerfilPage() {
  const [user, setUser] = useState<{ name: string | null; email: string; twoFactorEnabled: boolean } | null>(null);
  const [team, setTeam] = useState<{ planName: string | null; subscriptionStatus: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/user').then(r => r.json()),
      fetch('/api/empresa/list').then(r => r.json()),
    ]).then(([userData, empresaData]) => {
      setUser(userData);
      setNameInput(userData?.name ?? '');
      const active = empresaData?.teams?.find((t: any) => t.id === empresaData.activeTeamId) ?? empresaData?.teams?.[0];
      if (active) setTeam({ planName: active.planName, subscriptionStatus: active.subscriptionStatus ?? null });
    });
  }, []);

  async function saveName() {
    if (!nameInput.trim()) return;
    setLoading(true); setError(''); setSuccess('');
    const res = await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Error al guardar'); setLoading(false); return; }
    setUser(u => u ? { ...u, name: nameInput.trim() } : u);
    setEditing(false);
    setSuccess('Nombre actualizado');
    setLoading(false);
    setTimeout(() => setSuccess(''), 3000);
  }

  function cancelEdit() {
    setNameInput(user?.name ?? '');
    setEditing(false);
    setError('');
  }

  const planKey = (team?.planName ?? '').toLowerCase();
  const planBadge = PLAN_BADGE[planKey];
  const isTrialing = team?.subscriptionStatus === 'trialing';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona tu información personal</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
          <Check className="h-4 w-4 shrink-0" /> {success}
        </div>
      )}

      {/* Avatar + nombre */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="h-16 w-16 rounded-2xl bg-teal-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xl font-bold">
              {user ? getInitials(user.name, user.email) : '…'}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Nombre */}
            <div className="mb-1">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEdit(); }}
                    autoFocus
                    className="border border-teal-400 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 w-56"
                  />
                  <button onClick={saveName} disabled={loading}
                    className="p-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={cancelEdit}
                    className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-gray-900">
                    {user?.name ?? 'Sin nombre'}
                  </span>
                  <button onClick={() => setEditing(true)}
                    className="p-1 rounded-md text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>

            <p className="text-sm text-gray-500">{user?.email}</p>

            {/* Plan badge */}
            {planBadge && (
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${planBadge.color}`}>
                  {planBadge.label}
                </span>
                {isTrialing && (
                  <span className="text-xs text-blue-600 font-medium">· Prueba gratis</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info de cuenta */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y">
        {/* Email */}
        <div className="flex items-center gap-4 p-5">
          <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <Mail className="h-4 w-4 text-gray-500" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Email</p>
            <p className="text-sm text-gray-900 mt-0.5">{user?.email ?? '—'}</p>
          </div>
          <span className="text-xs text-gray-400">Solo lectura</span>
        </div>

        {/* Seguridad */}
        <div className="flex items-center gap-4 p-5">
          <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-gray-500" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Seguridad</p>
            <p className="text-sm text-gray-900 mt-0.5">
              2FA {user?.twoFactorEnabled ? '· Activo' : '· No configurado'}
            </p>
          </div>
          <Link href="/dashboard/security"
            className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
            Gestionar
          </Link>
        </div>

        {/* Plan */}
        <div className="flex items-center gap-4 p-5">
          <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <CreditCard className="h-4 w-4 text-gray-500" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Plan actual</p>
            <p className="text-sm text-gray-900 mt-0.5">
              {team?.planName ?? 'Sin plan'}
              {isTrialing ? ' · Prueba gratis' : ''}
            </p>
          </div>
          <Link href="/dashboard/suscripcion"
            className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
            Ver plan
          </Link>
        </div>
      </div>
    </div>
  );
}
