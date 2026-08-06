'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { useProximamenteDialog } from '@/components/proximamente-dialog';
import { METODOS_PAGO } from '@/lib/pagos/metodos';

interface Props {
  pagoRecibido: boolean;
  setPagoRecibido: (v: boolean) => void;
  pagoFecha: string;
  setPagoFecha: (v: string) => void;
  pagoCuenta: string;
  setPagoCuenta: (v: string) => void;
  pagoMetodo: string;
  setPagoMetodo: (v: string) => void;
  pagoValor: string;
  setPagoValor: (v: string) => void;
}

/**
 * Detalle de pago recibido — rendered inside the accordion section #8.
 * A toggle controls whether the document records a payment. When enabled,
 * the parent's right sidebar shows the live "saldo pendiente" summary.
 */
export function PagoRecibido({
  pagoRecibido, setPagoRecibido,
  pagoFecha, setPagoFecha,
  pagoCuenta, setPagoCuenta,
  pagoMetodo, setPagoMetodo,
  pagoValor, setPagoValor,
}: Props) {
  const { openProximamente, dialog } = useProximamenteDialog();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={pagoRecibido}
            onChange={(e) => setPagoRecibido(e.target.checked)}
            size="small"
            sx={{
              color: 'grey.400',
              '&.Mui-checked': { color: '#3658e1' },
              '&:hover': { bgcolor: 'rgba(13,148,136,0.06)' },
            }}
          />
        }
        label={
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Registrar un pago recibido en esta factura
          </Typography>
        }
        sx={{ mx: 0 }}
      />

      {pagoRecibido && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(5, 1fr)',
            },
            gap: 1.5,
          }}
        >
          {/* Numeración */}
          <FormControl size="small">
            <InputLabel sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Numeración
            </InputLabel>
            <Select
              defaultValue="recibo"
              label="Numeración"
              sx={{
                fontSize: '0.875rem',
                '& .MuiOutlinedInput-notchedOutline': { borderRadius: '8px' },
              }}
            >
              <MenuItem value="recibo" sx={{ fontSize: '0.875rem' }}>Recibo de caja</MenuItem>
              <MenuItem value="orden" sx={{ fontSize: '0.875rem' }}>Orden de pago</MenuItem>
            </Select>
          </FormControl>

          {/* Fecha */}
          <TextField
            type="date"
            size="small"
            label="Fecha"
            value={pagoFecha}
            onChange={(e) => setPagoFecha(e.target.value)}
            slotProps={{
              inputLabel: {
                shrink: true,
                sx: { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
              },
              htmlInput: { style: { fontSize: '0.875rem' } },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          {/* Cuenta bancaria */}
          <TextField
            size="small"
            label="Cuenta bancaria"
            placeholder="Seleccionar"
            value={pagoCuenta}
            onChange={(e) => setPagoCuenta(e.target.value)}
            slotProps={{
              inputLabel: {
                sx: { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
              },
              htmlInput: { style: { fontSize: '0.875rem' } },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          {/* Método de pago */}
          <FormControl size="small">
            <InputLabel sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Método de pago
            </InputLabel>
            <Select
              value={pagoMetodo}
              onChange={(e) => setPagoMetodo(e.target.value)}
              label="Método de pago"
              sx={{
                fontSize: '0.875rem',
                '& .MuiOutlinedInput-notchedOutline': { borderRadius: '8px' },
              }}
            >
              {METODOS_PAGO.map((m) => (
                <MenuItem key={m.value} value={m.value} sx={{ fontSize: '0.875rem' }}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Valor */}
          <Box sx={{ position: 'relative' }}>
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'text.secondary',
                fontWeight: 500,
                zIndex: 1,
                pointerEvents: 'none',
                fontSize: '0.75rem',
                lineHeight: 1,
              }}
            >
              RD$
            </Typography>
            <TextField
              type="number"
              size="small"
              label="Valor"
              placeholder="0.00"
              value={pagoValor}
              onChange={(e) => setPagoValor(e.target.value)}
              slotProps={{
                inputLabel: {
                  sx: { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
                },
                htmlInput: {
                  inputMode: 'decimal',
                  min: 0,
                  step: 0.01,
                  style: { paddingLeft: 40, fontSize: '0.875rem' },
                },
              }}
              sx={{
                width: '100%',
                '& .MuiOutlinedInput-root': { borderRadius: '8px' },
              }}
            />
          </Box>
        </Box>
      )}

      {pagoRecibido && (
        <Box sx={{ mt: 0.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => openProximamente('Pagos múltiples (tarjeta + efectivo)')}
            sx={{
              fontSize: '0.75rem',
              color: '#3658e1',
              fontWeight: 500,
              bgcolor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              p: 0,
              '&:hover': { color: '#2a45c4' },
            }}
          >
            + Agregar otro método de pago (split payment)
          </Box>
        </Box>
      )}
      {dialog}
    </Box>
  );
}
