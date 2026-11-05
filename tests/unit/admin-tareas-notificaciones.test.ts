import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Avisos de las tareas de los colegios al equipo de Zero (campana + push).
 *
 * REGLA DEL DUEÑO (31-10-2026): las tareas NO se mandan por WhatsApp, de ningún
 * colegio. Lo nuevo del panel no tiene ningún camino hacia allá, y estas pruebas
 * lo vigilan por dos lados: lo que hace en ejecución y lo que dice su código.
 */

const m = vi.hoisted(() => ({
  admins: [] as { id: number }[],
  insertados: [] as unknown[][],
  push: vi.fn(),
  whatsapp: vi.fn(),
  falla: false,
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => { if (m.falla) throw new Error('base caída'); return m.admins; } }) }),
    insert: () => ({ values: async (filas: unknown[]) => { m.insertados.push(filas); } }),
  },
}));
vi.mock('@/lib/notificaciones/push', () => ({ empujarA: m.push }));
vi.mock('@/lib/whatsapp/client', () => ({ enviarPlantilla: m.whatsapp, listarPlantillas: m.whatsapp }));

import { notificarEquipoZeroDeTarea } from '@/lib/notificaciones/plataforma';
import { enlaceDeTareaEnPanel, notificacionDeTareaParaZero } from '@/lib/notificaciones/plataforma-texto';
import type { DatosTarea } from '@/lib/notificaciones/texto';

const d: DatosTarea = { cambio: 'mensaje', tareaId: 7, titulo: 'Revisar factura', autor: 'Ana Pérez', texto: 'Ya la subí' };

beforeEach(() => {
  m.admins = [{ id: 1 }, { id: 2 }, { id: 3 }];
  m.insertados = [];
  m.falla = false;
  m.push.mockReset().mockResolvedValue(0);
  m.whatsapp.mockReset();
});

describe('notificarEquipoZeroDeTarea', () => {
  it('una fila personal por administrador, con el colegio de origen y el enlace al panel', async () => {
    expect(await notificarEquipoZeroDeTarea(45, d, 'Colegio Demo', { autorUserId: null, yaAvisados: [] })).toBe(3);
    const filas = m.insertados[0] as Record<string, unknown>[];
    expect(filas.map((f) => f.userId)).toEqual([1, 2, 3]);
    for (const f of filas) {
      expect(f).toMatchObject({ teamId: 45, tipo: 'tarea', enlace: '/admin/tareas?tarea=7' });
      expect(String(f.detalle)).toContain('Colegio Demo');
    }
  });

  it('no avisa a quien hizo el cambio ni a quien ya recibió el aviso del colegio', async () => {
    await notificarEquipoZeroDeTarea(45, d, 'Colegio Demo', { autorUserId: 1, yaAvisados: [2] });
    expect((m.insertados[0] as { userId: number }[]).map((f) => f.userId)).toEqual([3]);
    expect(m.push.mock.calls[0][0]).toEqual([3]);
  });

  it('sin nadie a quien avisar no escribe nada', async () => {
    expect(await notificarEquipoZeroDeTarea(45, d, null, { autorUserId: 1, yaAvisados: [2, 3] })).toBe(0);
    expect(m.insertados).toHaveLength(0);
    expect(m.push).not.toHaveBeenCalled();
  });

  it('el push agrupa por tarea (tag) y lleva al mismo enlace', async () => {
    await notificarEquipoZeroDeTarea(45, d, 'Colegio Demo', { autorUserId: null, yaAvisados: [] });
    expect(m.push.mock.calls[0][1]).toMatchObject({ tag: 'zero-tarea-7', url: '/admin/tareas?tarea=7' });
  });

  it('nunca lanza: si la base cae, la tarea ya guardada sigue guardada', async () => {
    m.falla = true;
    await expect(notificarEquipoZeroDeTarea(45, d, 'Colegio Demo', { autorUserId: null, yaAvisados: [] })).resolves.toBe(0);
  });

  it('NUNCA toca WhatsApp: ni con administradores, ni con la bandera encendida', async () => {
    process.env.TAREAS_WHATSAPP_ACTIVO = '1';
    try {
      await notificarEquipoZeroDeTarea(45, d, 'Colegio Demo', { autorUserId: null, yaAvisados: [] });
    } finally { delete process.env.TAREAS_WHATSAPP_ACTIVO; }
    expect(m.whatsapp).not.toHaveBeenCalled();
  });
});

describe('el texto para el equipo de Zero', () => {
  it('dice de qué colegio es y lleva al panel, no a «Por revisar» del colegio', () => {
    const n = notificacionDeTareaParaZero(d, 'Colegio Demo');
    expect(n.titulo).toBe('Ana Pérez escribió');
    expect(n.detalle).toBe('Colegio Demo · Revisar factura: Ya la subí');
    expect(n.enlace).toBe(enlaceDeTareaEnPanel(7));
    expect(n.enlace.startsWith('/admin/')).toBe(true);
  });

  it('cada cambio tiene su frase y lo urgente no firma a nadie', () => {
    const frases = (['creada', 'mensaje', 'adjunto', 'revision', 'completada', 'reabierta'] as const)
      .map((cambio) => notificacionDeTareaParaZero({ ...d, cambio, texto: null }, 'C').titulo);
    expect(new Set(frases).size).toBe(6);
    expect(notificacionDeTareaParaZero({ ...d, cambio: 'urgente' }, 'C').titulo).toBe('URGENTE: 24 horas sin respuesta');
  });

  it('recorta lo larguísimo y tolera un colegio vacío', () => {
    const n = notificacionDeTareaParaZero({ ...d, texto: 'x'.repeat(600) }, null);
    expect(n.detalle.length).toBeLessThanOrEqual(280);
    expect(notificacionDeTareaParaZero({ ...d, texto: null }, '  ').detalle).toBe('Revisar factura');
  });
});

describe('ningún camino a WhatsApp en lo nuevo (lo que dice el código)', () => {
  const RAIZ = process.cwd();
  const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8');
  function todos(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) todos(p, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
    }
    return acc;
  }

  it('el aviso al equipo, el panel nuevo y su API no mencionan WhatsApp', () => {
    const lugares = [
      join(RAIZ, 'lib', 'admin'),
      join(RAIZ, 'components', 'admin'),
      join(RAIZ, 'app', 'admin', 'tareas'),
      join(RAIZ, 'app', 'admin', 'equipo'),
      join(RAIZ, 'app', 'api', 'admin', 'notificaciones'),
      join(RAIZ, 'app', 'api', 'admin', 'equipo'),
      join(RAIZ, 'app', 'api', 'admin', 'exportar'),
    ];
    const sueltos = [join(RAIZ, 'lib', 'notificaciones', 'plataforma.ts'), join(RAIZ, 'lib', 'notificaciones', 'plataforma-texto.ts')];
    for (const f of [...lugares.flatMap((l) => todos(l)), ...sueltos]) {
      // Los comentarios que dicen «nunca por WhatsApp» no cuentan: se quitan antes de mirar. Tampoco
      // el acceso del menú a la sección ya existente /admin/whatsapp (plantillas y conexión de Meta
      // para los avisos de cobro): esa línea es lo único que el marco del panel puede decir de WhatsApp.
      const codigo = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        .split('\n').filter((l) => !(f.endsWith('AdminShell.tsx') && l.includes("href: '/admin/whatsapp'"))).join('\n')
        .replace(/MessageCircle/g, '');
      expect(/whatsapp/i.test(codigo), f.slice(RAIZ.length + 1)).toBe(false);
    }
  });

  it('en avisarDeTarea el aviso al equipo va solo cuando le toca a Soporte y el WhatsApp sigue recibiendo únicamente a los usuarios del colegio', () => {
    const s = leer('lib', 'administracion-escolar', 'tareas.ts');
    const i = s.indexOf('if (soporte) {\n      await notificarEquipoZeroDeTarea(');
    expect(i, 'el aviso al equipo debe estar dentro de `if (soporte)`').toBeGreaterThan(-1);
    // Una sola llamada a WhatsApp, la de siempre, con `usuarios` (nunca la lista de admins).
    expect(s.match(/avisarTareaPorWhatsApp\(/g)).toHaveLength(1);
    expect(s).toMatch(/avisarTareaPorWhatsApp\(usuarios,/);
  });

  it('la bandera sigue apagada por defecto', () => {
    expect(leer('lib', 'notificaciones', 'whatsapp-tareas.ts')).toContain("process.env.TAREAS_WHATSAPP_ACTIVO === '1'");
  });
});
