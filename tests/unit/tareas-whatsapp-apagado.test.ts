import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Los WhatsApp de las tareas están apagados: que Meta apruebe la plantilla no
 * puede volver a encenderlos solos.
 */

const crm = vi.hoisted(() => ({ listar: vi.fn(), enviar: vi.fn() }));

vi.mock('@/lib/whatsapp/client', () => ({ listarPlantillas: crm.listar, enviarPlantilla: crm.enviar }));
vi.mock('@/lib/db/drizzle', () => ({
  db: { select: () => ({ from: () => ({ where: async () => [{ id: 1, name: 'Ana Pérez', telefono: '8095551234' }] }) }) },
}));

import { avisarTareaPorWhatsApp } from '@/lib/notificaciones/whatsapp-tareas';

const aviso = { colegio: 'Colegio', cambio: 'mensaje', autor: 'Luis', titulo: 'Tarea', url: 'https://app.zero.com.do/x' } as Parameters<typeof avisarTareaPorWhatsApp>[1];

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('CRM_ZERO_API_KEY', 'llave');
  crm.listar.mockReset().mockResolvedValue({ templates: [{ name: 'zero_tarea_novedad', language: 'es', status: 'APPROVED' }] });
  crm.enviar.mockReset().mockResolvedValue({ messageId: 'm1' });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('WhatsApp de las tareas', () => {
  it('apagado por defecto: aunque Meta la haya aprobado, no manda nada ni pregunta', async () => {
    vi.stubEnv('TAREAS_WHATSAPP_ACTIVO', '');
    expect(await avisarTareaPorWhatsApp([1], aviso)).toBe(0);
    expect(crm.enviar).not.toHaveBeenCalled();
    expect(crm.listar).not.toHaveBeenCalled();
  });

  it('solo sale si se enciende a propósito', async () => {
    vi.stubEnv('TAREAS_WHATSAPP_ACTIVO', '1');
    expect(await avisarTareaPorWhatsApp([1], aviso)).toBe(1);
    expect(crm.enviar).toHaveBeenCalledTimes(1);
  });
});
