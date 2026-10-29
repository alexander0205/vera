import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email', () => ({ resend: { emails: { send: vi.fn() } }, assertSent: vi.fn() }));

import {
  ACEPTA_ADJUNTOS, claseDeMime, DESTINO, PENDIENTES, TOPE_ARCHIVO, TOPE_VIDEO, validarAdjunto,
} from '@/lib/administracion-escolar/tareas-reglas';
import { armarSlackTarea } from '@/lib/administracion-escolar/tareas-slack';
import { armarCorreoTarea } from '@/lib/email/escolar-tareas';

/**
 * Lo que pidió el usuario el 29-10-2026 para las tareas de «Por revisar»:
 * poder dejarlas «En revisión», subir fotos, videos y documentos, y que todo
 * llegue al Slack del equipo.
 */

describe('En revisión', () => {
  it('cuenta como pendiente, junto con las abiertas', () => {
    expect(PENDIENTES).toEqual(['abierta', 'en_revision']);
  });
  it('se llega desde abierta o completada; completar sirve desde abierta y desde revisión', () => {
    expect(DESTINO.revision).toEqual({ a: 'en_revision', desde: ['abierta', 'completada'] });
    expect(DESTINO.completar.desde).toEqual(['abierta', 'en_revision']);
    expect(DESTINO.reabrir.desde).toEqual(['en_revision', 'completada']);
  });
});

describe('archivos', () => {
  it('una foto, un video del celular y un PDF pasan, con el tipo que dice la extensión', () => {
    const foto = validarAdjunto({ nombre: 'IMG_2026.JPG', bytes: 2_000_000 });
    expect(foto).toMatchObject({ ok: true, adjunto: { mime: 'image/jpeg', clase: 'imagen', extension: 'jpg' } });
    const video = validarAdjunto({ nombre: 'pago.mov', bytes: 90 * 1024 * 1024 });
    expect(video).toMatchObject({ ok: true, adjunto: { mime: 'video/quicktime', clase: 'video' } });
    expect(validarAdjunto({ nombre: 'estado.pdf', bytes: 10 })).toMatchObject({ ok: true, adjunto: { clase: 'documento' } });
  });
  it('nada que el navegador ejecute', () => {
    for (const nombre of ['x.html', 'x.svg', 'x.js', 'x.exe', 'sin-extension']) {
      expect(validarAdjunto({ nombre, bytes: 10 }).ok).toBe(false);
    }
    expect(ACEPTA_ADJUNTOS).not.toContain('.html');
  });
  it('topes: los videos hasta 200 MB, lo demás hasta 25 MB, y nada vacío', () => {
    expect(validarAdjunto({ nombre: 'v.mp4', bytes: TOPE_VIDEO }).ok).toBe(true);
    expect(validarAdjunto({ nombre: 'v.mp4', bytes: TOPE_VIDEO + 1 }).ok).toBe(false);
    expect(validarAdjunto({ nombre: 'f.png', bytes: TOPE_ARCHIVO + 1 }).ok).toBe(false);
    expect(validarAdjunto({ nombre: 'f.png', bytes: 0 }).ok).toBe(false);
  });
  it('el nombre no trae rutas', () => {
    const v = validarAdjunto({ nombre: '../../etc/foto.png', bytes: 5 });
    expect(v.ok && v.adjunto.nombre).toBe('.._.._etc_foto.png');
  });
  it('la clase sale del tipo guardado', () => {
    expect(claseDeMime('image/png')).toBe('imagen');
    expect(claseDeMime('video/mp4')).toBe('video');
    expect(claseDeMime('application/pdf')).toBe('documento');
  });
});

const BASE = {
  colegio: 'INFANTIL MI CASITA II', tareaId: 8, titulo: 'Saber', de: 'Del colegio',
  asignada: 'Soporte IT · Zero', autor: 'Lic. Lizandro Martinez', documento: null,
};

describe('Slack', () => {
  it('dice el colegio, quién hizo qué, la tarea con su enlace y el estado', () => {
    const { blocks, texto } = armarSlackTarea({ ...BASE, aviso: 'mensaje', estado: 'abierta', texto: '¿Cómo inactivo a un estudiante?' });
    const todo = JSON.stringify(blocks);
    expect(texto).toBe('INFANTIL MI CASITA II · Lic. Lizandro Martinez respondió: Saber');
    expect(todo).toContain('/escolar/por-revisar?tarea=8|#8 Saber');
    expect(todo).toContain('Asignada a Soporte IT · Zero · Abierta');
    expect(todo).toContain('>¿Cómo inactivo a un estudiante?');
  });
  it('un archivo sale con su nombre; el estado en revisión se lee', () => {
    const { blocks } = armarSlackTarea({ ...BASE, aviso: 'adjunto', estado: 'en_revision', texto: 'recibo.pdf' });
    expect(JSON.stringify(blocks)).toContain('📎 recibo.pdf');
    expect(JSON.stringify(blocks)).toContain('En revisión');
  });
  it('un texto no puede armar enlaces ni menciones', () => {
    const { blocks } = armarSlackTarea({ ...BASE, aviso: 'creada', estado: 'abierta', texto: '<!channel> <http://x|y>' });
    const todo = JSON.stringify(blocks);
    expect(todo).not.toContain('<!channel>');
    expect(todo).toContain('&lt;!channel&gt;');
  });
});

describe('correo', () => {
  it('en revisión y archivo tienen su asunto', () => {
    expect(armarCorreoTarea({ ...BASE, aviso: 'revision', texto: null }).asunto).toBe('En revisión: Saber');
    const c = armarCorreoTarea({ ...BASE, aviso: 'adjunto', texto: 'foto.jpg' });
    expect(c.asunto).toBe('Lic. Lizandro Martinez subió un archivo: Saber');
    expect(c.texto).toContain('📎 foto.jpg');
  });
});

// ── La subida por trozos contra un S3 de mentira ─────────────────────────────

const enviados: { cmd: string; input: Record<string, unknown> }[] = [];
const guardado = new Map<string, Buffer>();

vi.mock('@aws-sdk/client-s3', () => {
  const cmd = (nombre: string) => class { constructor(public input: Record<string, unknown>) { (this as { nombre?: string }).nombre = nombre; } };
  return {
    S3Client: class {
      async send(c: { nombre: string; input: Record<string, unknown> }) {
        enviados.push({ cmd: c.nombre, input: c.input });
        const key = c.input.Key as string;
        if (c.nombre === 'Put') guardado.set(key, c.input.Body as Buffer);
        if (c.nombre === 'Get') return { Body: { transformToByteArray: async () => guardado.get(key)! } };
        if (c.nombre === 'Delete') guardado.delete(key);
        if (c.nombre === 'Create') return { UploadId: 'u1' };
        if (c.nombre === 'Part') return { ETag: `"e${c.input.PartNumber}"` };
        return {};
      }
    },
    PutObjectCommand: cmd('Put'), GetObjectCommand: cmd('Get'), DeleteObjectCommand: cmd('Delete'),
    HeadObjectCommand: cmd('Head'), CreateMultipartUploadCommand: cmd('Create'),
    UploadPartCommand: cmd('Part'), CompleteMultipartUploadCommand: cmd('Complete'),
  };
});

describe('subida por trozos', () => {
  beforeEach(() => {
    enviados.length = 0;
    guardado.clear();
    vi.stubEnv('S3_COMPROBANTES_BUCKET', 'b');
    vi.stubEnv('S3_COMPROBANTES_KEY_ID', 'k');
    vi.stubEnv('S3_COMPROBANTES_SECRET', 's');
    vi.resetModules();
  });

  async function subir(bytes: number) {
    const { recibirTrozo, TAMANO_TROZO } = await import('@/lib/storage/tareas');
    let e = { key: 'prod/tareas/team_22/x.mp4', mime: 'video/mp4', uploadId: null as string | null, partes: [] as { PartNumber: number; ETag: string }[], pendiente: false };
    const total = Math.ceil(bytes / TAMANO_TROZO);
    for (let n = 0; n < total; n++) {
      const largo = n < total - 1 ? TAMANO_TROZO : bytes - TAMANO_TROZO * (total - 1);
      e = await recibirTrozo(e, Buffer.alloc(largo, n), n === total - 1);
    }
    return e;
  }

  it('un archivo de un trozo sube entero, sin multipart', async () => {
    await subir(1_000_000);
    expect(enviados.map((x) => x.cmd)).toEqual(['Put']);
  });

  it('dos trozos: el primero espera aparte y los dos suben juntos como un solo objeto', async () => {
    await subir(6 * 1024 * 1024);
    expect(enviados.map((x) => x.cmd)).toEqual(['Put', 'Get', 'Delete', 'Put']);
    expect(enviados[0].input.Key).toBe('prod/tareas/team_22/x.mp4.pend');
    expect((enviados[3].input.Body as Buffer).length).toBe(6 * 1024 * 1024);
  });

  it('un video de 21 MB: partes de 8 MB (el mínimo de S3 es 5) y la última de lo que sobre', async () => {
    const e = await subir(21 * 1024 * 1024);
    const partes = enviados.filter((x) => x.cmd === 'Part').map((x) => (x.input.Body as Buffer).length / 1024 / 1024);
    expect(partes).toEqual([8, 8, 5]);
    expect(e.partes.map((p) => p.PartNumber)).toEqual([1, 2, 3]);
    expect(enviados.at(-1)?.cmd).toBe('Complete');
    expect(guardado.size).toBe(0); // no queda ningún trozo suelto
  });

  it('el trozo que esperaba va primero: los bytes llegan en orden', async () => {
    await subir(9 * 1024 * 1024);
    const parte = enviados.find((x) => x.cmd === 'Part')!.input.Body as Buffer;
    expect(parte[0]).toBe(0);
    expect(parte[parte.length - 1]).toBe(1);
  });
});

describe('plantillas de Soporte IT', () => {
  it('saludan por el primer nombre, sin el título, y llevan el enlace a la tarea', async () => {
    const { PLANTILLAS_SOPORTE, primerNombre } = await import('@/lib/administracion-escolar/tareas-reglas');
    expect(primerNombre('Lic. Lizandro Martinez')).toBe('Lizandro');
    expect(primerNombre('caja@colegio.do')).toBeNull();
    const url = 'https://app.zero.com.do/escolar/por-revisar?tarea=8';
    const cerrada = PLANTILLAS_SOPORTE.cerrada.texto({ nombre: 'Lizandro', url });
    expect(cerrada).toMatch(/^Hola Lizandro\. Ya resolvimos esta tarea y la cerramos\./);
    expect(cerrada).toContain(url);
    expect(PLANTILLAS_SOPORTE.revision.texto({ nombre: null, url })).toMatch(/^Hola\. Dejamos esta tarea en revisión\./);
  });
  it('cerrar completa y la de revisión la pasa a revisión', async () => {
    const { PLANTILLAS_SOPORTE, esPlantilla } = await import('@/lib/administracion-escolar/tareas-reglas');
    expect(PLANTILLAS_SOPORTE.cerrada.accion).toBe('completar');
    expect(PLANTILLAS_SOPORTE.revision.accion).toBe('revision');
    expect(esPlantilla('cerrada')).toBe(true);
    expect(esPlantilla('toString')).toBe(false);
  });
});

describe('24 horas sin respuesta', () => {
  const base = { asignadaA: 'soporte', asignadaUserId: null, creadaPorUserId: 35 };
  it('si lo último lo dijo Soporte, le toca al colegio: a quien la creó', async () => {
    const { turnoDe } = await import('@/lib/administracion-escolar/tareas-reglas');
    expect(turnoDe({ ...base, ultimo: { userId: 1, esSoporte: true } }))
      .toEqual({ soporte: false, colegio: true, usuarios: [35] });
  });
  it('si escribió el colegio en una tarea de Soporte, nos toca a nosotros', async () => {
    const { turnoDe } = await import('@/lib/administracion-escolar/tareas-reglas');
    expect(turnoDe({ ...base, ultimo: { userId: 35, esSoporte: false } }))
      .toEqual({ soporte: true, colegio: false, usuarios: [] });
    expect(turnoDe({ ...base, ultimo: null })).toEqual({ soporte: true, colegio: false, usuarios: [] });
  });
  it('en una tarea de una persona: si escribió ella, le toca a quien la creó; si no, a ella', async () => {
    const { turnoDe } = await import('@/lib/administracion-escolar/tareas-reglas');
    const t = { asignadaA: 'persona', asignadaUserId: 50, creadaPorUserId: 35 };
    expect(turnoDe({ ...t, ultimo: { userId: 50, esSoporte: false } }).usuarios).toEqual([35]);
    expect(turnoDe({ ...t, ultimo: { userId: 35, esSoporte: false } }).usuarios).toEqual([50]);
    expect(turnoDe({ ...t, ultimo: null }).usuarios).toEqual([50]);
  });
  it('el correo urgente lo dice en el asunto; la plantilla de revisión avisa del cierre en 24 horas', async () => {
    const { PLANTILLAS_SOPORTE } = await import('@/lib/administracion-escolar/tareas-reglas');
    expect(armarCorreoTarea({ ...BASE, aviso: 'urgente', texto: 'x' }).asunto).toBe('URGENTE · 24 horas sin respuesta: Saber');
    expect(PLANTILLAS_SOPORTE.revision.texto({ nombre: 'Lizandro', url: 'u' })).toContain('Si no recibimos respuesta en 24 horas, la cerramos automáticamente.');
    const { blocks } = armarSlackTarea({ ...BASE, aviso: 'urgente', estado: 'abierta', texto: 'x' });
    expect(JSON.stringify(blocks)).toContain('🚨');
  });
});
