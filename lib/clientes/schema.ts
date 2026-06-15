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
  z.string().max(max).optional().nullable()
    .transform(v => (typeof v === 'string' && v.trim() === '' ? null : v ?? null));

// RNC dominicano: cédula (11 dígitos) o RNC (9 dígitos).
// Normaliza a solo dígitos (acepta guiones/espacios del autocomplete de cédula).
const rncSchema = z.preprocess(
  v => (typeof v === 'string' ? v.replace(/[-\s]/g, '') : v),
  z.preprocess(
    v => (typeof v === 'string' && v === '' ? null : v),
    z.string()
      .nullable()
      .optional()
      .refine(v => v == null || /^\d{9}$|^\d{11}$/.test(v), {
        message: 'RNC debe tener 9 dígitos (empresa) u 11 dígitos (cédula)',
      })
      .transform(v => (v == null ? null : v)),
  ),
);

export const clienteSchema = z.object({
  razonSocial: z.string().min(1, 'El nombre es obligatorio').max(255).transform(v => v.trim()),
  rnc:         rncSchema,
  // email: vacío o null → null; con valor debe ser email válido
  email: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().email('Correo electrónico inválido').nullable().optional()
  ),
  telefono:    optStr(30),
  direccion:   optStr(500),
  descripcion: optStr(2000),
});

export type ClienteInput = z.infer<typeof clienteSchema>;
