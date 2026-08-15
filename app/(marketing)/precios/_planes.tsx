'use client';

/**
 * La parte viva de la página de precios: elegir perfil y línea, ver las cuatro
 * tarjetas, el recomendador y la tabla comparativa.
 *
 * Recibe TODO calculado desde el servidor (`page.tsx`), que lo saca de
 * `lib/config/plans.ts`. Aquí no hay ni un precio ni un tope escrito: si este
 * archivo tuviera un número del catálogo, sería el número que se queda viejo.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';
import { Cheque, Contenedor, Iconos } from '../_piezas';

// ─── Lo que llega del servidor ───────────────────────────────────────────────

export type Celda =
  | { tipo: 'check' }
  | { tipo: 'vacio' }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'infinito' };

export type Grupo = {
  titulo: string;
  resumen: string;
  icono: keyof typeof Iconos;
  /** Fila que se ve con el grupo plegado. */
  celdas: Celda[];
  filas: { nombre: string; celdas: Celda[] }[];
};

export type PlanVista = {
  key: string;
  nombre: string;
  descripcion: string;
  precio: number;
  destacado: boolean;
  /**
   * `sinTope` en vez de la palabra: el lazo ES el infinito de la marca, y en
   * una fila que dice «Comprobantes/mes» dibuja mejor el «no se acaba» que
   * dos palabras que hay que leer.
   */
  topes: { etiqueta: string; valor: string; sinTope?: boolean }[];
  incluyeTitulo: string;
  incluye: string[];
  /** Crudos, para el recomendador. -1 = sin tope / no aplica. */
  docs: number;
  usuarios: number;
  estudiantes: number;
};

export type LineaVista = {
  key: string;
  nombre: string;
  descripcion: string;
  gancho: string;
  esColegio: boolean;
  conPos: boolean;
  planes: PlanVista[];
  grupos: Grupo[];
};

const usd = (n: number) => `US$${n.toLocaleString('es-DO')}`;

// ─── Celdas de la tabla ──────────────────────────────────────────────────────

function PintaCelda({ celda, destacada }: { celda: Celda; destacada: boolean }) {
  if (celda.tipo === 'check') {
    return (
      <span className={`grid size-[19px] place-items-center rounded-full ${destacada ? 'bg-zero-600' : 'bg-[#102a72]'}`}>
        <Cheque tamano={10} color="#fff" grosor={3.8} />
      </span>
    );
  }
  if (celda.tipo === 'vacio') return <span className="text-[15px] text-gray-400">—</span>;
  if (celda.tipo === 'infinito') {
    return (
      <span className="flex flex-col items-center gap-1">
        <LazoZero alto={16} titulo="Sin tope" />
        <span className="text-[9.5px] font-semibold uppercase tracking-[.3px] text-[#2a48c4]">Sin tope</span>
      </span>
    );
  }
  return (
    <span className={`text-center text-[11.5px] font-semibold leading-tight tabular-nums ${destacada ? 'text-[#2a48c4]' : 'text-[#3b4252]'}`}>
      {celda.texto}
    </span>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function Planes({ lineas, diasPrueba }: { lineas: LineaVista[]; diasPrueba: number }) {
  const negocio = lineas.filter(l => !l.esColegio);
  const colegio = lineas.filter(l => l.esColegio);

  const [perfil, setPerfil] = useState<'pyme' | 'colegio'>('pyme');
  const [lineaNegocio, setLineaNegocio] = useState(negocio[0]?.key ?? '');
  const [vistaTabla, setVistaTabla] = useState(lineas[0]?.key ?? '');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const linea = useMemo(() => {
    if (perfil === 'colegio') return colegio[0] ?? lineas[0];
    return negocio.find(l => l.key === lineaNegocio) ?? negocio[0] ?? lineas[0];
  }, [perfil, lineaNegocio, negocio, colegio, lineas]);

  const tabla = lineas.find(l => l.key === vistaTabla) ?? lineas[0];

  function elegirPerfil(p: 'pyme' | 'colegio') {
    setPerfil(p);
    // La tabla de abajo sigue al perfil: quedarse comparando planes de colegio
    // después de decir «soy una pyme» es exactamente lo que confunde.
    const destino = p === 'colegio' ? colegio[0] : negocio.find(l => l.key === lineaNegocio) ?? negocio[0];
    if (destino) setVistaTabla(destino.key);
  }

  return (
    <>
      {/* ── Selector y tarjetas ───────────────────────────────────────────── */}
      <Contenedor className="relative">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="inline-flex h-[30px] items-center gap-2.5 rounded-full border border-[#e0e4f0] bg-white px-3.5 text-xs font-medium text-zero-600">
            <span className="size-1.5 rounded-full bg-zero-600" />
            {linea.esColegio
              ? 'Del aula a la caja, con cobro automático'
              : linea.conPos
                ? 'Caja, inventario y facturación en un mismo flujo'
                : 'Facturación electrónica certificada ante la DGII'}
          </div>
          <h1 className="mt-5 text-pretty font-[family-name:var(--font-display)] text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.1] tracking-[-.04em]">
            {linea.nombre}
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-pretty text-[15.5px] leading-relaxed text-[#5c6373]">
            {linea.gancho}
          </p>
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {([
            { clave: 'pyme', titulo: 'Soy una pyme', detalle: 'Comercio, servicios o negocio con varias sucursales', icono: Iconos.tienda },
            { clave: 'colegio', titulo: 'Soy un colegio', detalle: 'Institución educativa con matrículas y cuotas', icono: Iconos.colegio },
          ] as const).map(q => {
            const on = perfil === q.clave;
            return (
              <button
                key={q.clave}
                type="button"
                onClick={() => elegirPerfil(q.clave)}
                aria-pressed={on}
                className={`flex w-full max-w-[300px] cursor-pointer items-center gap-3.5 rounded-2xl border-[1.5px] p-4 text-left transition sm:w-[262px] ${
                  on ? 'border-zero-600 bg-[#f5f8ff]' : 'border-[#e4e8f4] bg-white hover:border-[#c9d3f5]'
                }`}
              >
                <span className={`grid size-[38px] shrink-0 place-items-center rounded-[11px] ${on ? 'bg-zero-600 text-white' : 'bg-[#f2f4fa] text-[#4a5164]'}`}>
                  <q.icono tamano={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-[family-name:var(--font-display)] text-sm font-semibold ${on ? 'text-[#102a72]' : 'text-[#0f1118]'}`}>
                    {q.titulo}
                  </span>
                  <span className="mt-0.5 block text-pretty text-[11.5px] leading-snug text-gray-500">{q.detalle}</span>
                </span>
                <span className={`grid size-[19px] shrink-0 place-items-center rounded-full border-[1.5px] ${on ? 'border-zero-600 bg-zero-600' : 'border-[#d2d7e4] bg-white'}`}>
                  {on && <span className="size-[7px] rounded-full bg-white" />}
                </span>
              </button>
            );
          })}
        </div>

        {perfil === 'pyme' && negocio.length > 1 && (
          <div className="mt-5 flex justify-center">
            <div className="flex rounded-[13px] border border-[#e4e8f4] bg-white p-1 shadow-[0_2px_6px_rgba(15,17,24,.04)]">
              {negocio.map(l => {
                const on = l.key === linea.key;
                return (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => { setLineaNegocio(l.key); setVistaTabla(l.key); }}
                    aria-pressed={on}
                    className={`h-[38px] cursor-pointer whitespace-nowrap rounded-[10px] px-4 text-[13px] font-semibold transition sm:px-5 ${
                      on ? 'bg-white text-[#0f1118] shadow-[0_1px_3px_rgba(15,17,24,.1)]' : 'bg-transparent text-[#4a5164]'
                    }`}
                  >
                    {l.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mx-auto mt-3.5 max-w-[700px] text-pretty text-center text-[12.5px] text-gray-500">
          {linea.descripcion}
        </p>

        <div className="mt-7 grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {linea.planes.map(p => {
            const oscuro = !p.destacado && p === linea.planes[linea.planes.length - 1];
            const esColegio = linea.key === 'erp-colegio';
            return (
              <div
                key={p.key}
                className={`relative flex flex-col rounded-2xl p-6 ${
                  p.destacado
                    ? 'border-[1.5px] border-zero-600 bg-white shadow-[0_22px_46px_-22px_rgba(54,88,225,.5)]'
                    : oscuro
                      ? 'border-[1.5px] border-[#102a72] bg-[#102a72]'
                      : 'border border-[#e9ebf3] bg-white shadow-[0_1px_2px_rgba(15,17,24,.04)]'
                }`}
              >
                {p.destacado && (
                  <span className="absolute -top-[11px] left-5 flex h-[22px] items-center whitespace-nowrap rounded-full bg-[#102a72] px-3 text-[10.5px] font-semibold uppercase tracking-[.4px] text-white">
                    Más elegido
                  </span>
                )}
                <div className={`font-[family-name:var(--font-display)] text-base font-semibold ${oscuro ? 'text-white' : 'text-[#0f1118]'}`}>
                  {p.nombre}
                </div>
                <div className={`mt-1.5 min-h-[42px] text-pretty text-[12.5px] leading-snug ${oscuro ? 'text-white/70' : 'text-gray-500'}`}>
                  {p.descripcion}
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className={`font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-[-1px] ${oscuro ? 'text-white' : 'text-[#0f1118]'}`}>
                    {usd(p.precio)}
                  </span>
                  <span className={`text-[12.5px] ${oscuro ? 'text-white/70' : 'text-gray-500'}`}>/ mes</span>
                </div>

                <div className={`mt-4 flex flex-col gap-2 border-y py-3.5 ${oscuro ? 'border-white/15' : 'border-[#edeff5]'}`}>
                  {p.topes.map(t => (
                    <div key={t.etiqueta} className="flex items-baseline justify-between gap-2">
                      <span className={`text-[11.5px] ${oscuro ? 'text-white/70' : 'text-gray-500'}`}>{t.etiqueta}</span>
                      {t.sinTope ? (
                        <LazoZero
                          alto={11}
                          titulo={t.valor}
                          color={oscuro ? 'rgba(255,255,255,.9)' : '#3b4252'}
                        />
                      ) : (
                        <span className={`font-[family-name:var(--font-display)] text-[11.5px] font-semibold ${oscuro ? 'text-white/90' : 'text-[#3b4252]'}`}>
                          {t.valor}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Un colegio no se compra solo: son US$135–500 al mes, hay
                    que migrar matrículas y alguien tiene que enseñárselo a la
                    secretaria. Ahí la demo es el camino honesto. Los planes de
                    facturación sí se compran solos —hay prueba de verdad, con
                    su tarjeta y su reloj en Stripe—, y mandarlos a un
                    formulario sería ponerle una cita a algo que ya funciona
                    sin nosotros. */}
                <Link
                  href={esColegio ? '/contacto' : '/sign-up'}
                  className={`mt-4 flex h-11 items-center justify-center rounded-xl font-[family-name:var(--font-display)] text-[13.5px] font-semibold transition ${
                    p.destacado
                      ? 'border-[1.5px] border-zero-600 bg-zero-600 text-white hover:border-zero-700 hover:bg-zero-700'
                      : oscuro
                        ? 'border-[1.5px] border-white bg-white text-[#102a72] hover:-translate-y-0.5'
                        : 'border-[1.5px] border-[#dce1f0] bg-white text-[#102a72] hover:border-zero-600 hover:text-zero-600'
                  }`}
                >
                  {esColegio ? 'Solicitar demo' : `Empieza gratis ${diasPrueba} días`}
                </Link>

                <div className={`mt-5 text-[11px] font-semibold uppercase tracking-[.5px] ${oscuro ? 'text-white/70' : 'text-gray-500'}`}>
                  {p.incluyeTitulo}
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {p.incluye.map(f => (
                    <div key={f} className="flex items-start gap-2.5">
                      <Cheque tamano={14} color={oscuro ? '#7b94f0' : '#3658e1'} className="mt-0.5" />
                      <span className={`text-pretty text-xs leading-snug ${oscuro ? 'text-white/90' : 'text-[#3b4252]'}`}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {[
            `${diasPrueba} días de prueba`,
            'Sin contrato mínimo',
            'Facturas certificadas ante la DGII',
            'Soporte en español',
          ].map(g => (
            <span key={g} className="flex items-center gap-2 text-[12.5px] text-gray-500">
              <Cheque tamano={15} color="#3658e1" grosor={2.2} />
              {g}
            </span>
          ))}
        </div>
      </Contenedor>

      {/* ── Recomendador ──────────────────────────────────────────────────── */}
      <Contenedor className="pt-16">
        <Recomendador linea={linea} perfil={perfil} />
      </Contenedor>

      {/* ── Tabla comparativa ─────────────────────────────────────────────── */}
      <Contenedor className="pt-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.5rem,4vw,1.75rem)] font-semibold tracking-[-1px]">
              Comparar todos los planes
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#5c6373]">
              Funcionalidad por funcionalidad, sin letra chica.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-[#f2f4fa] p-1">
            {lineas.map(l => {
              const on = l.key === tabla.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setVistaTabla(l.key)}
                  aria-pressed={on}
                  className={`h-[34px] cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-semibold transition ${
                    on ? 'bg-white text-zero-600 shadow-[0_1px_3px_rgba(15,17,24,.1)]' : 'bg-transparent text-[#4a5164]'
                  }`}
                >
                  {l.nombre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-[#e9ebf3]">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[minmax(240px,2.6fr)_repeat(4,minmax(0,1fr))] border-b border-[#edeff5] bg-[#fafbfe]">
              <div className="px-4 py-4 text-[11px] font-bold uppercase tracking-[.6px] text-[#2a48c4]">
                Funcionalidades principales
              </div>
              {tabla.planes.map(p => (
                <div
                  key={p.key}
                  className={`px-1.5 py-3 text-center ${p.destacado ? 'border-x border-[#dce4fb] bg-[#edf1fe]' : ''}`}
                >
                  <div className={`font-[family-name:var(--font-display)] text-xs font-semibold leading-tight ${p.destacado ? 'text-zero-600' : 'text-[#4a5164]'}`}>
                    {p.nombre}
                  </div>
                  <div className={`mt-1 font-[family-name:var(--font-display)] text-[13px] font-semibold ${p.destacado ? 'text-zero-600' : 'text-[#0f1118]'}`}>
                    {usd(p.precio)}
                  </div>
                </div>
              ))}
            </div>

            {tabla.grupos.map(g => {
              const abierto = !!abiertos[g.titulo];
              const Icono = Iconos[g.icono];
              return (
                <div key={g.titulo}>
                  <button
                    type="button"
                    onClick={() => setAbiertos(s => ({ ...s, [g.titulo]: !s[g.titulo] }))}
                    aria-expanded={abierto}
                    className={`grid w-full cursor-pointer grid-cols-[minmax(240px,2.6fr)_repeat(4,minmax(0,1fr))] border-b border-[#f0f2f8] text-left transition hover:bg-[#fafbfe] ${abierto ? 'bg-[#fafbfe]' : 'bg-white'}`}
                  >
                    <div className="flex min-w-0 items-center gap-3 px-4 py-3.5">
                      <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-[#f2f5fe] text-[#2a48c4]">
                        <Icono tamano={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold">{g.titulo}</span>
                        <span className="block truncate text-[11px] text-gray-500">{g.resumen}</span>
                      </span>
                      <span className={`grid size-5 shrink-0 place-items-center text-gray-500 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="m6 9.5 6 6 6-6" />
                        </svg>
                      </span>
                    </div>
                    {g.celdas.map((c, i) => (
                      <div
                        key={tabla.planes[i]?.key ?? i}
                        className={`grid place-items-center px-1 py-3.5 ${tabla.planes[i]?.destacado ? 'border-x border-[#e2e9fc] bg-[#f5f8ff]' : ''}`}
                      >
                        <PintaCelda celda={c} destacada={!!tabla.planes[i]?.destacado} />
                      </div>
                    ))}
                  </button>

                  {abierto && g.filas.map(f => (
                    <div key={f.nombre} className="grid grid-cols-[minmax(240px,2.6fr)_repeat(4,minmax(0,1fr))] border-b border-[#f5f7fc] bg-[#fcfdff]">
                      <div className="py-2.5 pl-[58px] pr-4 text-pretty text-xs leading-snug text-[#4a5164]">{f.nombre}</div>
                      {f.celdas.map((c, i) => (
                        <div
                          key={tabla.planes[i]?.key ?? i}
                          className={`grid place-items-center px-1 py-2.5 ${tabla.planes[i]?.destacado ? 'border-x border-[#e2e9fc] bg-[#f5f8ff]' : ''}`}
                        >
                          <PintaCelda celda={c} destacada={!!tabla.planes[i]?.destacado} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="bg-[#fafbfe] p-4 text-center">
              <button
                type="button"
                onClick={() => {
                  const todos = tabla.grupos.every(g => abiertos[g.titulo]);
                  setAbiertos(Object.fromEntries(tabla.grupos.map(g => [g.titulo, !todos])));
                }}
                className="cursor-pointer text-[12.5px] font-semibold text-zero-600"
              >
                {tabla.grupos.every(g => abiertos[g.titulo])
                  ? 'Ocultar el detalle de funcionalidades'
                  : 'Ver detalle completo de funcionalidades'}
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-gray-500">
          Precios mensuales en dólares estadounidenses, sin ITBIS. El lazo de Zero indica sin tope.
        </p>
      </Contenedor>
    </>
  );
}

// ─── Recomendador ────────────────────────────────────────────────────────────

/**
 * «¿Cuál plan me toca?»
 *
 * Elige el primer plan de la línea que aguanta LAS DOS dimensiones a la vez
 * (volumen y usuarios): quedarse con el mayor de los dos índices es lo que
 * evita recomendar un plan de 50 facturas a alguien que necesita 5 usuarios.
 * Si ni el más alto alcanza, se dice —no se recomienda el más caro fingiendo
 * que le sirve.
 */
function Recomendador({ linea, perfil }: { linea: LineaVista; perfil: 'pyme' | 'colegio' }) {
  const [facturas, setFacturas] = useState(180);
  const [estudiantes, setEstudiantes] = useState(220);
  const [usuarios, setUsuarios] = useState(3);

  const esColegio = perfil === 'colegio';
  const planes = linea.planes;

  const indicePorVolumen = esColegio
    ? planes.findIndex(p => p.estudiantes < 0 || estudiantes <= p.estudiantes)
    : planes.findIndex(p => p.docs < 0 || facturas <= p.docs);
  const indicePorUsuarios = planes.findIndex(p => p.usuarios < 0 || usuarios <= p.usuarios);

  const sugerido =
    indicePorVolumen < 0 || indicePorUsuarios < 0
      ? null
      : planes[Math.max(indicePorVolumen, indicePorUsuarios)];

  return (
    <div className="grid grid-cols-1 items-center gap-8 rounded-2xl border border-[#e7ebfa] bg-[#f5f7fe] p-6 sm:p-7 lg:grid-cols-2 lg:gap-9">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[.9px] text-zero-600">Encuentra tu plan</div>
        <h2 className="mt-3.5 font-[family-name:var(--font-display)] text-[clamp(1.4rem,4vw,1.7rem)] font-semibold leading-tight tracking-[-1px]">
          ¿Cuál plan me toca?
        </h2>
        <p className="mt-3 text-pretty text-[13.5px] leading-relaxed text-[#5c6373]">
          Mueve dos barras y te decimos el plan exacto de <strong className="font-semibold">{linea.nombre}</strong> con su precio.
        </p>

        {esColegio ? (
          <Deslizador
            etiqueta="Estudiantes matriculados"
            valor={estudiantes}
            min={20}
            max={900}
            paso={10}
            onChange={setEstudiantes}
          />
        ) : (
          <Deslizador
            etiqueta="Facturas que emites por mes"
            valor={facturas}
            min={10}
            max={900}
            paso={10}
            onChange={setFacturas}
          />
        )}
        <Deslizador etiqueta="Usuarios del sistema" valor={usuarios} min={1} max={10} paso={1} onChange={setUsuarios} />
      </div>

      <div className="relative min-w-0 overflow-hidden rounded-2xl bg-[#102a72] p-6 text-white">
        <div aria-hidden className="pointer-events-none absolute -bottom-6 -right-8 opacity-[.08]">
          <LazoZero alto={100} color="#ffffff" />
        </div>
        <div className="relative">
          {sugerido ? (
            <>
              <div className="text-xs text-white/70">Plan recomendado</div>
              <div className="mt-1 font-[family-name:var(--font-display)] text-[23px] font-semibold tracking-[-.7px]">
                {linea.nombre} · {sugerido.nombre}
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-[family-name:var(--font-display)] text-[38px] font-semibold tracking-[-1.5px] tabular-nums">
                  {usd(sugerido.precio)}
                </span>
                <span className="text-[13px] text-white/70">/ mes</span>
              </div>
              <div className="mt-1 text-[11.5px] text-white/60">Sin costo de instalación</div>
              <div className="my-4 h-px bg-white/15" />
              <div className="flex flex-col gap-2.5">
                {sugerido.topes.map(t => (
                  <div key={t.etiqueta} className="flex items-baseline justify-between gap-2.5 text-[12.5px]">
                    <span className="min-w-0 flex-1 text-white/70">{t.etiqueta}</span>
                    <span className="shrink-0 text-right font-medium tabular-nums">{t.valor}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-white/70">Fuera del catálogo</div>
              <div className="mt-1 text-pretty font-[family-name:var(--font-display)] text-[21px] font-semibold leading-tight tracking-[-.6px]">
                A ese tamaño te cotizamos a mano
              </div>
              <p className="mt-3 text-pretty text-[12.5px] leading-relaxed text-white/70">
                Pasas del tramo más alto de {linea.nombre}. No te vamos a empujar el plan más caro
                fingiendo que te sirve: escríbenos y armamos el precio con tus números.
              </p>
            </>
          )}

          <Link
            href="/contacto"
            className="mt-6 flex h-11 items-center justify-center rounded-xl bg-white font-[family-name:var(--font-display)] text-[13.5px] font-semibold text-[#102a72] transition hover:-translate-y-0.5"
          >
            {sugerido ? 'Solicitar este plan' : 'Hablar con ventas'}
          </Link>
          <div className="mt-3 text-center text-[11px] text-white/55">
            Precios en dólares, sin ITBIS. Facturación mensual.
          </div>
        </div>
      </div>
    </div>
  );
}

function Deslizador({
  etiqueta, valor, min, max, paso, onChange,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={`d-${etiqueta}`} className="text-[12.5px] font-semibold text-[#3b4252]">{etiqueta}</label>
        <span className="font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums">
          {valor.toLocaleString('es-DO')}{valor === max ? '+' : ''}
        </span>
      </div>
      <input
        id={`d-${etiqueta}`}
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-2.5 w-full accent-zero-600"
      />
    </div>
  );
}
