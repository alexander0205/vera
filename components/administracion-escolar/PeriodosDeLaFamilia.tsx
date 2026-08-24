'use client';

/**
 * Los meses de todos los hijos, juntos y separados por hijo.
 *
 * La ficha de la familia enseñaba de los períodos una sola línea —«sin plan»,
 * «se factura sola el día 5»— y todo lo demás obligaba a entrar hijo por hijo.
 * Pero el cobro no es por alumno: el padre llama una vez y pregunta por los
 * dos, y facturarle junto era imposible sin ir marcando cargos en dos
 * pantallas distintas.
 *
 * Aquí se ven los mismos meses que en cada ficha, con la misma cuenta —viene
 * todo de `fichaEstudiante`—, y se pueden marcar de los dos hijos a la vez
 * para hacer UNA factura. Que quepan juntos ya lo decide el prefill: el mismo
 * responsable de pago es justo la condición que cumplen por definición todos
 * los que salen en esta pantalla.
 *
 * LO QUE YA SE DEBE Y LO QUE VA A SALIR van en dos columnas, no en una tabla
 * sola. Antes era una lista corrida de veinte renglones donde el mes de
 * septiembre que hay que cobrar hoy estaba entre el de agosto ya pagado y el
 * de enero que todavía no existe. Son dos conversaciones distintas —«esto me
 * debes» y «esto te va a llegar»— y ahora se leen por separado.
 *
 * Los previstos van aparte del marcado múltiple a propósito: una cuota que
 * todavía no es cargo entra en la factura como línea nueva y el motor solo
 * admite una por documento. Ofrecer diez casillas que luego fallan es peor
 * que ofrecer un botón por fila.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarDays, ChevronDown, FileText, Receipt, Zap } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import type { HijoConPeriodos, PeriodoDeHijo, FilaMes } from '@/lib/administracion-escolar/periodos-familia';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Cómo se identifica un año escolar entre hermanos.
 *
 * No sirve la matrícula: cada hijo tiene la suya y son números distintos para
 * el MISMO 2026-2027. Se usa el período, que es lo que de verdad comparten, y
 * el nombre solo cuando no hay id —una matrícula suelta sin período—.
 */
const claveAnio = (p: PeriodoDeHijo) =>
  p.periodoId != null ? `id:${p.periodoId}` : `n:${p.periodo}`;

/**
 * Cuántas filas enseña cada columna antes de plegar el resto.
 *
 * El mismo número en las dos a propósito: con dieciséis cargos a la izquierda
 * y cinco meses a la derecha, la columna larga empujaba su fila de total tan
 * abajo que había que buscarla, y la corta dejaba medio metro en blanco al
 * lado. Recortadas por igual, las dos terminan a la misma altura y el total se
 * lee sin bajar.
 */
const FILAS_VISIBLES = 8;

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo cargar');
  return r.json();
});

const iniciales = (nombre: string) =>
  nombre.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

/** Marcable = es deuda de verdad y todavía no está en ninguna factura. */
function marcable(f: FilaMes): boolean {
  return f.tipo === 'cargo' && f.cargoId != null && f.ecfDocumentId == null && f.saldoCentavos > 0;
}

const tituloFila = (f: FilaMes) =>
  f.mes ? `${f.concepto} — ${MESES[f.mes]} ${f.anio}` : f.concepto;

// ─── Piezas visuales ─────────────────────────────────────────────────────────

const CHIP = {
  verde:  { bg: '#E8F6EF', fg: '#0F7A4A' },
  rojo:   { bg: '#FDECEC', fg: '#B4231F' },
  ambar:  { bg: '#FEF6E7', fg: '#B45309' },
  violeta:{ bg: '#F3EFFE', fg: '#6D28D9' },
  gris:   { bg: '#F2F4FA', fg: '#4A5164' },
} as const;

function Chip({ tono, children }: { tono: keyof typeof CHIP; children: React.ReactNode }) {
  const c = CHIP[tono];
  return (
    <Box component="span" sx={{
      display: 'inline-grid', placeItems: 'center', height: 22, px: 1.125,
      borderRadius: '6px', bgcolor: c.bg, color: c.fg,
      fontSize: '0.6875rem', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {children}
    </Box>
  );
}

function EstadoChip({ fila, hoy }: { fila: FilaMes; hoy: string }) {
  if (fila.saldoCentavos <= 0) return <Chip tono="verde">Pagado</Chip>;
  if (fila.fechaVencimiento && fila.fechaVencimiento < hoy) return <Chip tono="rojo">Vencido</Chip>;
  if (fila.saldoCentavos < fila.montoCentavos) return <Chip tono="ambar">Parcial</Chip>;
  if (fila.ecfDocumentId == null) return <Chip tono="violeta">Sin facturar</Chip>;
  return <Chip tono="gris">Pendiente</Chip>;
}

const ENCABEZADO = {
  fontSize: '0.65625rem', fontWeight: 600, color: '#8A90A0',
  textTransform: 'uppercase' as const, letterSpacing: '.07em',
  pb: 1, pt: 0,
};

const CELDA = { py: 1.375, fontSize: '0.8125rem', color: '#1E2433', minWidth: 0 };

/** Fila de una de las dos tablas. `subgrid` la alinea con la cabecera. */
function Fila({ children, resaltada = false }: { children: React.ReactNode; resaltada?: boolean }) {
  return (
    <Box sx={{
      gridColumn: '1 / -1',
      display: 'grid',
      gridTemplateColumns: 'subgrid',
      alignItems: 'center',
      borderTop: '1px solid #F1F3F9',
      bgcolor: resaltada ? '#F7F9FF' : 'transparent',
      transition: 'background .12s',
      '&:hover': { bgcolor: resaltada ? '#F0F4FE' : '#FBFCFE' },
    }}>
      {children}
    </Box>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function PeriodosDeLaFamilia({ clientId, puedeFacturar, onFacturar, onFacturarPrevisto }: {
  clientId: number;
  puedeFacturar: boolean;
  /** Recibe los cargos marcados de todos los hijos, para una sola factura. */
  onFacturar: (cargoIds: number[]) => void;
  /** Una cuota que todavía no es cargo: se crea al confirmar, no al abrir. */
  onFacturarPrevisto: (p: { matriculaId: number; cuotaId: number; conceptoId: number }) => void;
}) {
  const { data, error, isLoading } = useSWR<{ hijos: HijoConPeriodos[] }>(
    `/api/administracion-escolar/responsables/${clientId}/periodos`, traer,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  /**
   * El año escolar que se está mirando, para TODA la familia.
   *
   * Estaba dentro de la tarjeta de cada hijo, uno por hijo. Pero un año
   * escolar no es de un alumno: los precios cambian de un año a otro y lo que
   * se compara es «lo que debe la familia en 2026-2027», no un hijo en un año
   * y el otro en otro. Con tres hijos había que cambiarlo tres veces y era
   * fácil terminar leyendo dos años mezclados sin darse cuenta.
   *
   * `null` = el primero de la lista, que es el año en curso.
   */
  const [anio, setAnio] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  /** null = todos los hijos. Con un id, solo ese. */
  const [soloHijo, setSoloHijo] = useState<number | null>(null);
  /** De qué hijos se desplegó la lista completa, por columna: `id:cargos` / `id:proximos`. */
  const [desplegadas, setDesplegadas] = useState<Set<string>>(new Set());

  function alternarColumna(clave: string) {
    setDesplegadas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave); else next.add(clave);
      return next;
    });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const hijos = data?.hijos ?? [];

  /**
   * Los años escolares que aparecen en la familia, sin repetir.
   *
   * De todos los hijos a la vez: el hermano que entró este año no tiene
   * 2025-2026 y el que se gradúa no tiene 2027-2028, y el selector tiene que
   * ofrecer los dos. El año en curso va primero.
   */
  const anios = useMemo(() => {
    const m = new Map<string, { clave: string; nombre: string; activo: boolean }>();
    for (const h of hijos) {
      for (const p of h.periodos) {
        const clave = claveAnio(p);
        const ya = m.get(clave);
        if (!ya) m.set(clave, { clave, nombre: p.periodo, activo: p.activo });
        else if (p.activo) ya.activo = true;
      }
    }
    return [...m.values()].sort((a, b) =>
      (Number(b.activo) - Number(a.activo)) || b.nombre.localeCompare(a.nombre));
  }, [hijos]);

  const anioActual = anio ?? anios[0]?.clave ?? null;

  /**
   * Lo marcado que TODAVÍA se puede facturar, y su resumen.
   *
   * La marca se cruza contra los datos frescos en vez de fiarse del estado:
   * al crear la factura, esos cargos dejan de ser marcables y la marca se cae
   * sola. Guardándola suelta, la barra seguía diciendo «3 cargos · RD$2,200»
   * encima de tres cargos ya facturados, y volver a pulsar los facturaba otra
   * vez. Vale igual si los factura otro desde otra pantalla.
   *
   * Cuenta los hijos además de los cargos: «3 cargos de 2 hijos» es lo que
   * distingue esta pantalla de la del alumno, y es lo que hay que confirmar
   * antes de emitir una factura que va a llevar dos nombres dentro.
   *
   * Recorre TODOS los hijos, no solo el que se está mirando: filtrar por un
   * hijo es un filtro de vista, y esconder de la barra lo que ya se marcó del
   * otro haría emitir una factura con líneas que no se ven por ninguna parte.
   */
  const resumen = useMemo(() => {
    let total = 0;
    const ids: number[] = [];
    const conMarca = new Set<number>();
    for (const h of hijos) {
      for (const p of h.periodos) {
        for (const f of p.filas) {
          if (f.cargoId != null && marcados.has(f.cargoId) && marcable(f)) {
            ids.push(f.cargoId);
            total += f.saldoCentavos;
            conMarca.add(h.estudianteId);
          }
        }
      }
    }
    return { ids, cargos: ids.length, hijos: conMarca.size, total };
  }, [hijos, marcados]);

  function alternar(cargoId: number) {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(cargoId)) next.delete(cargoId); else next.add(cargoId);
      return next;
    });
  }

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '16px', borderColor: '#E6E8F0', display: 'flex', justifyContent: 'center', py: 5 }}>
        <CircularProgress size={22} />
      </Paper>
    );
  }
  if (error) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '16px', borderColor: '#E6E8F0', p: 2 }}>
        <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280' }}>
          No se pudieron cargar los meses de sus hijos.
        </Typography>
      </Paper>
    );
  }
  if (hijos.length === 0) return null;

  const visibles = soloHijo == null ? hijos : hijos.filter((h) => h.estudianteId === soloHijo);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/*
        Quién se mira y de qué año, en la misma barra.

        El año escolar manda sobre TODA la familia y por eso vive aquí arriba y
        no dentro de la tarjeta de cada hijo: es lo que fija los precios que se
        están leyendo, y con un selector por hijo se podían acabar comparando
        dos años distintos creyendo que era el mismo.

        Las pastillas de estudiante solo con más de un hijo: con uno serían
        «Todos» y su nombre, las dos enseñando lo mismo. El año se dice
        siempre, aunque no haya otro que elegir —entonces como rótulo y no como
        desplegable, que ofrecer una lista de una opción es prometer algo que
        no se puede hacer—.
      */}
      {anios.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            borderRadius: '14px', borderColor: '#E6E8F0', p: 0.875,
            display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap',
            boxShadow: '0 1px 2px rgba(15,17,24,.03)',
          }}
        >
          {hijos.length > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0, overflowX: 'auto' }}>
              <Pastilla activa={soloHijo == null} insignia={String(hijos.length)} onClick={() => setSoloHijo(null)}>
                Todos los estudiantes
              </Pastilla>
              {hijos.map((h) => (
                <Pastilla
                  key={h.estudianteId}
                  activa={soloHijo === h.estudianteId}
                  insignia={iniciales(h.alumno)}
                  onClick={() => setSoloHijo(h.estudianteId)}
                >
                  {h.alumno}
                </Pastilla>
              ))}
            </Box>
          )}

          <Box sx={{
            // Siempre a la derecha, haya pastillas o no: es el mismo control
            // en el mismo sitio para una familia de un hijo y para una de
            // tres, y no hay que buscarlo al cambiar de ficha.
            ml: 'auto', flex: '0 0 auto',
            display: 'flex', alignItems: 'center', gap: 0.875,
            border: '1px solid #E6E8F0', borderRadius: '10px',
            pl: 1.25, pr: anios.length > 1 ? 0.5 : 1.25, height: 36,
          }}>
            <Box component="span" sx={{ display: 'inline-flex', color: '#8A90A0' }}>
              <CalendarDays size={15} />
            </Box>
            <Typography component="span" sx={{
              fontSize: '0.71875rem', fontWeight: 600, color: '#4A5164', whiteSpace: 'nowrap',
            }}>
              Año escolar
            </Typography>
            {anios.length > 1 ? (
              <NativeSelect
                value={anioActual ?? ''}
                onChange={(e) => setAnio(e.target.value)}
                className="h-8 w-40 border-0 text-xs font-semibold shadow-none focus:ring-0"
                aria-label="Año escolar de la familia"
              >
                {anios.map((a) => (
                  <option key={a.clave} value={a.clave}>
                    {a.nombre}{a.activo ? ' · en curso' : ''}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Typography component="span" sx={{
                fontSize: '0.8125rem', fontWeight: 600, color: '#0F1118', whiteSpace: 'nowrap',
              }}>
                {anios[0]?.nombre}
              </Typography>
            )}
          </Box>
        </Paper>
      )}

      {visibles.map((h) => {
        const periodos = h.periodos;
        if (periodos.length === 0) {
          return (
            <Paper key={h.estudianteId} variant="outlined" sx={{ borderRadius: '16px', borderColor: '#E6E8F0', overflow: 'hidden' }}>
              <CabeceraHijo hijo={h} />
              <Typography sx={{ px: 2.75, py: 3, textAlign: 'center', fontSize: '0.8125rem', color: '#9AA0AC' }}>
                Sin matrícula: no tiene meses que cobrar todavía.
              </Typography>
            </Paper>
          );
        }

        // El año que se eligió arriba. Si este hijo no estaba matriculado ese
        // año, se dice —antes se caía al primero que tuviera y la tarjeta
        // enseñaba otro año distinto del que marca el selector, sin avisar.
        const p = periodos.find((x) => claveAnio(x) === anioActual) ?? null;
        if (!p) {
          const nombreAnio = anios.find((a) => a.clave === anioActual)?.nombre ?? '';
          return (
            <Paper key={h.estudianteId} variant="outlined" sx={{ borderRadius: '16px', borderColor: '#E6E8F0', overflow: 'hidden' }}>
              <CabeceraHijo hijo={h} />
              <Typography sx={{ px: 2.75, py: 3, textAlign: 'center', fontSize: '0.8125rem', color: '#9AA0AC' }}>
                No estuvo matriculado en {nombreAnio}.
              </Typography>
            </Paper>
          );
        }

        const cargos = p.filas.filter((f) => f.tipo === 'cargo');
        const previstos = p.filas.filter((f) => f.tipo === 'previsto');

        const claveCargos = `${h.estudianteId}:cargos`;
        const clavePrevistos = `${h.estudianteId}:proximos`;
        const cargosAbiertos = desplegadas.has(claveCargos);
        const previstosAbiertos = desplegadas.has(clavePrevistos);
        const cargosVisibles = cargosAbiertos ? cargos : cargos.slice(0, FILAS_VISIBLES);
        const previstosVisibles = previstosAbiertos ? previstos : previstos.slice(0, FILAS_VISIBLES);
        const cargosRestantes = cargos.length - cargosVisibles.length;
        const restantes = previstos.length - previstosVisibles.length;

        const totalCargos = cargos.reduce((s, f) => s + f.montoCentavos, 0);
        const cobrados = cargos.filter((f) => f.saldoCentavos <= 0).length;
        const ultimoPrevisto = previstos.at(-1);

        return (
          <Paper
            key={h.estudianteId}
            variant="outlined"
            sx={{
              borderRadius: '16px', borderColor: '#E6E8F0', overflow: 'hidden',
              boxShadow: '0 1px 2px rgba(15,17,24,.03)',
            }}
          >
            <CabeceraHijo hijo={h} periodo={p} />

            {/* Por qué estos meses van a ir saliendo solos — o por qué no van a
                salir, que es lo que nadie descubre a tiempo. */}
            <Box sx={{ px: 2.75, pt: 1.75 }}>
              <TiraAutomatizacion periodo={p} />
            </Box>

            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(auto-fit, minmax(430px, 1fr))' },
              pt: 2, pb: 0.5,
            }}>
              {/* ── Lo que ya se debe ─────────────────────────────────────── */}
              <Box sx={{ px: 2.75, minWidth: 0 }}>
                <TituloColumna
                  titulo="Cargos del año en curso"
                  nota={cargos.length === 0
                    ? 'Sin cargos todavía'
                    : `${cargos.length} ${cargos.length === 1 ? 'cargo' : 'cargos'} · ${
                        cobrados === cargos.length ? 'todos cobrados' : `${cobrados} cobrados`}`}
                />
                {cargos.length === 0 ? (
                  <Vacio texto="Este período no tiene cargos emitidos." />
                ) : (
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: puedeFacturar
                      ? '30px minmax(140px, 1fr) 92px 92px 108px'
                      : 'minmax(150px, 1fr) 92px 92px 108px',
                    mt: 1.5,
                  }}>
                    {puedeFacturar && <Box sx={ENCABEZADO} />}
                    <Box sx={ENCABEZADO}>Concepto</Box>
                    <Box sx={{ ...ENCABEZADO, textAlign: 'right' }}>Vence</Box>
                    <Box sx={{ ...ENCABEZADO, textAlign: 'center' }}>Estado</Box>
                    <Box sx={{ ...ENCABEZADO, textAlign: 'right' }}>Monto</Box>

                    {cargosVisibles.map((f) => {
                      const sePuede = puedeFacturar && marcable(f);
                      const marcado = f.cargoId != null && marcados.has(f.cargoId);
                      return (
                        <Fila key={f.key} resaltada={marcado}>
                          {puedeFacturar && (
                            <Box sx={{ ...CELDA, py: 0.5 }}>
                              {sePuede && (
                                <Checkbox
                                  size="small"
                                  checked={marcado}
                                  onChange={() => alternar(f.cargoId!)}
                                  slotProps={{ input: { 'aria-label': `Marcar ${tituloFila(f)} de ${h.alumno}` } }}
                                  sx={{ p: 0.5, color: '#C3C8D4', '&.Mui-checked': { color: '#3658E1' } }}
                                />
                              )}
                            </Box>
                          )}
                          <Box sx={{ ...CELDA, pr: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography noWrap title={tituloFila(f)} sx={{ minWidth: 0, fontSize: '0.8125rem', color: '#1E2433' }}>
                              {tituloFila(f)}
                            </Typography>
                            {/*
                              El icono AL LADO del concepto, no debajo.

                              Antes iba en un segundo renglón con el número de
                              la factura al lado, y en un «sin NCF» ese número
                              es cadena vacía —no nula—, así que `??` no hacía
                              respaldo y quedaba un icono suelto colgando bajo
                              el nombre, doblando el alto de cada fila para no
                              decir nada. Ahora el número va en el título del
                              enlace, que es donde se consulta y no ocupa sitio.
                            */}
                            {f.ecfDocumentId != null && (
                              <Link
                                href={`/dashboard/facturas/${f.ecfDocumentId}`}
                                title={`Factura ${f.encf || f.codigo || `#${f.ecfDocumentId}`}`}
                                style={{ textDecoration: 'none', flexShrink: 0, display: 'inline-flex' }}
                              >
                                <Box component="span" sx={{
                                  display: 'inline-flex', color: '#9AA0AC',
                                  '&:hover': { color: '#3658E1' },
                                }}>
                                  <FileText size={13} />
                                </Box>
                              </Link>
                            )}
                          </Box>
                          <Box sx={{ ...CELDA, textAlign: 'right', fontSize: '0.78125rem', color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
                            {f.fechaVencimiento ? fmtFechaCorta(f.fechaVencimiento) : '—'}
                          </Box>
                          <Box sx={{ ...CELDA, display: 'flex', justifyContent: 'center' }}>
                            <EstadoChip fila={f} hoy={hoy} />
                          </Box>
                          <Box sx={{ ...CELDA, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                            {fmtDOP(f.montoCentavos)}
                          </Box>
                        </Fila>
                      );
                    })}

                    {(cargosRestantes > 0 || cargosAbiertos) && (
                      <VerMas
                        abierto={cargosAbiertos}
                        restantes={cargosRestantes}
                        etiqueta="cargos"
                        onClick={() => alternarColumna(claveCargos)}
                      />
                    )}

                    {/* El total del año y, si queda algo vivo, cuánto. Son dos
                        cifras distintas: lo facturado no es lo cobrado. */}
                    <Box sx={{
                      gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid',
                      borderTop: '1.5px solid #E2E6F2', bgcolor: '#FBFCFE',
                    }}>
                      <Box sx={{
                        gridColumn: puedeFacturar ? '1 / 5' : '1 / 4',
                        py: 1.5, fontSize: '0.78125rem', fontWeight: 600, color: '#4A5164',
                      }}>
                        {p.pendienteCentavos > 0
                          ? `Total facturado · debe ${fmtDOP(p.pendienteCentavos)}`
                          : 'Total facturado y cobrado'}
                      </Box>
                      <Box sx={{
                        py: 1.5, textAlign: 'right', fontSize: '0.9375rem', fontWeight: 600,
                        color: '#102A72', letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums',
                      }}>
                        {fmtDOP(totalCargos)}
                      </Box>
                    </Box>
                  </Box>
                )}
              </Box>

              {/* ── Lo que va a salir ─────────────────────────────────────── */}
              <Box sx={{
                px: 2.75, minWidth: 0,
                borderLeft: { lg: '1px solid #EDEFF5' },
                borderTop: { xs: '1px solid #EDEFF5', lg: 'none' },
                pt: { xs: 2, lg: 0 }, mt: { xs: 2, lg: 0 },
              }}>
                <TituloColumna
                  titulo="Próximos cargos"
                  nota={ultimoPrevisto?.fechaVencimiento
                    ? `Hasta ${fmtFechaCorta(ultimoPrevisto.fechaVencimiento)}`
                    : (previstos.length === 0 ? 'Nada por venir' : `${previstos.length} por venir`)}
                />
                {previstos.length === 0 ? (
                  <Vacio texto="No queda nada por salir en este período." />
                ) : (
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(140px, 1fr) 92px 100px 108px',
                    mt: 1.5,
                  }}>
                    <Box sx={ENCABEZADO}>Concepto</Box>
                    <Box sx={{ ...ENCABEZADO, textAlign: 'right' }}>Vence</Box>
                    <Box sx={{ ...ENCABEZADO, textAlign: 'right' }}>Monto</Box>
                    <Box sx={{ ...ENCABEZADO, textAlign: 'right' }}>Acción</Box>

                    {previstosVisibles.map((f) => (
                      <Fila key={f.key}>
                        <Box sx={{ ...CELDA, pr: 1 }}>
                          <Typography noWrap title={tituloFila(f)} sx={{ fontSize: '0.8125rem', color: '#1E2433' }}>
                            {tituloFila(f)}
                          </Typography>
                        </Box>
                        <Box sx={{ ...CELDA, textAlign: 'right', fontSize: '0.78125rem', color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
                          {f.fechaVencimiento ? fmtFechaCorta(f.fechaVencimiento) : '—'}
                        </Box>
                        <Box sx={{ ...CELDA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtDOP(f.montoCentavos)}
                        </Box>
                        <Box sx={{ ...CELDA, display: 'flex', justifyContent: 'flex-end' }}>
                          {puedeFacturar && f.cuotaId != null && f.conceptoId != null ? (
                            // Adelantar un mes que aún no ha salido: el cargo se
                            // crea al confirmar la factura, no al pulsar aquí.
                            <BotonAdelantar
                              onClick={() => onFacturarPrevisto({
                                matriculaId: p.matriculaId, cuotaId: f.cuotaId!, conceptoId: f.conceptoId!,
                              })}
                            />
                          ) : (
                            <Chip tono="gris">Previsto</Chip>
                          )}
                        </Box>
                      </Fila>
                    ))}

                    {(restantes > 0 || previstosAbiertos) && (
                      <VerMas
                        abierto={previstosAbiertos}
                        restantes={restantes}
                        etiqueta="cargos"
                        onClick={() => alternarColumna(clavePrevistos)}
                      />
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        );
      })}

      {/* La barra solo aparece con algo marcado, y dice CUÁNTOS HIJOS entran:
          es lo único que avisa de que se está a punto de emitir una factura
          con dos nombres dentro. */}
      {resumen.cargos > 0 && (
        <Box sx={{
          position: 'sticky', bottom: 16, zIndex: 10,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5,
          borderRadius: '14px', border: '1px solid #C3CDEB', bgcolor: '#fff',
          px: 2, py: 1.5, boxShadow: '0 12px 28px -14px rgba(15,17,24,.35)',
        }}>
          <Receipt size={16} style={{ flexShrink: 0, color: '#3658E1' }} />
          <Typography sx={{ fontSize: '0.8125rem', color: '#4A5164' }}>
            <Box component="b" sx={{ color: '#0F1118' }}>{resumen.cargos}</Box> cargo{resumen.cargos === 1 ? '' : 's'}
            {resumen.hijos > 1 && <> de <Box component="b" sx={{ color: '#0F1118' }}>{resumen.hijos}</Box> hijos</>}
            {' · '}<Box component="b" sx={{ color: '#0F1118' }}>{fmtDOP(resumen.total)}</Box>
          </Typography>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button variant="ghost" size="sm" onClick={() => setMarcados(new Set())}>Quitar marcas</Button>
            <Button size="sm" onClick={() => onFacturar(resumen.ids)}>
              <Receipt className="mr-1.5 h-4 w-4" />
              Facturar juntos
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Pastilla({ activa, insignia, onClick, children }: {
  activa: boolean; insignia: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.125, flex: '0 0 auto',
        height: 38, px: 1.75, borderRadius: '10px', cursor: 'pointer',
        font: 'inherit', fontSize: '0.8125rem', whiteSpace: 'nowrap',
        transition: 'all .15s',
        ...(activa
          ? { border: '1px solid #C3CDEB', bgcolor: '#EDF1FE', color: '#102A72', fontWeight: 600 }
          : { border: '1px solid #EDEFF5', bgcolor: '#fff', color: '#4A5164', fontWeight: 500 }),
        '&:hover': { borderColor: '#C3CDEB' },
      }}
    >
      <Box component="span" sx={{
        width: 24, height: 24, flex: '0 0 24px', borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        fontSize: '0.65625rem', fontWeight: 600, letterSpacing: '.02em',
        ...(activa ? { bgcolor: '#3658E1', color: '#fff' } : { bgcolor: '#F2F4FA', color: '#6B7280' }),
      }}>
        {insignia}
      </Box>
      {children}
    </Box>
  );
}

/** «Ver los N cargos restantes del año» / «Ver menos», al pie de una columna. */
function VerMas({ abierto, restantes, etiqueta, onClick }: {
  abierto: boolean; restantes: number; etiqueta: string; onClick: () => void;
}) {
  return (
    <Box sx={{
      gridColumn: '1 / -1', borderTop: '1px solid #F1F3F9',
      pt: 1.375, pb: 0.25, display: 'flex', justifyContent: 'center',
    }}>
      <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.875,
          background: 'none', border: 'none', p: 0, cursor: 'pointer',
          fontSize: '0.78125rem', fontWeight: 600, color: '#3658E1', font: 'inherit',
          '&:hover': { color: '#2A48C4' },
        }}
      >
        {abierto ? 'Ver menos' : `Ver los ${restantes} ${etiqueta} restantes del año`}
        <Box component="span" sx={{
          display: 'inline-flex',
          transform: abierto ? 'rotate(180deg)' : 'none',
          transition: 'transform .2s',
        }}>
          <ChevronDown size={14} />
        </Box>
      </Box>
    </Box>
  );
}

function TituloColumna({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F1118' }}>{titulo}</Typography>
      <Typography noWrap sx={{ fontSize: '0.71875rem', color: '#9AA0AC' }}>{nota}</Typography>
    </Box>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <Typography sx={{ mt: 1.5, py: 3, textAlign: 'center', fontSize: '0.78125rem', color: '#9AA0AC' }}>
      {texto}
    </Typography>
  );
}

function BotonAdelantar({ onClick }: { onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.75,
        height: 28, px: 1.25, borderRadius: '8px',
        border: '1px solid #C3CDEB', bgcolor: '#fff', color: '#2A48C4',
        font: 'inherit', fontSize: '0.71875rem', fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .15s',
        '&:hover': { bgcolor: '#EDF1FE' },
      }}
    >
      <Receipt size={13} />Adelantar
    </Box>
  );
}

/**
 * Si la mensualidad sale sola o hay que facturarla a mano.
 *
 * Es la línea que decide si el colegio va a cobrar este mes sin que nadie se
 * acuerde. En verde dice cuándo sale la próxima; en ámbar avisa de que no va
 * a salir ninguna. Ámbar y no rojo a propósito: facturar a mano es una forma
 * válida de trabajar, no un error.
 */
function TiraAutomatizacion({ periodo }: { periodo: PeriodoDeHijo }) {
  const auto = periodo.facturaRecurrenteId != null && periodo.recurrenteEstado === 'activa';
  const c = auto
    ? { borde: '#D6EDE1', fondo: '#F5FBF8', texto: '#0F7A4A' }
    : { borde: '#F5E2C4', fondo: '#FEFAF3', texto: '#B45309' };

  const detalle = !periodo.facturaRecurrenteId
    ? 'cada mes hay que facturarlo a mano, mes por mes'
    : auto
      ? [
          periodo.recurrenteDiaCobro != null ? `se factura sola el día ${periodo.recurrenteDiaCobro}` : 'se factura sola',
          periodo.recurrenteProxima ? `próxima ${fmtFechaCorta(periodo.recurrenteProxima)}` : null,
        ].filter(Boolean).join(' · ')
      : `la mensualidad automática está ${periodo.recurrenteEstado ?? 'pausada'}: este mes no va a salir sola`;

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      border: `1px solid ${c.borde}`, bgcolor: c.fondo, borderRadius: '11px',
      px: 1.75, py: 1.375,
    }}>
      <Box component="span" sx={{ display: 'flex', flex: '0 0 auto', color: c.texto }}>
        <Zap size={16} />
      </Box>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.78125rem', color: '#3B4252' }}>
        <Box component="strong" sx={{ fontWeight: 600, color: c.texto }}>
          {auto ? 'Mensualidad automática' : 'Mensualidad manual'}
        </Box>
        {' · '}{detalle}
      </Typography>
      {periodo.facturaRecurrenteId != null && (
        <Link href={`/dashboard/facturas-recurrentes/${periodo.facturaRecurrenteId}`} style={{ textDecoration: 'none' }}>
          <Typography component="span" sx={{
            display: 'flex', alignItems: 'center', gap: 0.75, flex: '0 0 auto',
            fontSize: '0.78125rem', fontWeight: 600, color: c.texto,
            '&:hover': { textDecoration: 'underline' },
          }}>
            Ver reglas
          </Typography>
        </Link>
      )}
    </Box>
  );
}

function CabeceraHijo({ hijo, periodo }: {
  hijo: HijoConPeriodos;
  periodo?: PeriodoDeHijo;
}) {
  const alDia = (periodo?.pendienteCentavos ?? 0) <= 0;
  return (
    <Box sx={{
      px: 2.75, pt: 2, pb: 1.875,
      display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap',
      borderBottom: '1px solid #EDEFF5',
    }}>
      <Box sx={{
        width: 40, height: 40, flex: '0 0 40px', borderRadius: '50%',
        bgcolor: '#EDF1FE', color: '#2A48C4', display: 'grid', placeItems: 'center',
        fontSize: '0.84375rem', fontWeight: 600,
      }}>
        {iniciales(hijo.alumno)}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Link href={`/escolar/estudiantes/${hijo.estudianteId}`} style={{ textDecoration: 'none' }}>
          <Typography sx={{
            fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.4px', color: '#0F1118',
            '&:hover': { color: '#2A48C4' },
          }}>
            {hijo.alumno}
          </Typography>
        </Link>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.125, mt: 0.625, flexWrap: 'wrap' }}>
          {periodo?.curso && <Chip tono="gris">{periodo.curso}</Chip>}
          {periodo && (
            alDia
              ? <Chip tono="verde">{periodo.activo ? 'Activa · al día' : 'Al día'}</Chip>
              : <Chip tono="rojo">Debe {fmtDOP(periodo.pendienteCentavos)}</Chip>
          )}
          {periodo && periodo.previstoCentavos > 0 && (
            <Typography component="span" sx={{ fontSize: '0.71875rem', color: '#9AA0AC' }}>
              Por salir {fmtDOP(periodo.previstoCentavos)}
            </Typography>
          )}
        </Box>
      </Box>

      {/* El año NO se repite aquí: se dice una vez arriba, en la barra, y
          escribirlo otra vez en cada tarjeta lo pone tres veces en pantalla
          para una familia de tres hijos. Lo que sí es de este hijo —su
          curso— ya está en el chip de al lado del nombre. */}
    </Box>
  );
}
