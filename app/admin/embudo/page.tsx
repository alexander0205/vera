/**
 * El embudo de registro: de dónde vienen las empresas nuevas y dónde se quedan.
 *
 * Lo que Google Analytics no puede decir: no cuántas visitas hubo, sino quién
 * creó una cuenta, por qué canal llegó la primera vez y hasta qué paso llegó
 * —verificó el correo, puso el RNC, abrió la prueba, facturó, volvió, pagó—.
 * Las visitas, los clics y las grabaciones están en las herramientas de abajo.
 *
 * Solo empresas fundadas por registro propio. Las de antes de que existiera
 * la cookie de origen salen como «Sin dato».
 */

import { exigirAdmin } from '@/lib/auth/admin-guard';
import { contarEmbudo, pasosAlcanzados, porCanal, registrosDelEmbudo, PASOS_EMBUDO } from '@/lib/analytics/embudo';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const dynamic = 'force-dynamic';

const PERIODOS = [30, 90, 365] as const;

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Santo_Domingo' }) : '—';

const pct = (n: number, de: number) => (de ? `${Math.round((n / de) * 100)} %` : '—');

const celda = { px: 1.25, py: 1, fontSize: '0.8125rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' } as const;
const cabecera = { ...celda, fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', whiteSpace: 'nowrap' } as const;

export default async function AdminEmbudoPage({ searchParams }: { searchParams: Promise<{ dias?: string; internos?: string }> }) {
  await exigirAdmin();   // antes de tocar la base: ver lib/auth/admin-guard.ts
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias) as (typeof PERIODOS)[number]) ? Number(sp.dias) : 90;
  const conInternos = sp.internos === '1';

  const todos = await registrosDelEmbudo(dias);
  // Las cuentas de prueba del propio equipo ensucian el embudo: fuera, salvo que se pidan.
  const filas = conInternos ? todos : todos.filter((r) => !r.interno);
  const embudo = contarEmbudo(filas);
  const canales = porCanal(filas);
  const total = embudo[0]?.n ?? 0;
  const enlace = (d: number, i = conInternos) => `/admin/embudo?dias=${d}${i ? '&internos=1' : ''}`;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: '#111827' }}>
          Embudo de registro
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Empresas creadas por registro propio en los últimos {dias} días, de dónde llegaron y hasta qué paso llegaron.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIODOS.map((d) => (
            <Box key={d} component="a" href={enlace(d)}
              sx={{ px: 1.5, py: 0.5, borderRadius: '999px', fontSize: '0.8125rem', textDecoration: 'none',
                border: '1px solid', borderColor: d === dias ? '#111827' : '#e5e7eb',
                bgcolor: d === dias ? '#111827' : '#fff', color: d === dias ? '#fff' : '#374151' }}>
              {d} días
            </Box>
          ))}
          <Box component="a" href={enlace(dias, !conInternos)}
            sx={{ ml: 1, fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'none' }}>
            {conInternos ? 'Ocultar cuentas internas' : `Incluir cuentas internas (${todos.length - filas.length})`}
          </Box>
        </Box>
      </Box>

      {/* El embudo: cada paso con cuántos llegaron y qué parte del total. */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2.5 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', mb: 1.5 }}>Hasta dónde llegan</Typography>
        {total === 0 ? (
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Ningún registro en este período.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {embudo.map((p, i) => {
              const anterior = i > 0 ? embudo[i - 1].n : p.n;
              return (
                <Box key={p.clave} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '220px 1fr 140px' }, gap: { xs: 0.5, sm: 1.5 }, alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>{p.titulo}</Typography>
                  <Box sx={{ height: 22, bgcolor: '#f3f4f6', borderRadius: '6px', overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${Math.max(2, (p.n / total) * 100)}%`, bgcolor: '#3658e1', borderRadius: '6px' }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>
                    <strong>{p.n}</strong> · {pct(p.n, total)}
                    {i > 0 && anterior > 0 && p.n < anterior && (
                      <Box component="span" sx={{ color: '#b91c1c' }}> (−{anterior - p.n})</Box>
                    )}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Por canal: qué canal trae registros que avanzan, no solo visitas. */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflowX: 'auto' }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', p: 2.5, pb: 1 }}>Por canal de llegada</Typography>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Canal', 'Registros', 'Terminó el alta', 'Usó el sistema', 'Pagando'].map((h) => (
                <Box component="th" key={h} sx={{ ...cabecera, textAlign: h === 'Canal' ? 'left' : 'right' }}>{h}</Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {canales.map((c) => (
              <tr key={c.canal}>
                <Box component="td" sx={celda}>{c.canal}</Box>
                {[c.registros, c.alta, c.uso, c.pagando].map((n, i) => (
                  <Box component="td" key={i} sx={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {n}{i > 0 && c.registros ? <Box component="span" sx={{ color: '#9ca3af' }}> · {pct(n, c.registros)}</Box> : null}
                  </Box>
                ))}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>

      {/* Uno por uno: a quién llamar y dónde se quedó. */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflowX: 'auto' }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', p: 2.5, pb: 1 }}>Registro por registro</Typography>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr>
              {['Fecha', 'Empresa', 'Dueño', 'Canal', 'Entró por', 'Se quedó en', 'Plan', 'Clientes / docs', 'Última entrada'].map((h) => (
                <Box component="th" key={h} sx={{ ...cabecera, textAlign: 'left' }}>{h}</Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => {
              const p = pasosAlcanzados(r);
              const ultimo = [...PASOS_EMBUDO].reverse().find((x) => p[x.clave]);
              const siguiente = PASOS_EMBUDO.find((x) => !p[x.clave]);
              return (
                <tr key={r.teamId}>
                  <Box component="td" sx={{ ...celda, whiteSpace: 'nowrap' }}>{fecha(r.fecha)}</Box>
                  <Box component="td" sx={celda}>
                    <Box component="a" href={`/admin/empresas/${r.teamId}`} sx={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>
                      {r.rnc ? r.empresa : 'Sin RNC todavía'}
                    </Box>
                    {r.interno && <Box component="span" sx={{ ml: 0.75, fontSize: '0.6875rem', color: '#92400e', bgcolor: '#fef3c7', px: 0.75, borderRadius: '4px' }}>interna</Box>}
                    {r.rnc && <Box sx={{ color: '#9ca3af', fontSize: '0.75rem' }}>RNC {r.rnc}</Box>}
                  </Box>
                  <Box component="td" sx={celda}>
                    {r.email}
                    <Box sx={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                      {r.metodo === 'google' ? 'Google' : 'Correo'}{r.verificado ? ' · verificado' : ' · sin verificar'}
                    </Box>
                  </Box>
                  <Box component="td" sx={celda}>
                    {r.canal}
                    <Box sx={{ color: '#9ca3af', fontSize: '0.75rem' }}>{r.detalle}</Box>
                  </Box>
                  <Box component="td" sx={{ ...celda, color: '#6b7280' }}>{r.entrada ?? '—'}</Box>
                  <Box component="td" sx={celda}>
                    {ultimo?.titulo}
                    {siguiente && <Box sx={{ color: '#b91c1c', fontSize: '0.75rem' }}>Falta: {siguiente.titulo.toLowerCase()}</Box>}
                  </Box>
                  <Box component="td" sx={{ ...celda, color: '#6b7280' }}>{r.plan ? `${r.plan} · ${r.estado ?? '—'}` : '—'}</Box>
                  <Box component="td" sx={{ ...celda, fontVariantNumeric: 'tabular-nums' }}>{r.clientes} / {r.documentos}</Box>
                  <Box component="td" sx={{ ...celda, whiteSpace: 'nowrap', color: '#6b7280' }}>{fecha(r.ultimaEntrada)}</Box>
                </tr>
              );
            })}
          </tbody>
        </Box>
      </Box>

      {/* Lo que vive fuera: visitas, clics y grabaciones. */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>Visitas, clics y grabaciones</Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>
          <strong>Google Analytics</strong> — visitas, fuentes, páginas de entrada y los eventos <code>cta_click</code> (botón y sección),
          {' '}<code>sign_up</code>, <code>email_verified</code>, <code>onboarding_step</code>, <code>onboarding_submit</code> y <code>generate_lead</code>.
          {' '}<Box component="a" href="https://analytics.google.com/" target="_blank" rel="noreferrer" sx={{ color: '#2563eb' }}>Abrir</Box>
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>
          <strong>Microsoft Clarity</strong> — mapas de calor, hasta dónde se baja en cada página, clics de rabia y grabaciones.
          {' '}<Box component="a" href="https://clarity.microsoft.com/" target="_blank" rel="noreferrer" sx={{ color: '#2563eb' }}>Abrir</Box>
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>
          <strong>Search Console</strong> — qué se busca en Google para llegar y en qué posición salimos.
          {' '}<Box component="a" href="https://search.google.com/search-console?resource_id=sc-domain:zero.com.do" target="_blank" rel="noreferrer" sx={{ color: '#2563eb' }}>Abrir</Box>
        </Typography>
      </Box>
    </Box>
  );
}
