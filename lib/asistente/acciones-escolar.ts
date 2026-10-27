import 'server-only';
import { z } from 'zod';
import { accionRegistrada, registrarAccion } from './acciones';
import type { ContextoAsistente } from './contexto';
import { ErrorApi } from './api';
import { fechaYmd, hoyRd, rd } from './util';
import { generarCalendario, repartirMilesimas, type Frecuencia } from '@/lib/administracion-escolar/calendario';
import { cuotasAlMatricular, sumaCentavos } from '@/lib/administracion-escolar/cuotas-al-matricular';
import type { RespuestaLote } from '@/lib/administracion-escolar/matricula-lote';
import type { FacturaPlan, PlanLote } from '@/lib/administracion-escolar/facturar-lote';
import type { LineaPlan } from '@/components/administracion-escolar/PlanCobroSelector';

/**
 * Lo que el asistente puede HACER en Gobernanza (el módulo escolar), de la
 * creación del año escolar al cobro.
 *
 * Cada acción pasa por el carril de `acciones.ts`: el modelo propone, la
 * persona ve en la tarjeta lo que va a pasar —con las cifras que da la propia
 * API en su revisión («dryRun»)— y pulsa «Confirmar». Recién entonces se llama
 * a la MISMA ruta que usa la pantalla, con la sesión de quien confirmó: mismos
 * permisos, mismas validaciones, misma auditoría.
 *
 * La lógica del colegio (qué se configura antes de qué, qué preguntar) está en
 * la guía del prompt (`guia-gobernanza.ts`); aquí solo se ejecuta.
 */

const AE = '/api/administracion-escolar';
const CONFIGURAR = 'administracion-escolar:configurar' as const;
const GESTIONAR = 'administracion-escolar:gestionar' as const;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ── Lecturas de apoyo ───────────────────────────────────────────────────────

interface Periodo { id: number; nombre: string; activo: boolean; fechaInicio: string | null; fechaFin: string | null }
interface Concepto { id: number; nombre: string; tipo: string; frecuencia: string; productId: number | null; opcional: boolean }

async function periodoActivo(ctx: ContextoAsistente): Promise<Periodo | null> {
  const { periodos } = await ctx.api.get<{ periodos: Periodo[] }>(`${AE}/periodos`);
  return periodos.find((p) => p.activo) ?? null;
}

async function conceptoPorId(ctx: ContextoAsistente, id: number): Promise<Concepto | null> {
  const { conceptos } = await ctx.api.get<{ conceptos: Concepto[] }>(`${AE}/conceptos`);
  return conceptos.find((c) => c.id === id) ?? null;
}

/** Un «no se puede» con el texto para la persona: `acciones.ts` lo muestra tal cual. */
const falla = (mensaje: string) => new ErrorApi(400, '', mensaje);

const sinAno = { error: 'No hay año escolar activo. Primero hay que crear el año (con sus fechas de inicio y fin).' };

const lista = (xs: string[], max = 4) =>
  xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')} y ${xs.length - max} más`;

// ── Calendario de cuotas ────────────────────────────────────────────────────

/**
 * Las cuotas de un concepto en el año activo, como las arma la pantalla de
 * Conceptos (`generarCalendario`), recortadas a los meses que pide el colegio
 * («de agosto a mayo», «solo noviembre y mayo») o a fechas sueltas (una
 * excursión el 2 de noviembre). Las partes se reparten de nuevo entre las que
 * quedan para que sigan sumando el 100 %.
 */
export function calendarioDeConcepto(opts: {
  nombre: string;
  frecuencia: Frecuencia;
  diaEmision: number;
  periodo: Pick<Periodo, 'fechaInicio' | 'fechaFin'>;
  meses?: number[];
  fechas?: string[];
}): { etiqueta: string; mes: number | null; fechaEmision: string; porcentajeMilesimas: number }[] {
  if (opts.fechas && opts.fechas.length > 0) {
    const fechas = [...new Set(opts.fechas)].sort();
    const partes = repartirMilesimas(fechas.length);
    return fechas.map((f, i) => {
      const mes = Number(f.slice(5, 7));
      return {
        etiqueta: fechas.length === 1 ? opts.nombre : `${opts.nombre} — ${MESES[mes - 1]}`,
        mes, fechaEmision: f, porcentajeMilesimas: partes[i],
      };
    });
  }
  if (opts.frecuencia === 'unico') return [];
  let cuotas = generarCalendario({
    frecuencia: opts.frecuencia, diaEmision: opts.diaEmision,
    fechaInicio: opts.periodo.fechaInicio, fechaFin: opts.periodo.fechaFin, nombre: opts.nombre,
  });
  if (opts.meses && opts.meses.length > 0) {
    const quiere = new Set(opts.meses);
    cuotas = cuotas.filter((c) => c.mes != null && quiere.has(c.mes));
  }
  const partes = repartirMilesimas(cuotas.length);
  return cuotas.map((c, i) => ({ etiqueta: c.etiqueta, mes: c.mes, fechaEmision: c.fechaEmision, porcentajeMilesimas: partes[i] }));
}

const describirCalendario = (cuotas: { fechaEmision: string }[]) => {
  if (cuotas.length === 0) return 'se cobra una sola vez, al matricular';
  const primera = cuotas[0].fechaEmision, ultima = cuotas[cuotas.length - 1].fechaEmision;
  return cuotas.length === 1 ? `una cuota que sale el ${primera}` : `${cuotas.length} cuotas, del ${primera} al ${ultima}`;
};

// ── Esquemas compartidos ────────────────────────────────────────────────────

const id = z.number().int().positive();
const ids = (max: number) => z.array(id).min(1).max(max);

/** Cómo se cobra un concepto: emisión, vencimiento, mora y avisos. */
const cicloSchema = {
  frecuencia: z.enum(['unico', 'mensual', 'trimestral', 'semestral']).optional()
    .describe('Cada cuánto se cobra. Mensualidad, almuerzo, horario extendido: mensual. Inscripción, avance de anualidad, excursión: unico.'),
  diaEmision: z.number().int().min(1).max(30).optional().describe('Día del mes en que sale la factura (ej. 24).'),
  diasParaPago: z.number().int().min(0).max(90).optional().describe('Días que tiene la familia para pagar después de emitida (ej. 5). Sin esto no hay vencimiento ni mora.'),
  cobraMora: z.boolean().optional().describe('Si al vencer se le cobra recargo por mora (el % o monto se configura en configurar_mora).'),
  moraDiasGracia: z.number().int().min(0).max(60).optional().describe('Días de gracia después del vencimiento antes de cobrar mora.'),
  avisoAlEmitir: z.boolean().optional().describe('Avisar a la familia el día que se emite.'),
  avisoAlVencer: z.boolean().optional().describe('Avisar el día que vence.'),
  avisoAntesDeMoraDias: z.number().int().min(1).max(60).optional().describe('Avisar N días antes de que se cobre la mora.'),
  canales: z.object({ correo: z.boolean(), whatsapp: z.boolean(), sms: z.boolean() }).partial().optional(),
  meses: z.array(z.number().int().min(1).max(12)).max(12).optional()
    .describe('Meses en que se cobra (1=enero … 12=diciembre). Ej. agosto a mayo = [8,9,10,11,12,1,2,3,4,5]. Si se omite, todo el año escolar.'),
  fechas: z.array(fechaYmd).max(24).optional()
    .describe('Fechas exactas de emisión para cobros sueltos (excursión, brazalete): ["2026-11-02"]. Reemplaza a frecuencia y meses.'),
};

type Ciclo = { [K in keyof typeof cicloSchema]?: z.infer<(typeof cicloSchema)[K]> };

/** Los campos de ciclo como los espera la API de conceptos (`camposCiclo`). */
function cuerpoCiclo(c: Ciclo): Record<string, unknown> {
  const avisos = c.avisoAlEmitir ?? c.avisoAlVencer ?? c.avisoAntesDeMoraDias;
  return {
    ...(c.frecuencia ? { frecuencia: c.fechas?.length ? 'unico' : c.frecuencia } : c.fechas?.length ? { frecuencia: 'unico' } : {}),
    ...(c.diaEmision !== undefined ? { diaEmision: c.diaEmision } : {}),
    ...(c.diasParaPago !== undefined ? { diasParaPago: c.diasParaPago } : {}),
    ...(c.cobraMora !== undefined ? { cobraMora: c.cobraMora } : {}),
    ...(c.moraDiasGracia !== undefined ? { moraDiasGracia: c.moraDiasGracia } : {}),
    ...(avisos !== undefined ? { avisosActivos: true } : {}),
    ...(c.avisoAlEmitir !== undefined ? { avisoDiaEmision: c.avisoAlEmitir } : {}),
    ...(c.avisoAlVencer !== undefined ? { avisoDiaVencimiento: c.avisoAlVencer } : {}),
    ...(c.avisoAntesDeMoraDias !== undefined ? { avisoAntesMoraDias: c.avisoAntesDeMoraDias } : {}),
    ...(c.canales?.correo !== undefined ? { avisoCorreo: c.canales.correo } : {}),
    ...(c.canales?.whatsapp !== undefined ? { avisoWhatsapp: c.canales.whatsapp } : {}),
    ...(c.canales?.sms !== undefined ? { avisoSms: c.canales.sms } : {}),
  };
}

function frasesCiclo(c: Ciclo): string[] {
  const f: string[] = [];
  if (c.diaEmision) f.push(`sale el día ${c.diaEmision}`);
  if (c.diasParaPago !== undefined) f.push(c.diasParaPago === 0 ? 'vence el mismo día' : `vence a los ${c.diasParaPago} días`);
  if (c.cobraMora !== undefined) f.push(c.cobraMora ? `cobra mora${c.moraDiasGracia ? ` con ${c.moraDiasGracia} días de gracia` : ''}` : 'sin mora');
  const avisos = [c.avisoAlEmitir && 'al emitir', c.avisoAlVencer && 'al vencer', c.avisoAntesDeMoraDias && `${c.avisoAntesDeMoraDias} días antes de la mora`].filter(Boolean);
  const por = c.canales ? [c.canales.correo && 'correo', c.canales.whatsapp && 'WhatsApp', c.canales.sms && 'SMS'].filter(Boolean) : [];
  if (avisos.length) f.push(`avisa ${avisos.join(' y ')}${por.length ? ` por ${por.join(' y ')}` : ''}`);
  return f;
}

/** Pone el calendario de cuotas del año activo, si el concepto lo lleva. */
async function ponerCalendario(ctx: ContextoAsistente, conceptoId: number, nombre: string, frecuencia: Frecuencia, diaEmision: number, periodo: Periodo, c: Ciclo) {
  const cuotas = calendarioDeConcepto({ nombre, frecuencia, diaEmision, periodo, meses: c.meses, fechas: c.fechas });
  if (cuotas.length === 0) return cuotas;
  await ctx.api.enviar('PUT', `${AE}/conceptos/${conceptoId}/cuotas`, { periodoId: periodo.id, cuotas });
  return cuotas;
}

// ── Registro ────────────────────────────────────────────────────────────────

/** Idempotente: lo llaman las herramientas del chat y la ruta de confirmar. */
export function asegurarAccionesEscolares() {
  if (accionRegistrada('crear_ano_escolar')) return;

  // ─── Configuración del colegio ──────────────────────────────────────────

  registrarAccion({
    nombre: 'crear_ano_escolar', tipo: 'crear', permiso: CONFIGURAR, modulo: 'escolar',
    descripcion: 'Crea el año escolar con sus fechas (ej. «2026-2027», del 2026-08-24 al 2027-06-30). El primero queda activo.',
    esquema: z.object({ nombre: z.string().min(4).max(40), fechaInicio: fechaYmd, fechaFin: fechaYmd }),
    resumen: (a) => `Crear el año escolar «${a.nombre}», del ${a.fechaInicio} al ${a.fechaFin}.`,
    ejecutar: async (ctx, _u, a) => {
      await ctx.api.enviar('POST', `${AE}/periodos`, a);
      return { mensaje: `Año escolar «${a.nombre}» creado.`, enlace: '/escolar/configuracion/estructura' };
    },
  });

  registrarAccion({
    nombre: 'crear_secciones', tipo: 'crear', permiso: CONFIGURAR, modulo: 'escolar',
    descripcion:
      'Crea la estructura del año activo: nivel (servicio, ej. «Primario», con su tanda), grado y sección. ' +
      'Reusa lo que ya exista con el mismo nombre. Sirve para varias de una vez. Si el colegio está en SIGERD, mejor traer_de_sigerd.',
    esquema: z.object({
      secciones: z.array(z.object({
        nivel: z.string().min(2).max(80), tanda: z.string().max(40).optional(),
        grado: z.string().min(1).max(80), seccion: z.string().min(1).max(40).default('A'),
      })).min(1).max(60),
    }),
    resumen: (a) => `Crear ${a.secciones.length} sección(es): ${lista(a.secciones.map((s) => `${s.grado} ${s.seccion}`))}.`,
    previsualizar: async (ctx, a) => (await periodoActivo(ctx)) ? { resumen: `Crear ${a.secciones.length} sección(es) en el año activo: ${lista(a.secciones.map((s) => `${s.nivel}${s.tanda ? ` (${s.tanda})` : ''} › ${s.grado} ${s.seccion}`), 6)}.` } : sinAno,
    ejecutar: async (ctx, _u, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) throw falla(sinAno.error);
      type Est = { servicios: { id: number; nombre: string; tanda: string | null }[]; grados: { id: number; servicioId: number; nombre: string }[]; secciones: { id: number; gradoId: number; nombre: string }[] };
      const e = await ctx.api.get<Est>(`${AE}/concepto-precios`, { periodoId: periodo.id });
      const igual = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();
      let creadas = 0;
      for (const s of a.secciones) {
        let servicio = e.servicios.find((x) => igual(x.nombre, s.nivel) && (x.tanda ?? '') === (s.tanda ?? ''));
        if (!servicio) {
          const r = await ctx.api.enviar<{ servicio: { id: number } }>('POST', `${AE}/servicios`, { periodoId: periodo.id, nombre: s.nivel, tanda: s.tanda ?? null });
          servicio = { id: r.servicio.id, nombre: s.nivel, tanda: s.tanda ?? null };
          e.servicios.push(servicio);
        }
        let grado = e.grados.find((x) => x.servicioId === servicio!.id && igual(x.nombre, s.grado));
        if (!grado) {
          const r = await ctx.api.enviar<{ grado: { id: number } }>('POST', `${AE}/grados`, { servicioId: servicio.id, nombre: s.grado });
          grado = { id: r.grado.id, servicioId: servicio.id, nombre: s.grado };
          e.grados.push(grado);
        }
        if (!e.secciones.some((x) => x.gradoId === grado!.id && igual(x.nombre, s.seccion))) {
          const r = await ctx.api.enviar<{ curso: { id: number } }>('POST', `${AE}/cursos`, { gradoId: grado.id, nombre: s.seccion });
          e.secciones.push({ id: r.curso.id, gradoId: grado.id, nombre: s.seccion });
          creadas++;
        }
      }
      return { mensaje: creadas === a.secciones.length ? `Listo: ${creadas} sección(es) creadas.` : `Listo: ${creadas} nueva(s); las demás ya existían.`, enlace: '/escolar/configuracion/estructura' };
    },
  });

  registrarAccion({
    nombre: 'descargar_sigerd', tipo: 'modificar', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Descarga de SIGERD (MINERD) todo el centro: estructura, estudiantes, fichas y personal. Tarda unos minutos. ' +
      'Necesita las credenciales de SIGERD guardadas en Configuración › SIGERD: la contraseña NUNCA se pide por el chat.',
    esquema: z.object({ anoAcademico: z.number().int().min(20).max(40).optional().describe('Año académico de SIGERD (ej. 25 para 2025-2026). Si no lo sabes, omítelo.') }),
    resumen: () => 'Descargar de SIGERD la estructura, los estudiantes y el personal del centro.',
    previsualizar: async (ctx) => {
      const e = await ctx.api.get<{ estado: string; conDescarga: boolean; nEstudiantes: number | null; completadoEn: string | null }>('/api/sigerd/obtener');
      if (e.estado === 'corriendo') return { error: 'Ya hay una descarga de SIGERD en curso. Espera a que termine.' };
      return { resumen: e.conDescarga
        ? `Volver a descargar SIGERD. Hoy hay una descarga con ${e.nEstudiantes ?? 0} estudiantes${e.completadoEn ? ` (del ${e.completadoEn.slice(0, 10)})` : ''}; si la nueva viene incompleta, se conserva la anterior.`
        : 'Descargar de SIGERD la estructura, los estudiantes y el personal del centro (primera vez).' };
    },
    ejecutar: async (ctx, _u, a) => {
      const r = await ctx.api.enviar<{ estado: string; mensaje?: string; nEstudiantes?: number; nSecciones?: number }>('POST', '/api/sigerd/obtener', a.anoAcademico ? { anoAcademico: a.anoAcademico } : {});
      if (r.estado === 'error') throw falla(r.mensaje ?? 'SIGERD no respondió.');
      return { mensaje: `Descarga lista: ${r.nEstudiantes ?? 0} estudiantes en ${r.nSecciones ?? 0} secciones.`, enlace: '/escolar/configuracion/sigerd' };
    },
  });

  registrarAccion({
    nombre: 'traer_de_sigerd', tipo: 'crear', permiso: CONFIGURAR, modulo: 'escolar',
    descripcion:
      'Pasa a Zero lo descargado de SIGERD: paso «estructura» crea niveles, grados y secciones enlazados a SIGERD (exige año activo); ' +
      'paso «estudiantes» crea las fichas de los alumnos (sin matricularlos). Es idempotente: lo que ya existe no se duplica.',
    esquema: z.object({ paso: z.enum(['estructura', 'estudiantes']) }),
    resumen: (a) => a.paso === 'estructura' ? 'Crear en Zero la estructura que tiene SIGERD.' : 'Crear en Zero las fichas de los estudiantes que tiene SIGERD.',
    previsualizar: async (ctx, a) => {
      if (a.paso === 'estructura' && !(await periodoActivo(ctx))) return sinAno;
      type Fila = { estado: 'nuevo' | 'existe' | 'dudoso' };
      const r = await ctx.api.get<{ hayDatos: boolean; plan?: { totales: { servicios: number; grados: number; secciones: number }; estudiantes: Fila[] } }>('/api/sigerd/plan');
      if (!r.hayDatos || !r.plan) return { error: 'Todavía no hay nada descargado de SIGERD: primero hay que descargarlo.' };
      if (a.paso === 'estructura') {
        const t = r.plan.totales;
        return { resumen: `Traer de SIGERD la estructura: ${t.servicios} nivel(es), ${t.grados} grado(s) y ${t.secciones} sección(es). Lo que ya está en Zero se reusa.` };
      }
      const nuevos = r.plan.estudiantes.filter((e) => e.estado === 'nuevo').length;
      const dudosos = r.plan.estudiantes.filter((e) => e.estado === 'dudoso').length;
      return { resumen: `Crear las fichas de ${nuevos} estudiante(s) de SIGERD (sin matricularlos).${dudosos ? ` ${dudosos} se parecen a alguien que ya está: revísalos en la pantalla.` : ''}` };
    },
    ejecutar: async (ctx, _u, a) => {
      const r = await ctx.api.enviar<{ ok: boolean; creados?: number; fallos?: unknown[] }>('POST', '/api/sigerd/cruzar', { paso: a.paso, excluir: [] });
      const fallos = Array.isArray(r.fallos) ? r.fallos.length : 0;
      return { mensaje: `Listo${typeof r.creados === 'number' ? `: ${r.creados} creado(s)` : ''}${fallos ? `; ${fallos} no se pudieron pasar (revísalos en la pantalla)` : ''}.`, enlace: '/escolar/configuracion/sigerd' };
    },
  });

  registrarAccion({
    nombre: 'crear_concepto', tipo: 'crear', permiso: CONFIGURAR, modulo: 'escolar',
    descripcion:
      'Crea un concepto de cobro del colegio (mensualidad, inscripción, almuerzo, horario extendido, excursión…) con cómo se cobra: ' +
      'día de emisión, días para pagar, mora, avisos y meses o fechas. Le pone su calendario de cuotas en el año activo. ' +
      'El precio NO va aquí: va en poner_tarifa. Pregunta lo que falte antes de proponer.',
    esquema: z.object({
      nombre: z.string().min(2).max(80),
      tipo: z.enum(['mensualidad', 'inscripcion', 'uniforme', 'actividad', 'otro']).describe('mensualidad = colegiatura; inscripcion = inscripción o avance de anualidad; actividad = excursión; otro = servicios (almuerzo, horario extendido, transporte).'),
      opcional: z.boolean().default(false).describe('true si NO todos lo llevan (almuerzo, horario extendido, programa especial). Los obligatorios salen marcados al matricular.'),
      admiteBeca: z.boolean().optional(),
      ...cicloSchema,
    }),
    resumen: (a) => `Crear el concepto «${a.nombre}» (${a.tipo}${a.opcional ? ', opcional' : ', obligatorio'}).`,
    previsualizar: async (ctx, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) return sinAno;
      const frecuencia: Frecuencia = a.fechas?.length ? 'unico' : a.frecuencia ?? (a.tipo === 'mensualidad' ? 'mensual' : 'unico');
      const cuotas = calendarioDeConcepto({ nombre: a.nombre, frecuencia, diaEmision: a.diaEmision ?? 1, periodo, meses: a.meses, fechas: a.fechas });
      const ciclo = frasesCiclo(a);
      return { resumen: `Crear el concepto «${a.nombre}» (${a.opcional ? 'opcional' : 'obligatorio'}): ${describirCalendario(cuotas)}${ciclo.length ? `; ${ciclo.join(', ')}` : ''}. El precio se pone después, en Tarifas.` };
    },
    ejecutar: async (ctx, _u, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) throw falla(sinAno.error);
      const frecuencia: Frecuencia = a.fechas?.length ? 'unico' : a.frecuencia ?? (a.tipo === 'mensualidad' ? 'mensual' : 'unico');
      const r = await ctx.api.enviar<{ concepto: { id: number } }>('POST', `${AE}/conceptos`, {
        nombre: a.nombre, tipo: a.tipo, opcional: a.opcional, admiteBeca: a.admiteBeca,
        // Un servicio mensual (almuerzo, horario extendido) se escribe por mes: su
        // tarifa es lo de cada cuota, no el total del año repartido. Era el error
        // de «4,000 en vez de 5,000» de la configuración de CEMM.
        precioPorCuota: frecuencia !== 'unico' || (a.fechas?.length ?? 0) > 1,
        ...cuerpoCiclo({ ...a, frecuencia }),
      });
      const cuotas = await ponerCalendario(ctx, r.concepto.id, a.nombre, frecuencia, a.diaEmision ?? 1, periodo, a);
      return { mensaje: `Concepto «${a.nombre}» creado: ${describirCalendario(cuotas)}. Falta ponerle el precio en Tarifas.`, enlace: '/escolar/configuracion/conceptos' };
    },
  });

  registrarAccion({
    nombre: 'configurar_concepto', tipo: 'modificar', permiso: CONFIGURAR, modulo: 'escolar',
    descripcion:
      'Cambia cómo se cobra un concepto que ya existe: día de emisión, vencimiento, mora, avisos, si es opcional, o sus meses/fechas ' +
      '(rehace su calendario del año activo; una cuota ya facturada no se puede quitar). Usa el conceptoId de configuracion_colegio.',
    esquema: z.object({
      conceptoId: id, nombre: z.string().min(2).max(80).optional(), opcional: z.boolean().optional(), admiteBeca: z.boolean().optional(),
      ...cicloSchema,
    }),
    resumen: (a) => `Cambiar la configuración del concepto #${a.conceptoId}.`,
    previsualizar: async (ctx, a) => {
      const c = await conceptoPorId(ctx, a.conceptoId);
      if (!c) return { error: 'Ese concepto no existe en este colegio.' };
      const cambios = [...frasesCiclo(a), a.opcional !== undefined && (a.opcional ? 'pasa a opcional' : 'pasa a obligatorio'), a.nombre && `se llamará «${a.nombre}»`].filter(Boolean) as string[];
      if (a.meses?.length || a.fechas?.length) {
        const periodo = await periodoActivo(ctx);
        if (!periodo) return sinAno;
        const cuotas = calendarioDeConcepto({ nombre: a.nombre ?? c.nombre, frecuencia: (a.frecuencia ?? c.frecuencia) as Frecuencia, diaEmision: a.diaEmision ?? 1, periodo, meses: a.meses, fechas: a.fechas });
        cambios.push(`calendario: ${describirCalendario(cuotas)}`);
      }
      return { resumen: `Cambiar «${c.nombre}»: ${cambios.join('; ') || 'sin cambios'}.` };
    },
    ejecutar: async (ctx, _u, a) => {
      const c = await conceptoPorId(ctx, a.conceptoId);
      if (!c) throw falla('Ese concepto no existe en este colegio.');
      await ctx.api.enviar('PATCH', `${AE}/conceptos/${a.conceptoId}`, {
        ...(a.nombre ? { nombre: a.nombre } : {}), ...(a.opcional !== undefined ? { opcional: a.opcional } : {}),
        ...(a.admiteBeca !== undefined ? { admiteBeca: a.admiteBeca } : {}), ...cuerpoCiclo(a),
      });
      let cal = '';
      if (a.meses?.length || a.fechas?.length || a.diaEmision !== undefined) {
        const periodo = await periodoActivo(ctx);
        if (periodo) {
          const cuotas = await ponerCalendario(ctx, a.conceptoId, a.nombre ?? c.nombre, (a.fechas?.length ? 'unico' : a.frecuencia ?? c.frecuencia) as Frecuencia, a.diaEmision ?? 1, periodo, a);
          if (cuotas.length) cal = ` Calendario: ${describirCalendario(cuotas)}.`;
        }
      }
      return { mensaje: `«${a.nombre ?? c.nombre}» actualizado.${cal}`, enlace: '/escolar/configuracion/conceptos' };
    },
  });

  registrarAccion({
    nombre: 'poner_tarifa', tipo: 'modificar', permiso: CONFIGURAR, modulo: 'escolar',
    descripcion:
      'Pone el precio de un concepto para unos niveles, grados o secciones del año activo (o para un alumno: precio propio). ' +
      'monto en PESOS. En una mensualidad o un servicio mensual es lo de CADA cuota (ej. 15000 al mes), no el total del año. ' +
      'Usa los ids de configuracion_colegio. Si ya había tarifa en ese mismo lugar, la reemplaza.',
    esquema: z.object({
      conceptoId: id,
      aplicaA: z.enum(['servicio', 'grado', 'seccion', 'estudiante']).describe('servicio = un nivel entero (Primario); grado; seccion; estudiante = precio propio de un alumno.'),
      objetivoIds: ids(60).describe('Ids de los niveles, grados, secciones o estudiantes.'),
      monto: z.number().positive().max(10_000_000).describe('En pesos.'),
    }),
    resumen: (a) => `Poner ${rd(a.monto)} al concepto #${a.conceptoId} en ${a.objetivoIds.length} ${a.aplicaA}(s).`,
    previsualizar: async (ctx, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) return sinAno;
      const c = await conceptoPorId(ctx, a.conceptoId);
      if (!c) return { error: 'Ese concepto no existe en este colegio.' };
      const e = await ctx.api.get<{ servicios: { id: number; nombre: string }[]; grados: { id: number; nombre: string }[]; secciones: { id: number; nombre: string; gradoId: number }[] }>(`${AE}/concepto-precios`, { periodoId: periodo.id });
      const nombres = a.objetivoIds.map((i) => a.aplicaA === 'servicio' ? e.servicios.find((x) => x.id === i)?.nombre
        : a.aplicaA === 'grado' ? e.grados.find((x) => x.id === i)?.nombre
        : a.aplicaA === 'seccion' ? (() => { const s = e.secciones.find((x) => x.id === i); return s ? `${e.grados.find((g) => g.id === s.gradoId)?.nombre ?? ''} ${s.nombre}`.trim() : undefined; })()
        : `alumno #${i}`);
      if (a.aplicaA !== 'estudiante' && nombres.some((n) => !n)) return { error: `Alguno de esos ${a.aplicaA}s no está en el año activo. Revisa los ids con configuracion_colegio.` };
      const porCuota = c.frecuencia !== 'unico' ? ' por cuota' : '';
      return { resumen: `Poner «${c.nombre}» a ${rd(a.monto)}${porCuota} en: ${lista(nombres as string[], 8)}. A quien ya esté matriculado ahí se le cargan las cuotas que ya tocaban.` };
    },
    ejecutar: async (ctx, _u, a) => {
      const periodo = await periodoActivo(ctx);
      const c = await conceptoPorId(ctx, a.conceptoId);
      if (!periodo || !c) throw falla('Falta el año activo o el concepto.');
      let productId = c.productId;
      let cargos = 0;
      for (const objetivoId of a.objetivoIds) {
        const r = await ctx.api.enviar<{ cargosCreados?: number; producto?: { id: number } | null }>('POST', `${AE}/concepto-precios`, {
          conceptoId: c.id, periodoId: periodo.id, objetivoTipo: a.aplicaA, objetivoId, monto: a.monto,
          // Toda tarifa tiene que poder facturarse contra un producto: si el
          // concepto no tiene, la primera lo crea y se le queda al concepto.
          ...(productId == null ? { nuevoProducto: { nombre: c.nombre, precio: a.monto } } : {}),
          ...(a.aplicaA === 'estudiante' ? { devengar: true } : {}),
        });
        cargos += r.cargosCreados ?? 0;
        if (productId == null && r.producto?.id) {
          productId = r.producto.id;
          await ctx.api.enviar('PATCH', `${AE}/conceptos/${c.id}`, { productId });
        }
      }
      return { mensaje: `Tarifa puesta en ${a.objetivoIds.length} lugar(es).${cargos ? ` Se cargaron ${cargos} cuota(s) a quienes ya estaban matriculados.` : ''}`, enlace: '/escolar/configuracion/tarifas' };
    },
  });

  registrarAccion({
    nombre: 'crear_paquete', tipo: 'crear', permiso: CONFIGURAR, modulo: 'escolar',
    descripcion: 'Crea un paquete: un grupo de conceptos con nombre («Talleres HE almuerzo» = avance + mensualidad + horario extendido + almuerzo) para asignarlo de un clic al matricular. No tiene precio propio.',
    esquema: z.object({ nombre: z.string().min(2).max(80), conceptosIds: ids(20), descripcion: z.string().max(200).optional() }),
    resumen: (a) => `Crear el paquete «${a.nombre}» con ${a.conceptosIds.length} concepto(s).`,
    previsualizar: async (ctx, a) => {
      const { conceptos } = await ctx.api.get<{ conceptos: Concepto[] }>(`${AE}/conceptos`);
      const nombres = a.conceptosIds.map((i) => conceptos.find((c) => c.id === i)?.nombre);
      if (nombres.some((n) => !n)) return { error: 'Alguno de esos conceptos no existe en este colegio.' };
      return { resumen: `Crear el paquete «${a.nombre}»: ${nombres.join(' + ')}.` };
    },
    ejecutar: async (ctx, _u, a) => {
      await ctx.api.enviar('POST', `${AE}/paquetes`, a);
      return { mensaje: `Paquete «${a.nombre}» creado.`, enlace: '/escolar/configuracion/paquetes' };
    },
  });

  registrarAccion({
    nombre: 'configurar_mora', tipo: 'modificar', permiso: 'configuracion:gestionar',
    descripcion: 'Enciende o cambia el recargo por mora del colegio: porcentaje del saldo vencido (ej. 5) o monto fijo (ej. 500 pesos), y días de gracia. Solo lo puede cambiar el dueño de la empresa.',
    esquema: z.object({
      activo: z.boolean(), modo: z.enum(['porcentaje', 'fijo']).default('porcentaje'),
      porcentaje: z.number().min(0.1).max(50).optional().describe('Si modo=porcentaje, ej. 5 para 5 %.'),
      montoFijo: z.number().positive().max(100_000).optional().describe('Si modo=fijo, en pesos (se cobra por cada hijo que debe).'),
      diasGracia: z.number().int().min(0).max(60).optional(),
    }),
    resumen: (a) => !a.activo ? 'Apagar el recargo por mora.'
      : `Cobrar mora de ${a.modo === 'fijo' ? `${rd(a.montoFijo ?? 0)} por hijo` : `${a.porcentaje ?? 0} % del saldo vencido`}${a.diasGracia != null ? `, con ${a.diasGracia} días de gracia` : ''}.`,
    ejecutar: async (ctx, _u, a) => {
      await ctx.api.enviar('POST', '/api/equipo/perfil', {
        recargoMoraActivo: a.activo, recargoMoraModo: a.modo,
        ...(a.porcentaje != null ? { recargoMoraPorcentaje: Math.round(a.porcentaje * 100) } : {}),
        ...(a.montoFijo != null ? { recargoMoraMontoCents: Math.round(a.montoFijo * 100) } : {}),
        ...(a.diasGracia != null ? { recargoMoraDiasGracia: a.diasGracia } : {}),
      });
      return { mensaje: a.activo ? 'Mora configurada.' : 'Mora apagada.', enlace: '/dashboard/configuracion' };
    },
  });

  // ─── Estudiantes ────────────────────────────────────────────────────────

  registrarAccion({
    nombre: 'crear_estudiantes', tipo: 'crear', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Crea fichas de estudiantes a mano (para alumnos que NO vienen de SIGERD), cada uno con su tutor, que queda como responsable de pago. ' +
      'No los matricula: después va matricular. Hermanos: repite el mismo tutor (mismo nombre y cédula) y se usa uno solo. ' +
      'Pide del tutor: nombre, cédula, celular/WhatsApp y correo si lo tiene.',
    esquema: z.object({
      estudiantes: z.array(z.object({
        nombres: z.string().min(1).max(80), apellidos: z.string().min(1).max(80),
        sexo: z.enum(['M', 'F']).optional(), fechaNacimiento: fechaYmd.optional(),
        tutor: z.object({
          nombre: z.string().min(2).max(120), cedula: z.string().regex(/^\d{11}$/).optional(),
          relacion: z.enum(['madre', 'padre', 'tutor', 'abuelo', 'abuela', 'tio', 'tia', 'otro']).default('tutor'),
          celular: z.string().max(20).optional(), whatsapp: z.string().max(20).optional(), email: z.string().email().optional(),
        }),
      })).min(1).max(40),
    }),
    resumen: (a) => `Crear ${a.estudiantes.length} estudiante(s): ${lista(a.estudiantes.map((e) => `${e.nombres} ${e.apellidos}`))}.`,
    previsualizar: async (_ctx, a) => {
      const tutores = new Set(a.estudiantes.map((e) => claveTutor(e.tutor)));
      const sinContacto = a.estudiantes.filter((e) => !e.tutor.celular && !e.tutor.whatsapp).length;
      return { resumen: `Crear ${a.estudiantes.length} ficha(s) de estudiante con ${tutores.size} tutor(es), que quedan como responsables de pago: ${lista(a.estudiantes.map((e) => `${e.nombres} ${e.apellidos}`), 6)}.${sinContacto ? ` ${sinContacto} tutor(es) sin celular ni WhatsApp: no les llegarán los avisos.` : ''}` };
    },
    ejecutar: async (ctx, _u, a) => {
      if (!ctx.puede('clientes:gestionar')) throw falla('Tu rol no puede crear los contactos de los responsables de pago.');
      // Un tutor, un contacto y una ficha de tutor aunque tenga varios hijos en la lista.
      const hechos = new Map<string, { clientId: number; tutorId: number }>();
      let creados = 0;
      for (const e of a.estudiantes) {
        const clave = claveTutor(e.tutor);
        let t = hechos.get(clave);
        if (!t) {
          const c = await ctx.api.enviar<{ cliente: { id: number } }>('POST', '/api/clientes', {
            razonSocial: e.tutor.nombre, ...(e.tutor.cedula ? { rnc: e.tutor.cedula } : {}),
            ...(e.tutor.email ? { email: e.tutor.email } : {}), ...(e.tutor.celular ? { celular: e.tutor.celular, telefono: e.tutor.celular } : {}),
            ...(e.tutor.whatsapp ?? e.tutor.celular ? { whatsapp: e.tutor.whatsapp ?? e.tutor.celular } : {}),
          });
          const tu = await ctx.api.enviar<{ tutor: { id: number } }>('POST', `${AE}/tutores`, {
            nombre: e.tutor.nombre, documento: e.tutor.cedula, telefono: e.tutor.celular, whatsapp: e.tutor.whatsapp ?? e.tutor.celular,
            email: e.tutor.email, clientId: c.cliente.id,
          });
          t = { clientId: c.cliente.id, tutorId: tu.tutor.id };
          hechos.set(clave, t);
        }
        await ctx.api.enviar('POST', `${AE}/estudiantes`, {
          nombres: e.nombres, apellidos: e.apellidos, sexo: e.sexo, fechaNacimiento: e.fechaNacimiento,
          tutores: [{ tutorId: t.tutorId, relacion: e.tutor.relacion, responsablePago: true }], facturarAClientId: t.clientId,
        });
        creados++;
      }
      return { mensaje: `Estudiantes creados: ${creados}. Falta matricularlos.`, enlace: '/escolar/estudiantes' };
    },
  });

  // ─── Matrícula ──────────────────────────────────────────────────────────

  registrarAccion({
    nombre: 'matricular', tipo: 'crear', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Matricula a uno o varios estudiantes en UNA sección con los MISMOS conceptos (o un paquete) y crea sus cargos. ' +
      'Si cada uno lleva cosas distintas, propón una matrícula por grupo. Para alumnos que vienen de SIGERD usa matricular_desde_sigerd.',
    esquema: z.object({
      cursoId: id.describe('La sección.'), estudianteIds: ids(80),
      conceptos: z.array(id).max(20).optional().describe('Conceptos que lleva. Si se omite y hay paqueteId, los del paquete.'),
      paqueteId: id.optional(),
      fechaInscripcion: fechaYmd.optional().describe('Desde esta fecha se le cobran las cuotas. Por defecto hoy.'),
    }),
    resumen: (a) => `Matricular ${a.estudianteIds.length} estudiante(s) en la sección #${a.cursoId}.`,
    previsualizar: async (ctx, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) return sinAno;
      const conceptos = await conceptosDeMatricula(ctx, a.conceptos, a.paqueteId);
      if (conceptos.length === 0) return { error: 'Dime qué conceptos lleva (o un paquete): sin conceptos no se le cobraría nada.' };
      const fecha = a.fechaInscripcion ?? hoyRd();
      const r = await ctx.api.enviar<RespuestaLote>('POST', `${AE}/matriculas/lote`, {
        periodoId: periodo.id, cursoId: a.cursoId, estudianteIds: a.estudianteIds, conceptos, fechaInscripcion: fecha, dryRun: true,
      });
      if (r.resumen.crear === 0) return { error: `No se puede matricular a ninguno: ${r.resumen.conflicto} ya tienen matrícula y ${r.resumen.invalido} no son válidos.` };
      const quienes = r.resultados.filter((x) => x.resultado === 'crear').map((x) => x.nombre);
      // Con fecha pasada, lo que salió entre la inscripción y hoy también se carga al confirmar.
      const { lineas } = await ctx.api.get<{ lineas: LineaPlan[] }>(`${AE}/matriculas/plan-cobro`, { periodoId: periodo.id, cursoId: a.cursoId, desde: fecha });
      const c = cuentaHasta(lineas, conceptos, fecha > hoyRd() ? fecha : hoyRd());
      const seccion = await nombreSeccion(ctx, periodo.id, a.cursoId);
      return {
        resumen: `Matricular en ${seccion ?? `la sección #${a.cursoId}`} con fecha ${fecha} a ${lista(quienes, 8)}: ` +
          `${quienes.length > 1 ? 'a cada uno, ' : ''}${c.cargos} cargo(s) pendientes por ${rd(c.hoy / 100)} (lo que ya salió hasta hoy); el resto de las cuotas, en su fecha. No se cobra nada ahora.` +
          `${r.resumen.conflicto ? ` ${r.resumen.conflicto} ya tenían matrícula y se saltan.` : ''}`,
      };
    },
    ejecutar: async (ctx, _u, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) throw falla(sinAno.error);
      const conceptos = await conceptosDeMatricula(ctx, a.conceptos, a.paqueteId);
      const fecha = a.fechaInscripcion ?? hoyRd();
      const r = await ctx.api.enviar<RespuestaLote>('POST', `${AE}/matriculas/lote`, {
        periodoId: periodo.id, cursoId: a.cursoId, estudianteIds: a.estudianteIds, conceptos, fechaInscripcion: fecha, dryRun: false,
      });
      // El lote carga hasta la inscripción; las cuotas que salieron después y
      // antes de hoy las crea el devengo (cada mañana). Se corre ya, como el
      // botón «Generar cargos del mes», para que la cuenta quede al día.
      let devengados = 0;
      if (r.resumen.crear > 0 && fecha < hoyRd()) {
        const d = await ctx.api.enviar<{ cargosCreados?: number }>('POST', `${AE}/cargos/devengar`, { periodoId: periodo.id });
        devengados = d.cargosCreados ?? 0;
      }
      const cargos = r.cargoCount * r.resumen.crear + devengados;
      return {
        mensaje: `Matriculados: ${r.resumen.crear}, con ${cargos} cargo(s) pendientes.${r.resumen.conflicto ? ` ${r.resumen.conflicto} ya tenían matrícula.` : ''}${r.resumen.error ? ` ${r.resumen.error} con error.` : ''}`,
        enlace: '/escolar/matriculas',
      };
    },
  });

  registrarAccion({
    nombre: 'matricular_desde_sigerd', tipo: 'crear', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Matricula en UNA sección a alumnos que SIGERD tiene ahí, cada uno con sus conceptos (o paquete). Mira antes pendientes_sigerd. ' +
      'La inscripción es, salvo que digan otra, el inicio del año: le tocan todas las cuotas y lo ya vencido se carga hoy.',
    esquema: z.object({
      cursoId: id,
      alumnos: z.array(z.object({ estudianteId: id, conceptos: z.array(id).max(20).optional(), paqueteId: id.optional() })).min(1).max(60),
      fechaInscripcion: fechaYmd.optional(),
    }),
    resumen: (a) => `Matricular desde SIGERD a ${a.alumnos.length} alumno(s) de la sección #${a.cursoId}.`,
    previsualizar: async (ctx, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) return sinAno;
      const fecha = a.fechaInscripcion ?? periodo.fechaInicio ?? hoyRd();
      const hoy = hoyRd();
      const corte = fecha > hoy ? fecha : hoy;
      const { lineas } = await ctx.api.get<{ lineas: LineaPlan[] }>(`${AE}/matriculas/plan-cobro`, { periodoId: periodo.id, cursoId: a.cursoId, desde: fecha });
      let cargos = 0, hoyCentavos = 0;
      for (const al of a.alumnos) {
        const conceptos = await conceptosDeMatricula(ctx, al.conceptos, al.paqueteId, lineas);
        const c = cuentaHasta(lineas, conceptos, corte);
        cargos += c.cargos; hoyCentavos += c.hoy;
      }
      return { resumen: `Matricular ${a.alumnos.length} alumno(s) con inscripción del ${fecha}: ${cargos} cargo(s) pendientes por ${rd(hoyCentavos / 100)} hoy; el resto de cuotas sale en su fecha. No se cobra nada ahora.` };
    },
    ejecutar: async (ctx, _u, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) throw falla(sinAno.error);
      const { lineas } = await ctx.api.get<{ lineas: LineaPlan[] }>(`${AE}/matriculas/plan-cobro`, { periodoId: periodo.id, cursoId: a.cursoId, desde: a.fechaInscripcion ?? periodo.fechaInicio ?? hoyRd() });
      const alumnos = await Promise.all(a.alumnos.map(async (al) => ({ estudianteId: al.estudianteId, conceptos: await conceptosDeMatricula(ctx, al.conceptos, al.paqueteId, lineas), precios: [] })));
      const r = await ctx.api.enviar<{ creadas: number; conflicto: number; error: number }>('POST', `${AE}/matriculas/desde-sigerd`, {
        cursoId: a.cursoId, fechaInscripcion: a.fechaInscripcion ?? periodo.fechaInicio ?? hoyRd(), alumnos,
      });
      return { mensaje: `Matriculados: ${r.creadas}.${r.conflicto ? ` ${r.conflicto} ya tenían matrícula.` : ''}${r.error ? ` ${r.error} con error.` : ''}`, enlace: '/escolar/matriculas' };
    },
  });

  registrarAccion({
    nombre: 'cambiar_servicios', tipo: 'modificar', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Agrega o quita conceptos (almuerzo, horario extendido, programa…) a alumnos ya matriculados. Quitar anula sus cargos que nadie ha facturado ni pagado; ' +
      'agregar carga ya lo que venció. Usa los matriculaId de buscar_estudiantes o cargos_escolares.',
    esquema: z.object({ cambios: z.array(z.object({ matriculaId: id, agregar: z.array(id).max(10).default([]), quitar: z.array(id).max(10).default([]) })).min(1).max(80) }),
    resumen: (a) => {
      const ag = a.cambios.reduce((n, c) => n + c.agregar.length, 0), qu = a.cambios.reduce((n, c) => n + c.quitar.length, 0);
      return `Cambiar lo que llevan ${a.cambios.length} matrícula(s): ${ag} concepto(s) que se agregan y ${qu} que se quitan.${qu ? ' Lo que se quita anula sus cargos sin facturar ni pagar.' : ''}`;
    },
    previsualizar: async (ctx, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) return sinAno;
      const g = await ctx.api.get<{ conceptos: { id: number; nombre: string }[]; filas: { matriculaId: number; nombre: string; conceptosIds: number[] }[] }>(`${AE}/matriculas/servicios`, { periodoId: periodo.id });
      const concepto = (id: number) => g.conceptos.find((c) => c.id === id)?.nombre ?? `#${id}`;
      const frases: string[] = [];
      for (const c of a.cambios) {
        const f = g.filas.find((x) => x.matriculaId === c.matriculaId);
        if (!f) return { error: `La matrícula #${c.matriculaId} no está activa en el año. Revisa el matriculaId con buscar_estudiantes.` };
        const agregar = c.agregar.filter((id) => !f.conceptosIds.includes(id));
        const quitar = c.quitar.filter((id) => f.conceptosIds.includes(id));
        const partes = [agregar.length && `agregar ${agregar.map(concepto).join(', ')}`, quitar.length && `quitar ${quitar.map(concepto).join(', ')}`].filter(Boolean);
        if (partes.length) frases.push(`${f.nombre}: ${partes.join(' y ')}`);
      }
      if (frases.length === 0) return { error: 'Esos alumnos ya llevan exactamente eso: no hay nada que cambiar.' };
      const quita = a.cambios.some((c) => c.quitar.length);
      return { resumen: `${lista(frases, 10)}.${quita ? ' Lo que se quita deja de cobrarse y anula sus cargos que nadie ha facturado ni pagado.' : ''}${a.cambios.some((c) => c.agregar.length) ? ' Lo que se agrega carga ya las cuotas que salieron.' : ''}` };
    },
    ejecutar: async (ctx, _u, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) throw falla(sinAno.error);
      const r = await ctx.api.enviar<{ guardados?: number; anulados?: number; cargosCreados?: number }>('POST', `${AE}/matriculas/servicios`, { periodoId: periodo.id, cambios: a.cambios, anularSinFacturar: true });
      return { mensaje: `Listo: ${r.guardados ?? a.cambios.length} matrícula(s) cambiadas, ${r.anulados ?? 0} cargo(s) anulados y ${r.cargosCreados ?? 0} creados.`, enlace: '/escolar/matriculas/servicios' };
    },
  });

  registrarAccion({
    nombre: 'asignar_responsable', tipo: 'modificar', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Pone el responsable de pago de un estudiante (a quién se le factura y le llegan los avisos). Sin responsable, sus cargos no se facturan. ' +
      'Usa clientId si el contacto ya existe (buscar_clientes); si no, «nuevo» con nombre o razón social, cédula/RNC y, muy importante, celular y WhatsApp.',
    esquema: z.object({
      estudianteId: id,
      clientId: id.optional(),
      nuevo: z.object({
        razonSocial: z.string().min(2).max(160), rnc: z.string().regex(/^\d{9}$|^\d{11}$/).optional(),
        email: z.string().email().optional(), telefono: z.string().max(20).optional(),
        celular: z.string().max(20).optional(), whatsapp: z.string().max(20).optional(),
      }).optional(),
    }).refine((a) => a.clientId != null || a.nuevo != null, 'Falta el responsable'),
    resumen: (a) => a.nuevo ? `Crear el contacto «${a.nuevo.razonSocial}» y ponerlo como responsable de pago del estudiante #${a.estudianteId}.` : `Poner el contacto #${a.clientId} como responsable de pago del estudiante #${a.estudianteId}.`,
    previsualizar: async (ctx, a) => {
      const quien = await nombreEstudiante(ctx, a.estudianteId);
      if (!quien) return { error: 'Ese estudiante no existe en este colegio. Busca su estudianteId con buscar_estudiantes.' };
      if (a.nuevo) {
        const datos = [a.nuevo.rnc && `cédula/RNC ${a.nuevo.rnc}`, a.nuevo.celular && `celular ${a.nuevo.celular}`, a.nuevo.whatsapp && `WhatsApp ${a.nuevo.whatsapp}`, a.nuevo.email].filter(Boolean);
        return { resumen: `Crear el contacto «${a.nuevo.razonSocial}»${datos.length ? ` (${datos.join(', ')})` : ''} y ponerlo como responsable de pago de ${quien}: sus facturas y avisos le llegan a esa persona.` };
      }
      const c = await ctx.api.get<{ cliente?: { razonSocial?: string } }>(`/api/clientes/${a.clientId}`).catch(() => null);
      if (!c?.cliente) return { error: 'Ese contacto no existe. Búscalo con buscar_clientes o crea uno nuevo.' };
      return { resumen: `Poner a ${c.cliente.razonSocial ?? `el contacto #${a.clientId}`} como responsable de pago de ${quien}: sus facturas y avisos le llegan a esa persona.` };
    },
    ejecutar: async (ctx, _u, a) => {
      let clientId = a.clientId;
      if (!clientId && a.nuevo) {
        if (!ctx.puede('clientes:gestionar')) throw falla('Tu rol no puede crear contactos.');
        const r = await ctx.api.enviar<{ cliente: { id: number } }>('POST', '/api/clientes', a.nuevo);
        clientId = r.cliente.id;
      }
      await ctx.api.enviar('PUT', `${AE}/estudiantes/${a.estudianteId}/facturar-a`, { clientId });
      return { mensaje: 'Responsable de pago asignado.', enlace: `/escolar/estudiantes/${a.estudianteId}` };
    },
  });

  registrarAccion({
    nombre: 'dar_de_baja', tipo: 'modificar', permiso: GESTIONAR, modulo: 'escolar',
    descripcion: 'Da de baja a un estudiante (se retira, queda inactivo o se gradúa) desde una fecha: cierra su matrícula y puede anular las cuotas de meses posteriores. Lo ya facturado o cursado no se toca.',
    esquema: z.object({
      estudianteId: id, estado: z.enum(['retirado', 'inactivo', 'graduado']), fecha: fechaYmd,
      motivo: z.string().max(200).optional(), anularPosteriores: z.boolean().default(true),
    }),
    resumen: (a) => `Dar de baja al estudiante #${a.estudianteId} (${a.estado}) desde el ${a.fecha}.`,
    previsualizar: async (ctx, a) => {
      const quien = await nombreEstudiante(ctx, a.estudianteId);
      if (!quien) return { error: 'Ese estudiante no existe en este colegio. Busca su estudianteId con buscar_estudiantes.' };
      const p = await ctx.api.get<{ cargosPosteriores: { montoCentavos: number }[]; deudaQueSeQuedaCentavos: number }>(`${AE}/estudiantes/${a.estudianteId}/estado`, { accion: 'baja', fecha: a.fecha });
      const anular = p.cargosPosteriores.reduce((s, c) => s + c.montoCentavos, 0);
      return { resumen: `Dar de baja a ${quien} (${a.estado}) desde el ${a.fecha}.${a.anularPosteriores && p.cargosPosteriores.length ? ` Se anulan ${p.cargosPosteriores.length} cuota(s) posteriores por ${rd(anular / 100)}.` : ''} Sigue debiendo ${rd(p.deudaQueSeQuedaCentavos / 100)} de lo ya facturado o cursado.` };
    },
    ejecutar: async (ctx, _u, a) => {
      await ctx.api.enviar('POST', `${AE}/estudiantes/${a.estudianteId}/estado`, { accion: 'baja', estado: a.estado, fecha: a.fecha, motivo: a.motivo, anularPosteriores: a.anularPosteriores });
      return { mensaje: 'Baja registrada.', enlace: `/escolar/estudiantes/${a.estudianteId}` };
    },
  });

  // ─── Cobro ──────────────────────────────────────────────────────────────

  registrarAccion({
    nombre: 'facturar_cargos', tipo: 'crear', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Factura los cargos pendientes de unos estudiantes (una factura por familia; hermanos juntos si se pide). Las facturas nacen en borrador sin NCF: ' +
      'emitirlas a la DGII es otro paso en Facturación. Quien no tiene responsable de pago se salta.',
    esquema: z.object({
      estudianteIds: ids(100), conceptoIds: ids(20),
      meses: z.array(z.string().regex(/^\d{4}-\d{2}$/)).max(12).optional().describe('Meses a facturar, YYYY-MM. Si se omite, todo lo vencido hasta hoy.'),
      juntarHermanos: z.boolean().default(true),
    }),
    resumen: (a) => `Facturar los cargos de ${a.estudianteIds.length} estudiante(s).`,
    previsualizar: async (ctx, a) => {
      // Es POST pero sin `confirmar` solo planifica: no escribe nada.
      const r = await ctx.api.enviar<{ plan: Pick<PlanLote, 'omitidos' | 'totalCargos' | 'totalCentavos'> & { facturas: Pick<FacturaPlan, 'responsable' | 'estudiantes' | 'totalCentavos'>[] } }>('POST', `${AE}/cargos/facturar-lote`, { ...a, confirmar: false });
      if (r.plan.facturas.length === 0) return { error: `No hay nada que facturar a esos estudiantes${r.plan.omitidos.length ? ` (${r.plan.omitidos.length} sin cargos por facturar o sin responsable de pago)` : ''}.` };
      const de = a.meses?.length ? ` de ${lista(a.meses.map(mesEnLetras), 6)}` : ' con todo lo pendiente hasta hoy';
      const cuales = r.plan.facturas.map((f) => `${f.responsable ?? 'sin nombre'} (${f.estudiantes.map((e) => e.nombre.split(' ')[0]).join(', ')}) ${rd(f.totalCentavos / 100)}`);
      return { resumen: `Crear ${r.plan.facturas.length} factura(s) en borrador${de}: ${lista(cuales, 6)}. Son ${r.plan.totalCargos} cargo(s) por ${rd(r.plan.totalCentavos / 100)}.${r.plan.omitidos.length ? ` ${r.plan.omitidos.length} se saltan (sin responsable o sin nada pendiente).` : ''}` };
    },
    ejecutar: async (ctx, _u, a) => {
      const r = await ctx.api.enviar<{ creadas?: unknown[]; fallidas?: unknown[] }>('POST', `${AE}/cargos/facturar-lote`, { ...a, confirmar: true });
      return { mensaje: `Facturas creadas: ${r.creadas?.length ?? 0}.${r.fallidas?.length ? ` ${r.fallidas.length} fallaron.` : ''}`, enlace: '/dashboard/facturas' };
    },
  });

  registrarAccion({
    nombre: 'cobrar_mora', tipo: 'crear', permiso: 'facturas:crear',
    descripcion:
      'Genera ya la mora de unas facturas vencidas (una nota de débito en borrador por factura, con el % o monto que tiene configurado la empresa). ' +
      'El cobro de mora también corre solo cada mañana; esto es para no esperar. Usa los ids de factura de cuentas_por_cobrar.',
    esquema: z.object({ facturaIds: ids(50) }),
    resumen: (a) => `Generar la mora de ${a.facturaIds.length} factura(s) vencida(s).`,
    previsualizar: async (ctx, a) => {
      let aplican = 0, total = 0;
      const razones = new Set<string>();
      for (const fid of a.facturaIds) {
        const { preview } = await ctx.api.get<{ preview: { estado: string; razon?: string; montoCents?: number; yaVencida?: boolean } }>(`/api/facturas/${fid}/nota-debito-mora`);
        if (preview.estado === 'inactiva') return { error: 'La mora está apagada en esta empresa: primero hay que configurarla (configurar_mora).' };
        if (preview.estado === 'pendiente' && preview.yaVencida) { aplican++; total += preview.montoCents ?? 0; } else if (preview.razon) razones.add(preview.razon);
      }
      if (aplican === 0) return { error: `A ninguna de esas facturas le toca mora ahora${razones.size ? ` (${[...razones].slice(0, 2).join('; ')})` : ''}.` };
      return { resumen: `Generar la mora de ${aplican} factura(s) por ${rd(total / 100)} en total (notas de débito en borrador).${aplican < a.facturaIds.length ? ` A ${a.facturaIds.length - aplican} todavía no le toca.` : ''}` };
    },
    ejecutar: async (ctx, _u, a) => {
      let hechas = 0;
      for (const fid of a.facturaIds) {
        const { preview } = await ctx.api.get<{ preview: { estado: string; yaVencida?: boolean } }>(`/api/facturas/${fid}/nota-debito-mora`);
        if (preview.estado !== 'pendiente' || !preview.yaVencida) continue;
        await ctx.api.enviar('POST', `/api/facturas/${fid}/nota-debito-mora`);
        hechas++;
      }
      return { mensaje: `Mora generada en ${hechas} factura(s).`, enlace: '/dashboard/cuentas-por-cobrar' };
    },
  });

  registrarAccion({
    nombre: 'cobrar_a_grupo', tipo: 'crear', permiso: GESTIONAR, modulo: 'escolar',
    descripcion:
      'Le carga un cobro puntual a un grupo (día de cine RD$100, evaluación del período RD$200) en un mes del calendario: a unas secciones enteras o a unos estudiantes. ' +
      'Necesita un concepto que exista (créalo antes si hace falta). Lo ocasional que no todos compran (libros, brazaletes) va mejor por punto de venta.',
    esquema: z.object({
      conceptoId: id, monto: z.number().positive().max(1_000_000).describe('En pesos, por estudiante.'),
      mes: z.number().int().min(1).max(12), anio: z.number().int().min(2024).max(2100),
      cursoIds: z.array(id).max(60).optional(), estudianteIds: z.array(id).max(200).optional(),
      fechaVencimiento: fechaYmd.optional(),
    }).refine((a) => (a.cursoIds?.length ?? 0) + (a.estudianteIds?.length ?? 0) > 0, 'Faltan las secciones o los estudiantes'),
    resumen: (a) => `Cargar ${rd(a.monto)} por estudiante (${MESES[a.mes - 1]} ${a.anio}).`,
    previsualizar: async (ctx, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) return sinAno;
      const r = await ctx.api.enviar<{ total: number; creados: number; omitidos: number }>('POST', `${AE}/cargos/generar`, cuerpoGrupo(periodo.id, a, true));
      if (!r.total) return { error: 'No hay estudiantes matriculados en esas secciones.' };
      return { resumen: `Cargar ${rd(a.monto)} a ${r.total - r.omitidos} estudiante(s) por ${rd((a.monto * (r.total - r.omitidos)))} en total (${MESES[a.mes - 1]} ${a.anio}).${r.omitidos ? ` ${r.omitidos} ya lo tenían.` : ''}` };
    },
    ejecutar: async (ctx, _u, a) => {
      const periodo = await periodoActivo(ctx);
      if (!periodo) throw falla(sinAno.error);
      const r = await ctx.api.enviar<{ creados: number }>('POST', `${AE}/cargos/generar`, cuerpoGrupo(periodo.id, a, false));
      return { mensaje: `Cargos creados: ${r.creados}.`, enlace: '/escolar/cobrar-grupo' };
    },
  });
}

/** Un tutor se reconoce por su cédula; sin ella, por su nombre. */
const claveTutor = (t: { nombre: string; cedula?: string }) => t.cedula ?? t.nombre.trim().toLowerCase();

function cuerpoGrupo(periodoId: number, a: { conceptoId: number; monto: number; mes: number; anio: number; cursoIds?: number[]; estudianteIds?: number[]; fechaVencimiento?: string }, dryRun: boolean) {
  return {
    periodoId, conceptoId: a.conceptoId, mes: a.mes, anio: a.anio, montoCentavos: Math.round(a.monto * 100),
    cursoIds: a.cursoIds, estudianteIds: a.estudianteIds, fechaVencimiento: a.fechaVencimiento, dryRun,
  };
}

/**
 * Los conceptos con que se matricula: los que diga la persona o los del
 * paquete. Con las líneas del plan de la sección, solo los que tienen tarifa
 * ahí (lo mismo que hace la pantalla al aplicar un paquete).
 */
/**
 * Lo que se carga al matricular con corte en `corte`: la misma regla con la que
 * el servidor crea los cargos. No se usa `cuentaDe` de la pantalla de SIGERD:
 * pasa por `aplicarPreciosPropios`, que vive en un componente de cliente y en
 * el servidor revienta.
 */
function cuentaHasta(lineas: LineaPlan[], conceptos: number[], corte: string) {
  const { ahora } = cuotasAlMatricular(lineas, conceptos, corte);
  return { cargos: ahora.length, hoy: sumaCentavos(ahora) };
}

/** '2026-08' → «agosto 2026». */
const mesEnLetras = (aaaamm: string) => { const [y, m] = aaaamm.split('-').map(Number); return `${MESES[m - 1] ?? aaaamm} ${y}`; };

/** Nombre del alumno para la tarjeta; null si no es de este colegio. */
async function nombreEstudiante(ctx: ContextoAsistente, estudianteId: number): Promise<string | null> {
  const r = await ctx.api.get<{ estudiante?: { nombres: string; apellidos: string } }>(`${AE}/estudiantes/${estudianteId}`).catch(() => null);
  return r?.estudiante ? `${r.estudiante.nombres} ${r.estudiante.apellidos}`.trim() : null;
}

/** «Primario › Primero A», para que la tarjeta diga dónde y no un número. */
async function nombreSeccion(ctx: ContextoAsistente, periodoId: number, cursoId: number): Promise<string | null> {
  const e = await ctx.api.get<{ grados: { id: number; nombre: string }[]; secciones: { id: number; nombre: string; gradoId: number }[] }>(`${AE}/concepto-precios`, { periodoId });
  const sec = e.secciones?.find((x) => x.id === cursoId);
  if (!sec) return null;
  return `${e.grados?.find((g) => g.id === sec.gradoId)?.nombre ?? ''} ${sec.nombre}`.trim();
}

async function conceptosDeMatricula(ctx: ContextoAsistente, conceptos: number[] | undefined, paqueteId: number | undefined, lineas?: LineaPlan[]): Promise<number[]> {
  let ids = conceptos ?? [];
  if (ids.length === 0 && paqueteId) {
    const { paquetes } = await ctx.api.get<{ paquetes: { id: number; conceptosIds: number[] }[] }>(`${AE}/paquetes`);
    ids = paquetes.find((p) => p.id === paqueteId)?.conceptosIds ?? [];
  }
  if (lineas) {
    const conTarifa = new Set(lineas.map((l) => l.conceptoId));
    ids = ids.filter((i) => conTarifa.has(i));
  }
  return [...new Set(ids)];
}
