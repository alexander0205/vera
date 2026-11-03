/**
 * Lo que Zero CRM publica de sí mismo tiene que poder sostenerse.
 *
 * Las subpáginas, `/productos/crm.md` y la parte del CRM en `llms.txt` las leen
 * personas y asistentes de IA, que lo repiten como un hecho. Esta prueba vigila
 * las reglas de `lib/agentes/crm.ts`: que cada función diga su estado, que lo
 * probado contra un simulador no se presente como operativo y que no se cuelen
 * nombres de clientes o de sistemas que no se pueden decir.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENIDO_CRM, ESTADOS, PREGUNTAS_CRM, crmMarkdown } from '@/lib/agentes/crm';
import { PAGINAS_CRM, RUTA_CRM } from '@/lib/agentes/crm-rutas';
import sitemap from '@/app/sitemap';
import { GET as llms } from '@/app/llms.txt/route';

/**
 * Palabras que no van en lo publicado. Los nombres concretos de sistemas ajenos
 * que no se pueden decir no se listan aquí: este repositorio es público, y una
 * lista de lo que no se puede nombrar los nombraría.
 */
const PROHIBIDO = /licitaci[oó]n|pliego|\bbancos?\b|\[confirmar/i;

describe('contenido de las subpáginas del CRM', () => {
  it('toda subpágina del menú tiene su contenido y su archivo', () => {
    for (const p of PAGINAS_CRM) {
      expect(CONTENIDO_CRM[p.clave], p.clave).toBeDefined();
      expect(p.ruta.startsWith(`${RUTA_CRM}/`), p.ruta).toBe(true);
      expect(existsSync(join(process.cwd(), 'app/(marketing)', p.ruta, 'page.tsx')), p.ruta).toBe(true);
    }
  });

  it('cada función dice un estado que existe', () => {
    for (const c of Object.values(CONTENIDO_CRM)) {
      for (const g of c.grupos) {
        for (const f of g.funciones) expect(ESTADOS[f.estado], f.titulo).toBeDefined();
      }
    }
  });

  it('los sistemas ajenos solo se nombran como conectores que se enlazan al implementar', () => {
    const ajenos = /dynamics|ucontact|bookings/i;
    for (const c of Object.values(CONTENIDO_CRM)) {
      for (const g of c.grupos) {
        for (const f of g.funciones) {
          if (ajenos.test(`${f.titulo} ${f.detalle}`)) expect(f.estado, f.titulo).toBe('implementar');
        }
      }
    }
  });

  it('la página de integraciones dice que no están en operación con clientes', () => {
    const notas = CONTENIDO_CRM.integraciones.notas?.map(n => n.texto).join(' ') ?? '';
    expect(notas).toMatch(/ambientes simulados/);
    expect(notas).toMatch(/no están en operación/);
  });

  it('citas dice que el conector de turnos no está en operación', () => {
    const notas = CONTENIDO_CRM.citas.notas?.map(n => n.texto).join(' ') ?? '';
    expect(notas).toMatch(/ambientes simulados/);
    expect(notas).toMatch(/no está en operación/);
  });

  it('lo que va hacia una plataforma de encuestas ajena se conecta al implementar', () => {
    const grupo = CONTENIDO_CRM.encuestas.grupos.find(g => /plataforma de encuestas/.test(g.titulo));
    expect(grupo).toBeDefined();
    for (const f of grupo!.funciones) expect(f.estado, f.titulo).toBe('implementar');
  });

  it('accesibilidad dice lo que no se ha probado', () => {
    const notas = CONTENIDO_CRM.idiomas.notas?.map(n => n.texto).join(' ') ?? '';
    expect(notas).toMatch(/lectores de pantalla reales/);
    expect(notas).toMatch(/no tenemos una certificación/);
  });

  it('el 99.9 % solo aparece atado a infraestructura dedicada', () => {
    const texto = crmMarkdown();
    for (const m of texto.matchAll(/[^.\n]*99\.9[^\n]*/g)) {
      expect(m[0], m[0]).toMatch(/infraestructura dedicada/);
    }
  });

  it('no se afirman certificaciones propias', () => {
    const notas = CONTENIDO_CRM.seguridad.notas?.map(n => n.texto).join(' ') ?? '';
    expect(notas).toMatch(/no tiene ISO 27001 ni SOC 2 propios/);
  });

  it('las preguntas son preguntas', () => {
    for (const q of PREGUNTAS_CRM) {
      expect(q.pregunta.startsWith('¿') && q.pregunta.endsWith('?'), q.pregunta).toBe(true);
    }
  });

  it('no se cuelan palabras de un expediente ni marcadores sin resolver', () => {
    expect(crmMarkdown()).not.toMatch(PROHIBIDO);
  });
});

describe('lo que leen los robots', () => {
  it('el sitemap trae todas las subpáginas', () => {
    const urls = sitemap().map(u => u.url);
    for (const p of PAGINAS_CRM) expect(urls.some(u => u.endsWith(p.ruta)), p.ruta).toBe(true);
  });

  it('llms.txt enlaza las subpáginas y separa el ERP del CRM', async () => {
    const texto = await llms().text();
    for (const p of PAGINAS_CRM) expect(texto, p.ruta).toContain(p.ruta);
    expect(texto).toContain('¿Zero ERP se integra con otros sistemas?');
    expect(texto).toContain('¿Zero CRM se integra con otros sistemas?');
    expect(texto).toContain('Qué NO hace Zero ERP');
    expect(texto).not.toMatch(/licitaci[oó]n|pliego/i);
  });

  it('las cifras del CRM salen en el HTML inicial, no solo al animarse', () => {
    const fuente = readFileSync(join(process.cwd(), 'app/(marketing)/productos/crm/_cifras.tsx'), 'utf8');
    expect(fuente).toContain('useState(cifra.valor)');
  });
});
