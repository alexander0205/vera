import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  consultaAntesDelCursor, DEBOUNCE_MENCIONES_MS, enlaceDeMencion, escaparLike, GRUPOS_MENCION, limpiarEtiqueta, MAX_MENCIONES_POR_MENSAJE,
  MAX_POR_GRUPO, mencionesDe, MIN_BUSQUEDA, partirMenciones, reescribirMenciones, textoPlano, tokenDe, tokenizar, type Mencion,
} from '@/lib/administracion-escolar/tareas-menciones';

const ana: Mencion = { tipo: 'persona', id: 74, etiqueta: 'Ana · Zero' };
const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

describe('el token de una mención', () => {
  it('se arma y se lee de vuelta', () => {
    expect(tokenDe(ana)).toBe('@[Ana · Zero](persona:74)');
    expect(partirMenciones('Hola @[Ana · Zero](persona:74), mira esto')).toEqual([
      { texto: 'Hola ' }, { mencion: ana }, { texto: ', mira esto' },
    ]);
  });

  it('una etiqueta con corchetes o paréntesis no rompe el token', () => {
    expect(limpiarEtiqueta('Juan [el] (Pérez)\nlinea')).toBe('Juan el Pérez linea');
    const t = tokenDe({ tipo: 'padre', id: 5, etiqueta: 'Juan [el] (Pérez)' });
    expect(partirMenciones(t)).toEqual([{ mencion: { tipo: 'padre', id: 5, etiqueta: 'Juan el Pérez' } }]);
  });

  it('un token mal formado o de un tipo que no existe queda como texto', () => {
    for (const malo of ['@[X](usuario:3)', '@[X](persona:abc)', '@[X](persona:)', '@[](persona:3)', '@X(persona:3)']) {
      expect(partirMenciones(malo)).toEqual([{ texto: malo }]);
    }
  });

  it('los avisos y las vistas previas leen «@Ana · Zero», sin tokens', () => {
    expect(textoPlano('Hola @[Ana · Zero](persona:74) y @[FA-2026-1](factura:9).')).toBe('Hola @Ana · Zero y @FA-2026-1.');
  });

  it('sin repetir y con tope por mensaje', () => {
    expect(mencionesDe(`${tokenDe(ana)} ${tokenDe(ana)}`)).toEqual([ana]);
    const muchas = Array.from({ length: 30 }, (_, i) => tokenDe({ tipo: 'estudiante', id: i + 1, etiqueta: `E${i}` })).join(' ');
    expect(mencionesDe(muchas)).toHaveLength(MAX_MENCIONES_POR_MENSAJE);
  });
});

describe('validar al guardar: los ids son del colegio o quedan como texto', () => {
  const delColegio = new Map([['persona:74', 'Ana · Zero'], ['padre:5', 'Familia Pérez'], ['factura:9', 'FA-2026-9']]);
  const resolver = (m: Mencion) => delColegio.get(`${m.tipo}:${m.id}`) ?? null;

  it('los válidos se reescriben con la etiqueta del servidor, no la del cliente', () => {
    const r = reescribirMenciones('Mira @[Cualquier cosa](padre:5)', resolver);
    expect(r.texto).toBe('Mira @[Familia Pérez](padre:5)');
    expect(r.validas).toEqual([{ tipo: 'padre', id: 5, etiqueta: 'Familia Pérez' }]);
  });

  it('un id de otro colegio, o que no existe, pasa a texto plano', () => {
    const r = reescribirMenciones('Ojo @[Otra familia](padre:999) y @[Ana · Zero](persona:74)', resolver);
    expect(r.texto).toBe('Ojo @Otra familia y @[Ana · Zero](persona:74)');
    expect(r.validas.map((m) => m.id)).toEqual([74]);
  });

  it('el mismo tipo con otro id no se cuela: la clave es tipo + id', () => {
    expect(reescribirMenciones('@[F](estudiante:9)', resolver).texto).toBe('@F');
    expect(reescribirMenciones('@[F](factura:9)', resolver).texto).toBe('@[FA-2026-9](factura:9)');
  });

  it('las que pasan del tope por mensaje quedan como texto', () => {
    const todo = (m: Mencion) => `Nombre ${m.id}`;
    const texto = Array.from({ length: 25 }, (_, i) => tokenDe({ tipo: 'estudiante', id: i + 1, etiqueta: 'x' })).join(' ');
    const r = reescribirMenciones(texto, todo);
    expect(r.validas).toHaveLength(MAX_MENCIONES_POR_MENSAJE);
    expect(r.texto.match(/@\[/g)).toHaveLength(MAX_MENCIONES_POR_MENSAJE);
  });

  it('un id cero o negativo no se acepta', () => {
    expect(reescribirMenciones('@[X](persona:0)', () => 'X').texto).toBe('@X');
  });
});

describe('al enviar: de @Etiqueta a token', () => {
  it('solo las elegidas del menú; lo escrito a mano queda como está', () => {
    expect(tokenizar('Hola @Ana · Zero y @Pedro', [ana])).toBe('Hola @[Ana · Zero](persona:74) y @Pedro');
  });
  it('dos con la misma etiqueta se reparten en el orden en que se eligieron', () => {
    const a: Mencion = { tipo: 'padre', id: 1, etiqueta: 'Pérez' };
    const b: Mencion = { tipo: 'estudiante', id: 2, etiqueta: 'Pérez' };
    expect(tokenizar('@Pérez y @Pérez', [a, b])).toBe('@[Pérez](padre:1) y @[Pérez](estudiante:2)');
  });
  it('si la persona borró lo elegido, no queda nada que convertir', () => {
    expect(tokenizar('ya no la menciono', [ana])).toBe('ya no la menciono');
  });
  it('no come la palabra siguiente: @Ana no es @Anabel', () => {
    expect(tokenizar('@Anabel', [{ tipo: 'persona', id: 1, etiqueta: 'Ana' }])).toBe('@Anabel');
  });
  it('etiquetas con caracteres de expresión regular', () => {
    const f: Mencion = { tipo: 'factura', id: 3, etiqueta: 'FA-2026.(1)' };
    expect(tokenizar('ver @FA-2026.(1) ya', [f])).toBe(`ver ${tokenDe(f)} ya`);
  });
});

describe('cuándo se abre el menú de «@»', () => {
  it('después de un espacio o al inicio, con lo escrito hasta el cursor', () => {
    expect(consultaAntesDelCursor('@an', 3)).toEqual({ desde: 0, consulta: 'an' });
    expect(consultaAntesDelCursor('Hola @Ana Ma', 12)).toEqual({ desde: 5, consulta: 'Ana Ma' });
    expect(consultaAntesDelCursor('Hola @', 6)).toEqual({ desde: 5, consulta: '' });
  });
  it('un correo no abre el menú, ni un salto de línea, ni una consulta larguísima', () => {
    expect(consultaAntesDelCursor('escribe a ana@zero.com', 22)).toBeNull();
    expect(consultaAntesDelCursor('@ana\nsigue', 10)).toBeNull();
    expect(consultaAntesDelCursor(`@${'a'.repeat(40)}`, 41)).toBeNull();
    expect(consultaAntesDelCursor('sin arroba', 10)).toBeNull();
  });
});

describe('a dónde lleva cada chip', () => {
  it('padres, estudiantes y documentos tienen pantalla; las personas, no', () => {
    expect(enlaceDeMencion({ tipo: 'padre', id: 5 })).toBe('/escolar/responsables/5');
    expect(enlaceDeMencion({ tipo: 'estudiante', id: 6 })).toBe('/escolar/estudiantes/6');
    for (const tipo of ['factura', 'nc', 'nd'] as const) expect(enlaceDeMencion({ tipo, id: 7 })).toBe('/dashboard/facturas/7');
    expect(enlaceDeMencion({ tipo: 'persona', id: 8 })).toBeNull();
  });
});

describe('los límites de la búsqueda', () => {
  it('seis grupos en su orden, 5 por grupo, 2 letras y 250 ms', () => {
    expect(GRUPOS_MENCION.map((g) => g.titulo)).toEqual([
      'Personas', 'Padres', 'Estudiantes', 'Facturas', 'Notas de crédito', 'Notas de débito',
    ]);
    expect([MAX_POR_GRUPO, MIN_BUSQUEDA, DEBOUNCE_MENCIONES_MS]).toEqual([5, 2, 250]);
  });
  it('los comodines de LIKE de lo que escribe la persona se escapan', () => {
    expect(escaparLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
});

describe('lo que dice el código', () => {
  it('el endpoint está acotado al colegio de la tarea y pide permisos para padres y documentos', () => {
    const r = leer('app', 'api', 'administracion-escolar', 'tareas', '[id]', 'menciones', 'route.ts');
    expect(r).toMatch(/leerTarea\(auth\.teamId, id\)/);
    expect(r).toContain("'clientes:ver'");
    expect(r).toContain("'facturas:ver'");
    const s = leer('lib', 'administracion-escolar', 'tareas-menciones-servidor.ts');
    expect(s).toMatch(/\.limit\(MAX_POR_GRUPO\)/g);
    expect(s.match(/eq\((clients|adminEscolarEstudiantes|ecfDocuments)\.teamId, teamId\)/g)!.length).toBeGreaterThanOrEqual(6);
  });
  it('se pintan con elementos de React: nunca HTML crudo', () => {
    expect(leer('components', 'administracion-escolar', 'MencionesTarea.tsx')).not.toContain('dangerouslySetInnerHTML');
    expect(leer('components', 'administracion-escolar', 'TareasEstudiante.tsx')).not.toContain('dangerouslySetInnerHTML');
  });
  it('el cliente cancela la búsqueda vieja y espera antes de llamar', () => {
    const c = leer('components', 'administracion-escolar', 'MencionesTarea.tsx');
    expect(c).toContain('new AbortController()');
    expect(c).toContain('ctrl.abort()');
    expect(c).toContain('DEBOUNCE_MENCIONES_MS');
  });
  it('el mensaje se valida contra el colegio antes de guardarlo', () => {
    const r = leer('app', 'api', 'administracion-escolar', 'tareas', '[id]', 'mensajes', 'route.ts');
    expect(r.indexOf('resolverMencionesGuardadas')).toBeLessThan(r.indexOf('agregarMensaje(auth.teamId'));
  });
});
