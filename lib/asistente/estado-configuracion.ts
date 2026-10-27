import 'server-only';
import type { ClienteApi } from './api';
import type { EstadoConfiguracion } from './guias-paso';

/**
 * Qué tiene ya configurada la empresa para facturar. Solo conteos, con las
 * mismas rutas de la app y la sesión de quien pregunta. Lo que no se pudo leer
 * (sin permiso, módulo apagado) queda en `null`: nunca se supone.
 */
export async function leerEstadoConfiguracion(api: ClienteApi): Promise<EstadoConfiguracion> {
  const lee = async <T,>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
  const [cert, seq, cli, prod, fac] = await Promise.all([
    lee(() => api.get<{ tieneCertificado?: boolean }>('/api/equipo/certificado')),
    lee(() => api.get<{ sequences?: { tipoEcf: string; estado: string }[] }>('/api/secuencias')),
    lee(() => api.get<{ clientes?: unknown[] }>('/api/clientes', { limit: 1 })),
    lee(() => api.get<{ productos?: unknown[] }>('/api/productos', { limit: 1 })),
    lee(() => api.get<{ total?: number }>('/api/facturas', { estado: 'ACEPTADO', limit: 1, offset: 0 })),
  ]);
  return {
    certificado: cert == null ? null : Boolean(cert.tieneCertificado),
    secuencias: seq == null ? null : (seq.sequences ?? []).filter((s) => s.estado === 'activa').length,
    clientes: cli == null ? null : (cli.clientes ?? []).length,
    productos: prod == null ? null : (prod.productos ?? []).length,
    facturasEmitidas: fac == null ? null : Number(fac.total ?? 0),
  };
}
