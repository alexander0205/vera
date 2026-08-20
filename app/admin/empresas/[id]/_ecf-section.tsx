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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface Props {
  teamId: number;
  rnc: string | null;
}

export default async function EcfApiSection({ teamId, rnc }: Props) {
  if (!rnc) {
    return (
      <Box sx={{ bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', p: 2.5, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <AlertTriangle style={{ width: 20, height: 20, color: '#d97706', marginTop: 2, flexShrink: 0 }} />
        <Box>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#78350f' }}>Empresa sin RNC</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#92400e', mt: 0.5 }}>Edita la empresa y agrega un RNC válido para vincular con ecf-api.</Typography>
        </Box>
      </Box>
    );
  }

  let link: Awaited<ReturnType<typeof ensureContribuyenteLink>>;
  try {
    link = await ensureContribuyenteLink(teamId);
  } catch (e) {
    console.error('[EcfApiSection] ensureContribuyenteLink error:', e);
    link = { linked: false, codigoPublico: null, contribuyente: null, autoLinked: false };
  }

  if (!link.linked) {
    return <EcfApiNoLink teamId={teamId} rnc={rnc} />;
  }

  const cp = link.codigoPublico!;
  const contrib = link.contribuyente!;

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
