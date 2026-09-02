'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DocumentoIdentidadInput } from '@/components/shared/documento-identidad-input';

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
  /** Subtipo fiscal del gasto (e43 gastos menores / e47 pagos al exterior). */
  tipoEcf: string;
  onChangeTipo: (value: string) => void;
}

/** Captura propia de una compra/gasto. No reutiliza vocabulario de ventas. */
export function GastoDatosSection({
  proveedor, setProveedor, rncProveedor, setRncProveedor,
  ncfProveedor, setNcfProveedor, categoriaGasto, setCategoriaGasto,
  fechaGasto, setFechaGasto, tipoEcf, onChangeTipo,
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

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.5fr) 1.2fr 1fr' }, gap: 1.5, alignItems: 'flex-end' }}>
        <TextField
          required fullWidth size="small" label="Proveedor"
          placeholder="Nombre del proveedor o comercio"
          value={proveedor} onChange={(e) => setProveedor(e.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography component="label" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#6b7280' }}>
            Documento (opcional)
          </Typography>
          <DocumentoIdentidadInput value={rncProveedor} onChange={setRncProveedor} />
        </Box>
        <TextField
          fullWidth size="small" label="NCF / No. documento"
          placeholder="B0100000001"
          value={ncfProveedor} onChange={(e) => setNcfProveedor(e.target.value.toUpperCase())}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 220px) 1fr 180px' }, gap: 1.5 }}>
        <FormControl size="small" fullWidth>
          <InputLabel>Tipo de comprobante</InputLabel>
          <Select
            label="Tipo de comprobante" value={tipoEcf}
            onChange={(e) => onChangeTipo(e.target.value)}
            sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
          >
            <MenuItem value="43" sx={{ fontSize: '0.875rem' }}>e43 — Gastos menores</MenuItem>
            <MenuItem value="47" sx={{ fontSize: '0.875rem' }}>e47 — Pagos al exterior</MenuItem>
          </Select>
        </FormControl>
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
