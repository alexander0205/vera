/**
 * Vocabulario del constructor de formularios, portado de `models/Formulario.ts`
 * del CRM (crm-escolar, Mongo/Mongoose). La UI del constructor es
 * presentacional — come un `ICampo[]` y no le importa si detrás hay Mongo o
 * Postgres — así que el vocabulario de tipos sobrevive casi intacto. Lo que
 * SÍ cambia es `mapaA`: ver más abajo.
 */

export type TipoCampo =
  | 'text' | 'email' | 'phone' | 'number'
  | 'textarea' | 'select' | 'radio' | 'checkboxes'
  | 'date' | 'heading' | 'paragraph' | 'divider'
  // Avanzados
  | 'nombre_completo' | 'direccion' | 'hora' | 'estrellas'
  | 'firma' | 'archivo'
  // Layout / estructura
  | 'salto_pagina' | 'imagen';

export const TIPOS_CAMPO: TipoCampo[] = [
  'text', 'email', 'phone', 'number',
  'textarea', 'select', 'radio', 'checkboxes',
  'date', 'heading', 'paragraph', 'divider',
  'nombre_completo', 'direccion', 'hora', 'estrellas',
  'firma', 'archivo',
  'salto_pagina', 'imagen',
];

/** Campos que no piden un valor: no cuentan para validación ni de cara al
 *  "faltan requeridos". Los mismos cinco que el CRM. */
export const TIPOS_SIN_VALOR: TipoCampo[] = ['heading', 'paragraph', 'divider', 'imagen', 'salto_pagina'];

export type AnchoCampo = 'full' | 'medio' | 'tercio';

/**
 * A qué columna de verdad puede bajar la respuesta de un campo, cuando
 * alguien la aplique.
 *
 * DIVERGENCIA DELIBERADA del CRM: allí `MapeoProspecto` apunta a los campos de
 * un `Prospecto` (un lead de Mongo). Aquí no hay leads — un formulario
 * contestado por una familia puede traer la ficha de un ESTUDIANTE real y de
 * su TUTOR, con datos sensibles (alergias, quién puede recoger al menor). Por
 * eso el tipo apunta a columnas de `admin_escolar_estudiantes` y
 * `admin_escolar_tutores`.
 *
 * Esta lista declara solo las claves OBVIAS — las que ya tienen columna hoy.
 * La capa que de verdad copia `datos[campo.id]` a esas columnas (con su
 * validación, su "quién aprobó" y su rastro) no se construye todavía: eso es
 * lo que hace `estado: 'pendiente' | 'aplicada' | 'rechazada'` en
 * `admin_escolar_formulario_respuestas` — la respuesta espera a que alguien
 * la revise antes de tocar la ficha.
 */
export type MapeoCampoZero =
  // Estudiante (admin_escolar_estudiantes)
  | 'estudianteNombres' | 'estudianteApellidos' | 'estudianteFechaNacimiento'
  | 'estudianteSexo' | 'estudianteTelefono' | 'estudianteDireccion'
  // Tutor / responsable (admin_escolar_tutores)
  | 'tutorNombre' | 'tutorDocumento' | 'tutorTelefono' | 'tutorEmail' | 'tutorDireccion';

export const MAPEO_CAMPO_OPCIONES: { value: MapeoCampoZero; label: string }[] = [
  { value: 'estudianteNombres', label: 'Estudiante · Nombres' },
  { value: 'estudianteApellidos', label: 'Estudiante · Apellidos' },
  { value: 'estudianteFechaNacimiento', label: 'Estudiante · Fecha de nacimiento' },
  { value: 'estudianteSexo', label: 'Estudiante · Sexo' },
  { value: 'estudianteTelefono', label: 'Estudiante · Teléfono' },
  { value: 'estudianteDireccion', label: 'Estudiante · Dirección' },
  { value: 'tutorNombre', label: 'Tutor · Nombre' },
  { value: 'tutorDocumento', label: 'Tutor · Cédula/Documento' },
  { value: 'tutorTelefono', label: 'Tutor · Teléfono' },
  { value: 'tutorEmail', label: 'Tutor · Correo electrónico' },
  { value: 'tutorDireccion', label: 'Tutor · Dirección' },
];

export interface ICampo {
  id: string;
  tipo: TipoCampo;
  label: string;
  placeholder?: string;
  ayuda?: string;
  requerido: boolean;
  opciones?: string[];
  mapaA?: MapeoCampoZero;
  ancho?: AnchoCampo;
  /** Para el campo 'imagen' (data URL base64). */
  imagenUrl?: string;
  // Traducciones opcionales EN, igual que el CRM: el español es el valor
  // canónico, esto solo cambia lo que se muestra en modo bilingüe.
  labelEn?: string;
  placeholderEn?: string;
  ayudaEn?: string;
  opcionesEn?: string[];
}

/**
 * Configuración del formulario. Portada de `IFormularioConfig` del CRM SIN
 * los campos de captura de leads (`crearProspecto`, `fuenteCaptacion`,
 * `tableroDestino`, `estadoDestino`): aquí no hay Kanban ni prospectos, una
 * respuesta es una respuesta.
 */
export interface IFormularioConfig {
  mensajeConfirmacion: string;
  urlRedireccion?: string;
  notificarEmail?: string;
  colorPrimario: string;
  colorFondo?: string;
  colorTarjeta?: string;
  logoUrl?: string;
  limitarEnvios?: number;
  /** ISO date string — JSONB no tiene tipo Date. */
  fechaExpiracion?: string;
  captchaActivo?: boolean;
  bilingue?: boolean;
}

export function configuracionPorDefecto(): IFormularioConfig {
  return {
    mensajeConfirmacion: '¡Gracias! Tu formulario fue recibido. El colegio se pondrá en contacto contigo.',
    colorPrimario: '#2563eb',
  };
}

// ── Slug ────────────────────────────────────────────────────────────────────

// Los diacríticos que NFD separa de su letra van del código 0x0300 al 0x036f.
// Construido con String.fromCharCode y no como literal de regex (mismo motivo
// que en lib/administracion-escolar/documentos.ts): un literal así en el
// fuente sería un carácter invisible que cualquier reformateo puede comerse
// sin que nadie lo note.
const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

/** Minúsculas, sin acentos, solo [a-z0-9-]. Igual criterio que cualquier slug
 *  de URL: lo que no encaja se vuelve guion, y los guiones no se repiten. */
export function normalizarSlug(texto: string): string {
  return texto
    .normalize('NFD').replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'formulario';
}

// `slugUnico` (que sí toca la base) vive en ./formularios-server, NO aquí.
//
// Este fichero lo importa `FormularioBuilder.tsx`, que es 'use client': un
// solo import de `db` en cualquier función de este módulo basta para que
// Turbopack intente meter el driver de Postgres (`postgres`, que usa `fs` y
// `net` de Node) en el bundle del navegador, y la pantalla se queda en negro
// sin un solo error visible más que en la consola. Se separó server-only
// aparte precisamente para que este fichero pueda seguir siendo puro y
// cliente-seguro.
