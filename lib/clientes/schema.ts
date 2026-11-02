/**
 * Validación compartida de clientes.
 *
 * Fuente única para crear (POST /api/clientes) y editar (PUT /api/clientes/[id]).
 * Antes el PUT tenía un schema propio más estricto que rechazaba:
 *   - email vacío ("") porque .email() no acepta cadena vacía
 *   - cédula/RNC con guiones o espacios del autocomplete porque solo hacía .max(11)
 * Mantener una sola definición evita que vuelvan a desincronizarse.
 */

import { z } from 'zod';

// Cadena opcional: vacío o solo espacios → null.
const optStr = (max = 500) =>
  z.string().max(max, `Máximo ${max} caracteres`).optional().nullable()
    .transform(v => (typeof v === 'string' && v.trim() === '' ? null : v ?? null));

// Documento de identidad: RNC (9 dígitos), cédula (11 dígitos) o pasaporte (alfanumérico 5-20).
// Normaliza guiones/espacios del autocomplete de cédula.
const rncSchema = z.preprocess(
  v => (typeof v === 'string' ? v.replace(/[-\s]/g, '').toUpperCase() : v),
  z.preprocess(
    v => (typeof v === 'string' && v === '' ? null : v),
    z.string()
      .nullable()
      .optional()
      .refine(v => v == null || /^\d{9}$|^\d{11}$|^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,20}$/.test(v), {
        message: 'Documento inválido. Ingrese RNC (9 dígitos), cédula (11 dígitos) o pasaporte (letras y números)',
      })
      .transform(v => (v == null ? null : v)),
  ),
);

/**
 * Quita los caracteres de formato invisibles (Unicode `Cf`: U+200E, U+200B,
 * U+FEFF…) de cada texto antes de validar.
 *
 * Llegan al copiar y pegar de WhatsApp, PDFs o el portal: un tutor con un
 * U+200E delante de la cédula y del nombre no se podía hacer responsable de
 * pago, y como esa marca no se ve, «40212926592» fallaba como documento inválido sin que nadie pudiera
 * ver por qué.
 */
const sinInvisibles = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).map(([k, x]) =>
        [k, typeof x === 'string' ? x.replace(/\p{Cf}/gu, '') : x]))
    : v;

export const clienteSchema = z.preprocess(sinInvisibles, z.object({
  razonSocial: z.string().min(1, 'El nombre es obligatorio').max(255).transform(v => v.trim()),
  rnc:         rncSchema,
  // email: vacío o null → null; con valor debe ser email válido. Se recorta
  // antes de validar: un espacio pegado al final no hace inválido el correo.
  email: z.preprocess(
    v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
    z.string().email('Correo electrónico inválido').nullable().optional()
  ),
  telefono:    optStr(30),
  /** El móvil al que se llama; el fijo y el celular no son el mismo número. */
  celular:     optStr(30),
  /** Por donde se le escribe de verdad; puede no ser el mismo que `telefono`. */
  whatsapp:    optStr(30),
  direccion:   optStr(500),
  descripcion: optStr(2000),
}));

export type ClienteInput = z.infer<typeof clienteSchema>;
