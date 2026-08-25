/**
 * Cuánto se tarda en hacer una factura, por colegio y por dónde se hace.
 *
 * Existe para reemplazar el supuesto del argumento comercial. La tabla de la
 * propuesta —«se van 75 horas al mes en cobrar»— salía de minutos estimados
 * sobre volumen real; aquí están los minutos de verdad.
 *
 * SE LEE LA MEDIANA, NUNCA EL PROMEDIO. Es tiempo de pared: del momento en que
 * se abre el formulario al momento en que se guarda, con el café de por medio.
 * Una pestaña olvidada media tarde arrastra la media a un número que no
 * describe a nadie; la mediana ni se entera. El p90 está al lado para ver la
 * cola —«una de cada diez tarda esto»— que es donde vive el trabajo pesado.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Clock, TrendingUp, Users, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

/** RD$ por hora: salario mínimo de empresa mediana con TSS, INFOTEP y regalía. */
const RD_HORA = 180;

type PorColegio = {
  colegio: string; facturas: number;
  medianaMs: number; p90Ms: number; lineasProm: number; msTotales: number;
};
type PorOrigen = { origen: string; facturas: number; medianaMs: number; p90Ms: number };

function seg(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s ? `${m} m ${s} s` : `${m} m`;
}

const rd = (n: number) =>
  `RD$${Math.round(n).toLocaleString('es-DO')}`;

export default async function AdminTiemposPage() {
  const [porColegio, porOrigen, total] = await Promise.all([
    db.execute<PorColegio>(sql`
      select t.name as colegio,
             count(*)::int                                                       as facturas,
             percentile_cont(0.5) within group (order by f.ms)::int              as "medianaMs",
             percentile_cont(0.9) within group (order by f.ms)::int              as "p90Ms",
             round(avg(f.lineas), 1)::float                                      as "lineasProm",
             sum(f.ms)::bigint                                                   as "msTotales"
      from factura_tiempos f
      join teams t on t.id = f.team_id
      where f.created_at >= now() - interval '30 days'
      group by 1 order by facturas desc limit 40`),
    db.execute<PorOrigen>(sql`
      select f.origen,
             count(*)::int                                          as facturas,
             percentile_cont(0.5) within group (order by f.ms)::int as "medianaMs",
             percentile_cont(0.9) within group (order by f.ms)::int as "p90Ms"
      from factura_tiempos f
      where f.created_at >= now() - interval '30 days'
      group by 1 order by facturas desc`),
    db.execute<{ n: number; mediana: number }>(sql`
      select count(*)::int as n,
             coalesce(percentile_cont(0.5) within group (order by ms), 0)::int as mediana
      from factura_tiempos where created_at >= now() - interval '30 days'`),
  ]);

  // `db.execute` en esta versión devuelve el array directo, no `{ rows }`.
  const filas: PorColegio[] = [...porColegio];
  const origenes: PorOrigen[] = [...porOrigen];
  const t = [...total][0] ?? { n: 0, mediana: 0 };

  const ETIQUETA: Record<string, string> = {
    escolar: 'Cajón del colegio', formulario: 'Formulario grande',
    pos: 'Punto de venta', recurrente: 'Factura recurrente',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>
          Tiempo por factura
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 0.5 }}>
          Últimos 30 días. Del momento en que se abre el formulario al momento en que se guarda.
        </Typography>
      </Box>

      {t.n === 0 ? (
        <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 5, textAlign: 'center' }}>
          <Clock size={36} color="#d1d5db" style={{ marginBottom: 12 }} />
          <Typography sx={{ fontWeight: 600, color: '#111827' }}>Todavía no hay mediciones</Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 0.5 }}>
            Se llena solo: cada factura que alguien guarde a partir de ahora deja su tiempo aquí.
          </Typography>
        </Box>
      ) : (
        <>
          {/* Cabecera con lo esencial */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              { icono: Clock, etiqueta: 'Mediana de todas', valor: seg(t.mediana) },
              { icono: TrendingUp, etiqueta: 'Facturas medidas', valor: String(t.n) },
              { icono: Users, etiqueta: 'Empresas midiendo', valor: String(filas.length) },
            ].map((c) => (
              <Box key={c.etiqueta} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#6b7280' }}>
                  <c.icono size={14} />
                  <Typography sx={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {c.etiqueta}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827', mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  {c.valor}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Por dónde se hace */}
          {origenes.length > 0 && (
            <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>
                Por dónde se hace
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {origenes.map((o) => (
                  <Box key={o.origen}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {ETIQUETA[o.origen] ?? o.origen}
                    </Typography>
                    <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                      {seg(o.medianaMs)}
                      <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', ml: 1 }}>
                        p90 {seg(o.p90Ms)} · {o.facturas}
                      </Box>
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Por empresa */}
          <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                <Box component="thead">
                  <Box component="tr" sx={{ bgcolor: '#f9fafb' }}>
                    {['Empresa', 'Facturas', 'Mediana', 'p90', 'Líneas', 'Horas/mes', 'Costo/mes'].map((h, i) => (
                      <Box key={h} component="th" sx={{
                        px: 2, py: 1.25, fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '.04em',
                        textAlign: i === 0 ? 'left' : 'right',
                      }}>{h}</Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {filas.map((f) => {
                    // El costo se calcula con la MEDIANA, no con el total medido:
                    // el total arrastra las pestañas olvidadas y sale un número
                    // que nadie puede defender en una reunión.
                    const horas = (f.facturas * f.medianaMs) / 3_600_000;
                    return (
                      <Box component="tr" key={f.colegio} sx={{ borderTop: '1px solid #f3f4f6' }}>
                        <Box component="td" sx={{ px: 2, py: 1.25, fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                          {f.colegio}
                        </Box>
                        {[
                          String(f.facturas), seg(f.medianaMs), seg(f.p90Ms),
                          String(f.lineasProm), horas.toFixed(1), rd(horas * RD_HORA),
                        ].map((v, i) => (
                          <Box key={i} component="td" sx={{
                            px: 2, py: 1.25, fontSize: '0.875rem', textAlign: 'right',
                            color: i === 5 ? '#111827' : '#4b5563',
                            fontWeight: i === 5 ? 600 : 400,
                            fontVariantNumeric: 'tabular-nums',
                          }}>{v}</Box>
                        ))}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          </Box>
        </>
      )}

      {/* Cómo hay que leer esto. Va en la pantalla y no solo en el código
          porque el número acaba en una propuesta comercial. */}
      <Box sx={{ display: 'flex', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', p: 2 }}>
        <Info size={16} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
        <Typography sx={{ fontSize: '0.8125rem', color: '#1e3a8a', lineHeight: 1.6 }}>
          <strong>Mediana, no promedio.</strong> Es tiempo de pared: incluye que alguien se levante
          por un café a mitad de una factura. Cuatro facturas de dos minutos y una pestaña olvidada
          toda la tarde dan un promedio que no describe a nadie. El <strong>p90</strong> es la cola:
          una de cada diez tarda eso o más. El costo sale de multiplicar la mediana por el número de
          facturas, a {rd(RD_HORA)} la hora — salario mínimo de empresa mediana con sus cargas.
          Nada por encima de 12 horas se guarda.
        </Typography>
      </Box>
    </Box>
  );
}
