/**
 * Escribe el correo del enlace de documentos en un HTML para verlo en el
 * navegador, sin mandarlo a nadie.
 *
 *   RESEND_API_KEY=re_dummy npx tsx scripts/previsualizar-correo-documentos.ts
 *
 * La clave falsa es a propósito: el módulo construye el cliente de Resend al
 * importarse y se planta sin ella, pero aquí no se manda nada — solo se arma
 * el HTML. No hace falta la clave de verdad.
 */

import { writeFileSync } from 'node:fs';
import { armarEnlaceDocumentosEmail } from '../lib/email/escolar-avisos';

const casos = [
  {
    titulo: 'Varios documentos',
    datos: {
      colegio: 'Colegio Andrés Bello',
      tutor: 'María Fernández Pérez',
      estudiante: 'Luis Fernández',
      documentos: ['Acta de nacimiento', 'Récord de notas', 'Certificado médico', 'Foto 2x2'],
      url: 'https://facturacion.zero.com.do/d/ejemplo-de-token-largo',
      dias: 7,
    },
  },
  {
    titulo: 'Un solo documento',
    datos: {
      colegio: 'Colegio Andrés Bello',
      tutor: null,
      estudiante: 'Luis Fernández',
      documentos: ['Acta de nacimiento'],
      url: 'https://facturacion.zero.com.do/d/ejemplo-de-token-largo',
      dias: 7,
    },
  },
];

const bloques = casos.map(({ titulo, datos }) => {
  const { asunto, html } = armarEnlaceDocumentosEmail(datos);
  return `
    <section style="margin:0 0 40px;">
      <p style="font:600 12px sans-serif;color:#6b7280;margin:0 0 4px;">${titulo} · asunto:</p>
      <p style="font:600 14px sans-serif;color:#111;margin:0 0 12px;">${asunto}</p>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;background:#fff;">${html}</div>
    </section>`;
}).join('');

const salida = process.argv[2] ?? 'correo-documentos.html';
writeFileSync(salida, `<div style="background:#f3f4f6;padding:32px;">${bloques}</div>`);
console.log(`Escrito en ${salida}`);
