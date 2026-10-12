/**
 * Buscar por documento de identidad: cédula o RNC.
 *
 * El documento se guarda como salga del formulario —casi siempre los once
 * dígitos pelados, a veces con guiones— y quien busca lo teclea como lo lee en
 * la cédula: `402-1234567-8`. Comparando texto contra texto, esas dos formas
 * del MISMO número no coinciden nunca, y el buscador contestaba «sin
 * resultados» con la persona delante.
 *
 * Aquí se comparan solo los dígitos de los dos lados.
 *
 * Sin `server-only` a propósito: no toca la base, solo arma el trozo de SQL, y
 * así se puede probar con un test de los de siempre.
 */

import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Con menos de tres dígitos no es un documento, es un número cualquiera: «25»
 * está dentro de media base de cédulas.
 */
export const MIN_DIGITOS_DOCUMENTO = 3;

/**
 * Los dígitos de lo escrito, SI lo escrito parece un documento.
 *
 * Parece un documento cuando no lleva letras: solo números y los separadores
 * con que se escribe una cédula (guion, punto, espacio). `FA-2026-000633` es un
 * código de factura y `Juan 23` un nombre; ninguno de los dos debe ponerse a
 * comparar dígitos contra las cédulas.
 */
export function digitosDeDocumento(q: string): string | null {
  const t = q.trim();
  if (!/^[\d\s.\-]+$/.test(t)) return null;
  const digitos = t.replace(/\D/g, '');
  return digitos.length >= MIN_DIGITOS_DOCUMENTO ? digitos : null;
}

/**
 * `columna` contiene esos dígitos, se haya guardado con guiones o sin ellos.
 *
 * Devuelve `null` cuando lo escrito no es un documento, para que quien arma el
 * `OR` simplemente no añada la condición.
 */
export function coincideDocumento(columna: SQLWrapper, q: string): SQL | null {
  const digitos = digitosDeDocumento(q);
  if (!digitos) return null;
  return sql`regexp_replace(COALESCE(${columna}, ''), '[^0-9]', '', 'g') LIKE ${`%${digitos}%`}`;
}

/**
 * Cómo se enseña un documento en una lista.
 *
 * Once dígitos son una cédula y se escribe como en el plástico; nueve, un RNC.
 * Lo que no encaje se devuelve tal cual: mejor el dato crudo que uno mal
 * partido.
 */
export function fmtDocumento(doc: string | null | undefined): string | null {
  const crudo = (doc ?? '').trim();
  if (!crudo) return null;
  const d = crudo.replace(/\D/g, '');
  if (d.length === 11) return `Cédula ${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
  if (d.length === 9) return `RNC ${d}`;
  return crudo;
}
