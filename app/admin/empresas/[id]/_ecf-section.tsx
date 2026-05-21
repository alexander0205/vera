import {
  certificados,
  ncfRangos,
  dgiiStatus,
  emision,
  me,
  EcfApiError,
} from '@/lib/ecf-api/client';
import { ensureContribuyenteLink } from '@/lib/ecf-api/sync';
import { EcfApiTabs, EcfApiNoLink } from './_ecf-tabs';
import { AlertTriangle } from 'lucide-react';

interface Props {
  teamId: number;
  rnc: string | null;
}

export default async function EcfApiSection({ teamId, rnc }: Props) {
  if (!rnc) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Empresa sin RNC</p>
          <p className="text-xs text-amber-700 mt-1">Edita la empresa y agrega un RNC válido para vincular con ecf-api.</p>
        </div>
      </div>
    );
  }

  const link = await ensureContribuyenteLink(teamId);

  if (!link.linked) {
    return <EcfApiNoLink teamId={teamId} rnc={rnc} />;
  }

  const cp = link.codigoPublico!;
  const contrib = link.contribuyente!;

  // Cargar data en paralelo, tolerando errores parciales
  const [certs, rangos, status, emisiones, meData] = await Promise.all([
    safeCall(() => certificados.list(cp)),
    safeCall(() => ncfRangos.list(cp)),
    safeCall(() => dgiiStatus.get(cp)),
    safeCall(() => emision.list(cp, 50)),
    safeCall(() => me()),
  ]);

  return (
    <EcfApiTabs
      teamId={teamId}
      autoLinked={link.autoLinked}
      contrib={contrib}
      certs={certs}
      rangos={rangos}
      status={status}
      emisiones={emisiones}
      meData={meData}
    />
  );
}

async function safeCall<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof EcfApiError) {
      console.error('[EcfApiSection]', e.status, e.message);
    } else {
      console.error('[EcfApiSection]', e);
    }
    return null;
  }
}
