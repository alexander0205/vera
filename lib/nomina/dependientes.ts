/**
 * Dependientes del empleado en el Seguro Familiar de Salud — lógica pura.
 *
 * La TSS distingue dos clases (FAQ de la TSS):
 *   · DIRECTOS: cónyuge e hijos o hijastros menores de edad (y los de 18 a 21
 *     que estudian). Se registran solo en la ARS y no cuestan nada.
 *   · ADICIONALES: hijos o hijastros mayores de 18 que no estudian, mayores de
 *     21, padres del titular y padres del cónyuge. Se afilian primero en la ARS,
 *     se registran en el SUIR, y el trabajador paga una cápita mensual por cada
 *     uno (ver `capitaDependienteVigente`).
 *
 * Lo que se COBRA es lo que está registrado —el campo `tipo`— porque eso es lo
 * que la TSS factura. La edad solo sirve para AVISAR: el hijo que cumplió 18 y
 * no estudia ya no es directo, y el que estudia y figura como adicional podría
 * estar pagando de más.
 */

import { esFechaYMD } from '@/lib/nomina/periodos';

export const PARENTESCOS = ['conyuge', 'hijo', 'hijastro', 'padre_madre', 'suegro_suegra'] as const;
export type Parentesco = (typeof PARENTESCOS)[number];
export type TipoDependiente = 'directo' | 'adicional';

export const LABEL_PARENTESCO: Record<Parentesco, string> = {
  conyuge: 'Cónyuge',
  hijo: 'Hijo o hija',
  hijastro: 'Hijastro o hijastra',
  padre_madre: 'Padre o madre',
  suegro_suegra: 'Padre o madre del cónyuge',
};

export const esParentesco = (v: unknown): v is Parentesco =>
  (PARENTESCOS as readonly string[]).includes(String(v));

export const esTipoDependiente = (v: unknown): v is TipoDependiente => v === 'directo' || v === 'adicional';

export interface DependienteBase {
  nombre: string;
  parentesco: Parentesco;
  fechaNacimiento: string | null;
  estudiante: boolean;
  tipo: TipoDependiente;
  /** Alta en el registro, 'YYYY-MM-DD'. */
  desde: string;
  /** Baja, 'YYYY-MM-DD'; null = vigente. */
  hasta: string | null;
}

/** Años cumplidos en una fecha ('YYYY-MM-DD'), sin zona horaria de por medio. */
export function edadEnFecha(fechaNacimiento: string, fechaYMD: string): number {
  const [ny, nm, nd] = fechaNacimiento.split('-').map(Number);
  const [fy, fm, fd] = fechaYMD.split('-').map(Number);
  let edad = fy - ny;
  if (fm < nm || (fm === nm && fd < nd)) edad -= 1;
  return edad;
}

/**
 * La clase que le corresponde según la TSS en una fecha, o null si es un hijo
 * sin fecha de nacimiento: sin ella no hay forma de saberlo, y adivinar aquí es
 * adivinar un descuento.
 */
export function tipoSegunTSS(
  d: Pick<DependienteBase, 'parentesco' | 'fechaNacimiento' | 'estudiante'>,
  fechaYMD: string,
): TipoDependiente | null {
  if (d.parentesco === 'conyuge') return 'directo';
  if (d.parentesco === 'padre_madre' || d.parentesco === 'suegro_suegra') return 'adicional';
  if (!d.fechaNacimiento) return null;
  const edad = edadEnFecha(d.fechaNacimiento, fechaYMD);
  if (edad < 18) return 'directo';
  if (edad < 21 && d.estudiante) return 'directo';
  return 'adicional';
}

/** ¿Estuvo registrado algún día del rango? (inclusivo en ambos extremos) */
export function vigenteEnRango(d: Pick<DependienteBase, 'desde' | 'hasta'>, inicio: string, fin: string): boolean {
  return d.desde <= fin && (d.hasta === null || d.hasta >= inicio);
}

/** Cuántos dependientes ADICIONALES hay que cobrar en el rango. */
export function contarAdicionalesVigentes(
  deps: Pick<DependienteBase, 'tipo' | 'desde' | 'hasta'>[],
  inicio: string,
  fin: string,
): number {
  return deps.filter((d) => d.tipo === 'adicional' && vigenteEnRango(d, inicio, fin)).length;
}

/**
 * Avisos sobre los dependientes vigentes cuyo registro no coincide con la regla
 * de la TSS. No cambian el cobro: lo que se descuenta sigue siendo lo registrado.
 */
export function avisosDependientes(deps: DependienteBase[], hoyYMD: string): string[] {
  const avisos: string[] = [];
  for (const d of deps) {
    if (d.hasta !== null && d.hasta < hoyYMD) continue;
    const segun = tipoSegunTSS(d, hoyYMD);
    if (segun === null) {
      avisos.push(`${d.nombre}: falta la fecha de nacimiento para saber si es dependiente directo o adicional.`);
    } else if (segun === 'adicional' && d.tipo === 'directo') {
      avisos.push(`${d.nombre} ya no califica como dependiente directo según la TSS: para mantenerlo en el seguro hay que registrarlo como adicional en el SUIR.`);
    } else if (segun === 'directo' && d.tipo === 'adicional') {
      avisos.push(`${d.nombre} califica como dependiente directo, que no cuesta: revisa si puede pasar a directo en la ARS y darse de baja como adicional.`);
    }
  }
  return avisos;
}

export type DatosDependiente = Omit<DependienteBase, 'hasta'> & { hasta: string | null; cedula: string | null };

/**
 * Valida lo que llega del formulario. Devuelve los datos limpios o el primer
 * error, redactado para enseñarlo tal cual.
 */
export function validarDependiente(body: Record<string, unknown>): { ok: true; datos: DatosDependiente } | { ok: false; error: string } {
  const nombre = String(body.nombre ?? '').trim();
  if (!nombre) return { ok: false, error: 'Escribe el nombre del dependiente' };
  if (nombre.length > 200) return { ok: false, error: 'El nombre es demasiado largo' };

  if (!esParentesco(body.parentesco)) return { ok: false, error: 'Elige el parentesco' };
  if (!esTipoDependiente(body.tipo)) return { ok: false, error: 'Elige si está registrado como directo o como adicional' };

  const cedulaTexto = String(body.cedula ?? '').replace(/\D/g, '');
  if (cedulaTexto !== '' && cedulaTexto.length !== 11) return { ok: false, error: 'La cédula lleva 11 dígitos' };

  const fechaNacimiento = body.fechaNacimiento === '' || body.fechaNacimiento == null ? null : body.fechaNacimiento;
  if (fechaNacimiento !== null && !esFechaYMD(fechaNacimiento)) return { ok: false, error: 'Fecha de nacimiento inválida' };

  if (!esFechaYMD(body.desde)) return { ok: false, error: 'Indica desde cuándo está registrado' };
  const hasta = body.hasta === '' || body.hasta == null ? null : body.hasta;
  if (hasta !== null && !esFechaYMD(hasta)) return { ok: false, error: 'Fecha de baja inválida' };
  if (hasta !== null && hasta < body.desde) return { ok: false, error: 'La baja no puede ser antes del alta' };

  return {
    ok: true,
    datos: {
      nombre,
      cedula: cedulaTexto === '' ? null : cedulaTexto,
      parentesco: body.parentesco,
      fechaNacimiento,
      estudiante: Boolean(body.estudiante),
      tipo: body.tipo,
      desde: body.desde,
      hasta,
    },
  };
}
