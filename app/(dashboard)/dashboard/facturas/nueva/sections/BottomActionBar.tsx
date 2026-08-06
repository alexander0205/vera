'use client';

import { ChevronDown, CreditCard, FileText, Loader2, Mail, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ItemLinea } from '../utils/types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

interface Props {
  items: ItemLinea[];
  loading: boolean;
  onCancelar?: () => void;
  primaryLabel?: string;
  loadingPrimaryLabel?: string;
  /** Color del botón primario por tipo de doc (factura teal / NC ámbar / ND azul). */
  primaryBtnClass?: string;
  // Full invoice mode (optional — omit for simple mode)
  loadingPreview?: boolean;
  onVistaPrevia?: () => void;
  onEmitir?: (modo: 'emitir' | 'borrador', opts?: { andThen?: 'nueva' | 'imprimir' | 'correo' | 'cobrar' }) => void;
}

export function BottomActionBar({
  items, loading, onCancelar,
  primaryLabel = 'Guardar',
  loadingPrimaryLabel = 'Emitiendo…',
  primaryBtnClass = 'bg-zero-600 hover:bg-zero-700 border-zero-700',
  loadingPreview, onVistaPrevia, onEmitir,
}: Props) {
  const [showGuardarMenu, setShowGuardarMenu] = useState(false);
  const guardarMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (guardarMenuRef.current && !guardarMenuRef.current.contains(e.target as Node)) {
        setShowGuardarMenu(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const menuItemSx = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 1.25,
    px: 2, py: { xs: 1.5, sm: 1.25 }, fontSize: '0.875rem', color: '#374151',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const,
    '&:hover': { bgcolor: '#f9fafb' }, transition: 'background 0.1s',
  };

  return (
    <Box sx={{ position: 'sticky', bottom: 0, zIndex: 30, mx: { xs: -1.5, sm: -2, md: -2.5 }, px: { xs: 1.5, sm: 2, md: 2.5 }, mt: 'auto', bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderTop: '1px solid #e5e7eb', boxShadow: '0 -4px 12px -2px rgba(0,0,0,0.08)', display: 'flex', flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' }, gap: 1.5, py: 1.5 }}>
      <Button
        type="button"
        variant="outlined"
        disableElevation
        onClick={onCancelar}
        sx={{ textTransform: 'none', borderRadius: '8px', color: '#4b5563', borderColor: '#e5e7eb', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' } }}
      >
        Cancelar
      </Button>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 1.5, width: { xs: '100%', sm: 'auto' } }}>
        {onEmitir ? (
          <>
            <Button
              type="button"
              variant="outlined"
              disableElevation
              disabled={loading || loadingPreview}
              onClick={onVistaPrevia}
              startIcon={loadingPreview ? <CircularProgress size={14} /> : undefined}
              sx={{ textTransform: 'none', borderRadius: '8px', color: '#4b5563', borderColor: '#e5e7eb', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' } }}
            >
              {loadingPreview ? 'Guardando…' : 'Vista previa'}
            </Button>

            <Button
              type="button"
              variant="outlined"
              disableElevation
              disabled={loading}
              onClick={() => onEmitir('emitir', { andThen: 'nueva' })}
              sx={{ textTransform: 'none', borderRadius: '8px', color: '#374151', borderColor: '#d1d5db', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' } }}
            >
              Guardar y crear nueva
            </Button>

            <Box ref={guardarMenuRef} sx={{ position: 'relative', display: 'flex', width: { xs: '100%', sm: 'auto' } }}>
              <Button
                type="submit"
                disableElevation
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
                sx={{ textTransform: 'none', bgcolor: '#3658e1', color: '#fff', '&:hover': { bgcolor: '#2a45c4' }, borderRadius: '8px 0 0 8px', flex: { xs: 1, sm: 'none' }, minWidth: { sm: 140 }, height: { xs: 44, sm: 36 }, borderRight: '1px solid #2a45c4', fontWeight: 500 }}
              >
                {loading ? loadingPrimaryLabel : primaryLabel}
              </Button>
              <Box
                component="button"
                type="button"
                disabled={loading}
                onClick={() => setShowGuardarMenu(v => !v)}
                aria-label="Más opciones para guardar"
                sx={{ bgcolor: '#3658e1', color: '#fff', '&:hover': { bgcolor: '#2a45c4' }, '&:disabled': { opacity: 0.5 }, borderRadius: '0 8px 8px 0', px: { xs: 1.5, sm: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #2a45c4', cursor: 'pointer', border: 'none', height: { xs: 44, sm: 36 } }}
              >
                <ChevronDown size={16} />
              </Box>

              {showGuardarMenu && (
                <Box sx={{ position: 'absolute', bottom: '100%', right: 0, mb: 0.5, bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', py: 0.5, width: { xs: '100%', sm: 208 }, minWidth: 192, zIndex: 50 }}>
                  {[
                    { icon: <FileText size={16} color="#4b5563" />, label: 'Guardar como borrador', onClick: () => { setShowGuardarMenu(false); onEmitir('borrador'); } },
                    { icon: <Printer size={16} color="#4b5563" />, label: 'Guardar e imprimir',    onClick: () => { setShowGuardarMenu(false); onEmitir('emitir', { andThen: 'imprimir' }); } },
                    { icon: <Mail size={16} color="#4b5563" />,    label: 'Guardar y enviar por correo', onClick: () => { setShowGuardarMenu(false); onEmitir('emitir', { andThen: 'correo' }); } },
                  ].map(item => (
                    <Box key={item.label} component="button" type="button" onClick={item.onClick} sx={menuItemSx}>
                      {item.icon}
                      {item.label}
                    </Box>
                  ))}
                  <Box
                    component="button"
                    type="button"
                    onClick={() => { setShowGuardarMenu(false); onEmitir('emitir', { andThen: 'cobrar' }); }}
                    sx={{ ...menuItemSx, color: '#2a45c4', borderTop: '1px solid #f3f4f6', '&:hover': { bgcolor: '#eef2fe' } }}
                  >
                    <CreditCard size={16} color="#3658e1" />
                    Guardar y generar link de pago
                  </Box>
                </Box>
              )}
            </Box>
          </>
        ) : (
          <Button
            type="submit"
            disableElevation
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
            sx={{ textTransform: 'none', bgcolor: '#3658e1', color: '#fff', '&:hover': { bgcolor: '#2a45c4' }, borderRadius: '8px', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 140 }, fontWeight: 500 }}
          >
            {loading ? loadingPrimaryLabel : primaryLabel}
          </Button>
        )}
      </Box>
    </Box>
  );
}
