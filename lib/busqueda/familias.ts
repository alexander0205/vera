/**
 * A dónde lleva el buscador cuando se busca a un padre.
 *
 * En Gobernanza una persona puede aparecer de dos maneras: como el CONTACTO al
 * que se le factura (el responsable de pago) y como TUTOR de un alumno. Casi
 * siempre son la misma persona, pero no siempre: paga la madre y el padre
 * figura solo como tutor.
 *
 * El buscador encontraba solo al contacto y lo llevaba a SU ficha de
 * responsable. Con eso, buscar al padre que no paga —o a una madre cuya única
 * ficha de alumno era una copia ya retirada— dejaba en una pantalla vacía,
 * mientras el hijo activo y su deuda estaban en la ficha del otro padre.
 *
 * La regla que se aplica aquí:
 *
 *   busques a quien busques, se abre la ficha del responsable de pago de su
 *   hijo ACTIVO.
 *
 *   1. Si la persona paga por un hijo activo, su propia ficha.
 *   2. Si no, la de quien paga por el hijo activo del que es tutor.
 *   3. Si ya no tiene a nadie activo, la que tuviera: la suya primero.
 *
 * Sin base de datos y sin `server-only`: recibe filas y devuelve renglones.
 * La consulta que trae esas filas vive en `global.ts`.
 */

import { fmtDocumento } from '@/lib/busqueda/documento';
import type { ResultadoBusqueda } from '@/lib/busqueda/tipos';

/**
 * Una persona encontrada, junto a UN alumno suyo y a quién le factura ese
 * alumno. La misma persona llega repetida: una fila por hijo, y una vez más si
 * coincidió a la vez como contacto y como tutor.
 */
export interface VinculoFamilia {
  /** El contacto de Facturación de la persona. `null` si es un tutor sin contacto. */
  personaClientId: number | null;
  /** El tutor, cuando la fila viene de la lista de tutores. */
  tutorId: number | null;
  nombre: string;
  documento: string | null;
  /** padre | madre | tutor | cuidador | otro. `null` cuando la persona es quien paga. */
  relacion: string | null;
  /** `null` cuando la persona no tiene ningún alumno colgando. */
  estudianteId: number | null;
  /** Los nombres del alumno, sin apellidos: así se le nombra en el renglón. */
  alumno: string | null;
  activo: boolean;
  /** A quién se le factura ese alumno: la ficha que hay que abrir. */
  destinoId: number | null;
  destino: string | null;
  /**
   * El alumno le factura de verdad a `destinoId`.
   *
   * Es `false` cuando el alumno no tiene responsable de pago puesto y se cae
   * al contacto del tutor por no dejarlo sin destino: ahí no se puede escribir
   * «paga por», porque nadie ha dicho que pague.
   */
  pagadorAsignado: boolean;
}

const PARENTESCO: Record<string, string> = {
  padre: 'Padre de',
  madre: 'Madre de',
  tutor: 'Tutor de',
  cuidador: 'Cuidador de',
};

/** «Ana», «Ana y Luis», «Ana, Luis y 2 más». */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  return `${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más`;
}

/** Sin espacios de más: los nombres vienen como se teclearon. */
function nombreCorto(alumno: string): string {
  return alumno.trim().replace(/\s+/g, ' ');
}

interface Persona {
  clave: string;
  clientId: number | null;
  tutorId: number | null;
  nombre: string;
  documento: string | null;
  vinculos: VinculoFamilia[];
}

/**
 * De las filas crudas a los renglones del grupo «Padres y responsables».
 *
 * Un renglón por PERSONA, no por coincidencia: la madre que es a la vez
 * contacto y tutora sale una vez.
 */
export function resolverFamilias(vinculos: VinculoFamilia[], tope: number): ResultadoBusqueda[] {
  const personas = new Map<string, Persona>();

  for (const v of vinculos) {
    // El contacto identifica a la persona. Solo un tutor que no tiene contacto
    // se identifica por sí mismo.
    const clave = v.personaClientId != null ? `c${v.personaClientId}` : `t${v.tutorId}`;
    let p = personas.get(clave);
    if (!p) {
      p = {
        clave, clientId: v.personaClientId, tutorId: v.tutorId,
        nombre: v.nombre.trim(), documento: v.documento, vinculos: [],
      };
      personas.set(clave, p);
    }
    if (!p.documento && v.documento) p.documento = v.documento;
    p.vinculos.push(v);
  }

  const renglones: (ResultadoBusqueda & { conActivo: boolean })[] = [];

  for (const p of personas.values()) {
    const candidatos = p.vinculos.filter((v) => v.destinoId != null);
    if (candidatos.length === 0) continue; // Sin ficha a la que ir: no se ofrece.

    // El hijo activo manda; entre activos, el que paga la propia persona.
    const mejor = [...candidatos].sort((a, b) =>
      Number(b.activo && b.estudianteId != null) - Number(a.activo && a.estudianteId != null)
      || Number(b.destinoId === p.clientId) - Number(a.destinoId === p.clientId)
      || (a.alumno ?? '').localeCompare(b.alumno ?? ''))[0];

    const destinoId = mejor.destinoId!;
    const pagaElla = destinoId === p.clientId;

    // Los hijos activos que cuelgan de esa ficha, sin repetir.
    const activos = new Map<number, string>();
    for (const v of candidatos) {
      if (v.destinoId === destinoId && v.activo && v.estudianteId != null && v.alumno) {
        activos.set(v.estudianteId, nombreCorto(v.alumno));
      }
    }
    const hijos = [...activos.values()].sort((a, b) => a.localeCompare(b));

    const partes: string[] = [];
    const doc = fmtDocumento(p.documento);
    if (doc) partes.push(doc);

    const parentesco = PARENTESCO[mejor.relacion ?? ''] ?? 'Familiar de';
    const deQuien = hijos.length > 0
      ? `${parentesco} ${enumerar(hijos)}`
      : mejor.alumno ? `${parentesco} ${nombreCorto(mejor.alumno)}` : null;

    if (mejor.estudianteId == null) {
      partes.push('Sin alumnos');
    } else if (pagaElla && mejor.pagadorAsignado) {
      partes.push(hijos.length > 0 ? `Paga por ${enumerar(hijos)}` : 'Sin hijos activos');
    } else if (pagaElla) {
      // El alumno no tiene responsable de pago puesto: se dice de quién es,
      // sin afirmar que paga.
      if (deQuien) partes.push(deQuien);
    } else {
      // No es quien paga: se dice de quién es y a nombre de quién se abre,
      // para que no sorprenda llegar a una ficha con otro nombre arriba.
      if (deQuien) partes.push(deQuien);
      if (mejor.destino) partes.push(`paga ${mejor.destino.trim()}`);
    }

    renglones.push({
      tipo: 'responsable',
      // Único dentro del grupo: el contacto, o el tutor en negativo cuando no
      // tiene contacto —un tutor y un contacto pueden compartir número—.
      id: p.clientId ?? -(p.tutorId ?? 0),
      label: p.nombre,
      sublabel: partes.join(' · ') || 'Familia del colegio',
      href: `/escolar/responsables/${destinoId}`,
      conActivo: hijos.length > 0,
    });
  }

  // Las familias con alguien en el colegio, primero: con cinco huecos, la
  // copia retirada de una ficha no puede quitarle el sitio a la que se busca.
  return renglones
    .sort((a, b) => Number(b.conActivo) - Number(a.conActivo) || a.label.localeCompare(b.label))
    .slice(0, tope)
    .map(({ conActivo: _conActivo, ...r }) => r);
}
