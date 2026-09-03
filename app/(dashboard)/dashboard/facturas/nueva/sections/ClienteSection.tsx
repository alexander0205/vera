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

const CLIENTE_DROPDOWN_W = 520;

/**
 * Opción del dropdown: el contacto arriba (nombre + RNC/cédula) y, separados por
 * una línea, sus dependientes, uno por fila. El contacto va primero porque es a
 * quien se le factura.
 * Se listan TODOS los dependientes, no solo el que matcheó: buscando al padre se
 * ve la familia, y buscando al hijo se confirma que el contacto es el correcto.
 */
function renderClienteOption(c: Cliente) {
  const deps = c.dependientes ?? [];
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
        <Typography
          variant="body2"
          title={c.razonSocial}
          sx={{ minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {c.razonSocial}
        </Typography>
        <Typography variant="caption" sx={{ flexShrink: 0, fontFamily: 'monospace', color: 'text.secondary' }}>
          {c.rnc || '—'}
        </Typography>
      </Box>
      {deps.length > 0 && (
        <Box component="ul" sx={{ mt: 0.5, pt: 0.5, m: 0, pl: 0, listStyle: 'none', borderTop: '1px solid #e5e7eb' }}>
          {deps.map((d) => (
            <Typography
              key={d}
              component="li"
              variant="caption"
              title={d}
              sx={{ display: 'block', color: '#2563eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {d}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

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
  /**
   * El cliente ya viene resuelto y aquí no se cambia.
   *
   * Al facturar desde la ficha de la familia el responsable es el dueño de la
   * pantalla de la que salió el cajón: dejar buscarlo de nuevo solo abre la
   * puerta a emitirle la factura a otra familia. Se muestra, no se edita.
   *
   * Solo muerde si de verdad hay un cliente resuelto. Si el prefill falló,
   * vuelve el buscador — si no, la factura quedaría sin destinatario y sin
   * manera de ponerle uno.
   */
  soloLectura?: boolean;
}

/**
 * Datos del cliente. Cliente autocomplete + RNC + teléfono + email.
 * El selector de beneficiario/dependiente fue movido a nivel de línea (ItemsTable).
 */
export function ClienteSection({
  clienteSeleccionado, buscarClientes, onSelectCliente, onClearCliente, onOpenNuevoCliente,
  regla, rncManual, rncManualNombre, setRncManual, setRncManualNombre,
  emailManual, setEmailManual, telefonoManual, setTelefonoManual,
  tipoEcf, totalDocumento, soloLectura = false,
}: Props) {
  const bloqueado = soloLectura && !!clienteSeleccionado;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Row: autocomplete + "Nuevo contacto" button */}
      {bloqueado ? (
        <Box>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, display: 'block', mb: 0.5 }}
          >
            Cliente
          </Typography>
          <TextField
            size="small"
            fullWidth
            value={clienteSeleccionado.razonSocial}
            slotProps={{
              input: { readOnly: true },
              htmlInput: { style: { fontSize: '0.875rem', height: '22px' }, tabIndex: -1 },
            }}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#f9fafb' },
              '& .MuiOutlinedInput-input': { color: '#111827', cursor: 'default' },
            }}
          />
        </Box>
      ) : (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Autocomplete<Cliente>
            placeholder="Buscar cliente por nombre, RNC o beneficiario…"
            value={clienteSeleccionado?.razonSocial ?? ''}
            onSearch={buscarClientes}
            onSelect={onSelectCliente}
            onClear={onClearCliente}
            onCreate={onOpenNuevoCliente}
            createLabel="Nuevo contacto"
            dropdownMinWidth={CLIENTE_DROPDOWN_W}
            renderOption={renderClienteOption}
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
            color: '#3658e1',
            bgcolor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            py: 1,
            my: -0.5,
            '&:hover': { color: '#2a45c4' },
          }}
        >
          <Plus size={14} />Nuevo contacto
        </Box>
      </Box>
      )}

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
          {/*
            El RNC se edita SIEMPRE, incluso con el cliente bloqueado.

            Son dos datos distintos: a quién se le cobra (el responsable de
            pago, que aquí no se toca) y con qué RNC sale el comprobante. El
            padre que paga la colegiatura de su hijo y la quiere a nombre de su
            empresa es el caso corriente, no la excepción — y la base ya los
            guarda por separado (`client_id` vs `rnc_comprador`).

            Antes esto era un campo gris de solo lectura y no había forma de
            hacerlo sin salir del colegio y facturar a mano.
          */}
          <RncSearch
            placeholder="Buscar RNC, Cédula o razón social…"
            // El nombre que acompaña al RNC sale de `rncManualNombre` cuando se
            // eligió otro RNC, y del contacto cuando el RNC sigue siendo el
            // suyo. Sin ese segundo caso el campo enseñaría el número pelado en
            // cuanto se elige un cliente, porque al elegirlo se limpia
            // `rncManualNombre` a propósito.
            value={
              rncManual
                ? `${rncManual} · ${rncManualNombre
                    || (rncManual === clienteSeleccionado?.rnc ? clienteSeleccionado.razonSocial : '')}`
                    .replace(/ · $/, '')
                : clienteSeleccionado?.rnc
                  ? `${clienteSeleccionado.rnc} · ${clienteSeleccionado.razonSocial}`
                  : undefined
            }
            onSelect={(r) => { setRncManual(r.rnc); setRncManualNombre(r.nombre); }}
            onClear={() => {
              // Con el cliente bloqueado, vaciar el RNC es quitar el RNC — no
              // soltar al cliente, que es el dueño de la pantalla de la que
              // salió el cajón y no se puede cambiar desde aquí.
              if (clienteSeleccionado && !bloqueado) onClearCliente();
              else { setRncManual(''); setRncManualNombre(''); }
            }}
            showSyncHint={!clienteSeleccionado}
          />
          </Box>
          {bloqueado && clienteSeleccionado && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
              Se le cobra a {clienteSeleccionado.razonSocial}. Cambia el RNC si la
              factura va a nombre de una empresa.
            </Typography>
          )}
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
