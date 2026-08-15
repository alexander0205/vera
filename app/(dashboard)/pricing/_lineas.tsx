'use client';

/**
 * El selector de línea comercial y la parrilla de planes que le corresponde.
 *
 * Existe porque los ocho planes NO son una sola escalera: van de US$9 a
 * US$500 y sirven a dos clientes distintos. Puestos en una parrilla —como
 * estaban— el colmado que busca facturar veía un tramo escolar de US$500
 * junto al suyo de US$9, y el precio de arriba tiñe la lectura de todos.
 *
 * "Zero POS + ERP" no es una familia aparte en los datos: es la familia e-CF
 * con el adicional de POS sumado, y el precio se calcula. Ver LINEAS_PRODUCTO.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Check } from 'lucide-react';
import { SubmitButton } from './submit-button';
import { LINEAS_PRODUCTO, type PlanDef } from '@/lib/config/plans';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';

/** Un plan ya resuelto en el servidor: con su precio de línea y su priceId. */
export interface PlanDeLinea {
  plan:    PlanDef;
  precio:  number;
  priceId: string;
}

interface Props {
  /** Planes por línea, calculados en el servidor (las env vars no van al cliente). */
  porLinea: Record<string, PlanDeLinea[]>;
  checkoutAction: (formData: FormData) => void;
}

export function Lineas({ porLinea, checkoutAction }: Props) {
  const [lineaKey, setLinea] = useState(LINEAS_PRODUCTO[0].key);
  const linea  = LINEAS_PRODUCTO.find(l => l.key === lineaKey)!;
  const planes = porLinea[lineaKey] ?? [];

  return (
    <>
      {/* Selector de línea */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <Box
          role="tablist"
          aria-label="Línea de producto"
          sx={{
            display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center',
            gap: 0.5, p: 0.5, borderRadius: '99px', bgcolor: '#f3f4f6',
          }}
        >
          {LINEAS_PRODUCTO.map(l => {
            const activa = l.key === lineaKey;
            return (
              <Box
                key={l.key}
                component="button"
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setLinea(l.key)}
                sx={{
                  border: 'none', cursor: 'pointer', px: 2.5, py: 1,
                  borderRadius: '99px', fontSize: '0.875rem', fontWeight: 600,
                  fontFamily: 'inherit', transition: 'all 0.15s',
                  ...(activa
                    ? { bgcolor: '#fff', color: '#2a45c4', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                    : { bgcolor: 'transparent', color: '#6b7280', '&:hover': { color: '#374151' } }),
                }}
              >
                {l.nombre}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Typography sx={{ textAlign: 'center', color: '#6b7280', fontSize: '0.9375rem', mb: 5, maxWidth: 560, mx: 'auto' }}>
        {linea.descripcion}
      </Typography>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        gap: 3,
        alignItems: 'stretch',
      }}>
        {planes.map(p => (
          <Card key={p.plan.key} item={p} lineaKey={lineaKey} checkoutAction={checkoutAction} />
        ))}
      </Box>
    </>
  );
}

function Card({
  item, lineaKey, checkoutAction,
}: { item: PlanDeLinea; lineaKey: string; checkoutAction: (fd: FormData) => void }) {
  const { plan, precio, priceId } = item;
  const destacado = plan.ui.highlighted;

  return (
    <Box sx={{
      position: 'relative', display: 'flex', flexDirection: 'column', p: 4,
      borderRadius: '16px', border: '1px solid',
      ...(destacado
        ? { borderColor: '#3658e1', bgcolor: '#3658e1', color: '#fff', boxShadow: '0 20px 40px rgba(54,88,225,0.28)' }
        : { borderColor: '#e5e7eb', bgcolor: '#fff' }),
    }}>
      {destacado && (
        <Box sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', bgcolor: '#f97316', color: '#fff', fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '99px', whiteSpace: 'nowrap' }}>
          Más popular
        </Box>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 0.5, color: destacado ? '#fff' : '#111827' }}>{plan.name}</Typography>
        <Typography sx={{ fontSize: '0.875rem', mb: 2, color: destacado ? '#e0e7fd' : '#6b7280' }}>{plan.ui.description}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography sx={{ fontSize: '2.25rem', fontWeight: 700, color: destacado ? '#fff' : '#111827' }}>${precio}</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: destacado ? '#e0e7fd' : '#6b7280' }}>USD/mes</Typography>
        </Box>
        <Typography sx={{ fontSize: '0.75rem', mt: 0.5, color: destacado ? '#e0e7fd' : '#9ca3af' }}>
          {diasDePrueba(plan.familia)} días gratis, luego ${precio}/mes
        </Typography>
      </Box>

      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4, flex: 1 }}>
        {/* En la línea con POS se antepone lo que la distingue: si no, las dos
            parrillas de la familia e-CF se leen idénticas salvo el precio. */}
        {lineaKey === 'pos-erp' && (
          <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Check size={16} color={destacado ? '#e0e7fd' : '#3658e1'} style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: destacado ? '#fff' : '#111827' }}>
              Punto de Venta: caja, turnos y stock por almacén
            </Typography>
          </Box>
        )}
        {plan.ui.marketingFeatures.map((feature, i) => (
          <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Check size={16} color={destacado ? '#e0e7fd' : '#3658e1'} style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.875rem', color: destacado ? '#eef2fe' : '#4b5563' }}>{feature}</Typography>
          </Box>
        ))}
      </Box>

      <form action={checkoutAction}>
        <input type="hidden" name="priceId" value={priceId} />
        {/* El adicional viaja para que el checkout sepa que esta línea lleva
            POS: el precio de la tarjeta ya lo incluye, y sin esto el cliente
            pagaría el combinado y recibiría el plan pelado. */}
        {lineaKey === 'pos-erp' && <input type="hidden" name="addons" value="pos" />}
        <SubmitButton destacado={destacado} label="Empezar prueba gratis" />
      </form>
    </Box>
  );
}
