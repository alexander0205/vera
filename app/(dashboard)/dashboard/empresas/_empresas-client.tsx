'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Plus, Check, ArrowRight, Loader2,
  CreditCard, Users, Crown, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Empresa {
  id: number;
  name: string;
  rnc: string | null;
  razonSocial: string | null;
  nombreComercial: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  createdAt: Date;
  role: string;
  logo: string | null;
}

interface Props {
  empresas: Empresa[];
  activeTeamId: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planBadge(planName: string | null, status: string | null) {
  const s = status?.toLowerCase();
  if (!planName || planName.toLowerCase() === 'gratis') {
    return { label: 'Sin plan', color: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
  if (s === 'trialing') {
    return { label: `${planName} · Trial`, color: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (s === 'canceled' || s === 'unpaid') {
    return { label: `${planName} · Cancelado`, color: 'bg-red-50 text-red-700 border-red-200' };
  }
  return {
    label: planName,
    color: planName.toLowerCase() === 'pro'
      ? 'bg-purple-50 text-purple-700 border-purple-200'
      : planName.toLowerCase() === 'business'
        ? 'bg-teal-50 text-teal-700 border-teal-200'
        : 'bg-blue-50 text-blue-700 border-blue-200',
  };
}

function hasActivePlan(planName: string | null, status: string | null) {
  if (!planName || planName.toLowerCase() === 'gratis') return false;
  const s = status?.toLowerCase();
  return s === 'active' || s === 'trialing';
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function EmpresasClient({ empresas, activeTeamId }: Props) {
  const router = useRouter();
  const [showCrear, setShowCrear] = useState(false);
  const [switching, setSwitching] = useState<number | null>(null);

  // Form crear empresa
  const [razonSocial, setRazonSocial]       = useState('');
  const [rnc, setRnc]                       = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [creando, setCreando]               = useState(false);
  const [crearError, setCrearError]         = useState<string | null>(null);

  // ─── Cambiar empresa activa ─────────────────────────────────────────────────

  async function handleSwitch(teamId: number) {
    if (teamId === activeTeamId) return;
    setSwitching(teamId);
    try {
      await fetch('/api/empresa/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      router.push('/dashboard');
      router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  // ─── Crear empresa ──────────────────────────────────────────────────────────

  async function handleCrear() {
    setCrearError(null);
    setCreando(true);
    try {
      const res  = await fetch('/api/empresa', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ razonSocial, rnc, nombreComercial: nombreComercial || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error creando empresa');

      // Empresa creada y ya es la activa → ir a elegir su plan
      router.push('/pricing?new_company=1');
    } catch (e) {
      setCrearError(e instanceof Error ? e.message : 'Error desconocido');
      setCreando(false);
    }
  }

  function resetCrear() {
    setShowCrear(false);
    setRazonSocial('');
    setRnc('');
    setNombreComercial('');
    setCrearError(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-teal-600" />
            Mis empresas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {empresas.length} {empresas.length === 1 ? 'empresa' : 'empresas'} —
            cada una tiene su propio plan y facturación
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white"
          onClick={() => setShowCrear(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva empresa
        </Button>
      </div>

      {/* Lista de empresas */}
      <div className="space-y-3">
        {empresas.map((empresa) => {
          const isActive  = empresa.id === activeTeamId;
          const isOwner   = empresa.role === 'owner';
          const hasPlan   = hasActivePlan(empresa.planName, empresa.subscriptionStatus);
          const badge     = planBadge(empresa.planName, empresa.subscriptionStatus);
          const isLoading = switching === empresa.id;

          return (
            <div
              key={empresa.id}
              className={`relative flex items-center gap-4 p-5 rounded-xl border transition-all ${
                isActive
                  ? 'border-teal-500 bg-teal-50/50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {/* Avatar empresa */}
              {empresa.logo ? (
                <img
                  src={empresa.logo}
                  alt={empresa.razonSocial ?? empresa.name}
                  className="h-12 w-12 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-lg ${
                  isActive ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {(empresa.razonSocial ?? empresa.name)?.[0]?.toUpperCase() ?? 'E'}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 truncate">
                    {empresa.razonSocial ?? empresa.name}
                  </p>
                  {isActive && (
                    <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                      Activa
                    </span>
                  )}
                  {isOwner && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                      <Crown className="h-3 w-3" />
                      Propietario
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {empresa.rnc && (
                    <span className="text-xs text-gray-400 font-mono">
                      RNC {empresa.rnc}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Si no tiene plan y es owner → elegir plan */}
                {isOwner && !hasPlan && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-teal-700 border-teal-300 hover:bg-teal-50 text-xs"
                    onClick={async () => {
                      if (!isActive) {
                        await fetch('/api/empresa/switch', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ teamId: empresa.id }),
                        });
                      }
                      router.push('/pricing?reason=no-plan');
                    }}
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Elegir plan
                  </Button>
                )}

                {/* Si tiene plan y es owner → gestionar */}
                {isOwner && hasPlan && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-500 hover:text-gray-700 text-xs"
                    onClick={async () => {
                      if (!isActive) {
                        await fetch('/api/empresa/switch', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ teamId: empresa.id }),
                        });
                      }
                      router.push('/dashboard/suscripcion');
                    }}
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Suscripción
                  </Button>
                )}

                {/* Cambiar a esta empresa */}
                {!isActive && (
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                    onClick={() => handleSwitch(empresa.id)}
                    disabled={isLoading}
                  >
                    {isLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <>
                          Cambiar
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </>
                    }
                  </Button>
                )}

                {isActive && (
                  <div className="flex items-center gap-1.5 text-teal-600 text-xs font-medium pr-1">
                    <Check className="h-4 w-4" />
                    Usando
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info footer */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-700 space-y-0.5">
          <p className="font-semibold">Cada empresa tiene su propio plan y facturación</p>
          <p>Puedes tener tantas empresas como necesites. Cada una paga su plan de forma independiente.</p>
        </div>
      </div>

      {/* ── Modal: Crear empresa ─────────────────────────────────────────────── */}
      <Dialog open={showCrear} onOpenChange={(o) => { if (!o) resetCrear(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-teal-600" />
              Nueva empresa
            </DialogTitle>
            <DialogDescription>
              Al crear la empresa podrás elegir su plan de inmediato.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4">
            {crearError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {crearError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="razon-social">
                Razón social <span className="text-red-500">*</span>
              </Label>
              <Input
                id="razon-social"
                placeholder="Ej: Soluciones SRL"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                disabled={creando}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rnc">
                RNC <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rnc"
                placeholder="9-11 dígitos"
                value={rnc}
                onChange={(e) => setRnc(e.target.value.replace(/\D/g, ''))}
                maxLength={11}
                disabled={creando}
              />
              <p className="text-xs text-gray-400">Solo números, sin guiones</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nombre-comercial">
                Nombre comercial <span className="text-gray-400 font-normal">(opcional)</span>
              </Label>
              <Input
                id="nombre-comercial"
                placeholder="Nombre que aparece en las facturas"
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value)}
                disabled={creando}
              />
            </div>

            {/* Aviso flujo */}
            <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-lg p-3">
              <CreditCard className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
              <p className="text-xs text-teal-700">
                Al continuar, te redirigiremos a elegir el plan para esta empresa.
                Incluye <strong>15 días de prueba gratis</strong>.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetCrear} disabled={creando}>
              Cancelar
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleCrear}
              disabled={creando || !razonSocial.trim() || rnc.length < 9}
            >
              {creando
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando…</>
                : <>Crear y elegir plan <ArrowRight className="h-4 w-4 ml-2" /></>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </section>
  );
}
