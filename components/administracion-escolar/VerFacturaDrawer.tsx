'use client';

import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import { DocumentoDetalle } from '@/app/(dashboard)/dashboard/facturas/[id]/page';

/**
 * La factura, sin salir de la ficha de la familia.
 *
 * Hermano de `FacturaDrawer`, que hace lo mismo para CREAR. El motivo es el
 * mismo: mirar una factura del colegio empieza y termina en el estado de cuenta
 * de la familia —qué debe, por cuál hijo, desde cuándo— y saltar a
 * `/dashboard/facturas/[id]` deja esa pantalla atrás justo cuando hace falta.
 * Se cierra el cajón y se sigue donde se estaba.
 *
 * No se reimplementa nada: se monta `DocumentoDetalle`, el mismo componente de
 * la pantalla de Facturación. Lo único propio de aquí es el envoltorio, y que
 * se le pasa el id a mano en vez de sacarlo de la ruta.
 *
 * Se descartó un iframe: traería su propia cabecera y su propio menú dentro del
 * cajón, y serían dos barras de navegación, una encima de otra.
 */
export function VerFacturaDrawer({ documentoId, onCerrar }: {
  /** `null` = cerrado. Se desmonta al cerrar para no dejar la factura anterior. */
  documentoId: number | null;
  onCerrar: () => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={documentoId != null}
      onClose={onCerrar}
      keepMounted={false}
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(2px)' } },
        paper: {
          sx: {
            // El mismo ancho que el cajón de crear: la tabla de líneas lleva
            // beneficiario por fila y a menos de esto sale con scroll lateral.
            width: { xs: '100%', sm: 'min(1240px, 94%)' },
            bgcolor: 'background.default',
            backgroundImage: 'none',
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/* El detalle ya trae su propia cabecera con «Comprobantes», el código y
            las acciones. La X va encima porque esa cabecera es pegajosa. */}
        <IconButton
          onClick={onCerrar}
          aria-label="Cerrar"
          size="small"
          sx={{
            position: 'absolute', top: 12, right: 16, zIndex: 3,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {documentoId != null && (
            <DocumentoDetalle variant="factura" docIdFijo={documentoId} onCerrar={onCerrar} />
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
