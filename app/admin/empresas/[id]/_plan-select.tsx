'use client';

/**
 * El desplegable de planes del panel admin.
 *
 * Se arma recorriendo PLANS agrupado por familia, así un plan nuevo en el
 * catálogo aparece aquí solo. La alternativa —escribir la lista a mano— es
 * exactamente lo que dejó la pantalla de suscripción del cliente ofreciendo
 * planes que ya no existían.
 */

import { useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import TextField from '@mui/material/TextField';
import { PLANS, LINEAS_PRODUCTO, type FamiliaPlan } from '@/lib/config/plans';

/** El nombre comercial de la familia, para agrupar el desplegable. */
function tituloFamilia(familia: FamiliaPlan): string {
  return LINEAS_PRODUCTO.find(l => l.familia === familia && l.addons.length === 0)?.nombre
    ?? (familia === 'colegio' ? 'Colegio' : 'Facturación');
}

export function PlanSelect({ current }: { current: string }) {
  // `current` viene de teams.plan_name, que guarda el nombre display; las
  // opciones van por `key`. getPlan() ya normaliza en minúsculas, así que se
  // compara igual para que el select arranque en el plan correcto.
  const [valor, setValor] = useState(
    PLANS.find(p => p.key === current.toLowerCase())?.key ?? '',
  );

  const familias: FamiliaPlan[] = ['ecf', 'colegio'];

  return (
    <TextField
      select
      name="plan"
      size="small"
      fullWidth
      label="Plan de la empresa"
      value={valor}
      onChange={e => setValor(e.target.value)}
      slotProps={{ inputLabel: { shrink: true } }}
    >
      <MenuItem value="">
        <em>Sin plan</em>
      </MenuItem>
      {familias.flatMap(familia => [
        <ListSubheader key={`h-${familia}`} sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 2.5 }}>
          {tituloFamilia(familia)}
        </ListSubheader>,
        ...PLANS.filter(p => p.familia === familia).map(p => (
          <MenuItem key={p.key} value={p.key}>
            {p.name} — US${p.price}/mes
          </MenuItem>
        )),
      ])}
    </TextField>
  );
}
