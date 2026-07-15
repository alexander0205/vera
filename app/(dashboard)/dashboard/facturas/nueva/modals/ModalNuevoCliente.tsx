'use client';

/**
 * Shim de compatibilidad — el modal real vive en components/shared/
 * cliente-dialog.tsx (compartido entre Facturación y POS). Mantener este
 * archivo evita tocar todos los imports existentes de la pantalla de factura.
 */

export { ClienteDialog as ModalNuevoCliente } from '@/components/shared/cliente-dialog';
export type { ClienteCreado } from '@/components/shared/cliente-dialog';
