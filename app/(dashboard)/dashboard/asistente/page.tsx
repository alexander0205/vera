import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { ThumbsDown, ThumbsUp, Sparkles } from 'lucide-react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { db } from '@/lib/db/drizzle';
import { asistenteConversaciones, asistenteMensajes, users } from '@/lib/db/schema';
import { evaluarAcceso } from '@/lib/asistente/acceso';
import { emparejar } from '@/lib/asistente/bitacora';
import { MOTIVOS_VALORACION, type MotivoValoracion } from '@/lib/asistente/casos';

/**
 * Historial del asistente: quién preguntó qué y qué se le contestó, para la
 * empresa. Solo dueños y administradores (los mismos que pueden usarlo).
 */

const DIAS = [7, 30, 90];
const MAX_FILAS = 200;

export default async function AsistenteHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; solo?: string; usuario?: string }>;
}) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) redirect('/dashboard');
  const { teamId } = acceso;

  const sp = await searchParams;
  const dias = DIAS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const soloMal = sp.solo === 'mal';
  const usuarioId = Number.isInteger(Number(sp.usuario)) && Number(sp.usuario) > 0 ? Number(sp.usuario) : null;
  const desde = new Date(Date.now() - dias * 86_400_000);

  const preguntasDb = await db.select({
    id: asistenteMensajes.id, conversacionId: asistenteMensajes.conversacionId, contenido: asistenteMensajes.contenido,
    creadoEn: asistenteMensajes.creadoEn, usuarioId: asistenteConversaciones.userId, usuario: users.name, correo: users.email,
  }).from(asistenteMensajes)
    .innerJoin(asistenteConversaciones, eq(asistenteConversaciones.id, asistenteMensajes.conversacionId))
    .innerJoin(users, eq(users.id, asistenteConversaciones.userId))
    .where(and(
      eq(asistenteConversaciones.teamId, teamId),
      eq(asistenteMensajes.rol, 'user'),
      gte(asistenteMensajes.creadoEn, desde),
      ...(usuarioId ? [eq(asistenteConversaciones.userId, usuarioId)] : []),
    ))
    .orderBy(desc(asistenteMensajes.id))
    .limit(MAX_FILAS);

  const conversaciones = [...new Set(preguntasDb.map((p) => p.conversacionId))];
  const respuestasDb = conversaciones.length
    ? await db.select({
      id: asistenteMensajes.id, conversacionId: asistenteMensajes.conversacionId, contenido: asistenteMensajes.contenido,
      herramientas: asistenteMensajes.herramientas, valoracion: asistenteMensajes.valoracion, valoracionMotivo: asistenteMensajes.valoracionMotivo,
    }).from(asistenteMensajes)
      .where(and(inArray(asistenteMensajes.conversacionId, conversaciones), eq(asistenteMensajes.rol, 'assistant')))
    : [];

  const todas = emparejar(
    preguntasDb.map((p) => ({ ...p, usuario: p.usuario ?? p.correo })),
    respuestasDb.map((r) => ({ ...r, herramientas: r.herramientas ?? null })),
  );
  const filas = soloMal ? todas.filter((f) => f.valoracion === -1) : todas;

  const personas = new Map<number, string>();
  for (const p of preguntasDb) personas.set(p.usuarioId, p.usuario ?? p.correo);
  const util = todas.filter((f) => f.valoracion === 1).length;
  const mal = todas.filter((f) => f.valoracion === -1).length;

  const href = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | null> = {
      dias: String(dias), solo: soloMal ? 'mal' : null, usuario: usuarioId ? String(usuarioId) : null, ...cambios,
    };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    return `/dashboard/asistente?${q.toString()}`;
  };

  const chip = (activo: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 999, fontSize: 13, textDecoration: 'none', border: '1px solid #e5e7eb',
    color: activo ? '#fff' : 'inherit', background: activo ? '#3658e1' : 'transparent',
  });

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200 }}>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Historial del asistente</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Qué le han preguntado al asistente en esta empresa y qué respondió. Visible solo para dueños y administradores.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
        {DIAS.map((d) => (
          <Link key={d} href={href({ dias: String(d) })} style={chip(d === dias)}>Últimos {d} días</Link>
        ))}
        <Link href={href({ solo: soloMal ? null : 'mal' })} style={chip(soloMal)}>Solo las que no sirvieron</Link>
        {[...personas.entries()].length > 1 && [...personas.entries()].map(([id, nombre]) => (
          <Link key={id} href={href({ usuario: usuarioId === id ? null : String(id) })} style={chip(usuarioId === id)}>{nombre}</Link>
        ))}
        <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
          {todas.length} pregunta{todas.length === 1 ? '' : 's'} · {util} útil{util === 1 ? '' : 'es'} · {mal} no sirvieron
          {todas.length >= MAX_FILAS ? ' · mostrando las 200 más recientes' : ''}
        </Typography>
      </Box>

      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        {filas.length === 0 ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <Sparkles style={{ width: 40, height: 40, color: '#e5e7eb', margin: '0 auto 12px' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {soloMal ? 'No hay respuestas marcadas como no útiles en este período.' : 'Todavía no hay preguntas al asistente en este período.'}
            </Typography>
          </Box>
        ) : filas.map((f, i) => (
          <Box key={f.id}>
            {i > 0 && <Divider sx={{ mx: 2 }} />}
            <Box sx={{ display: 'flex', gap: 2, px: 2.5, py: 1.75 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', overflowWrap: 'anywhere' }}>{f.pregunta}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, overflowWrap: 'anywhere' }}>
                  {f.respuesta ?? 'Sin respuesta registrada.'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>
                  {f.usuario} · {f.fecha.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                  {f.consultas.length ? ` · Consultó: ${f.consultas.join(', ')}` : ''}
                </Typography>
              </Box>
              <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 0.75, color: 'text.secondary' }}>
                {f.valoracion === 1 && <ThumbsUp size={16} color="#16a34a" aria-label="Útil" />}
                {f.valoracion === -1 && (
                  <>
                    <ThumbsDown size={16} color="#dc2626" aria-label="No sirvió" />
                    {f.motivo && <Typography variant="caption">{MOTIVOS_VALORACION[f.motivo as MotivoValoracion] ?? f.motivo}</Typography>}
                  </>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </Card>

      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>
        Los textos se conservan 180 días. Datos sensibles como tarjetas o llaves aparecen enmascarados.
      </Typography>
    </Box>
  );
}
