'use client';

import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import NuevaFacturaFormClient from '@/app/(dashboard)/dashboard/facturas/nueva/_nueva-factura-client';
import type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

/**
 * La pantalla COMPLETA de nueva factura, en un cajón que entra desde la derecha.
 *
 * Por qué un cajón y no un salto a `/dashboard/facturas/nueva`: facturar a una
 * familia empieza mirando su estado de cuenta —qué debe, por cuál hijo, desde
 * cuándo— y al cambiar de pantalla esa información se pierde justo cuando hace
 * falta. El cajón deja la ficha detrás: se cierra y se sigue donde se estaba.
 *
 * Y por qué la pantalla completa y no las piezas sueltas del modo Lite: el
 * formulario grande es el único que trae beneficiario por línea, descuentos,
 * retenciones, tipo de ingresos y registrar el pago en el acto. En un colegio
 * esas cuatro cosas son el caso normal, no la excepción — una madre con tres
 * hijos factura tres líneas con tres beneficiarios distintos y una beca.
 *
 * No se reimplementa nada: se monta `NuevaFacturaFormClient`, el mismo
 * componente que usa `/dashboard/facturas/nueva`. Lo único propio de aquí es
 * el envoltorio.
 */
export function FacturaDrawer({
  abierto,
  onCerrar,
  perfilEmpresa,
  cargosIniciales,
  clienteInicial,
  previsto,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Datos del emisor, resueltos en el servidor por la página. */
  perfilEmpresa: EmpresaPerfil | null;
  /**
   * Los cargos con los que abrir el formulario ya lleno.
   *
   * El propio prefill resuelve el cliente y el beneficiario de cada línea a
   * partir del cargo, así que no hace falta pasarlos aparte: es la misma ruta
   * que usa el diálogo rápido, y la que garantiza que la factura quede atada
   * al cargo al guardarla.
   */
  cargosIniciales?: number[];
  /**
   * La familia de la ficha, para cuando no hay ningún cargo que facturar.
   *
   * El cliente salía SIEMPRE del prefill de los cargos, y una familia que ya
   * tiene todo facturado no aporta ninguno: «Nueva factura» abría el
   * formulario en blanco —sin comprador y, por tanto, sin la columna de
   * beneficiario— justo encima de la ficha del comprador. Hoy en este colegio
   * eso le pasa a dos de cada tres familias.
   */
  clienteInicial?: { id: number; razonSocial: string; rnc: string | null;
    email: string | null; telefono: string | null } | null;
  /**
   * Un mes del calendario que todavía no es deuda, traído desde «Adelantar».
   *
   * Entra como línea de la factura y el cargo se crea al vincular, con el
   * documento ya emitido. Si se cierra el cajón sin guardar no queda nada:
   * adelantar un mes es facturarlo, no apuntarlo.
   */
  previsto?: { matriculaId: number; cuotaId: number; conceptoId: number } | null;
}) {
  return (
    <Drawer
      anchor="right"
      open={abierto}
      onClose={onCerrar}
      // Se desmonta al cerrar a propósito. Conservándolo, la siguiente factura
      // arrancaría con las líneas de la anterior a medio llenar.
      keepMounted={false}
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(2px)' } },
        paper: {
          sx: {
            // Más ancho que el cajón típico porque aquí la tabla de líneas lleva
            // una columna que la factura normal no tiene —el beneficiario— y a
            // 1020px la tabla ya no cabía en la columna del formulario: se
            // quedaba con barra de scroll horizontal encima del resumen.
            width: { xs: '100%', sm: 'min(1240px, 94%)' },
            bgcolor: 'background.default',
            backgroundImage: 'none',
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/*
          Sin cabecera propia. El formulario ya trae la suya —«Volver», «Nueva
          factura», el emisor con su RNC y el chip de Borrador— y ponerle otra
          encima dejaba el título dos veces, una debajo de la otra.

          Su «Volver» se reapunta a `onCerrar` (ver abajo), así que la X es el
          mismo gesto en el sitio donde se busca al estar en un cajón. `zIndex`
          porque esa cabecera es pegajosa y si no, la tapa.
        */}
        <IconButton
          onClick={onCerrar}
          aria-label="Cerrar"
          size="small"
          sx={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 3,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <NuevaFacturaFormClient
            initialPerfil={perfilEmpresa}
            categoriaFija="factura-venta"
            cargosIniciales={cargosIniciales}
            clienteInicial={clienteInicial}
            previsto={previsto}
            // El «Volver» de la barra del formulario navegaba a
            // /dashboard/facturas: cambiaba la página de DEBAJO con el cajón
            // todavía abierto. Aquí cerrar el cajón ES volver.
            onVolver={onCerrar}
            // El cajón está ENCIMA de la ficha de la familia: el salto a la
            // ficha del estudiante cambiaba la página de debajo con el cajón
            // todavía abierto.
            sinRedirigirAlVincular
            // Sin columna de impuesto (la enseñanza está exenta), sin plazo
            // de vencimiento y con tipo de ingresos 01 fijo. Son tres casillas
            // que en un colegio solo se pueden equivocar.
            modoColegio
          />
        </Box>
      </Box>
    </Drawer>
  );
}
