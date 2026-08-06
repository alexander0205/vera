/**
 * Campos "extra" del estudiante que existen en la ficha de SIGERD y que también
 * se pueden llenar A MANO en el alta (todos OPCIONALES). Un solo lugar define la
 * lista para que el formulario, el perfil y la API no se desincronicen.
 *
 * Deriva de `FichaEstudianteSigerd` (lib/sigerd/ficha.ts). Los datos básicos
 * (nombres, apellidos, sexo, fecha de nacimiento) NO están aquí porque ya son
 * columnas propias del estudiante y campos fijos del formulario.
 */

export type GrupoCampo =
  | 'Identidad'
  | 'Contacto'
  | 'Acta de nacimiento'
  | 'Dirección'
  | 'Programa y subsidio';

export interface CampoSigerd {
  /** Clave = nombre de la columna en `admin_escolar_estudiantes` (camelCase). */
  key: string;
  label: string;
  grupo: GrupoCampo;
  tipo?: 'text' | 'tel';
  placeholder?: string;
}

export const GRUPOS_SIGERD: GrupoCampo[] = [
  'Identidad', 'Contacto', 'Acta de nacimiento', 'Dirección', 'Programa y subsidio',
];

export const CAMPOS_SIGERD_ESTUDIANTE: CampoSigerd[] = [
  // Identidad
  { key: 'nacionalidad', label: 'Nacionalidad', grupo: 'Identidad', placeholder: 'Dominicana' },
  { key: 'estadoCivil', label: 'Estado civil', grupo: 'Identidad' },
  { key: 'codigoRne', label: 'Código RNE', grupo: 'Identidad' },
  // Contacto
  { key: 'telefono', label: 'Teléfono', grupo: 'Contacto', tipo: 'tel', placeholder: '809-000-0000' },
  { key: 'celular', label: 'Celular', grupo: 'Contacto', tipo: 'tel', placeholder: '809-000-0000' },
  { key: 'whatsapp', label: 'WhatsApp', grupo: 'Contacto', tipo: 'tel', placeholder: '809-000-0000' },
  // Acta de nacimiento
  { key: 'actaEstado', label: 'Estado del acta', grupo: 'Acta de nacimiento', placeholder: 'Declarada' },
  { key: 'actaNumero', label: 'Número de acta', grupo: 'Acta de nacimiento' },
  { key: 'actaMunicipioJce', label: 'Municipio (JCE)', grupo: 'Acta de nacimiento' },
  { key: 'actaOficialiaJce', label: 'Oficialía (JCE)', grupo: 'Acta de nacimiento' },
  { key: 'actaLibro', label: 'Libro', grupo: 'Acta de nacimiento' },
  { key: 'actaFolio', label: 'Folio', grupo: 'Acta de nacimiento' },
  { key: 'actaAnio', label: 'Año', grupo: 'Acta de nacimiento' },
  // Dirección
  { key: 'dirProvincia', label: 'Provincia', grupo: 'Dirección' },
  { key: 'dirMunicipio', label: 'Municipio', grupo: 'Dirección' },
  { key: 'dirDistritoMunicipal', label: 'Distrito municipal', grupo: 'Dirección' },
  { key: 'dirSeccion', label: 'Sección', grupo: 'Dirección' },
  { key: 'dirBarrio', label: 'Barrio / paraje', grupo: 'Dirección' },
  { key: 'dirSubBarrio', label: 'Sub-barrio', grupo: 'Dirección' },
  { key: 'direccion', label: 'Dirección (calle y casa)', grupo: 'Dirección' },
  // Programa / subsidio
  { key: 'programa', label: 'Programa / tipo de estudiante', grupo: 'Programa y subsidio' },
  { key: 'tarjetaSolidaridad', label: 'Tarjeta Solidaridad', grupo: 'Programa y subsidio' },
  { key: 'tarjetaSolidaridadFamiliar', label: 'Tarjeta Solidaridad (familiar)', grupo: 'Programa y subsidio' },
];

/** Claves permitidas — para recortar cuerpos de request en la API. */
export const CLAVES_SIGERD_ESTUDIANTE = CAMPOS_SIGERD_ESTUDIANTE.map((c) => c.key);

/**
 * Recorta y normaliza un cuerpo a los campos SIGERD válidos. Cada valor: string
 * no vacío → trim; cualquier otra cosa → null. Solo incluye claves presentes en
 * el cuerpo (para PATCH parcial).
 */
export function limpiarCamposSigerd(
  body: Record<string, unknown>,
  { soloPresentes = false }: { soloPresentes?: boolean } = {},
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of CLAVES_SIGERD_ESTUDIANTE) {
    if (soloPresentes && !(key in body)) continue;
    const v = body[key];
    out[key] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  }
  return out;
}
