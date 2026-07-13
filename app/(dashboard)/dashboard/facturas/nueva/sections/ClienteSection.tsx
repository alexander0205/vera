'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import { AlertTriangle, Info, Plus, X } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import Tooltip from '@mui/material/Tooltip';
import { getCampoHint } from '@/lib/factura/validator/ui-helpers';
import { Autocomplete } from '../components/Autocomplete';
import type { Cliente } from '../utils/types';

interface Props {
  clienteSeleccionado: Cliente | null;
  buscarClientes: (q: string) => Promise<Cliente[]>;
  onSelectCliente: (c: Cliente) => void;
  onClearCliente: () => void;
  onOpenNuevoCliente: () => void;
  regla: TipoEcfRegla | undefined;
  rncManual: string;
  rncManualNombre: string;
  setRncManual: (v: string) => void;
  setRncManualNombre: (v: string) => void;
  emailManual: string;
  setEmailManual: (v: string) => void;
  telefonoManual: string;
  setTelefonoManual: (v: string) => void;
  tipoEcf: string;
  totalDocumento: number;
}

/**
 * Datos del cliente. Cliente autocomplete + RNC + teléfono + email.
 * El selector de beneficiario/dependiente fue movido a nivel de línea (ItemsTable).
 */
export function ClienteSection({
  clienteSeleccionado, buscarClientes, onSelectCliente, onClearCliente, onOpenNuevoCliente,
  regla, rncManual, rncManualNombre, setRncManual, setRncManualNombre,
  emailManual, setEmailManual, telefonoManual, setTelefonoManual,
  tipoEcf, totalDocumento,
}: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Row: autocomplete + "Nuevo contacto" button */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Autocomplete<Cliente>
            placeholder="Buscar cliente por nombre, RNC o email…"
            value={clienteSeleccionado?.razonSocial ?? ''}
            onSearch={buscarClientes}
            onSelect={onSelectCliente}
            onClear={onClearCliente}
            onCreate={onOpenNuevoCliente}
            createLabel="Nuevo contacto"
            renderOption={(c) => (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.razonSocial}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {[c.rnc, c.email].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
            )}
          />
          {/* Clear button — visible when a client is selected */}
          {clienteSeleccionado && (
            <IconButton
              type="button"
              onClick={onClearCliente}
              aria-label="Quitar cliente seleccionado"
              title="Quitar cliente"
              size="small"
              sx={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
                color: 'grey.400',
                '&:hover': { color: 'error.main' },
              }}
            >
              <X size={16} />
            </IconButton>
          )}
        </Box>

        <Box
          component="button"
          type="button"
          onClick={onOpenNuevoCliente}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#0d9488',
            bgcolor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            py: 1,
            my: -0.5,
            '&:hover': { color: '#0f766e' },
          }}
        >
          <Plus size={14} />Nuevo contacto
        </Box>
      </Box>

      {/* RNC / Teléfono / Email grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' },
          gap: 1.5,
          alignItems: 'start',
        }}
      >
        {/* RNC o Cédula */}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}
            >
              {regla?.rncLabel ?? 'RNC o Cédula'}
            </Typography>
            {regla?.requiereRncComprador && (
              <Typography component="span" sx={{ color: 'error.main', fontSize: '0.875rem', lineHeight: 1 }} aria-label="campo obligatorio">
                *
              </Typography>
            )}
            <Tooltip title={getCampoHint(tipoEcf, 'rncComprador') || 'DGII #38 · 9 u 11 dígitos'} arrow placement="top">
              <Box component="span" sx={{ display: 'inline-flex', cursor: 'help' }}>
                <Info size={12} color="var(--mui-palette-text-secondary, #6b7280)" aria-hidden="true" />
              </Box>
            </Tooltip>
          </Box>
          <Box sx={{ mt: 1 }}>
          <RncSearch
            placeholder="Buscar RNC, Cédula o razón social…"
            value={
              clienteSeleccionado?.rnc
                ? `${clienteSeleccionado.rnc} · ${clienteSeleccionado.razonSocial}`
                : rncManual
                  ? `${rncManual}${rncManualNombre ? ` · ${rncManualNombre}` : ''}`
                  : undefined
            }
            onSelect={(r) => { setRncManual(r.rnc); setRncManualNombre(r.nombre); }}
            onClear={() => {
              if (clienteSeleccionado) onClearCliente();
              else { setRncManual(''); setRncManualNombre(''); }
            }}
            showSyncHint={!clienteSeleccionado}
          />
          </Box>
        </Box>

        {/* Teléfono */}
        <Box>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, display: 'block', mb: 0.5 }}
          >
            Teléfono
          </Typography>
          <TextField
            size="small"
            fullWidth
            placeholder="___-___-____"
            value={telefonoManual}
            onChange={(e) => setTelefonoManual(e.target.value)}
            slotProps={{
              htmlInput: { style: { fontSize: '0.875rem', height: '22px' } },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </Box>

        {/* Email — siempre visible; si cliente sin email, queda editable */}
        <Box>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, display: 'block', mb: 0.5 }}
          >
            Email (para envío)
          </Typography>
          <TextField
            type="email"
            size="small"
            fullWidth
            placeholder="facturacion@empresa.com"
            value={emailManual}
            onChange={(e) => setEmailManual(e.target.value)}
            slotProps={{
              htmlInput: { style: { fontSize: '0.875rem', height: '22px' } },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </Box>
      </Box>

      {/* DOP 200k+ warning banner */}
      {tipoEcf === '32' && totalDocumento >= 200000 && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            bgcolor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            p: 1.5,
          }}
        >
          <Box sx={{ flexShrink: 0, mt: 0.25, color: '#92400e' }}>
            <AlertTriangle size={16} />
          </Box>
          <Typography variant="caption" sx={{ color: '#92400e', lineHeight: 1.5 }}>
            {totalDocumento >= 250000
              ? 'DOP 250,000+: datos del comprador OBLIGATORIOS.'
              : 'Al superar DOP 250,000 los datos del comprador serán obligatorios.'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
