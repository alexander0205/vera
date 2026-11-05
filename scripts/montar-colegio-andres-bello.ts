/**
 * Deja a Colegio Andrés Bello listo para entrar a Gobernanza de Colegios: SOLO
 * la base, sin inyectar datos de personas ni de dinero.
 *
 * Por defecto crea (idempotente: se puede correr dos veces sin duplicar):
 *   1. Período 2026-2027.
 *   2. Niveles (Inicial, Primaria, Secundaria), grados y una sección «A» por grado.
 *   3. Conceptos: Colegiatura (mensual), Inscripción, Materiales gastables y
 *      Evaluación de admisión.
 * Es lo mismo que la app exige para considerar un colegio «listo»
 * (período + grados + conceptos, ver `configurado.ts`).
 *
 * Opcional, APAGADO por defecto (el colegio no lo pidió):
 *   --con-tarifas   las tarifas por grado/nivel, enganchadas a los productos de
 *                   Facturación (PC-xx, MG-0x, INS-2026-2027, EVA-2026).
 *   --con-alumnos   trae como estudiantes a los beneficiarios con matrícula
 *                   2026-2027 facturada, con su responsable de pago. Con
 *                   OUT_CSV escribe además el grado sugerido de cada uno.
 *
 * Nunca crea matrículas ni cargos (generan cobros y avisos a las familias) ni
 * toca SIGERD.
 *
 * Uso (no carga .env: pásale POSTGRES_URL):
 *   POSTGRES_URL=... npx tsx scripts/montar-colegio-andres-bello.ts            # prueba: revierte
 *   POSTGRES_URL=... npx tsx scripts/montar-colegio-andres-bello.ts --aplicar  # escribe
 *   TEAM_ID=9 (opcional)
 *
 * Supuestos a confirmar con el colegio (marcados «CONFIRMAR»): fechas del
 * período, tanda de cada nivel y que cada grado tiene una sola sección «A».
 */
import { and, eq, sql } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarPeriodos, adminEscolarServicios, adminEscolarGrados, adminEscolarCursos,
  adminEscolarConceptosPago, adminEscolarConceptoPrecios, adminEscolarEstudiantes,
  dependientes, products,
} from '@/lib/db/schema';

const TEAM_ID = Number(process.env.TEAM_ID ?? 9);
const APLICAR = process.argv.includes('--aplicar');
const CON_TARIFAS = process.argv.includes('--con-tarifas');
const CON_ALUMNOS = process.argv.includes('--con-alumnos');
const OUT_CSV = process.env.OUT_CSV ?? null;

// CONFIRMAR con el colegio.
const PERIODO = { nombre: '2026-2027', inicio: '2026-08-24', fin: '2027-06-30' };

interface GradoDef { nombre: string; pc: string; mg: 'MG-01' | 'MG-02' | 'MG-03' }
const NIVELES: { servicio: string; grados: GradoDef[] }[] = [
  { servicio: 'INICIAL', grados: [
    { nombre: 'Párvulo',     pc: 'PC-P',  mg: 'MG-01' },
    { nombre: 'Pre-Kínder',  pc: 'PC-PK', mg: 'MG-01' },
    { nombre: 'Kínder',      pc: 'PC-K',  mg: 'MG-01' },
    { nombre: 'Pre-primero', pc: 'PC-PP', mg: 'MG-01' },
  ] },
  { servicio: 'PRIMARIA', grados: [
    { nombre: 'Primero de primaria', pc: 'PC-1P', mg: 'MG-01' },
    { nombre: 'Segundo de primaria', pc: 'PC-2P', mg: 'MG-02' },
    { nombre: 'Tercero de primaria', pc: 'PC-3P', mg: 'MG-02' },
    { nombre: 'Cuarto de primaria',  pc: 'PC-4P', mg: 'MG-02' },
    { nombre: 'Quinto de primaria',  pc: 'PC-5P', mg: 'MG-02' },
    { nombre: 'Sexto de primaria',   pc: 'PC-6P', mg: 'MG-03' },
  ] },
  { servicio: 'SECUNDARIA', grados: [
    { nombre: 'Primero de secundaria', pc: 'PC-1S', mg: 'MG-03' },
    { nombre: 'Segundo de secundaria', pc: 'PC-2S', mg: 'MG-03' },
    { nombre: 'Tercero de secundaria', pc: 'PC-3S', mg: 'MG-03' },
    { nombre: 'Cuarto de secundaria',  pc: 'PC-4S', mg: 'MG-03' },
    { nombre: 'Quinto de secundaria',  pc: 'PC-5S', mg: 'MG-03' },
    { nombre: 'Sexto de secundaria',   pc: 'PC-6S', mg: 'MG-03' },
  ] },
];

/** Orden de los grados, de menor a mayor, con las claves de las referencias. */
const ESCALERA = ['P', 'PK', 'K', 'PP', '1P', '2P', '3P', '4P', '5P', '6P', '1S', '2S', '3S', '4S', '5S', '6S'];

const log = (...a: unknown[]) => console.log(...a);
class Revertir extends Error {}

async function main() {
  log(`Colegio team ${TEAM_ID} — ${APLICAR ? 'APLICANDO' : 'PRUEBA (se revierte)'}`
    + ` — base${CON_TARIFAS ? ' + tarifas' : ''}${CON_ALUMNOS ? ' + alumnos' : ''}`);
  const resumen: Record<string, number> = {};
  const cuenta = (k: string) => { resumen[k] = (resumen[k] ?? 0) + 1; };

  try {
    await db.transaction(async (tx) => {
      // Productos por referencia: de ellos salen los precios, no se inventa ninguno.
      const prods = await tx.select({ id: products.id, ref: products.referencia, precio: products.precio })
        .from(products).where(eq(products.teamId, TEAM_ID));
      const prod = (ref: string) => {
        const p = prods.find((x) => x.ref?.trim() === ref);
        if (!p) throw new Error(`Falta el producto ${ref} en Facturación.`);
        return p;
      };

      // 1. Período
      let [periodo] = await tx.select().from(adminEscolarPeriodos).where(and(
        eq(adminEscolarPeriodos.teamId, TEAM_ID), eq(adminEscolarPeriodos.nombre, PERIODO.nombre))).limit(1);
      if (!periodo) {
        const [hayActivo] = await tx.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
          .where(and(eq(adminEscolarPeriodos.teamId, TEAM_ID), eq(adminEscolarPeriodos.activo, true))).limit(1);
        [periodo] = await tx.insert(adminEscolarPeriodos).values({
          teamId: TEAM_ID, nombre: PERIODO.nombre, fechaInicio: PERIODO.inicio, fechaFin: PERIODO.fin, activo: !hayActivo,
        }).returning();
        cuenta('período creado');
      }

      // 2. Niveles → grados → sección A
      const gradoIdPorPc = new Map<string, number>();
      const servicioIdPorNombre = new Map<string, number>();
      let ordenServicio = 0;
      for (const nivel of NIVELES) {
        let [s] = await tx.select().from(adminEscolarServicios).where(and(
          eq(adminEscolarServicios.teamId, TEAM_ID), eq(adminEscolarServicios.periodoId, periodo.id),
          eq(adminEscolarServicios.nombre, nivel.servicio))).limit(1);
        if (!s) {
          [s] = await tx.insert(adminEscolarServicios).values({
            teamId: TEAM_ID, periodoId: periodo.id, nombre: nivel.servicio, tanda: null, orden: ordenServicio,
          }).returning();
          cuenta('nivel creado');
        }
        ordenServicio++;
        servicioIdPorNombre.set(nivel.servicio, s.id);

        let ordenGrado = 0;
        for (const g of nivel.grados) {
          let [gr] = await tx.select().from(adminEscolarGrados).where(and(
            eq(adminEscolarGrados.teamId, TEAM_ID), eq(adminEscolarGrados.servicioId, s.id),
            eq(adminEscolarGrados.nombre, g.nombre))).limit(1);
          if (!gr) {
            [gr] = await tx.insert(adminEscolarGrados).values({
              teamId: TEAM_ID, servicioId: s.id, nombre: g.nombre, orden: ordenGrado,
            }).returning();
            cuenta('grado creado');
          }
          ordenGrado++;
          gradoIdPorPc.set(g.pc, gr.id);

          const [curso] = await tx.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos).where(and(
            eq(adminEscolarCursos.teamId, TEAM_ID), eq(adminEscolarCursos.gradoId, gr.id),
            eq(adminEscolarCursos.nombre, 'A'))).limit(1);
          if (!curso) {
            await tx.insert(adminEscolarCursos).values({ teamId: TEAM_ID, gradoId: gr.id, nombre: 'A', orden: 0 });
            cuenta('sección A creada');
          }
        }
      }

      // 3. Conceptos (valores por defecto de la columna: calendario, mora y
      //    avisos quedan como los deja la app; el colegio los ajusta en pantalla).
      const [ultimo] = await tx.select({ orden: adminEscolarConceptosPago.orden }).from(adminEscolarConceptosPago)
        .where(eq(adminEscolarConceptosPago.teamId, TEAM_ID))
        .orderBy(sql`${adminEscolarConceptosPago.orden} DESC`).limit(1);
      let orden = (ultimo?.orden ?? -1) + 1;
      const conceptoDef: { nombre: string; tipo: string; frecuencia: 'mensual' | 'unico'; admiteBeca: boolean; productId: number | null }[] = [
        { nombre: 'Colegiatura',            tipo: 'mensualidad', frecuencia: 'mensual', admiteBeca: true,  productId: null as number | null },
        { nombre: 'Inscripción',            tipo: 'inscripcion', frecuencia: 'unico',   admiteBeca: false, productId: prod('INS-2026-2027').id },
        { nombre: 'Materiales gastables',   tipo: 'otro',        frecuencia: 'unico',   admiteBeca: false, productId: null },
        { nombre: 'Evaluación de admisión', tipo: 'otro',        frecuencia: 'unico',   admiteBeca: false, productId: prod('EVA-2026').id },
      ];
      const conceptoId = new Map<string, number>();
      for (const c of conceptoDef) {
        let [row] = await tx.select().from(adminEscolarConceptosPago).where(and(
          eq(adminEscolarConceptosPago.teamId, TEAM_ID), eq(adminEscolarConceptosPago.nombre, c.nombre))).limit(1);
        if (!row) {
          [row] = await tx.insert(adminEscolarConceptosPago).values({
            teamId: TEAM_ID, nombre: c.nombre, tipo: c.tipo, frecuencia: c.frecuencia,
            admiteBeca: c.admiteBeca, productId: c.productId, activo: true, orden: orden++,
          }).returning();
          cuenta('concepto creado');
        }
        conceptoId.set(c.nombre, row.id);
      }

      // 4. Tarifas (una por nodo y concepto, por período)
      const poner = async (concepto: string, tipo: 'grado' | 'servicio', objetivoId: number, productRef: string) => {
        const p = prod(productRef);
        const [ya] = await tx.select({ id: adminEscolarConceptoPrecios.id }).from(adminEscolarConceptoPrecios).where(and(
          eq(adminEscolarConceptoPrecios.teamId, TEAM_ID),
          eq(adminEscolarConceptoPrecios.conceptoId, conceptoId.get(concepto)!),
          eq(adminEscolarConceptoPrecios.periodoId, periodo.id),
          eq(adminEscolarConceptoPrecios.objetivoTipo, tipo),
          eq(adminEscolarConceptoPrecios.objetivoId, objetivoId))).limit(1);
        if (ya) return;
        await tx.insert(adminEscolarConceptoPrecios).values({
          teamId: TEAM_ID, conceptoId: conceptoId.get(concepto)!, periodoId: periodo.id,
          objetivoTipo: tipo, objetivoId, montoCentavos: p.precio, productId: p.id, activo: true,
        });
        cuenta(`tarifa ${concepto}`);
      };
      if (CON_TARIFAS) for (const nivel of NIVELES) {
        const sid = servicioIdPorNombre.get(nivel.servicio)!;
        await poner('Inscripción', 'servicio', sid, 'INS-2026-2027');
        await poner('Evaluación de admisión', 'servicio', sid, 'EVA-2026');
        for (const g of nivel.grados) {
          const gid = gradoIdPorPc.get(g.pc)!;
          await poner('Colegiatura', 'grado', gid, g.pc);
          await poner('Materiales gastables', 'grado', gid, g.mg);
        }
      }

      // 5. Alumnos (solo con --con-alumnos): beneficiarios con matrícula
      //    2026-2027 ya facturada.
      const aMatricular = !CON_ALUMNOS ? [] : await tx.execute(sql`
        WITH l AS (
          SELECT (e.value->>'dependienteId')::int AS dep, e.value->>'referencia' AS ref, d.created_at AS fecha
            FROM ecf_documents d, jsonb_array_elements(d.lineas_json::jsonb) e
           WHERE d.team_id = ${TEAM_ID} AND d.estado <> 'ANULADO'
             AND e.value->>'dependienteId' IS NOT NULL
        )
        SELECT dep AS id,
               (SELECT ref FROM l l2 WHERE l2.dep = l.dep AND l2.ref ~ '^PC-(P|PK|K|PP|[1-6][PS]|BB)$'
                 ORDER BY fecha DESC LIMIT 1) AS grado_pc,
               (SELECT ref FROM l l3 WHERE l3.dep = l.dep AND l3.ref ~ '-2025-2026$'
                   AND l3.ref ~ '^(PC-)?(P|PK|K|PP|[1-6][PS])-2025-2026$'
                 ORDER BY fecha DESC LIMIT 1) AS ref_2025
          FROM l WHERE ref = 'INS-2026-2027' GROUP BY dep
      `) as unknown as { id: number; grado_pc: string | null; ref_2025: string | null }[];

      const filas: {
        id: number; nombre: string; apellido: string; clientId: number;
        gradoPc: string | null; promovidoDe: string | null;
      }[] = [];
      for (const a of aMatricular) {
        const [dep] = await tx.select().from(dependientes)
          .where(and(eq(dependientes.id, a.id), eq(dependientes.teamId, TEAM_ID))).limit(1);
        if (!dep) continue;
        // Sin colegiatura 2026-2027 todavía: se sugiere el grado SIGUIENTE al de
        // 2025-2026. Es una sugerencia para revisar, nunca un dato.
        const previo = a.ref_2025?.replace(/^PC-/, '').replace(/-2025-2026$/, '') ?? null;
        const i = previo ? ESCALERA.indexOf(previo) : -1;
        const promovido = !a.grado_pc && i >= 0 && i < ESCALERA.length - 1 ? `PC-${ESCALERA[i + 1]}` : null;
        filas.push({
          id: dep.id, nombre: dep.nombre, apellido: dep.apellido, clientId: dep.clientId,
          gradoPc: a.grado_pc ?? promovido, promovidoDe: promovido ? previo : null,
        });
        const [yaEs] = await tx.select({ id: adminEscolarEstudiantes.id }).from(adminEscolarEstudiantes).where(and(
          eq(adminEscolarEstudiantes.teamId, TEAM_ID), eq(adminEscolarEstudiantes.dependienteId, dep.id))).limit(1);
        if (yaEs) { cuenta('alumno ya existía'); continue; }
        await tx.insert(adminEscolarEstudiantes).values({
          teamId: TEAM_ID, dependienteId: dep.id, nombres: dep.nombre, apellidos: dep.apellido,
          facturarAClientId: dep.clientId, estado: 'activo',
        });
        cuenta('alumno creado');
      }

      if (CON_ALUMNOS) {
        resumen['grado según colegiatura 2026-27'] = filas.filter((f) => f.gradoPc && !f.promovidoDe && f.gradoPc !== 'PC-BB').length;
        resumen['grado sugerido (año pasado + 1)'] = filas.filter((f) => f.promovidoDe).length;
        resumen['alumnos becados (PC-BB)'] = filas.filter((f) => f.gradoPc === 'PC-BB').length;
        resumen['sin ningún dato de grado'] = filas.filter((f) => !f.gradoPc).length;
      }

      if (CON_ALUMNOS && OUT_CSV) {
        const gradoDe = new Map(NIVELES.flatMap((n) => n.grados.map((g) => [g.pc, g.nombre] as const)));
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        writeFileSync(OUT_CSV, '﻿' + [
          'dependiente_id,apellidos,nombres,cliente_id,grado_sugerido,nota',
          ...filas.map((f) => [
            f.id, esc(f.apellido), esc(f.nombre), f.clientId,
            esc(f.gradoPc && f.gradoPc !== 'PC-BB' ? gradoDe.get(f.gradoPc) ?? '' : ''),
            esc(f.gradoPc === 'PC-BB' ? 'Becado: confirmar grado y descuento'
              : f.promovidoDe ? `Sugerido: estaba en ${f.promovidoDe} en 2025-2026; confirmar`
              : !f.gradoPc ? 'Sin datos de grado: confirmar' : ''),
          ].join(',')),
        ].join('\n'), 'utf8');
        log(`CSV: ${OUT_CSV} (${filas.length} alumnos)`);
      }

      if (!APLICAR) throw new Revertir();
    });
  } catch (e) {
    if (!(e instanceof Revertir)) throw e;
    log('(prueba: todo revertido)');
  }

  log('Resumen:');
  for (const [k, v] of Object.entries(resumen)) log(`  ${k}: ${v}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
