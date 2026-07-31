'use client';

import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';
import { useTiposDisponibles } from '@/lib/hooks/useTiposDisponibles';
import type { EmpresaPerfil, SecuenciaInfo } from '../utils/types';
import { EmpresaBlock } from './EmpresaBlock';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

interface Props {
  empresa: EmpresaPerfil | null;
  categoriaId: string;
  setCategoriaId: (v: string) => void;
  tipoEcf: string;
  onChangeTipo: (t: string) => void;
  /** Oculta el dropdown de categoría (pantalla con categoría fija por ruta). */
  ocultarCategoria?: boolean;
  /** Muestra el código del tipo (e34/e33). Se oculta si la nota no tendrá e-CF real. */
  mostrarCodigoTipo?: boolean;
  /** Fuerza "Sin comprobante fiscal" en el bloque NCF (nota sobre factura sin e-CF). */
  sinComprobante?: boolean;
  secuencia: SecuenciaInfo | null;
  fechaEmision: string;
  /** Permite elegir la fecha de emisión (permiso facturas:fecha-personalizada). */
  puedeEditarFecha?: boolean;
  /** Actualiza la fecha de emisión (YYYY-MM-DD). Requerido si puedeEditarFecha. */
  onChangeFecha?: (v: string) => void;
  onEditarNcf: () => void;
}

export function CompactHeader({
  empresa, categoriaId, setCategoriaId, tipoEcf, onChangeTipo,
  ocultarCategoria, mostrarCodigoTipo = true, sinComprobante = false,
  secuencia, fechaEmision, puedeEditarFecha = false, onChangeFecha, onEditarNcf,
}: Props) {
  // "Sin comprobante" efectivo: la secuencia es sin-ncf, o es una nota sobre una
  // factura sin e-CF (nunca tendrá e-NCF real).
  const sinNcfEfectivo = sinComprobante || !!secuencia?.sinNcf;
  const { tipoVisible, dgiiReady, motivo: motivoDgii } = useTiposDisponibles();
  const categoriaActual = CATEGORIAS_ECF.find(c => c.id === categoriaId) ?? CATEGORIAS_ECF[0];
  const tiposVisibles  = categoriaActual.tipos.filter(t => tipoVisible(t.codigo));
  const tiposCategoria = tiposVisibles.length ? tiposVisibles : categoriaActual.tipos;

  useEffect(() => {
    if (!tiposCategoria.some(t => t.codigo === tipoEcf)) {
      onChangeTipo(tiposCategoria[0].codigo);
    }
  }, [categoriaId, tipoEcf, tiposCategoria, onChangeTipo]);

  const fechaFmt = (() => {
    if (!fechaEmision) return '—';
    const [y, m, d] = fechaEmision.split('-');
    return `${d}/${m}/${y}`;
  })();

  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', px: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 } }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px 10px' }}>
        <EmpresaBlock empresa={empresa} />

        {/* Tipos selector — categoría (oculta si fija por ruta) + subtipo. El
            subtipo solo se muestra cuando la categoría tiene más de un tipo;
            con un solo tipo (NC/ND/Compras) se rotula el documento fijo.
            id: ancla para resaltar cuando el método de pago obliga tipo fiscal. */}
        <Box id="tipo-comprobante-anchor" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, borderRadius: '8px', transition: 'box-shadow 0.2s' }}>
          {!ocultarCategoria && (
            <Select
              value={categoriaId}
              onChange={(e) => {
                const catId = e.target.value;
                if (!catId) return;
                const cat = CATEGORIAS_ECF.find(c => c.id === catId) ?? CATEGORIAS_ECF[0];
                setCategoriaId(catId);
                onChangeTipo(cat.tipos[0].codigo);
              }}
              variant="standard"
              disableUnderline
              sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', '& .MuiSelect-select': { py: 0, pr: '20px !important' } }}
            >
              {CATEGORIAS_ECF.map(cat => (
                <MenuItem key={cat.id} value={cat.id} sx={{ fontSize: '0.875rem' }}>{cat.label}</MenuItem>
              ))}
            </Select>
          )}
          {ocultarCategoria && (
            <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937', px: 0.5 }}>{categoriaActual.label}</Typography>
          )}
          {tiposCategoria.length > 1 ? (
            <Select
              value={tipoEcf}
              onChange={(e) => { if (e.target.value) onChangeTipo(e.target.value); }}
              variant="standard"
              disableUnderline
              sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#0f766e', '& .MuiSelect-select': { py: 0, pr: '20px !important' } }}
            >
              {tiposCategoria.map(t => (
                <MenuItem key={t.codigo} value={t.codigo} sx={{ fontSize: '0.75rem' }}>{t.etiqueta}</MenuItem>
              ))}
            </Select>
          ) : mostrarCodigoTipo ? (
            <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#0f766e', px: 1 }}>{tiposCategoria[0]?.etiqueta}</Typography>
          ) : null}
        </Box>

        {/* NCF block */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          {!sinNcfEfectivo && (
            <Typography sx={{ fontSize: '0.6875rem', textTransform: 'uppercase', fontWeight: 500, color: '#6b7280', letterSpacing: '0.04em' }}>NCF</Typography>
          )}
          {sinNcfEfectivo ? (
            <Box component="span" sx={{ fontSize: '0.6875rem', color: '#374151', bgcolor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', px: 1, py: '2px', fontWeight: 500 }}>Sin comprobante fiscal</Box>
          ) : secuencia === null ? (
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#d1d5db' }}>Cargando…</Typography>
          ) : secuencia.encf ? (
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 700, color: '#111827', wordBreak: 'break-all' }}>{secuencia.encf}</Typography>
          ) : secuencia.sinSecuencia ? (
            <Box component="span" sx={{ fontSize: '0.6875rem', color: '#92400e', bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', px: 1, py: '2px' }}>Sin secuencias</Box>
          ) : secuencia.agotada ? (
            <Box component="span" sx={{ fontSize: '0.6875rem', color: '#991b1b', bgcolor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', px: 1, py: '2px' }}>Agotadas</Box>
          ) : secuencia.vencida ? (
            <Box component="span" sx={{ fontSize: '0.6875rem', color: '#991b1b', bgcolor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', px: 1, py: '2px' }}>Vencidas</Box>
          ) : (
            <Box component="span" sx={{ fontSize: '0.6875rem', color: '#92400e', bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', px: 1, py: '2px' }}>Sin disponibles</Box>
          )}
          {!sinNcfEfectivo && (
            <Box
              component="button"
              type="button"
              onClick={onEditarNcf}
              aria-label="Configurar secuencia NCF"
              sx={{ color: '#9ca3af', '&:hover': { color: '#374151' }, p: '4px', m: '-4px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
            >
              <Settings size={14} />
            </Box>
          )}
        </Box>

        {/* Fecha — editable solo para roles con permiso y en sin-ncf (la fecha
            de un e-CF fiscal la fija la DGII, no el usuario). */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem' }}>
          <Typography component="span" sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Fecha:</Typography>
          {puedeEditarFecha && sinNcfEfectivo ? (
            <Box
              component="input"
              type="date"
              value={fechaEmision}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChangeFecha?.(e.target.value)}
              aria-label="Fecha de emisión"
              sx={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                px: 0.75,
                py: 0.25,
                '&:focus': { outline: 'none', borderColor: '#0d9488', boxShadow: '0 0 0 1px #0d9488' },
              }}
            />
          ) : (
            <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#111827' }}>{fechaFmt}</Typography>
          )}
        </Box>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ height: 8, width: 8, borderRadius: '50%', bgcolor: '#fbbf24' }} aria-hidden />
          <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>Borrador</Typography>
        </Box>
      </Box>

      {secuencia?.disponibles !== undefined && secuencia.disponibles < 50 && secuencia.disponibles > 0 && (
        <Typography sx={{ fontSize: '0.6875rem', color: '#d97706', mt: 1 }}>{secuencia.disponibles} NCF restantes</Typography>
      )}

      {/* Sin tipos fiscales disponibles, decir por qué. Si no, el usuario ve
          que "desaparecieron" el e31/e32 y no sabe si es un error del sistema. */}
      {!dgiiReady && motivoDgii && (
        <Box sx={{ mt: 1.25, borderRadius: '8px', border: '1px solid #fde68a', bgcolor: '#fffbeb', px: 1.5, py: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.4 }}>
            {motivoDgii}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
