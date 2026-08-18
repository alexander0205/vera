'use client';

/**
 * ClienteDialog — modal ÚNICO de cliente/contacto: crear y editar.
 *
 * Lo montan la lista de Clientes, la nueva factura, la nueva cotización, la
 * factura recurrente y el POS. Por dentro no tiene formulario propio: monta el
 * MISMO `ClienteForm` de la pantalla de Clientes.
 *
 * Antes sí lo tenía, y esa copia fue el problema: el formulario de la pantalla
 * ganó celular, WhatsApp, dirección, descripción y dependientes al crear, y el
 * modal se quedó con cinco campos. Quien creaba un cliente desde una factura
 * salía con media ficha, y quien lo creaba desde la lista tenía que guardarlo y
 * volver a abrirlo para ponerle los hijos.
 *
 * También murieron aquí dos controles que no guardaban nada: el selector «Tipo
 * de identificación» y el interruptor Cliente/Proveedor. Ninguno de los dos
 * viajaba en el POST — `clienteSchema` los descarta y la tabla `clients` no
 * tiene columna para ellos. Se veían, se elegían y no pasaba nada.
 *
 * Los botones Cancelar / Guardar los pone el propio formulario, por eso no hay
 * DialogActions.
 */

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import { UserPlus, Pencil } from 'lucide-react';
import ClienteForm, { type ClienteCreado } from '@/app/(dashboard)/dashboard/clientes/_cliente-form';

export type { ClienteCreado };

export function ClienteDialog({
  open, onClose, onCreated, nombreInicial = '', clienteId, onActualizado,
}: {
  open: boolean;
  onClose: () => void;
  /** Se llama al CREAR. En modo edición no se usa: ver `onActualizado`. */
  onCreated?: (c: ClienteCreado) => void;
  /** Pre-carga el nombre (ej. lo tipeado en el buscador del POS). */
  nombreInicial?: string;
  /** Presente → modo edición de ese cliente. Ausente → creación. */
  clienteId?: number;
  /** Se llama al guardar cambios en modo edición (para recargar la lista). */
  onActualizado?: () => void;
}) {
  const editando = clienteId != null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.125rem', fontWeight: 600, pb: 1 }}>
        {editando
          ? <Pencil size={20} color="#3658e1" />
          : <UserPlus size={20} color="#3658e1" />}
        {editando ? 'Editar contacto' : 'Nuevo contacto'}
      </DialogTitle>

      <DialogContent sx={{ pt: '8px !important', pb: 3 }}>
        {/* El `key` remonta el formulario entre aperturas: sin él, cerrar y
            abrir otra vez reaparecía con lo tecleado la vez anterior. */}
        <Box key={editando ? `editar-${clienteId}` : `nuevo-${nombreInicial}`}>
          <ClienteForm
            embebido
            clienteId={clienteId}
            valoresIniciales={editando ? undefined : { razonSocial: nombreInicial }}
            onCancelar={onClose}
            onGuardado={(_id, _nombre, cliente) => {
              if (editando) onActualizado?.();
              else onCreated?.(cliente);
              onClose();
            }}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
}
