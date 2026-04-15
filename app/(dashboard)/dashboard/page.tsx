import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  FileText,
  Plus,
  Hash,
  KeyRound,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Package,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getTeamIdForUser, getDashboardStats, getEcfDocuments } from '@/lib/db/queries';
import { TIPOS_ECF } from '@/lib/ecf/types';
import { OnboardingChecklist } from '@/components/onboarding-checklist';

const ESTADO_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACEPTADO:             { label: 'Aceptado',    variant: 'default' },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', variant: 'secondary' },
  EN_PROCESO:           { label: 'En Proceso',  variant: 'outline' },
  RECHAZADO:            { label: 'Rechazado',   variant: 'destructive' },
  BORRADOR:             { label: 'Borrador',    variant: 'outline' },
  ANULADO:              { label: 'Anulado',     variant: 'secondary' },
};

export default async function DashboardPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [stats, recentDocs] = await Promise.all([
    getDashboardStats(teamId),
    getEcfDocuments(teamId, 5),
  ]);

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel Principal</h1>
          {stats.rnc && (
            <p className="text-sm text-gray-500 mt-1">RNC: {stats.rnc}</p>
          )}
        </div>
        <Button asChild className="bg-teal-600 hover:bg-teal-700 rounded-lg">
          <Link href="/dashboard/facturas/nueva">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Factura
          </Link>
        </Button>
      </div>

      <OnboardingChecklist />

      {/* Alertas */}
      {!stats.tieneCertificado && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Certificado digital no configurado
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Para emitir comprobantes necesitas subir tu certificado P12 del INDOTEL.{' '}
              <Link href="/dashboard/certificado" className="underline font-medium">
                Configurar ahora →
              </Link>
            </p>
          </div>
        </div>
      )}

      {stats.secuenciasDisponibles === 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Sin secuencias disponibles</p>
            <p className="text-xs text-red-600 mt-0.5">
              Solicita nuevas secuencias en la Oficina Virtual de la DGII y regístralas en{' '}
              <Link href="/dashboard/secuencias" className="underline font-medium">
                Secuencias NCF →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Ingresos del mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900">
              {(stats.montoMesCentavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">DOP · {stats.facturasMes} comprobante{stats.facturasMes !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total histórico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{stats.facturasTotal}</p>
            <p className="text-xs text-gray-400 mt-1">documentos e-CF</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Secuencias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">
              {stats.secuenciasDisponibles.toLocaleString('es-DO')}
            </p>
            <p className="text-xs text-gray-400 mt-1">disponibles en total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Certificado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mt-1">
              {stats.tieneCertificado ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Activo</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <span className="text-sm font-medium text-amber-700">Pendiente</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">firma digital INDOTEL</p>
          </CardContent>
        </Card>
      </div>

      {/* Últimas facturas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Últimos comprobantes</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/facturas">Ver todos →</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentDocs.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aún no has emitido comprobantes</p>
              <Button asChild size="sm" className="mt-4 bg-teal-600 hover:bg-teal-700">
                <Link href="/dashboard/facturas/nueva">
                  <Plus className="h-4 w-4 mr-2" />
                  Emitir primer comprobante
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {recentDocs.map((doc) => {
                const badge = ESTADO_BADGE[doc.estado] ?? { label: doc.estado, variant: 'outline' as const };
                return (
                  <div key={doc.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{doc.encf}</p>
                      <p className="text-xs text-gray-500">
                        {TIPOS_ECF[doc.tipoEcf as keyof typeof TIPOS_ECF] ?? doc.tipoEcf}
                        {doc.razonSocialComprador && ` · ${doc.razonSocialComprador}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">
                        DOP {(doc.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: '/dashboard/facturas/nueva', icon: Plus, label: 'Nueva Factura', color: 'bg-teal-600 text-white hover:bg-teal-700' },
          { href: '/dashboard/clientes', icon: Users, label: 'Clientes', color: 'bg-white text-gray-700 border hover:bg-gray-50' },
          { href: '/dashboard/productos', icon: Package, label: 'Productos', color: 'bg-white text-gray-700 border hover:bg-gray-50' },
          { href: '/dashboard/secuencias', icon: Hash, label: 'Secuencias', color: 'bg-white text-gray-700 border hover:bg-gray-50' },
        ].map((action) => (
          <Link key={action.href} href={action.href}>
            <div className={`flex flex-col items-center gap-2 p-4 rounded-xl text-center cursor-pointer transition-colors ${action.color}`}>
              <action.icon className="h-5 w-5" />
              <span className="text-sm font-medium">{action.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
