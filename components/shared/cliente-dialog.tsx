'use client';

/**
 * ClienteDialog — modal ÚNICO de cliente/contacto: crear y editar.
 *
 * Lo montan la nueva factura, la nueva cotización, la factura recurrente y el
 * POS: sitios donde el usuario está a mitad de otra cosa y no se le puede
 * mandar a otra pantalla. Desde el listado de Clientes NO se usa —ahí se
 * navega a `/dashboard/clientes/nuevo` y `/dashboard/clientes/[id]/editar`,
 * que son páginas de verdad: se recargan, se comparten por enlace y no se
 * cierran solas.
 *
 * Por dentro no tiene formulario propio: monta el MISMO `ClienteForm` de la
 * pantalla de Clientes.
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

import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
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

  // Si hay algo escrito lo sabe el formulario, que es quien tiene los campos;
  // aquí solo se decide si toca preguntar antes de tirarlo.
  const [sucio, setSucio]                         = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  // Al cerrarse, el formulario se desmonta sin retirar su último aviso de
  // «sucio». Sin este reinicio la siguiente apertura arrancaría preguntando por
  // cambios de la vez anterior, que ya no existen.
  useEffect(() => {
    if (!open) { setSucio(false); setConfirmarDescarte(false); }
  }, [open]);

  function intentarCerrar() {
    if (sucio) { setConfirmarDescarte(true); return; }
    onClose();
  }

  return (
    <>
      <Dialog
        open={open}
        /**
         * El clic en el fondo y la tecla Escape NO cierran.
         *
         * El formulario es largo —razón social, RNC, tres teléfonos, dirección,
         * descripción y dependientes— y se llena en medio de una venta o de una
         * factura, así que aquí un cierre accidental no cuesta un clic de más:
         * cuesta el formulario entero. Y pasaba por dos vías: el fondo, enorme
         * alrededor de un modal `sm`, y el Escape con el que se intenta cerrar
         * el desplegable del RNC (que no se lo come, porque vive en un portal
         * aparte y sube hasta el diálogo).
         *
         * Se cortan filtrando por `motivo` y no con `disableEscapeKeyDown`:
         * esa prop desapareció en MUI v9 —el Modal ya no la mira, siempre
         * llama a `onClose` con motivo `escapeKeyDown`—, así que ignorar los
         * dos motivos aquí es lo único que de verdad bloquea. Lo demás
         * (Cancelar, guardado con éxito) llega sin motivo y sí cierra.
         */
        onClose={(_evento, motivo) => {
          if (motivo === 'backdropClick' || motivo === 'escapeKeyDown') return;
          intentarCerrar();
        }}
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
              onSucioChange={setSucio}
              onCancelar={intentarCerrar}
              onGuardado={(_id, _nombre, cliente) => {
                if (editando) onActualizado?.();
                else onCreated?.(cliente);
                onClose();
              }}
            />
          </Box>
        </DialogContent>
      </Dialog>

      {/* Última red antes de perder lo escrito. Aquí el Escape SÍ vale: cierra
          la pregunta y devuelve al formulario, que es el lado seguro. */}
      <Dialog
        open={confirmarDescarte}
        onClose={() => setConfirmarDescarte(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>¿Descartar lo escrito?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Este contacto tiene datos sin guardar. Si sales ahora se pierden.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setConfirmarDescarte(false)}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            Seguir editando
          </Button>
          <Button
            variant="contained"
            color="error"
            disableElevation
            onClick={() => { setConfirmarDescarte(false); onClose(); }}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
          >
            Sí, descartar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
