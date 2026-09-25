/**
 * Siembra la empresa DEMO de negocio: «Distribuidora Demo Zero».
 *
 * Existe porque la web vende Zero a cualquier negocio y todas sus capturas
 * salían del colegio de demostración: la portada abría con «Colegio Demo…» y
 * clientes llamados «Familia Pérez», el ERP enseñaba mensualidades, y la página
 * de Contabilidad enseñaba un libro diario VACÍO con el aviso «la contabilidad
 * automática está apagada». El colegio demo (`seed-demo-completo.ts`) se queda
 * para `/colegios`; esta es la de todo lo demás.
 *
 * Lo que deja:
 *   - 12 meses de ventas a crédito y al contado, con su e-NCF, cobros por
 *     transferencia, depósito, efectivo y tarjeta, y una cartera con saldos al
 *     día, vencidos y a más de 90 días.
 *   - Un catálogo de distribuidora de consumo masivo con costo, stock y mínimo
 *     (dos productos por debajo del mínimo, para que la alerta se vea).
 *   - Compras de mercancía a tres suplidores y los gastos del mes (alquiler,
 *     energía, combustible), las dos últimas compras todavía por pagar.
 *
 * Los ASIENTOS no se escriben aquí: los genera el propio sistema con su
 * configuración recomendada (lo hace `scripts/capturas-demo.mjs` llamando a la
 * API). Un asiento escrito a mano en un sembrador es justo el que no cuadra.
 *
 * Nada de lo sembrado es de nadie: las RNC llevan el dígito verificador MALO a
 * propósito, así que no pueden coincidir con ninguna empresa real.
 *
 * Cómo se corre — SIEMPRE contra el sandbox, nunca contra producción:
 *
 *   POSTGRES_URL="$(grep '^POSTGRES_URL=' .env.local | cut -d= -f2-)" \
 *   SEED_DEMO_FORZAR=1 npx tsx scripts/seed-demo-negocio.ts
 *
 * No carga ningún `.env`: la URL tiene que venir en la línea de comando. Ver la
 * nota de `project_scripts_tsx_apuntan_produccion` — `.env` es producción.
 */

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { hash } from 'bcryptjs';

// ─── Guardas ──────────────────────────────────────────────────────────────────

const URL = process.env.POSTGRES_URL ?? '';
if (!URL) {
  console.error('✗ Falta POSTGRES_URL en la línea de comando. Este script no lee ningún .env.');
  process.exit(1);
}

const host = (u: string) => u.replace(/^[^@]*@/, '').replace(/[/:?].*$/, '').replace('-pooler', '');

/** El host de producción sale de `.env`; si coincide, no se siembra nada. */
function hostProduccion(): string | null {
  if (!fs.existsSync('.env')) return null;
  const linea = fs.readFileSync('.env', 'utf8').split('\n').find(l => l.startsWith('POSTGRES_URL='));
  return linea ? host(linea.slice('POSTGRES_URL='.length).replace(/^["']|["']$/g, '')) : null;
}

const destino = host(URL);
if (destino === hostProduccion()) {
  console.error(`✗ ${destino} es PRODUCCIÓN. Esto siembra una empresa inventada: no se corre ahí.`);
  process.exit(1);
}
const esLocal = /localhost|127\.0\.0\.1/.test(URL);
if (!esLocal && !process.env.SEED_DEMO_FORZAR) {
  console.error(`✗ ${destino} no es local. Si es el sandbox y lo sabes, exporta SEED_DEMO_FORZAR=1.`);
  process.exit(1);
}

const sql = postgres(URL, { ssl: esLocal ? false : 'require', max: 1 });

// ─── Datos fijos ──────────────────────────────────────────────────────────────

const EMAIL = 'negocio@zero.test';
const EMPRESA = 'Distribuidora Demo Zero';
const RAZON_SOCIAL = 'Distribuidora Demo Zero, SRL';

/** Dígito verificador de una RNC de 9 dígitos (módulo 11 de la DGII). */
function digitoRnc(ocho: string): number {
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  const suma = [...ocho].reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  const r = suma % 11;
  return r === 0 ? 2 : r === 1 ? 1 : 11 - r;
}
/** Una RNC con el verificador equivocado: imposible que sea de alguien. */
const rncFalsa = (ocho: string) => ocho + String((digitoRnc(ocho) + 1) % 10);

type Clase = 'super' | 'colmado' | 'hotel' | 'restaurante' | 'ferreteria' | 'minimarket';

const CLIENTES: { nombre: string; rnc: string; email: string; clase: Clase; peso: number; tamano: number }[] = [
  { nombre: 'Supermercado Los Pinos',   rnc: rncFalsa('13199901'), email: 'compras@lospinos.demo.test',  clase: 'super',       peso: 16, tamano: 2.6 },
  { nombre: 'Minimarket Central',       rnc: rncFalsa('13199902'), email: 'central@demo.test',           clase: 'minimarket',  peso: 13, tamano: 1.5 },
  { nombre: 'Hotel Playa Serena',       rnc: rncFalsa('13199903'), email: 'almacen@playaserena.demo.test', clase: 'hotel',     peso: 10, tamano: 2.2 },
  { nombre: 'Colmado La Esquina',       rnc: rncFalsa('13199904'), email: 'laesquina@demo.test',         clase: 'colmado',     peso: 14, tamano: 0.8 },
  { nombre: 'Colmado Don Pedro',        rnc: rncFalsa('13199905'), email: 'donpedro@demo.test',          clase: 'colmado',     peso: 12, tamano: 0.7 },
  { nombre: 'Restaurante El Fogón',     rnc: rncFalsa('13199906'), email: 'elfogon@demo.test',           clase: 'restaurante', peso: 10, tamano: 1.1 },
  { nombre: 'Cafetería Mi Barrio',      rnc: rncFalsa('13199907'), email: 'mibarrio@demo.test',          clase: 'restaurante', peso: 8,  tamano: 0.6 },
  { nombre: 'Ferretería El Progreso',   rnc: rncFalsa('13199908'), email: 'elprogreso@demo.test',        clase: 'ferreteria',  peso: 5,  tamano: 0.7 },
];

type Producto = {
  sku: string; nombre: string; categoria: string; unidad: string;
  precio: number; costo: number;       // pesos
  tasa: 0 | 0.18;
  stock: number; minimo: number;
  tipo: 'bien' | 'servicio';
  /** Quién lo compra más: la clase de cliente con más peso lo pide más. */
  clases: Clase[];
  /** Cantidad típica por pedido de un cliente de tamaño 1. */
  base: number;
  proveedor?: string;
};

const PRODUCTOS: Producto[] = [
  { sku: 'ARR-125',  nombre: 'Arroz selecto · saco 125 lb',              categoria: 'Granos',      unidad: 'Saco',    precio: 4950, costo: 4310, tasa: 0,    stock: 184, minimo: 40, tipo: 'bien', clases: ['super', 'colmado', 'minimarket', 'restaurante', 'hotel'], base: 6, proveedor: 'granos' },
  { sku: 'HAB-24',   nombre: 'Habichuelas rojas · caja 24 × 1 lb',       categoria: 'Granos',      unidad: 'Caja',    precio: 2280, costo: 1930, tasa: 0,    stock: 96,  minimo: 30, tipo: 'bien', clases: ['super', 'colmado', 'minimarket', 'restaurante'], base: 5, proveedor: 'granos' },
  { sku: 'AZU-50',   nombre: 'Azúcar crema · saco 50 lb',                categoria: 'Granos',      unidad: 'Saco',    precio: 2150, costo: 1860, tasa: 0,    stock: 122, minimo: 30, tipo: 'bien', clases: ['super', 'colmado', 'minimarket', 'restaurante', 'hotel'], base: 4, proveedor: 'granos' },
  { sku: 'HAR-50',   nombre: 'Harina de trigo · saco 50 lb',             categoria: 'Granos',      unidad: 'Saco',    precio: 1875, costo: 1610, tasa: 0,    stock: 14,  minimo: 25, tipo: 'bien', clases: ['super', 'colmado', 'restaurante'], base: 3, proveedor: 'granos' },
  { sku: 'CAF-24',   nombre: 'Café molido · caja 24 × 1 lb',             categoria: 'Despensa',    unidad: 'Caja',    precio: 6480, costo: 5640, tasa: 0,    stock: 61,  minimo: 20, tipo: 'bien', clases: ['super', 'colmado', 'minimarket', 'hotel', 'restaurante'], base: 2, proveedor: 'granos' },
  { sku: 'LEC-12',   nombre: 'Leche en polvo · caja 12 × 2.2 lb',        categoria: 'Despensa',    unidad: 'Caja',    precio: 7920, costo: 6890, tasa: 0,    stock: 38,  minimo: 15, tipo: 'bien', clases: ['super', 'minimarket', 'hotel', 'colmado'], base: 2, proveedor: 'granos' },
  { sku: 'DET-12',   nombre: 'Detergente en polvo · caja 12 × 1 kg',     categoria: 'Limpieza',    unidad: 'Caja',    precio: 2640, costo: 2150, tasa: 0.18, stock: 72,  minimo: 20, tipo: 'bien', clases: ['super', 'hotel', 'minimarket', 'ferreteria', 'colmado'], base: 3, proveedor: 'quimicos' },
  { sku: 'CLO-12',   nombre: 'Cloro · caja 12 × 1 galón',                categoria: 'Limpieza',    unidad: 'Caja',    precio: 1560, costo: 1240, tasa: 0.18, stock: 64,  minimo: 20, tipo: 'bien', clases: ['hotel', 'super', 'ferreteria', 'restaurante'], base: 3, proveedor: 'quimicos' },
  { sku: 'PAP-48',   nombre: 'Papel higiénico · fardo 48 rollos',        categoria: 'Desechables', unidad: 'Fardo',   precio: 1980, costo: 1590, tasa: 0.18, stock: 110, minimo: 30, tipo: 'bien', clases: ['hotel', 'super', 'minimarket', 'restaurante'], base: 4, proveedor: 'desechables' },
  { sku: 'SER-24',   nombre: 'Servilletas · fardo 24 paquetes',          categoria: 'Desechables', unidad: 'Fardo',   precio: 1440, costo: 1150, tasa: 0.18, stock: 9,   minimo: 15, tipo: 'bien', clases: ['restaurante', 'hotel', 'minimarket'], base: 3, proveedor: 'desechables' },
  { sku: 'VAS-1000', nombre: 'Vasos desechables · caja 1,000 u',         categoria: 'Desechables', unidad: 'Caja',    precio: 1690, costo: 1330, tasa: 0.18, stock: 45,  minimo: 12, tipo: 'bien', clases: ['restaurante', 'hotel', 'colmado'], base: 2, proveedor: 'desechables' },
  { sku: 'FUN-1000', nombre: 'Fundas plásticas · paquete 1,000 u',       categoria: 'Desechables', unidad: 'Paquete', precio: 1150, costo: 890,  tasa: 0.18, stock: 204, minimo: 40, tipo: 'bien', clases: ['colmado', 'super', 'minimarket', 'ferreteria'], base: 3, proveedor: 'desechables' },
  { sku: 'ENT-01',   nombre: 'Entrega fuera de ruta',                    categoria: 'Servicios',   unidad: 'Servicio', precio: 1500, costo: 0,   tasa: 0.18, stock: 0,   minimo: 0,  tipo: 'servicio', clases: ['hotel', 'restaurante'], base: 1 },
];

const PROVEEDORES = {
  granos:      { nombre: 'Granos del Valle, SRL',     rnc: rncFalsa('13199951') },
  quimicos:    { nombre: 'Químicos del Este, SRL',    rnc: rncFalsa('13199952') },
  desechables: { nombre: 'Desechables Unidos, SRL',   rnc: rncFalsa('13199953') },
} as const;

const GASTOS = [
  { proveedor: 'Inmobiliaria Los Robles, SRL', rnc: rncFalsa('13199961'), descripcion: 'Alquiler del almacén',     categoria: 'alquiler',           tipo606: '03', monto: () => 85000,           tasa: 0.18 },
  { proveedor: 'Energía Caribe, SA',           rnc: rncFalsa('13199962'), descripcion: 'Energía eléctrica',        categoria: 'servicios_publicos', tipo606: '02', monto: () => azarEntre(19000, 26500), tasa: 0 },
  { proveedor: 'Estación La Autopista, SRL',   rnc: rncFalsa('13199963'), descripcion: 'Combustible de los camiones', categoria: 'combustible',     tipo606: '02', monto: () => azarEntre(18000, 25500), tasa: 0 },
];

/** Facturas por mes, del más viejo al actual. Diciembre sube. */
const VOLUMEN = [22, 25, 34, 20, 23, 26, 25, 28, 27, 30, 31, 29];

// ─── Azar con semilla: correrlo dos veces da lo mismo ─────────────────────────

let semilla = 20260924;
function azar(): number {
  semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function azarEntre(min: number, max: number): number { return Math.round(min + azar() * (max - min)); }
function elegir<T>(opciones: readonly T[], pesos?: readonly number[]): T {
  const p = pesos ?? opciones.map(() => 1);
  let r = azar() * p.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opciones.length; i++) { r -= p[i]; if (r <= 0) return opciones[i]; }
  return opciones[opciones.length - 1];
}
const codigoSeguridad = () =>
  Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(azar() * 32)]).join('');

// ─── Fechas ───────────────────────────────────────────────────────────────────

const HOY = new Date();
HOY.setHours(12, 0, 0, 0);
const DIA_MS = 86_400_000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** `timestamp without time zone` en hora dominicana, como lo guarda el sistema. */
const marca = (d: Date) => `${iso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
const mas = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);

/** Un día hábil (lunes a sábado) del mes, sin pasarse de hoy. */
function diaDelMes(anio: number, mes: number): Date {
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  const tope = anio === HOY.getFullYear() && mes === HOY.getMonth() ? HOY.getDate() : ultimo;
  for (;;) {
    const d = new Date(anio, mes, azarEntre(1, tope), azarEntre(8, 16), azarEntre(0, 59));
    if (d.getDay() !== 0) return d;
  }
}

// ─── Siembra ──────────────────────────────────────────────────────────────────

(async () => {
  const [{ servidor }] = await sql<{ servidor: string }[]>`SELECT current_database() AS servidor`;
  console.log(`→ sembrando en ${destino} (${servidor})`);

  // Usuario: nunca entra con contraseña (las capturas firman la sesión), así
  // que la contraseña es aleatoria y no queda escrita en ningún sitio.
  const [user] = await sql<{ id: number }[]>`
    INSERT INTO users (email, password_hash, name, email_verified)
    VALUES (${EMAIL}, ${await hash(randomUUID(), 10)}, 'Demo Zero', true)
    ON CONFLICT (email) DO UPDATE SET email_verified = true
    RETURNING id`;

  const MODULOS = ['facturacion', 'administracion', 'contabilidad', 'pos', 'nomina'];
  let [team] = await sql<{ id: number }[]>`
    SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ${user.id} AND t.name = ${EMPRESA} LIMIT 1`;
  if (!team) {
    [team] = await sql<{ id: number }[]>`
      INSERT INTO teams (name, rnc) VALUES (${EMPRESA}, ${rncFalsa('13199977')}) RETURNING id`;
    await sql`INSERT INTO team_members (user_id, team_id, role) VALUES (${user.id}, ${team.id}, 'owner')`;
  }
  const T = team.id;

  await sql`
    UPDATE teams SET
      razon_social = ${RAZON_SOCIAL},
      nombre_comercial = ${EMPRESA},
      direccion = 'Autopista Duarte km 12, Santo Domingo Oeste',
      telefono = '809-555-0142',
      email_facturacion = 'facturacion@distribuidora.demo.test',
      plan_name = 'pro',
      subscription_status = 'active',
      trial_end = now() + interval '60 days',
      onboarding_completado_en = COALESCE(onboarding_completado_en, now()),
      onboarding_paso = 3,
      modulos_habilitados = ${sql.json(MODULOS)},
      modulos_override = ${sql.json(MODULOS)},
      pos_habilitado = true,
      updated_at = now()
    WHERE id = ${T}`;

  // ── Lo transaccional se rehace entero; el catálogo se reutiliza ────────────
  // El orden importa: las líneas y los asientos apuntan a facturas, cobros y
  // compras; los cobros a las facturas; los ítems a las compras.
  await sql`DELETE FROM contabilidad_asiento_lineas WHERE team_id = ${T}`;
  await sql`DELETE FROM contabilidad_asientos WHERE team_id = ${T}`;
  await sql`DELETE FROM inventory_movements WHERE team_id = ${T}`;
  await sql`DELETE FROM pago_adjuntos WHERE ecf_document_id IN (SELECT id FROM ecf_documents WHERE team_id = ${T})`;
  await sql`DELETE FROM pagos_recibidos WHERE team_id = ${T}`;
  await sql`DELETE FROM ecf_documents WHERE team_id = ${T}`;
  await sql`DELETE FROM pagos_proveedores WHERE compra_id IN (SELECT id FROM compras_locales WHERE team_id = ${T})`;
  await sql`DELETE FROM compras_locales_items WHERE compra_id IN (SELECT id FROM compras_locales WHERE team_id = ${T})`;
  await sql`DELETE FROM compras_locales WHERE team_id = ${T}`;

  // ── Almacén, categorías y productos ───────────────────────────────────────
  let [almacen] = await sql<{ id: number }[]>`
    SELECT id FROM almacenes WHERE team_id = ${T} AND nombre = 'Almacén principal' LIMIT 1`;
  if (!almacen) {
    [almacen] = await sql<{ id: number }[]>`
      INSERT INTO almacenes (team_id, nombre, direccion, es_default)
      VALUES (${T}, 'Almacén principal', 'Autopista Duarte km 12', 'true') RETURNING id`;
  }

  const categorias: Record<string, number> = {};
  for (const nombre of [...new Set(PRODUCTOS.map(p => p.categoria))]) {
    const [ya] = await sql<{ id: number }[]>`SELECT id FROM categorias WHERE team_id = ${T} AND nombre = ${nombre} LIMIT 1`;
    categorias[nombre] = ya?.id ?? (await sql<{ id: number }[]>`
      INSERT INTO categorias (team_id, nombre) VALUES (${T}, ${nombre}) RETURNING id`)[0].id;
  }

  const idProducto: Record<string, number> = {};
  for (const p of PRODUCTOS) {
    const campos = {
      team_id: T,
      nombre: p.nombre,
      referencia: p.sku,
      precio: Math.round(p.precio * 100),
      costo: Math.round(p.costo * 100),
      tasa_itbis: p.tasa === 0 ? 'exento' : '0.18',
      tipo: p.tipo,
      activo: 'true',
      unidad_medida: p.unidad,
      stock_actual: p.stock,
      stock_minimo: p.minimo,
      controla_inventario: p.tipo === 'bien',
      permite_venta_sin_stock: p.tipo !== 'bien',
      visible_pos: true,
      visible_facturacion: true,
      pos_favorito: ['ARR-125', 'CAF-24', 'DET-12', 'PAP-48'].includes(p.sku),
      categoria_id: categorias[p.categoria],
    };
    const [ya] = await sql<{ id: number }[]>`SELECT id FROM products WHERE team_id = ${T} AND referencia = ${p.sku} LIMIT 1`;
    if (ya) {
      await sql`UPDATE products SET ${sql(campos)}, updated_at = now() WHERE id = ${ya.id}`;
      idProducto[p.sku] = ya.id;
    } else {
      idProducto[p.sku] = (await sql<{ id: number }[]>`INSERT INTO products ${sql(campos)} RETURNING id`)[0].id;
    }
    if (p.tipo === 'bien') {
      await sql`DELETE FROM product_almacen_stock WHERE team_id = ${T} AND product_id = ${idProducto[p.sku]}`;
      await sql`
        INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
        VALUES (${T}, ${idProducto[p.sku]}, ${almacen.id}, ${p.stock})`;
    }
  }

  // ── Clientes ──────────────────────────────────────────────────────────────
  const idCliente: Record<string, number> = {};
  for (const c of CLIENTES) {
    const [ya] = await sql<{ id: number }[]>`SELECT id FROM clients WHERE team_id = ${T} AND razon_social = ${c.nombre} LIMIT 1`;
    idCliente[c.nombre] = ya?.id ?? (await sql<{ id: number }[]>`
      INSERT INTO clients (team_id, razon_social, rnc, email, telefono)
      VALUES (${T}, ${c.nombre}, ${c.rnc}, ${c.email}, '809-555-0199') RETURNING id`)[0].id;
  }

  // ── Ventas: 12 meses ──────────────────────────────────────────────────────
  const secuencia = { '31': 0, '32': 0 };
  const vendidas: Record<string, number>[] = VOLUMEN.map(() => ({}));
  let facturas = 0;
  let cobros = 0;

  for (let m = 0; m < VOLUMEN.length; m++) {
    const ref = new Date(HOY.getFullYear(), HOY.getMonth() - (VOLUMEN.length - 1 - m), 1);
    const docsDelMes: { fecha: Date; consumo: boolean }[] = [];
    for (let i = 0; i < VOLUMEN[m]; i++) docsDelMes.push({ fecha: diaDelMes(ref.getFullYear(), ref.getMonth()), consumo: azar() < 0.12 });
    docsDelMes.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    for (const { fecha, consumo } of docsDelMes) {
      const cliente = consumo ? null : elegir(CLIENTES, CLIENTES.map(c => c.peso));
      const tipo = consumo ? '32' : '31';
      const candidatos = PRODUCTOS.filter(p => cliente ? p.clases.includes(cliente.clase) : p.tipo === 'bien');
      const cuantas = consumo ? azarEntre(1, 3) : azarEntre(2, Math.min(5, candidatos.length));
      const elegidos = [...candidatos].sort(() => azar() - 0.5).slice(0, cuantas);

      const lineas = elegidos.map(p => {
        const escala = consumo ? 0.35 : cliente!.tamano * (m === 2 ? 1.35 : 1); // diciembre compra más
        const cantidad = Math.max(1, Math.round(p.base * escala * (0.6 + azar() * 0.9)));
        vendidas[m][p.sku] = (vendidas[m][p.sku] ?? 0) + cantidad;
        const baseCents = Math.round(p.precio * 100) * cantidad;
        const itbisCents = Math.round(baseCents * p.tasa);
        return {
          p, cantidad, baseCents, itbisCents,
          json: {
            productoId: idProducto[p.sku],
            variantId: null,
            nombreItem: p.nombre,
            descripcionItem: '',
            referencia: p.sku,
            cantidadItem: cantidad,
            precioUnitarioItem: p.precio,
            descuentoMonto: 0,
            tasaItbis: p.tasa,
            subtotalConItbis: (baseCents + itbisCents) / 100,
            indicadorBienoServicio: p.tipo === 'bien' ? 1 : 2,
          },
        };
      });

      const base = lineas.reduce((s, l) => s + l.baseCents, 0);
      const itbis = lineas.reduce((s, l) => s + l.itbisCents, 0);
      const total = base + itbis;
      const contado = consumo || azar() < 0.1;
      secuencia[tipo] += 1;
      facturas += 1;

      const [doc] = await sql<{ id: number }[]>`
        INSERT INTO ecf_documents ${sql({
          team_id: T,
          client_id: cliente ? idCliente[cliente.nombre] : null,
          codigo: `FA-${fecha.getFullYear()}-${String(facturas).padStart(6, '0')}`,
          encf: `E${tipo}${String(secuencia[tipo]).padStart(10, '0')}`,
          tipo_ecf: tipo,
          fecha_emision: marca(fecha),
          fecha_limite_pago: contado ? null : iso(mas(fecha, 30)),
          razon_social_comprador: cliente?.nombre ?? null,
          rnc_comprador: cliente?.rnc ?? null,
          email_comprador: cliente?.email ?? null,
          monto_total: total,
          total_itbis: itbis,
          lineas_json: JSON.stringify(lineas.map(l => l.json)),
          estado: 'ACEPTADO',
          estado_pago: 'PENDIENTE',
          tipo_pago: contado ? 1 : 2,
          tipo_ingreso: '01',
          codigo_seguridad: codigoSeguridad(),
          stock_descontado: true,
          created_by: user.id,
          // El panel agrupa «ingresos del mes» y la tendencia por `created_at`,
          // no por la fecha de emisión: sin esto los doce meses caían en el de hoy.
          created_at: marca(fecha),
          updated_at: marca(fecha),
        })}
        RETURNING id`;

      // ── Cómo se cobró ──────────────────────────────────────────────────
      const edad = Math.floor((HOY.getTime() - fecha.getTime()) / DIA_MS);
      let pagado = 0;
      let fechaPago = fecha;
      let metodo = 'transferencia';
      if (contado) {
        pagado = total;
        metodo = consumo ? elegir(['efectivo', 'tarjeta'], [6, 4]) : 'efectivo';
      } else {
        const r = azar();
        // Un negocio sano cobra casi todo antes de los 45 días; lo que queda
        // vencido es poco, pero existe —si no, la alerta de cartera no se ve—.
        const [pleno, parcial] =
          edad > 75 ? [0.98, 0] :
          edad > 45 ? [0.95, 0.03] :
          edad > 30 ? [0.86, 0.06] :
                      [0.25, 0.1];
        if (r < pleno) pagado = total;
        else if (r < pleno + parcial) pagado = Math.round(total * (0.4 + azar() * 0.2));
        fechaPago = mas(fecha, Math.min(azarEntre(12, 38), Math.max(1, edad - 1)));
        metodo = elegir(['transferencia', 'deposito', 'efectivo', 'tarjeta'], [65, 20, 10, 5]);
      }

      if (pagado > 0) {
        await sql`
          INSERT INTO pagos_recibidos (team_id, ecf_document_id, monto_centavos, fecha_pago, metodo, referencia, created_at)
          VALUES (${T}, ${doc.id}, ${pagado}, ${iso(fechaPago)}, ${metodo},
                  ${metodo === 'transferencia' || metodo === 'deposito' ? `REF-${azarEntre(100000, 999999)}` : null},
                  ${marca(fechaPago)})`;
        cobros += 1;
      }
      await sql`
        UPDATE ecf_documents
        SET estado_pago = ${pagado >= total ? 'PAGADA' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE'}
        WHERE id = ${doc.id}`;
    }
  }

  // ── Compras de mercancía y gastos del mes ─────────────────────────────────
  let compras = 0;
  for (let m = 0; m < VOLUMEN.length; m++) {
    const ref = new Date(HOY.getFullYear(), HOY.getMonth() - (VOLUMEN.length - 1 - m), 1);
    const reciente = m >= VOLUMEN.length - 2; // las del mes pasado y este, a crédito y sin pagar

    for (const [clave, prov] of Object.entries(PROVEEDORES)) {
      const items = PRODUCTOS
        .filter(p => p.proveedor === clave && (vendidas[m][p.sku] ?? 0) > 0)
        .map(p => {
          const cantidad = Math.ceil((vendidas[m][p.sku] ?? 0) * (1 + azar() * 0.08));
          const costoCents = Math.round(p.costo * 100);
          const baseCents = costoCents * cantidad;
          return { p, cantidad, costoCents, baseCents, itbisCents: Math.round(baseCents * p.tasa) };
        });
      if (items.length === 0) continue;
      // Si el mes en curso todavía no ha vendido algo, no se inventa su compra.
      if (ref.getMonth() === HOY.getMonth() && azar() < 0.25) continue;

      const fecha = diaDelMes(ref.getFullYear(), ref.getMonth());
      const base = items.reduce((s, i) => s + i.baseCents, 0);
      const itbis = items.reduce((s, i) => s + i.itbisCents, 0);
      const [compra] = await sql<{ id: number }[]>`
        INSERT INTO compras_locales ${sql({
          team_id: T,
          proveedor_rnc: prov.rnc,
          proveedor_nombre: prov.nombre,
          fecha: iso(fecha),
          referencia_encf: `E31${String(azarEntre(1, 99999999)).padStart(10, '0')}`,
          monto_total: base + itbis,
          itbis_cents: itbis,
          monto_bienes_cents: base,
          tipo_bienes_606: '09',
          forma_pago: reciente ? 'credito' : 'contado',
          metodo_pago: 'transferencia',
          fecha_vencimiento: reciente ? iso(mas(fecha, 30)) : null,
          estado_pago: reciente ? 'PENDIENTE' : 'PAGADA',
          fecha_pago: reciente ? null : iso(fecha),
          clase: 'compra',
          estado: 'registrada',
          created_by: user.id,
          created_at: marca(fecha),
        })}
        RETURNING id`;
      for (const i of items) {
        await sql`
          INSERT INTO compras_locales_items ${sql({
            compra_id: compra.id,
            producto_id: idProducto[i.p.sku],
            almacen_id: almacen.id,
            cantidad: i.cantidad,
            costo_unitario: i.costoCents,
            descripcion: i.p.nombre,
            es_servicio: false,
            itbis_tasa: i.p.tasa === 0 ? '0' : '0.18',
            itbis_cents: i.itbisCents,
          })}`;
      }
      compras += 1;
    }

    for (const g of GASTOS) {
      const fecha = new Date(ref.getFullYear(), ref.getMonth(), g.categoria === 'alquiler' ? 1 : 5, 10, 0);
      if (fecha > HOY) continue;
      const baseCents = g.monto() * 100;
      const itbisCents = Math.round(baseCents * g.tasa);
      const [compra] = await sql<{ id: number }[]>`
        INSERT INTO compras_locales ${sql({
          team_id: T,
          proveedor_rnc: g.rnc,
          proveedor_nombre: g.proveedor,
          fecha: iso(fecha),
          referencia_encf: `E31${String(azarEntre(1, 99999999)).padStart(10, '0')}`,
          monto_total: baseCents + itbisCents,
          itbis_cents: itbisCents,
          monto_servicios_cents: g.categoria === 'combustible' ? 0 : baseCents,
          monto_bienes_cents: g.categoria === 'combustible' ? baseCents : 0,
          tipo_bienes_606: g.tipo606,
          forma_pago: 'contado',
          metodo_pago: 'transferencia',
          estado_pago: 'PAGADA',
          fecha_pago: iso(fecha),
          clase: 'gasto',
          estado: 'registrada',
          created_by: user.id,
          created_at: marca(fecha),
        })}
        RETURNING id`;
      await sql`
        INSERT INTO compras_locales_items ${sql({
          compra_id: compra.id,
          producto_id: null,
          almacen_id: null,
          cantidad: 1,
          costo_unitario: baseCents,
          descripcion: g.descripcion,
          categoria: g.categoria,
          es_servicio: g.categoria !== 'combustible',
          itbis_tasa: g.tasa === 0 ? '0' : '0.18',
          itbis_cents: itbisCents,
        })}`;
      compras += 1;
    }
  }

  // ── Secuencias autorizadas: sin ellas el panel sale con la alerta roja ─────
  await sql`DELETE FROM sequences WHERE team_id = ${T}`;
  for (const [tipo, usados, hasta] of [['31', secuencia['31'], 10000], ['32', secuencia['32'], 10000], ['34', 0, 2000], ['33', 0, 2000]] as const) {
    await sql`
      INSERT INTO sequences (team_id, tipo_ecf, secuencia_desde, secuencia_hasta, secuencia_actual, fecha_vencimiento, numeracion_automatica, preferida)
      VALUES (${T}, ${tipo}, 1, ${hasta}, ${usados + 1}, '2027-12-31', true, ${tipo === '31'})`;
  }

  const [r] = await sql<{ ventas: string; cartera: string; vencida: string }[]>`
    SELECT
      to_char(sum(monto_total) FILTER (WHERE fecha_emision >= date_trunc('month', now())) / 100.0, 'FM999,999,990.00') AS ventas,
      to_char((SELECT sum(d.monto_total - coalesce((SELECT sum(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = d.id), 0))
               FROM ecf_documents d WHERE d.team_id = ${T} AND d.estado_pago IN ('PENDIENTE', 'PARCIAL')) / 100.0, 'FM999,999,990.00') AS cartera,
      to_char((SELECT sum(d.monto_total - coalesce((SELECT sum(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = d.id), 0))
               FROM ecf_documents d WHERE d.team_id = ${T} AND d.estado_pago IN ('PENDIENTE', 'PARCIAL') AND d.fecha_limite_pago::date < current_date) / 100.0, 'FM999,999,990.00') AS vencida
    FROM ecf_documents WHERE team_id = ${T}`;

  console.log(`\n✓ ${EMPRESA} lista — team ${T}, usuario ${user.id} (${EMAIL})`);
  console.log(`  ${facturas} facturas · ${cobros} cobros · ${compras} compras y gastos · ${PRODUCTOS.length} productos · ${CLIENTES.length} clientes`);
  console.log(`  Ventas del mes RD$${r.ventas} · cartera RD$${r.cartera} (vencida RD$${r.vencida})`);
  console.log(`\n  Siguiente: DEMO_TEAM=${T} DEMO_USER=${user.id} node scripts/capturas-demo.mjs negocio\n`);

  await sql.end();
})().catch(async e => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
