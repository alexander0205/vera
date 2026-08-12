/**
 * Audit log de seguridad — registra accesos y operaciones sobre datos sensibles.
 *
 * Acciones auditadas:
 *   CERT_UPLOAD           — se subió/reemplazó el certificado P12
 *   CERT_VIEW             — se consultó la información del certificado (GET)
 *   CERT_ACCESS_FOR_SIGN  — el P12 fue descifrado para firmar un e-CF
 *   CERT_DELETE           — se eliminó el certificado
 *   ECF_SIGN              — XML firmado con el certificado del tenant
 *   ECF_SEND              — documento enviado a la DGII
 *   ECF_VOID              — anulación enviada a la DGII
 *   DGII_AUTH             — autenticación exitosa contra la DGII
 *   DGII_AUTH_FAIL        — autenticación fallida contra la DGII
 *
 * Uso:
 *   logAudit({ teamId, userId, actor: user.email, action: 'CERT_UPLOAD' });
 *
 * Es fire-and-forget: nunca lanza ni bloquea el flujo principal.
 */

import { db } from '@/lib/db/drizzle';
import { auditLogs } from '@/lib/db/schema';

export type AuditAction =
  | 'CERT_UPLOAD'
  | 'CERT_VIEW'
  | 'CERT_ACCESS_FOR_SIGN'
  | 'CERT_DELETE'
  | 'ECF_SIGN'
  | 'ECF_SEND'
  | 'ECF_RECHAZADO'
  | 'ECF_RESET'
  | 'ECF_VOID'
  | 'FACTURA_TRAZA'
  | 'DGII_AUTH'
  | 'DGII_AUTH_FAIL'
  | 'HABILITACION_SIGN'
  | 'PAGO_REGISTRADO'
  | 'PAGO_ELIMINADO'
  // Cuadre de caja
  | 'CAJA_APERTURA'
  | 'CAJA_MOVIMIENTO'
  | 'CAJA_AJUSTE'
  | 'CAJA_CIERRE_SOLICITADO'
  | 'CAJA_CIERRE_APROBADO'
  | 'CAJA_CIERRE_RECHAZADO'
  // Punto de venta (POS)
  | 'POS_TERMINAL_CREAR'
  | 'POS_TERMINAL_EDITAR'
  | 'POS_TERMINAL_DESACTIVAR'
  | 'POS_ASIGNACION'
  | 'POS_VENTA'
  | 'POS_MESA_CREAR'
  | 'POS_MESERO_CREAR'
  | 'POS_COMANDA_COBRAR'
  | 'POS_COMANDA_CANCELAR'
  | 'POS_VENTA_ELIMINAR'
  | 'POS_VENTA_UNSETTLE'
  | 'POS_VENTA_EDITAR'
  | 'POS_VENTA_QUITAR_ITEM'
  | 'MONEDERO_RECARGA'
  | 'MONEDERO_CONSUMO'
  | 'MONEDERO_LIMITE'
  // Cobranza — acciones hacia el cliente, deben quedar trazadas
  | 'RECORDATORIOS_COBRO_ENVIADOS'
  // WhatsApp (crm-escolar)
  | 'WHATSAPP_CONECTAR';

export interface AuditParams {
  teamId:    number;
  userId?:   number | null;
  actor:     string;                        // email del usuario o 'system'
  action:    AuditAction;
  resource?: string | null;                 // encf, serial del cert, etc.
  ip?:       string | null;
  meta?:     Record<string, unknown> | null;
}

/**
 * Inserta un registro en audit_logs.
 * Fire-and-forget: no hace await, no lanza si falla.
 */
export function logAudit(params: AuditParams): void {
  db.insert(auditLogs)
    .values({
      teamId:    params.teamId,
      userId:    params.userId ?? null,
      actor:     params.actor,
      action:    params.action,
      resource:  params.resource ?? null,
      ipAddress: params.ip ?? null,
      metadata:  params.meta ? JSON.stringify(params.meta) : null,
    })
    .catch((err: unknown) => {
      console.error('[audit] Error guardando entrada de auditoría:', err);
    });
}

/** Helper para extraer la IP real del header x-forwarded-for */
export function getIp(req: Request): string | null {
  const xff = req instanceof Request
    ? req.headers.get('x-forwarded-for')
    : null;
  return xff ? xff.split(',')[0].trim() : null;
}
