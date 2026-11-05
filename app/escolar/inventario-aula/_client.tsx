'use client';

/**
 * Inventario por aula: cuatro tarjetas (invertido, vale hoy, por estudiante, por
 * reponer) y la tabla de aulas. Cada fila lleva al detalle del aula. Los números
 * vienen calculados del servidor (`resumirInventario`).
 */

import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { ChevronRight } from 'lucide-react';
import type { ResumenInventario, TotalesAula } from '@/lib/escolar/inventario-aula';
import { labelTipoEspacio } from '@/lib/escolar/inventario-aula';
import { fmtDOP, fmtDOPCorto, fmtNumero } from './_formato';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Box sx={{ ...CARD, p: 2, flex: '1 1 200px', minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{titulo}</Typography>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>{valor}</Typography>
      {nota && <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>{nota}</Typography>}
    </Box>
  );
}

export type SeccionesDeAula = { [espacioId: number]: string[] };

export function InventarioAulaClient({ resumen, secciones = {} }: { resumen: Pick<ResumenInventario, 'tarjetas' | 'aulas' | 'sinAula'>; secciones?: SeccionesDeAula }) {
  const { tarjetas, aulas, sinAula } = resumen;
  const filas: TotalesAula[] = sinAula ? [...aulas, sinAula] : aulas;

  const celda = { fontSize: '0.8125rem', color: '#374151', px: 1.5, py: 1.25 } as const;
  const celdaMonto = { ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;
  const th = { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', px: 1.5, py: 1 } as const;

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>Inventario por aula</Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Qué hay en cada aula, cuánto se invirtió, cuánto vale hoy y qué toca reponer.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Tarjeta titulo="Invertido en total" valor={fmtDOPCorto(tarjetas.invertidoCents)} nota="Lo que costó todo lo del inventario" />
        <Tarjeta titulo="Vale hoy" valor={fmtDOPCorto(tarjetas.valeHoyCents)} nota="Costo menos lo ya depreciado" />
        <Tarjeta
          titulo="Por estudiante"
          valor={tarjetas.porEstudianteCents == null ? '—' : fmtDOPCorto(tarjetas.porEstudianteCents)}
          nota={tarjetas.estudiantes > 0 ? `Entre ${fmtNumero(tarjetas.estudiantes)} estudiantes matriculados` : 'No hay estudiantes matriculados'}
        />
        <Tarjeta
          titulo="Por reponer en 12 meses"
          valor={fmtDOPCorto(tarjetas.porReponerCents)}
          nota={tarjetas.unidadesPorReponer > 0 ? `${fmtNumero(tarjetas.unidadesPorReponer)} ${tarjetas.unidadesPorReponer === 1 ? 'unidad' : 'unidades'} por vencer o dañadas` : 'Nada por vencer'}
        />
      </Box>

      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <Box component="thead" sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <Box component="tr">
                <Box component="th" sx={{ ...th, textAlign: 'left' }}>Aula</Box>
                <Box component="th" sx={{ ...th, textAlign: 'left' }}>Secciones que la usan</Box>
                <Box component="th" sx={{ ...th, textAlign: 'right' }}>Unidades</Box>
                <Box component="th" sx={{ ...th, textAlign: 'right' }}>Vale hoy</Box>
                <Box component="th" sx={{ ...th, textAlign: 'right' }}>Por estudiante</Box>
                <Box component="th" sx={th} />
              </Box>
            </Box>
            <Box component="tbody">
              {filas.map((a) => {
                const href = `/escolar/inventario-aula/${a.espacioId ?? 'sin-aula'}`;
                const chips = a.espacioId != null ? secciones[a.espacioId] ?? [] : [];
                return (
                  <Box component="tr" key={a.espacioId ?? 'sin-aula'} sx={{ borderBottom: '1px solid #f3f4f6', '&:hover': { bgcolor: '#f9fafb' } }}>
                    <Box component="td" sx={celda}>
                      <Link href={href} style={{ fontWeight: 600, color: '#111827' }}>{a.nombre}</Link>
                      {a.espacioId != null && a.tipo !== 'aula' && (
                        <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af' }}>{labelTipoEspacio(a.tipo)}</Typography>
                      )}
                      {a.unidadesPorReponer > 0 && (
                        <Chip label={`${fmtNumero(a.unidadesPorReponer)} por reponer`} size="small" sx={{ mt: 0.5, height: 20, fontSize: '0.6875rem', bgcolor: '#fef3c7', color: '#92400e' }} />
                      )}
                    </Box>
                    <Box component="td" sx={celda}>
                      {a.espacioId == null ? (
                        <Typography component="span" sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Activos que todavía no tienen aula</Typography>
                      ) : chips.length === 0 ? '—' : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {chips.map((c) => <Chip key={c} label={c} size="small" sx={{ height: 22, fontSize: '0.75rem', bgcolor: '#eef2ff', color: '#3730a3' }} />)}
                        </Box>
                      )}
                    </Box>
                    <Box component="td" sx={celdaMonto}>{fmtNumero(a.unidades)}</Box>
                    <Box component="td" sx={{ ...celdaMonto, fontWeight: 600, color: '#111827' }}>{fmtDOP(a.valeHoyCents)}</Box>
                    <Box component="td" sx={celdaMonto}>{a.porEstudianteCents == null ? '—' : fmtDOP(a.porEstudianteCents)}</Box>
                    <Box component="td" sx={{ ...celda, textAlign: 'right' }}>
                      <Link href={href} aria-label={`Ver ${a.nombre}`}><ChevronRight style={{ width: 16, height: 16, color: '#9ca3af' }} /></Link>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
        Lo marcado «Solo control» se cuenta en unidades pero no suma a lo invertido ni a lo que vale hoy: no se deprecia.
      </Typography>
    </Box>
  );
}
