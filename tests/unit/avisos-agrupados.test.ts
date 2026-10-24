import { describe, expect, it, vi } from 'vitest';
import {
  avisosDeHoy, mensajesEnviados, redactar,
  type AvisoPendiente, type EnvioHecho, type FilaAviso,
} from '@/lib/administracion-escolar/avisos';
import {
  agruparPendientes, asuntoDeAviso, datosWhatsAppDeGrupo, redactarGrupo, resumirGrupo, unirLista,
} from '@/lib/administracion-escolar/agrupar-avisos';
import { parametrosDeAviso } from '@/lib/whatsapp/plantillas';
import { analizarSms, aGsm7 } from '@/lib/sms/mensaje';

/**
 * Un mensaje por familia.
 *
 * El error caro es doble: que tres hermanos sigan recibiendo tres mensajes
 * (lo que esto viene a arreglar) o, al revés, que se junte lo que no debe —dos
 * mensajes que dicen cosas distintas, o los de dos familias— y a una madre le
 * llegue la deuda de otra. Y un tercero, más sutil: que quien NO tiene hermanos
 * vea cambiar su mensaje de siempre.
 */

const BASE: FilaAviso = {
  cargoId: 1, teamId: 9, estudianteId: 10, clientId: 1689,
  estudiante: 'Ana Pérez', concepto: 'Colegiatura de octubre',
  saldoCentavos: 500000,
  ecfDocumentId: 77,
  fechaEmision: '2026-09-28',
  fechaVencimiento: '2026-10-03',
  cobraMora: true,
  avisoDiaEmision: true,
  avisoDiaVencimiento: true,
  avisoAntesMoraDias: 2,
  moraDiasGracia: 5,
  avisoCorreo: true, avisoWhatsapp: true, avisoSms: true,
  destinatario: 'Madre Pérez', email: 'madre@x.com', whatsapp: '8095551234', celular: '8095551234', telefono: null,
};

const fila = (p: Partial<FilaAviso> = {}): FilaAviso => ({ ...BASE, ...p });

/** Los tres hijos de la familia 1689. */
const HERMANOS = [
  fila({ cargoId: 1, estudianteId: 10, estudiante: 'Ana Pérez' }),
  fila({ cargoId: 2, estudianteId: 11, estudiante: 'Pedro Pérez' }),
  fila({ cargoId: 3, estudianteId: 12, estudiante: 'Luis Pérez' }),
];

const VENCER = '2026-10-03';
const EMITIR = '2026-09-28';
const ANTES_MORA = '2026-10-06';

const pendientesDe = (filas: FilaAviso[], hoy: string) => filas.flatMap((f) => avisosDeHoy(f, hoy));

describe('agruparPendientes', () => {
  it('tres hermanos el mismo día son UN mensaje por canal', () => {
    const grupos = agruparPendientes(pendientesDe(HERMANOS, VENCER));
    expect(grupos.map((g) => g.canal)).toEqual(['correo', 'whatsapp', 'sms']);
    for (const g of grupos) {
      // Ana (1), Luis (3), Pedro (2): por nombre.
      expect(g.miembros.map((m) => m.fila.cargoId)).toEqual([1, 3, 2]);
    }
  });

  it('dentro del mensaje se lee por alumno, no por orden de llegada', () => {
    const [g] = agruparPendientes(pendientesDe([...HERMANOS].reverse(), VENCER));
    expect(g.miembros.map((m) => m.fila.estudiante)).toEqual(['Ana Pérez', 'Luis Pérez', 'Pedro Pérez']);
  });

  it('el mismo resultado se mande la lista en el orden que se mande', () => {
    const a = agruparPendientes(pendientesDe(HERMANOS, VENCER));
    const b = agruparPendientes(pendientesDe([HERMANOS[2], HERMANOS[0], HERMANOS[1]], VENCER));
    expect(b.map((g) => g.clave)).toEqual(a.map((g) => g.clave));
    expect(b.map((g) => g.miembros.map((m) => m.fila.cargoId)))
      .toEqual(a.map((g) => g.miembros.map((m) => m.fila.cargoId)));
  });

  it('dos familias no se mezclan', () => {
    const otra = fila({ cargoId: 4, estudianteId: 20, estudiante: 'Zoe Gómez', clientId: 2000 });
    const grupos = agruparPendientes(pendientesDe([...HERMANOS, otra], VENCER));
    expect(grupos).toHaveLength(6);
    const deZoe = grupos.filter((g) => g.clientId === 2000);
    expect(deZoe).toHaveLength(3);
    expect(deZoe.every((g) => g.miembros.length === 1)).toBe(true);
  });

  it('los mensajes de una misma familia quedan seguidos, para que la tanda no la parta', () => {
    const otra = fila({ cargoId: 4, estudianteId: 20, estudiante: 'Zoe Gómez', clientId: 2000 });
    const familias = agruparPendientes(pendientesDe([otra, ...HERMANOS], VENCER)).map((g) => g.claveFamilia);
    // Cada familia aparece en UN solo tramo seguido.
    const tramos = familias.filter((f, i) => i === 0 || f !== familias[i - 1]);
    expect(tramos).toHaveLength(new Set(familias).size);
    // Y la 1689 va antes que la 2000: orden por responsable.
    expect(agruparPendientes(pendientesDe([otra, ...HERMANOS], VENCER))[0].clientId).toBe(1689);
  });

  it('el momento no se mezcla: emitir, vencer y antes del recargo son recados distintos', () => {
    // El mismo cargo no cae en dos momentos el mismo día, así que se arman tres
    // avisos de días distintos y se comprueba que cada uno forma su propio grupo.
    const todos = [
      ...pendientesDe(HERMANOS, EMITIR),
      ...pendientesDe(HERMANOS, VENCER),
      ...pendientesDe(HERMANOS, ANTES_MORA),
    ];
    const grupos = agruparPendientes(todos);
    expect(new Set(grupos.map((g) => g.aviso))).toEqual(new Set(['al-emitir', 'al-vencer', 'antes-mora']));
    expect(grupos.every((g) => g.miembros.length === 3)).toBe(true);
  });

  it('el día cuenta: lo de otro día no se junta aunque sea el mismo momento', () => {
    const hoy = pendientesDe(HERMANOS, VENCER);
    const ayer = pendientesDe(HERMANOS, VENCER).map((p) => ({ ...p, fecha: '2026-10-02' }));
    const grupos = agruparPendientes([...hoy, ...ayer]);
    expect(grupos).toHaveLength(6);
    expect(grupos.every((g) => g.miembros.length === 3)).toBe(true);
  });

  it('cobros con distinto hueco de plantilla salen aparte', () => {
    // La colegiatura cobra mora con gracia; los libros no. Un mismo mensaje no
    // puede decir «tienes 5 días antes del recargo» y «págala para ponerte al
    // día» a la vez.
    const colegiatura = fila({ cargoId: 1 });
    const libros = fila({ cargoId: 2, concepto: 'Libros', cobraMora: false });
    const grupos = agruparPendientes(pendientesDe([colegiatura, libros], VENCER));
    expect(grupos.filter((g) => g.canal === 'correo').map((g) => g.hueco).sort())
      .toEqual(['al-vencer-con-gracia', 'al-vencer-sin-mora']);
    expect(grupos).toHaveLength(6);
  });

  it('con gracia, los días de gracia distintos tampoco se funden', () => {
    const cinco = fila({ cargoId: 1, moraDiasGracia: 5 });
    const tres = fila({ cargoId: 2, moraDiasGracia: 3 });
    const grupos = agruparPendientes(pendientesDe([cinco, tres], VENCER)).filter((g) => g.canal === 'sms');
    expect(grupos).toHaveLength(2);
  });

  it('el canal apagado en un concepto deja a ese cobro fuera de ese mensaje', () => {
    const sinSms = fila({ cargoId: 2, estudianteId: 11, estudiante: 'Pedro Pérez', avisoSms: false });
    const grupos = agruparPendientes(pendientesDe([HERMANOS[0], sinSms, HERMANOS[2]], VENCER));
    const porCanal = (c: string) => grupos.find((g) => g.canal === c)!.miembros.map((m) => m.fila.cargoId);
    expect(porCanal('correo')).toEqual([1, 3, 2]);
    expect(porCanal('sms')).toEqual([1, 3]);
  });

  it('sin responsable de pago no hay con quién agrupar: cada cargo queda solo', () => {
    const huerfanos = [
      fila({ cargoId: 7, clientId: null, email: null, whatsapp: null, celular: null }),
      fila({ cargoId: 8, estudianteId: 11, clientId: null, email: null, whatsapp: null, celular: null }),
    ];
    const grupos = agruparPendientes(pendientesDe(huerfanos, VENCER));
    expect(grupos).toHaveLength(6);
    expect(grupos.every((g) => g.miembros.length === 1)).toBe(true);
  });

  it('un cargo repetido en la lista no se cuenta dos veces', () => {
    const p = pendientesDe([HERMANOS[0]], VENCER);
    const grupos = agruparPendientes([...p, ...p]);
    expect(grupos.every((g) => g.miembros.length === 1)).toBe(true);
  });

  it('colegios distintos no se mezclan aunque el responsable tenga el mismo id', () => {
    const otroColegio = fila({ cargoId: 50, teamId: 12, estudianteId: 90, estudiante: 'Otro' });
    const grupos = agruparPendientes(pendientesDe([HERMANOS[0], otroColegio], VENCER));
    expect(grupos).toHaveLength(6);
    expect(grupos.map((g) => g.teamId)).toEqual([9, 9, 9, 12, 12, 12]);
  });
});

describe('un cobro suelto sale IGUAL que siempre', () => {
  const sueltos: [string, string][] = [
    ['al-emitir', EMITIR], ['al-vencer', VENCER], ['antes-mora', ANTES_MORA],
  ];

  it.each(sueltos)('texto de %s', (_aviso, dia) => {
    const p = pendientesDe([HERMANOS[0]], dia)[0];
    expect(redactarGrupo([p], 'Colegio X')).toEqual(redactar(p, 'Colegio X'));
    // Y con enlace tampoco cambia: el SMS de un cobro nunca lo lleva.
    expect(redactarGrupo([p], 'Colegio X', 'https://zero.com.do/pagar/abc')).toEqual(redactar(p, 'Colegio X'));
  });

  it.each(sueltos)('variables de la plantilla de %s', (_aviso, dia) => {
    const p = pendientesDe([HERMANOS[0]], dia)[0];
    const datos = datosWhatsAppDeGrupo([p], { colegio: 'Colegio X', telefonoColegio: '809-555-0000' });
    // Lo que el cron armaba en línea antes de agrupar.
    expect(datos).toEqual({
      colegio: 'Colegio X',
      concepto: 'Colegiatura de octubre',
      estudiante: 'Ana Pérez',
      monto: 'RD$5,000.00',
      telefonoColegio: '809-555-0000',
      fechaLimite: '3 de octubre',
      diasGracia: 5,
      fechaRecargo: '8 de octubre',
    });
  });

  it('un cargo sin vencimiento no inventa fechas', () => {
    const p = { ...pendientesDe([HERMANOS[0]], VENCER)[0], fila: fila({ fechaVencimiento: null }) };
    const datos = datosWhatsAppDeGrupo([p], { colegio: 'C', telefonoColegio: '' });
    expect(datos.fechaLimite).toBeNull();
    expect(datos.fechaRecargo).toBeNull();
  });
});

describe('el mensaje de varios cobros', () => {
  const grupoDe = (dia: string, filas = HERMANOS) => agruparPendientes(pendientesDe(filas, dia))[0].miembros;

  it('enumera «alumno – concepto: monto», suma el total y dice cuántas son', () => {
    const { largo } = redactarGrupo(grupoDe(VENCER), 'Colegio X');
    expect(largo).toContain('Hoy vencieron 3 cobros, RD$15,000.00 en total:');
    expect(largo).toContain('• Ana Pérez – Colegiatura de octubre: RD$5,000.00');
    expect(largo).toContain('• Luis Pérez – Colegiatura de octubre: RD$5,000.00');
    expect(largo).toContain('• Pedro Pérez – Colegiatura de octubre: RD$5,000.00');
    expect(largo).toContain('Tienes 5 día(s) antes de que se les aplique el recargo.');
  });

  it('suma saldos distintos', () => {
    const filas = [
      fila({ cargoId: 1, saldoCentavos: 250000 }),
      fila({ cargoId: 2, estudianteId: 11, estudiante: 'Pedro Pérez', saldoCentavos: 175050 }),
    ];
    expect(redactarGrupo(grupoDe(VENCER, filas), 'C').largo).toContain('RD$4,250.50 en total');
  });

  it('al emitir da el vencimiento MÁS CERCANO', () => {
    const filas = [
      fila({ cargoId: 1, fechaVencimiento: '2026-10-10' }),
      fila({ cargoId: 2, estudianteId: 11, estudiante: 'Pedro Pérez', fechaVencimiento: '2026-10-03' }),
    ];
    const { largo } = redactarGrupo(grupoDe(EMITIR, filas), 'C');
    expect(largo).toContain('Ya están listos 2 cobros');
    expect(largo).toContain('Tienes hasta el 3 de octubre para pagarlos.');
    expect(largo).not.toContain('10 de octubre');
  });

  it('antes del recargo da la fecha del RECARGO, no la del vencimiento', () => {
    const { largo } = redactarGrupo(grupoDe(ANTES_MORA), 'C');
    expect(largo).toContain('Paga RD$15,000.00 antes del 8 de octubre');
    expect(largo).not.toContain('3 de octubre');
  });

  it('sin días de gracia lo dice en plural y sin amenazar con días', () => {
    const filas = HERMANOS.map((f) => ({ ...f, moraDiasGracia: 0 }));
    const { largo } = redactarGrupo(grupoDe(VENCER, filas), 'C');
    expect(largo).toContain('Ya se les aplicó el recargo por mora.');
  });

  it('sin mora la cola es «págalos»', () => {
    const filas = HERMANOS.map((f) => ({ ...f, cobraMora: false }));
    expect(redactarGrupo(grupoDe(VENCER, filas), 'C').largo).toContain('Págalos para ponerte al día.');
  });

  it('una familia enorme se resume en vez de hacer un mensaje interminable', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => fila({
      cargoId: 100 + i, estudianteId: 200 + i, estudiante: `Alumno ${String(i).padStart(2, '0')}`,
    }));
    const { largo } = redactarGrupo(grupoDe(VENCER, muchos), 'C');
    expect(largo).toContain('20 cobros');
    expect(largo).toContain('• y 8 cobros más');
    expect(largo.split('\n').filter((l) => l.startsWith('• ')).length).toBe(13);
  });

  it('resumirGrupo cuenta alumnos y no cargos', () => {
    // Un mismo hijo con dos cobros: dos cobros, un alumno.
    const filas = [
      fila({ cargoId: 1, concepto: 'Colegiatura' }),
      fila({ cargoId: 2, concepto: 'Libros', saldoCentavos: 100000 }),
    ];
    const r = resumirGrupo(grupoDe(VENCER, filas));
    expect(r.cobros).toBe(2);
    expect(r.alumnos).toEqual(['Ana Pérez']);
    expect(r.conceptos).toEqual(['Colegiatura', 'Libros']);
    expect(r.totalCentavos).toBe(600000);
  });
});

describe('el SMS de varios cobros', () => {
  const ENLACE = 'https://app.zero.com.do/pagar/AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const miembros = (dia: string) => agruparPendientes(pendientesDe(HERMANOS, dia))[0].miembros;
  const unaParte = (t: string) => analizarSms(aGsm7(t)).partes === 1;

  it('lleva cuántos, cuánto, la fecha y un solo enlace', () => {
    const { corto } = redactarGrupo(miembros(ANTES_MORA), 'Colegio X', ENLACE);
    expect(corto).toContain('Colegio X');
    expect(corto).toContain('3 cobros');
    expect(corto).toContain('RD$15,000.00');
    expect(corto).toContain('08/10');
    expect(corto.match(/https:/g)).toHaveLength(1);
    expect(corto).toContain(`Detalle: ${ENLACE}`);
  });

  it('cabe en una sola parte (160) en los dos momentos con SMS', () => {
    for (const dia of [VENCER, ANTES_MORA]) {
      const { corto } = redactarGrupo(miembros(dia), 'Colegio X', ENLACE);
      expect(aGsm7(corto).length).toBeLessThanOrEqual(160);
      expect(unaParte(corto)).toBe(true);
    }
  });

  it('con un nombre de colegio larguísimo acorta el nombre y conserva el enlace', () => {
    const colegio = 'Colegio Cristiano Evangélico Bilingüe Nuestra Señora de la Altagracia del Este';
    const { corto } = redactarGrupo(miembros(ANTES_MORA), colegio, ENLACE);
    expect(unaParte(corto)).toBe(true);
    expect(corto).toContain(ENLACE);
    expect(corto.startsWith('Colegio Cristiano')).toBe(true);
  });

  it('si ni acortando el nombre cabe el enlace, renuncia al enlace y no se parte', () => {
    const enlaceLargo = `https://app.zero.com.do/pagar/${'x'.repeat(110)}`;
    const { corto } = redactarGrupo(miembros(ANTES_MORA), 'Colegio X', enlaceLargo);
    expect(unaParte(corto)).toBe(true);
    expect(corto).not.toContain('https:');
  });

  it('sin enlace (cobros sin factura) sale sin «Detalle»', () => {
    const { corto } = redactarGrupo(miembros(VENCER), 'Colegio X', null);
    expect(corto).not.toContain('Detalle');
    expect(corto).toContain('3 cobros por RD$15,000.00 vencieron hoy');
  });
});

describe('las variables de WhatsApp de varios cobros', () => {
  const datos = (filas: FilaAviso[], dia = VENCER) => datosWhatsAppDeGrupo(
    agruparPendientes(pendientesDe(filas, dia))[0].miembros,
    { colegio: 'Colegio X', telefonoColegio: '809-555-0000' },
  );

  it('junta alumnos, etiqueta el concepto con el número de cobros y suma el monto', () => {
    const d = datos(HERMANOS);
    expect(d.estudiante).toBe('Ana Pérez, Luis Pérez y Pedro Pérez');
    expect(d.concepto).toBe('Colegiatura de octubre (3)');
    expect(d.monto).toBe('RD$15,000.00');
    expect(d.fechaLimite).toBe('3 de octubre');
  });

  it('dos hermanos se leen «A y B»', () => {
    expect(datos(HERMANOS.slice(0, 2)).estudiante).toBe('Ana Pérez y Pedro Pérez');
  });

  it('conceptos distintos se enumeran', () => {
    const d = datos([
      fila({ cargoId: 1, concepto: 'Colegiatura' }),
      fila({ cargoId: 2, concepto: 'Libros' }),
    ]);
    expect(d.concepto).toBe('Colegiatura y Libros (2)');
  });

  it('con 40 hijos, nada pasa de Meta: sin saltos, sin vacíos y muy por debajo de 1024', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => fila({
      cargoId: 100 + i, estudianteId: 200 + i,
      estudiante: `Alumno Con Nombre Largo Número ${i}`, concepto: `Concepto número ${i}`,
    }));
    // Con conceptos distintos para forzar el resumen de los dos.
    const d = datosWhatsAppDeGrupo(
      muchos.map((f) => avisosDeHoy(f, VENCER)[0]),
      { colegio: 'Colegio X', telefonoColegio: '809-555-0000' },
    );
    expect(d.estudiante!.length).toBeLessThanOrEqual(160);
    expect(d.concepto!.length).toBeLessThanOrEqual(170);
    expect(d.estudiante).toMatch(/ y \d+ más$/);

    const params = parametrosDeAviso('al-vencer-con-gracia', d);
    for (const v of params) {
      expect(v).not.toMatch(/\s{2,}|[\n\r\t]/);
      expect(v.length).toBeGreaterThan(0);
    }
    expect(params.join('').length).toBeLessThan(600);
  });

  it('un nombre con saltos de línea o espacios de más se limpia igual que siempre', () => {
    const d = datos([fila({ cargoId: 1, estudiante: 'Ana\n  Pérez ' }), fila({ cargoId: 2, estudianteId: 11, estudiante: 'Pedro Pérez' })]);
    const params = parametrosDeAviso('al-vencer-con-gracia', d);
    expect(params[2]).toBe('Ana Pérez y Pedro Pérez');
  });
});

describe('unirLista', () => {
  it('una, dos, tres y más', () => {
    expect(unirLista(['A'], 100)).toBe('A');
    expect(unirLista(['A', 'B'], 100)).toBe('A y B');
    expect(unirLista(['A', 'B', 'C'], 100)).toBe('A, B y C');
  });

  it('no repite', () => {
    expect(unirLista(['Libros', 'Libros', 'Matrícula'], 100)).toBe('Libros y Matrícula');
  });

  it('lo que no cabe se cuenta, no se corta a media palabra', () => {
    const nombres = ['Ana Pérez', 'Pedro Pérez', 'Luis Pérez', 'Marta Pérez', 'Juan Pérez'];
    const t = unirLista(nombres, 30);
    expect(t.length).toBeLessThanOrEqual(30);
    expect(t).toMatch(/ y \d+ más$/);
    expect(t.startsWith('Ana Pérez')).toBe(true);
  });

  it('un solo nombre desmesurado se recorta con puntos', () => {
    const t = unirLista(['X'.repeat(300)], 50);
    expect(t.length).toBeLessThanOrEqual(50);
    expect(t.endsWith('...')).toBe(true);
  });
});

describe('asuntoDeAviso', () => {
  it('un cobro: el de siempre', () => {
    expect(asuntoDeAviso('al-vencer', 1)).toBe('Tu factura venció hoy');
    expect(asuntoDeAviso('al-emitir', 1)).toBe('Tienes una factura nueva');
    expect(asuntoDeAviso('antes-mora', 1)).toBe('Evita el recargo de tu factura');
  });

  it('varios: en plural', () => {
    expect(asuntoDeAviso('al-vencer', 3)).toBe('Tus cobros vencieron hoy');
    expect(asuntoDeAviso('al-emitir', 3)).toBe('Tienes 3 cobros nuevos');
    expect(asuntoDeAviso('antes-mora', 3)).toBe('Evita el recargo de tus cobros');
  });
});

describe('mensajesEnviados', () => {
  const hecho = (p: Partial<EnvioHecho>): EnvioHecho => ({
    cargoId: 1, aviso: 'al-vencer', canal: 'correo', destino: 'a@b.com', ok: true, ...p,
  });

  it('tres hermanos en un mismo mensaje son un mensaje', () => {
    const g = 'g1';
    expect(mensajesEnviados([
      hecho({ cargoId: 1, grupo: g }), hecho({ cargoId: 2, grupo: g }), hecho({ cargoId: 3, grupo: g }),
    ])).toBe(1);
  });

  it('cada canal es su propio mensaje', () => {
    expect(mensajesEnviados([
      hecho({ cargoId: 1, grupo: 'a|correo' }), hecho({ cargoId: 2, grupo: 'a|correo' }),
      hecho({ cargoId: 1, canal: 'sms', grupo: 'a|sms' }), hecho({ cargoId: 2, canal: 'sms', grupo: 'a|sms' }),
    ])).toBe(2);
  });

  it('los fallos no gastan presupuesto', () => {
    expect(mensajesEnviados([
      hecho({ grupo: 'a', ok: false, error: 'sin correo' }), hecho({ cargoId: 2, grupo: 'b' }),
    ])).toBe(1);
  });

  it('sin clave de grupo cada cargo cuenta por su cuenta', () => {
    expect(mensajesEnviados([hecho({ cargoId: 1 }), hecho({ cargoId: 2 })])).toBe(2);
  });
});

describe('cuerpoDeAvisoHtml', () => {
  // El módulo de correo crea el cliente de Resend al cargarse y sin llave se queja.
  vi.stubEnv('RESEND_API_KEY', 're_prueba');

  it('un cobro sale como siempre: escapado y corrido', async () => {
    const { cuerpoDeAvisoHtml } = await import('@/lib/email/escolar-avisos');
    expect(cuerpoDeAvisoHtml('Hola <b>\nadiós')).toBe('Hola &lt;b&gt;\nadiós');
  });

  it('varios cobros conservan la lista y el enlace sale pulsable', async () => {
    const { cuerpoDeAvisoHtml } = await import('@/lib/email/escolar-avisos');
    const html = cuerpoDeAvisoHtml('Hoy vencieron 2:\n\n• Ana – Colegiatura: RD$1\n\nAquí: https://x.com/pagar/abc', true);
    expect(html).toContain('<br>• Ana');
    expect(html).toContain('<a href="https://x.com/pagar/abc"');
    expect(html).not.toContain('\n');
  });

  it('escapa antes de convertir: un nombre con HTML no inyecta nada', async () => {
    const { cuerpoDeAvisoHtml } = await import('@/lib/email/escolar-avisos');
    expect(cuerpoDeAvisoHtml('• <img src=x onerror=alert(1)> – Libros', true)).not.toContain('<img');
  });
});

// Evita que un cambio de tipos pase sin que se note: el pendiente que usa el
// despachador lleva el día en que cae.
describe('AvisoPendiente', () => {
  it('avisosDeHoy marca el día en que cae', () => {
    const p: AvisoPendiente = avisosDeHoy(BASE, VENCER)[0];
    expect(p.fecha).toBe(VENCER);
  });
});
