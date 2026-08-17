'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

const CATEGORIAS_GASTO = [
  'Materiales y suministros',
  'Servicios y mantenimiento',
  'Transporte y combustible',
  'Equipos y herramientas',
  'Alquileres y servicios públicos',
  'Mercancía / inventario',
  'Otro gasto',
];

interface Props {
  proveedor: string;
  setProveedor: (value: string) => void;
  rncProveedor: string;
  setRncProveedor: (value: string) => void;
  ncfProveedor: string;
  setNcfProveedor: (value: string) => void;
  categoriaGasto: string;
  setCategoriaGasto: (value: string) => void;
  fechaGasto: string;
  setFechaGasto: (value: string) => void;
}

/** Captura propia de una compra/gasto. No reutiliza vocabulario de ventas. */
export function GastoDatosSection({
  proveedor, setProveedor, rncProveedor, setRncProveedor,
  ncfProveedor, setNcfProveedor, categoriaGasto, setCategoriaGasto,
  fechaGasto, setFechaGasto,
}: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
          Datos del gasto
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 0.25 }}>
          Registra una compra o salida real de empresa. Para reponer inventario, usa Compras registradas.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.5fr) 1fr 1fr' }, gap: 1.5 }}>
        <TextField
          required fullWidth size="small" label="Proveedor"
          placeholder="Nombre del proveedor o comercio"
          value={proveedor} onChange={(e) => setProveedor(e.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
        <TextField
          fullWidth size="small" label="RNC / cédula"
          placeholder="Opcional"
          value={rncProveedor} onChange={(e) => setRncProveedor(e.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
        <TextField
          fullWidth size="small" label="NCF / No. documento"
          placeholder="B0100000001"
          value={ncfProveedor} onChange={(e) => setNcfProveedor(e.target.value.toUpperCase())}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 180px' }, gap: 1.5 }}>
        <FormControl size="small" fullWidth>
          <InputLabel>Categoría</InputLabel>
          <Select
            label="Categoría" value={categoriaGasto}
            onChange={(e) => setCategoriaGasto(e.target.value)}
            sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
          >
            {CATEGORIAS_GASTO.map((categoria) => (
              <MenuItem key={categoria} value={categoria} sx={{ fontSize: '0.875rem' }}>{categoria}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          required type="date" fullWidth size="small" label="Fecha del gasto"
          value={fechaGasto} onChange={(e) => setFechaGasto(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
      </Box>
    </Box>
  );
}
