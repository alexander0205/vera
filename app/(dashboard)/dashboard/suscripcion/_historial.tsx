'use client';

/**
 * Historial de pagos — los cobros de la suscripción, tal como los tiene Stripe.
 *
 * Lo que se descarga aquí es la FACTURA DE STRIPE, no un comprobante fiscal
 * dominicano. Un cobro de suscripción no emite e-CF: el webhook no crea
 * ninguno y no hay nada en el sistema que lo haga. Por eso no hay columna de
 * NCF y el pie lo dice con todas las letras — prometer una «Factura de Crédito
 * Fiscal» aquí sería mandar al cliente a buscar un documento que no existe, y
 * enterarse delante de su contador.
 *
 * Recibe las filas YA formateadas desde el servidor. Fechas y montos se pintan
 * allí a propósito: formatearlos en el cliente los deja a merced de la zona
 * horaria del navegador y sale un desajuste de hidratación en cada fila.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { Download, Info, ExternalLink } from 'lucide-react';

import type { CobroDelHistorial } from '@/lib/payments/stripe';
import {
  GRIS, ROJO, AMBAR, VERDE, TINTA, BORDE, BORDE_TENUE, FILA_BORDE,
  FONDO_TENUE, TEXTO_SUAVE, NAVY, RADIO,
} from './_paleta';

/** Una fila lista para pintar: sin números crudos ni epochs. */
export interface CobroVista {
  id: string;
  fecha: string;
  concepto: string;
  detalle: string | null;
  monto: string;
  estado: CobroDelHistorial['estado'];
  pdfUrl: string | null;
  urlDePago: string | null;
}

export interface TarjetaResumen {
  etiqueta: string;
  valor: string;
  pie: string;
  /** Solo para el de rechazados, que se pone ámbar cuando hay alguno. */
  alerta?: boolean;
}

const ESTADO: Record<CobroDelHistorial['estado'], { texto: string; color: string; fondo: string }> = {
  'pagada':    { texto: 'Pagado',    color: VERDE, fondo: '#dff5e9' },
  'fallida':   { texto: 'Rechazado', color: ROJO,  fondo: '#fdecec' },
  'abierta':   { texto: 'Pendiente', color: AMBAR, fondo: '#fff4e0' },
  'sin-cobro': { texto: 'Sin cobro', color: GRIS,  fondo: '#edeff5' },
};

const FILTROS = [
  { id: 'todas',    texto: 'Todos' },
  { id: 'pagadas',  texto: 'Pagados' },
  { id: 'fallidas', texto: 'Rechazados' },
] as const;

type Filtro = (typeof FILTROS)[number]['id'];

/** Las mismas columnas arriba y en cada fila; si se tocan, se tocan aquí. */
const REJILLA = { xs: '1fr', sm: '104px minmax(150px,1fr) 100px 96px 40px' };

export function Historial({
  cobros, resumen, sinCliente,
}: {
  cobros: CobroVista[];
  resumen: TarjetaResumen[];
  /**
   * El team no tiene cliente en Stripe.
   *
   * Cambia el vacío, y la diferencia importa: sin cliente es seguro que nunca
   * hubo un cobro. CON cliente, `historialDeCobros` devuelve [] tanto si no hay
   * facturas como si Stripe no respondió, así que ahí no se puede afirmar que
   * no haya nada — solo que no encontramos nada.
   */
  sinCliente: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const visibles = cobros.filter(c =>
    filtro === 'todas' ? true
    : filtro === 'pagadas' ? c.estado === 'pagada'
    : c.estado === 'fallida',
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {resumen.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {resumen.map(r => (
            <Box key={r.etiqueta} sx={{ border: `1px solid ${BORDE}`, bgcolor: '#fff', borderRadius: '14px', p: '15px 18px' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: GRIS }}>
                {r.etiqueta}
              </Typography>
              <Typography sx={{ fontSize: '1.3125rem', fontWeight: 700, letterSpacing: '-.4px', mt: 0.875, color: r.alerta ? AMBAR : TINTA }}>
                {r.valor}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: GRIS, mt: 0.5 }}>{r.pie}</Typography>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ borderRadius: RADIO, border: `1px solid ${BORDE}`, bgcolor: '#fff', overflow: 'hidden' }}>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '14px 20px', borderBottom: `1px solid ${BORDE_TENUE}`, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {FILTROS.map(f => {
              const on = filtro === f.id;
              return (
                <Button key={f.id} onClick={() => setFiltro(f.id)} disableElevation
                  sx={{
                    height: 30, minWidth: 0, px: 1.5, borderRadius: '8px', textTransform: 'none',
                    fontSize: '0.78rem', fontWeight: 600, border: `1px solid ${on ? NAVY : '#d7dae5'}`,
                    bgcolor: on ? NAVY : '#fff', color: on ? '#fff' : '#3b4252',
                    '&:hover': { bgcolor: on ? '#0c2059' : '#f7f9ff', borderColor: NAVY },
                  }}>
                  {f.texto}
                </Button>
              );
            })}
          </Box>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: '0.78rem', color: GRIS }}>
            {visibles.length === 1 ? '1 movimiento' : `${visibles.length} movimientos`}
          </Typography>
        </Box>

        {cobros.length === 0 ? (
          <Vacio sinCliente={sinCliente} />
        ) : visibles.length === 0 ? (
          <Box sx={{ p: '36px 20px', textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: GRIS }}>
              No hay cobros {filtro === 'pagadas' ? 'pagados' : 'rechazados'} en tu historial.
            </Typography>
          </Box>
        ) : (
          <>
            {/* La cabecera se esconde en móvil: a ese ancho la fila deja de ser
                una tabla y pasa a ser una tarjeta apilada, y unos títulos de
                columna sueltos encima de tarjetas no encabezan nada. */}
            <Box sx={{
              display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: REJILLA,
              alignItems: 'center', p: '10px 20px', borderBottom: `1px solid ${BORDE_TENUE}`,
              bgcolor: FONDO_TENUE, fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '.4px', textTransform: 'uppercase', color: GRIS,
            }}>
              <Box>Fecha</Box>
              <Box>Concepto</Box>
              <Box sx={{ textAlign: 'right' }}>Monto</Box>
              <Box sx={{ textAlign: 'right' }}>Estado</Box>
              <Box />
            </Box>

            {visibles.map(c => {
              const e = ESTADO[c.estado];
              return (
                <Box key={c.id} sx={{
                  display: 'grid', gridTemplateColumns: REJILLA, alignItems: 'center',
                  gap: { xs: 0.5, sm: 0 }, p: '13px 20px', borderBottom: `1px solid ${FILA_BORDE}`,
                  transition: 'background .12s', '&:hover': { bgcolor: FONDO_TENUE },
                }}>
                  <Typography sx={{ fontSize: '0.78rem', color: TEXTO_SUAVE, fontVariantNumeric: 'tabular-nums' }}>
                    {c.fecha}
                  </Typography>

                  <Box sx={{ minWidth: 0, pr: { sm: 1.5 } }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: TINTA }}>
                      {c.concepto}
                    </Typography>
                    {c.detalle && (
                      <Typography sx={{ fontSize: '0.72rem', color: c.estado === 'fallida' ? ROJO : GRIS, mt: 0.25 }}>
                        {c.detalle}
                      </Typography>
                    )}
                  </Box>

                  <Typography sx={{
                    fontSize: '0.8125rem', fontWeight: 700, textAlign: { xs: 'left', sm: 'right' },
                    fontVariantNumeric: 'tabular-nums', color: c.estado === 'pagada' ? TINTA : GRIS,
                  }}>
                    {c.monto}
                  </Typography>

                  <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, pr: { sm: 1 } }}>
                    <Box component="span" sx={{
                      fontSize: '0.72rem', fontWeight: 600, color: e.color, bgcolor: e.fondo,
                      borderRadius: '7px', px: 1, py: 0.375, whiteSpace: 'nowrap', display: 'inline-block',
                    }}>
                      {e.texto}
                    </Box>
                  </Box>

                  <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                    {c.pdfUrl ? (
                      <Tooltip title="Descargar la factura de Stripe (PDF)">
                        <Button component="a" href={c.pdfUrl} target="_blank" rel="noopener noreferrer"
                          sx={{ minWidth: 0, width: 30, height: 30, p: 0, borderRadius: '8px', border: `1px solid ${BORDE}`, color: TEXTO_SUAVE, '&:hover': { borderColor: NAVY, bgcolor: '#f7f9ff' } }}>
                          <Download size={14} />
                        </Button>
                      </Tooltip>
                    ) : c.urlDePago ? (
                      <Tooltip title="Pagar esta factura en Stripe">
                        <Button component="a" href={c.urlDePago} target="_blank" rel="noopener noreferrer"
                          sx={{ minWidth: 0, width: 30, height: 30, p: 0, borderRadius: '8px', border: `1px solid #f5e6c8`, color: AMBAR, '&:hover': { borderColor: AMBAR, bgcolor: '#fffaf0' } }}>
                          <ExternalLink size={14} />
                        </Button>
                      </Tooltip>
                    ) : null}
                  </Box>
                </Box>
              );
            })}
          </>
        )}

        {/* Lo que de verdad se descarga. Va aquí abajo y no en un tooltip
            porque es lo que le van a preguntar al cliente cuando lo lleve a
            su contador. */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, p: '14px 20px' }}>
          <Info size={15} color={GRIS} style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography sx={{ fontSize: '0.75rem', color: GRIS, lineHeight: 1.55 }}>
            El PDF de cada fila es la factura que emite Stripe por el cobro de tu
            suscripción a Zero. No es un comprobante fiscal electrónico dominicano:
            estos cobros no generan e-CF ni NCF.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function Vacio({ sinCliente }: { sinCliente: boolean }) {
  return (
    <Box sx={{ p: '44px 24px', textAlign: 'center' }}>
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: TINTA }}>
        {sinCliente ? 'Tu plan no tiene cobro automático' : 'No encontramos cobros'}
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: GRIS, mt: 0.875, maxWidth: 440, mx: 'auto', lineHeight: 1.6 }}>
        {sinCliente
          ? 'Tu empresa no tiene una suscripción de cobro en Stripe, así que no hay movimientos que mostrar. Cuando contrates un plan, cada cobro aparecerá aquí.'
          : 'No hay facturas en tu cuenta de Stripe todavía. Si acabas de contratar, el primer cobro aparece aquí en cuanto se procese.'}
      </Typography>
    </Box>
  );
}
