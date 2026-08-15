'use client';

/**
 * Cambiar de plan — con el riesgo delante, no detrás.
 *
 * La versión anterior era una lista y el veredicto solo se pedía al pulsar
 * «Actualizar»: el colegio descubría que perdería 442 estudiantes cuando ya
 * había decidido. Ahora el servidor calcula `riesgosDeCambio` para TODOS los
 * planes de LAS TRES LÍNEAS y cada tarjeta llega sabiendo lo suyo — un chip y
 * una línea. El diálogo queda para el detalle, que es donde el detalle se lee.
 *
 * Las tres líneas se pintan SIEMPRE, incluso las que este cliente no puede
 * contratar: esas salen apagadas con el motivo. Esconderlas —que es lo que
 * hacía antes, filtrando por `familiasOfrecibles`— deja al usuario sin saber
 * si la opción no existe o si él no la encuentra, y las dos preguntas acaban
 * en soporte. `familiasOfrecibles` ya no decide qué se PINTA; decide qué se
 * puede PULSAR.
 *
 * Los cuatro niveles (`actual`, `bloquea`, `avisa`, `ok`) salen de
 * `validarCambioDePlan`. Aquí no se decide ninguno: solo se pintan.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';
import { Calendar, X, CircleSlash, TriangleAlert, Check, Info, MessageCircle } from 'lucide-react';

import type { PlanDef } from '@/lib/config/plans';
import type { MotivoCambio, RiesgoDeCambio, NivelDeCambio } from '@/lib/config/suscripcion';
import {
  AZUL, NAVY, GRIS, ROJO, AMBAR, TINTA, BORDE, TEXTO_MEDIO,
  TONO_NIVEL, TONO_MOTIVO, type ClaveMotivo, usd,
} from './_paleta';

// ─── Lo que entra ────────────────────────────────────────────────────────────

interface PendingPlan {
  name: string;
  effectiveDate: string;
}

/** Lo que responde /api/stripe/change-plan cuando el cambio no es directo. */
interface RespuestaCambio {
  error?: string;
  code?: 'CAMBIO_BLOQUEADO' | 'REQUIERE_CONFIRMACION';
  bloqueos?: MotivoCambio[];
  avisos?: MotivoCambio[];
  effectiveDate?: string;
}

/** Un aviso de los que van encima de la rejilla, ya resuelto por el servidor. */
export interface AvisoLinea {
  tono: 'info' | 'alerta';
  titulo: string;
  texto: string;
  /**
   * Por dónde seguir cuando la respuesta es «no».
   *
   * Un camino cerrado sin salida no ahorra trabajo: lo convierte en un correo
   * a soporte preguntando cómo, que es justo lo que el aviso venía a evitar.
   * `null` cuando no hay número de WhatsApp configurado — entonces queda el
   * correo, que siempre existe.
   */
  contacto?: { whatsapp: string | null; correo: string } | null;
}

/**
 * Una línea comercial, con todo lo suyo ya calculado.
 *
 * Las tres comparten catálogo pero no precio: `erp` y `pos-erp` ofrecen los
 * MISMOS cuatro planes de la familia `ecf` y solo cambia si el precio lleva
 * dentro el adicional del Punto de Venta. Por eso el precio viaja resuelto
 * desde el servidor (`precioTotal(plan, addons)`) y no se suma aquí: sumarle
 * nueve a mano sería tener el precio del POS en dos sitios.
 */
export interface LineaVista {
  key: string;
  nombre: string;
  planes: PlanDef[];
  /** Precio real de cada plan EN ESTA LÍNEA. */
  precios: Record<string, number>;
  /** Riesgo de cambiarse a cada plan DE ESTA LÍNEA. */
  riesgos: Record<string, RiesgoDeCambio>;
  /**
   * Adicionales que la línea lleva de fábrica. Viajan al checkout para que la
   * suscripción nueva se cree con ellos dentro: `createCheckoutSession` solo
   * mete los items que le mandan, y sin esto «Zero POS + ERP» cobraría el
   * combinado y entregaría el plan pelado.
   */
  addons: string[];
  /** Es la que tiene contratada hoy. */
  esLaMia: boolean;
  /** Si es false, `veto` dice por qué y la pestaña queda apagada. */
  pulsable: boolean;
  veto: AvisoLinea | null;
  /** Lo que hay que saber antes de elegirla. null cuando no hay nada. */
  aviso: AvisoLinea | null;
}

interface Props {
  lineas: LineaVista[];
  planActual: PlanDef;
  priceIds: Record<string, string>;
  pendingPlan?: PendingPlan | null;
  /**
   * ¿Hay una suscripción viva en Stripe?
   *
   * Cambia lo que hace cada botón, no solo su texto. Con suscripción se
   * modifica la que existe (prorrateo al subir, fin de ciclo al bajar); sin
   * ella no hay nada que modificar y hay que pasar por el checkout. Es el caso
   * de quien tiene el plan asignado por nosotros y el de quien nunca compró.
   */
  tieneSuscripcion: boolean;
  /** Server Action del checkout. Solo se usa cuando no hay suscripción. */
  checkoutAction: (formData: FormData) => void;
  /**
   * Días de prueba por familia cuando elegir plan abre una PRUEBA sin tarjeta
   * en vez del checkout (empresas en `sin-plan`, que nunca tuvieron
   * suscripción). Con esto puesto, `checkoutAction` debe ser la acción que
   * abre la prueba; el formulario que se envía es el mismo.
   */
  pruebaPorFamilia?: Record<string, number> | null;
}

// ─── Textos derivados del catálogo ───────────────────────────────────────────

/**
 * Qué trae el plan, en una línea.
 *
 * Se arma de `limits` y no de `ui.marketingFeatures`: esa lista es copy de
 * portada («Sistema completo: contabilidad, inventario…») y es idéntica en los
 * ocho planes, así que en una rejilla donde hay que ELEGIR no distingue nada.
 * Lo que cambia entre planes son los topes.
 */
function resumenDelPlan(plan: PlanDef, conPos: boolean): string {
  const partes: string[] = [];

  if (plan.limits.estudiantes >= 0) {
    partes.push(`Hasta ${plan.limits.estudiantes.toLocaleString('es-DO')} estudiantes`);
  }
  partes.push(
    plan.limits.docs < 0
      ? 'Comprobantes sin tope'
      : `${plan.limits.docs.toLocaleString('es-DO')} comprobantes/mes`,
  );
  partes.push(`${plan.limits.users} ${plan.limits.users === 1 ? 'usuario' : 'usuarios'}`);
  if (conPos) partes.push('punto de venta incluido');

  return partes.join(' · ');
}

const ICONO_NIVEL: Record<NivelDeCambio, typeof Info> = {
  actual:  Info,
  bloquea: CircleSlash,
  avisa:   TriangleAlert,
  ok:      Check,
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function ChangePlan({
  lineas, planActual, priceIds, pendingPlan, tieneSuscripcion, checkoutAction,
  pruebaPorFamilia,
}: Props) {
  const router = useRouter();
  // Arranca en la línea contratada. Es la que el usuario reconoce y desde la
  // que se mide todo lo demás.
  const [lineaKey, setLineaKey] = useState(
    () => (lineas.find(l => l.esLaMia) ?? lineas[0])?.key ?? '',
  );
  const [cargando, setCargando]   = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [exito, setExito]     = useState<string | null>(null);
  /** El plan que se está confirmando. null = diálogo cerrado. */
  const [abierto, setAbierto] = useState<PlanDef | null>(null);
  const [aceptado, setAceptado] = useState(false);
  /**
   * Bloqueos que apareció el servidor al confirmar.
   *
   * El riesgo de la tarjeta se calculó al cargar la página; entre eso y el clic
   * pueden haber matriculado a un estudiante o abierto un turno de caja. La API
   * vuelve a validar, y si dice que no, se enseña aquí en vez de tragárselo.
   */
  const [bloqueosTardios, setBloqueosTardios] = useState<MotivoCambio[] | null>(null);

  const ocupado = Boolean(cargando) || cancelando;

  const linea = lineas.find(l => l.key === lineaKey) ?? lineas[0]!;
  // El veto manda sobre el aviso: si la línea no se puede contratar, contarle
  // primero lo bonito que sería es hacerle leer dos veces para llegar al «no».
  const avisoDeLinea = linea.veto ?? linea.aviso;

  function cerrar() {
    setAbierto(null);
    setAceptado(false);
    setBloqueosTardios(null);
  }

  function abrir(plan: PlanDef) {
    setError(null); setExito(null);
    setBloqueosTardios(null);
    setAceptado(false);
    setAbierto(plan);
  }

  /**
   * @param confirmado Siempre `true` desde el diálogo: para llegar ahí hubo que
   *   leer la lista de consecuencias. Sin esta bandera la API devuelve 409 con
   *   los avisos en vez de aplicar el cambio — es lo que impide enterarse de
   *   que perdiste el módulo escolar el lunes por la mañana.
   */
  async function cambiar(plan: PlanDef, tipo: 'upgrade' | 'downgrade') {
    const priceId = priceIds[plan.key];
    if (!priceId) { setError(`No hay precio configurado para ${plan.name}.`); cerrar(); return; }

    setError(null); setExito(null); setCargando(plan.key);
    try {
      const res  = await fetch('/api/stripe/change-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPriceId: priceId, confirmado: true }),
      });
      const data = await res.json() as RespuestaCambio;

      if (data.code === 'CAMBIO_BLOQUEADO') {
        setBloqueosTardios(data.bloqueos ?? []);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar el plan.');

      if (tipo === 'upgrade') {
        setExito(`Cambiaste a ${plan.name}. Se cobró la diferencia del período que quedaba.`);
      } else {
        const cuando = data.effectiveDate
          ? new Date(data.effectiveDate).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'el fin de tu ciclo';
        setExito(`Bajada a ${plan.name} programada para ${cuando}. Conservas tu plan actual hasta entonces.`);
      }
      cerrar();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      cerrar();
    } finally { setCargando(null); }
  }

  async function cancelarBajadaProgramada() {
    setError(null); setExito(null); setCancelando(true);
    try {
      const res  = await fetch('/api/stripe/change-plan', { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cancelar.');
      setExito('Cambio de plan cancelado. Sigues con tu plan actual.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally { setCancelando(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

      {/* Bajada ya programada en Stripe */}
      {pendingPlan && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#fffaf0', border: '1px solid #f5e6c8', borderRadius: '13px', p: 1.75 }}>
          <Calendar size={16} color={AMBAR} style={{ marginTop: 2, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: AMBAR }}>
              Cambio de plan programado
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: TEXTO_MEDIO, mt: 0.375, lineHeight: 1.5 }}>
              Pasas a <strong>{pendingPlan.name}</strong> el{' '}
              {new Date(pendingPlan.effectiveDate).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}.
              Hasta entonces conservas todo lo de tu plan actual.
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={cancelarBajadaProgramada} disabled={ocupado}
            startIcon={cancelando ? <CircularProgress size={12} /> : <X size={12} />}
            sx={{ borderRadius: '9px', textTransform: 'none', fontSize: '0.75rem', borderColor: '#f5e6c8', color: AMBAR, flexShrink: 0, '&:hover': { borderColor: AMBAR, bgcolor: '#fffaf0' } }}>
            {cancelando ? '' : 'Cancelar'}
          </Button>
        </Box>
      )}

      {error && <Alert severity="error"   sx={{ borderRadius: '11px' }}>{error}</Alert>}
      {exito && <Alert severity="success" sx={{ borderRadius: '11px' }}>{exito}</Alert>}

      {/* Selector de línea. Control segmentado y no pestañas: son tres formas
          de comprar lo mismo, no tres secciones de la pantalla. */}
      <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: '#edeff5', borderRadius: '12px', width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
        {lineas.map(l => {
          const activa = l.key === linea.key;
          return (
            <Button
              key={l.key}
              onClick={() => l.pulsable && setLineaKey(l.key)}
              disableElevation
              // Vetada NO es `disabled`: un botón deshabilitado no recibe foco
              // y el lector de pantalla se lo salta, así que quien navega con
              // teclado no se entera de que la línea existe. Se deja pulsable
              // para el foco, se marca con aria y el clic no hace nada.
              aria-disabled={!l.pulsable}
              aria-pressed={activa}
              // El motivo también al pasar por encima: el banner lo cuenta,
              // pero quien va directo a la pestaña apagada lo busca ahí.
              title={l.veto ? `${l.veto.titulo}. ${l.veto.texto}` : undefined}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.875, height: 34, px: 1.75,
                borderRadius: '9px', textTransform: 'none', fontSize: '0.78rem', fontWeight: 600,
                bgcolor: activa ? '#fff' : 'transparent',
                color: activa ? TINTA : '#4a5164',
                boxShadow: activa ? '0 2px 8px rgba(15,17,24,.1)' : 'none',
                opacity: l.pulsable ? 1 : 0.45,
                cursor: l.pulsable ? 'pointer' : 'not-allowed',
                '&:hover': { bgcolor: activa ? '#fff' : l.pulsable ? 'rgba(255,255,255,.6)' : 'transparent' },
              }}
            >
              {l.nombre}
              {(l.esLaMia || !l.pulsable) && (
                <Box component="span" sx={{
                  fontSize: '0.625rem', fontWeight: 700, letterSpacing: '.3px', borderRadius: '5px', px: 0.75, py: 0.25,
                  color: l.esLaMia ? AZUL : GRIS,
                  bgcolor: l.esLaMia ? '#e7ecfd' : '#e4e7ef',
                }}>
                  {l.esLaMia ? 'Tu línea' : 'Con nosotros'}
                </Box>
              )}
            </Button>
          );
        })}
      </Box>

      {/* Por qué esta línea no se puede, o qué hay que saber al elegirla.
          Es información de LÍNEA, no de plan: lo que sale aquí es lo que vale
          para sus cuatro tramos por igual. Lo que cambia de un tramo a otro
          sigue en su tarjeta. */}
      {avisoDeLinea && (
        <Box sx={{
          display: 'flex', gap: 1.5, alignItems: 'flex-start', p: '14px 16px', borderRadius: '13px',
          bgcolor: avisoDeLinea.tono === 'alerta' ? '#fdf3f3' : '#f7f9ff',
          border: `1px solid ${avisoDeLinea.tono === 'alerta' ? '#f6dcdc' : '#dce4fa'}`,
        }}>
          {avisoDeLinea.tono === 'alerta'
            ? <CircleSlash size={17} color={ROJO} style={{ flexShrink: 0, marginTop: 1 }} />
            : <Info size={17} color={NAVY} style={{ flexShrink: 0, marginTop: 1 }} />}
          <Box>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: avisoDeLinea.tono === 'alerta' ? ROJO : NAVY }}>
              {avisoDeLinea.titulo}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: TEXTO_MEDIO, lineHeight: 1.55, mt: 0.375, maxWidth: 640 }}>
              {avisoDeLinea.texto}
            </Typography>

            {/* El «escríbenos» del texto, hecho un botón. WhatsApp primero
                porque es por donde escribe la gente aquí, y el correo siempre
                detrás: el número sale del entorno y puede no estar puesto, el
                correo no falla nunca. */}
            {avisoDeLinea.contacto && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
                {avisoDeLinea.contacto.whatsapp && (
                  <Button
                    component="a"
                    href={avisoDeLinea.contacto.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    variant="contained"
                    disableElevation
                    startIcon={<MessageCircle size={15} />}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', bgcolor: NAVY, '&:hover': { bgcolor: '#0b1f57' } }}
                  >
                    Escribir por WhatsApp
                  </Button>
                )}
                <Button
                  component="a"
                  href={avisoDeLinea.contacto.correo}
                  size="small"
                  variant="outlined"
                  sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', color: NAVY, borderColor: '#d7dae5' }}
                >
                  {avisoDeLinea.contacto.whatsapp ? 'Escribir por correo' : 'Escribir a soporte'}
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Una tarjeta por plan. auto-fit para que cuatro tramos quepan en
          escritorio y bajen a una columna en un teléfono sin media queries. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1.5 }}>
        {linea.planes.map(plan => {
          const riesgo = linea.riesgos[plan.key];
          // Sin riesgo calculado no se pinta la tarjeta: un plan sin veredicto
          // solo puede salir de un desajuste entre lo que el servidor evaluó y
          // lo que mandó, y adivinarle un nivel sería inventarse el permiso.
          if (!riesgo) return null;

          const tono   = TONO_NIVEL[riesgo.nivel];
          const Icono  = ICONO_NIVEL[riesgo.nivel];
          const actual = riesgo.nivel === 'actual';
          const veta   = riesgo.nivel === 'bloquea';
          const programado = pendingPlan?.name === plan.name;
          const precio = linea.precios[plan.key] ?? plan.price;
          const conPos = linea.addons.includes('pos') || plan.modulos.includes('pos');

          return (
            <Box key={plan.key} sx={{
              border: `1.5px solid ${tono.borde}`, bgcolor: tono.fondo, borderRadius: '14px',
              p: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 1.375,
              opacity: veta ? 0.85 : 1,
              transition: 'box-shadow .18s',
              '&:hover': { boxShadow: '0 10px 26px rgba(15,17,24,.07)' },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 22 }}>
                <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: TINTA }}>{plan.name}</Typography>
                <Box component="span" sx={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '.3px', whiteSpace: 'nowrap',
                  color: programado ? AMBAR : tono.chipColor,
                  bgcolor: programado ? '#fff4e0' : tono.chipFondo,
                  borderRadius: '6px', px: 0.875, py: 0.375,
                }}>
                  {programado ? 'Programado' : tono.chip}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-.5px', color: TINTA }}>
                  {usd(precio)}
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: GRIS }}>/mes</Typography>
              </Box>

              <Typography sx={{ fontSize: '0.78rem', color: TEXTO_MEDIO, lineHeight: 1.5, minHeight: 38 }}>
                {resumenDelPlan(plan, conPos)}
              </Typography>

              {/* El motivo más grave, en una línea. Es lo que evita el clic
                  a ciegas: si le importa, abre; si no, sigue. */}
              <Box sx={{
                display: 'flex', gap: 1, alignItems: 'flex-start', p: '9px 10px', borderRadius: '9px',
                bgcolor: tono.avisoFondo, border: `1px solid ${tono.avisoBorde}`,
              }}>
                <Icono size={14} color={tono.avisoColor} style={{ flexShrink: 0, marginTop: 1 }} />
                <Typography sx={{ fontSize: '0.72rem', lineHeight: 1.45, color: tono.avisoColor, fontWeight: 500 }}>
                  {riesgo.resumen}
                </Typography>
              </Box>

              {actual ? (
                <Button fullWidth disabled disableElevation
                  sx={{ height: 36, borderRadius: '9px', textTransform: 'none', fontSize: '0.78rem', fontWeight: 600, bgcolor: '#edeff5', color: GRIS, '&.Mui-disabled': { bgcolor: '#edeff5', color: GRIS } }}>
                  Plan actual
                </Button>
              ) : (
                <Button
                  fullWidth disableElevation
                  onClick={() => abrir(plan)}
                  disabled={ocupado || programado || !linea.pulsable}
                  variant={riesgo.nivel === 'ok' ? 'contained' : 'outlined'}
                  startIcon={cargando === plan.key ? <CircularProgress size={12} color="inherit" /> : undefined}
                  sx={{
                    height: 36, borderRadius: '9px', textTransform: 'none', fontSize: '0.78rem', fontWeight: 600,
                    ...(riesgo.nivel === 'ok'
                      ? { bgcolor: NAVY, color: '#fff', '&:hover': { bgcolor: '#0c2059' } }
                      : veta
                        ? { borderColor: '#f0d7d8', color: ROJO, '&:hover': { borderColor: ROJO, bgcolor: '#fdf3f3' } }
                        : { borderColor: '#d7dae5', color: TINTA, '&:hover': { borderColor: NAVY, bgcolor: '#f7f9ff' } }),
                  }}
                >
                  {programado
                    ? 'Ya programado'
                    : veta
                      ? 'Ver por qué'
                      // «Cambiar a» presupone que hay algo desde lo que cambiar.
                      // Quien está eligiendo su PRIMER plan no cambia: elige.
                      : pruebaPorFamilia && !tieneSuscripcion
                        ? `Elegir ${plan.name}`
                        : `Cambiar a ${plan.name}`}
                </Button>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Cómo se aplica el cambio. No se le habla de prorrateo a quien todavía
          no tiene suscripción: es explicarle una mecánica que no le va a pasar. */}
      <Typography sx={{ fontSize: '0.75rem', color: GRIS, lineHeight: 1.5 }}>
        {tieneSuscripcion
          ? 'Subir de plan aplica de inmediato y se cobra solo la diferencia del período que queda. Bajar aplica al terminar tu ciclo ya pagado.'
          : pruebaPorFamilia
            ? 'Todos los planes empiezan con días de prueba y sin tarjeta. Al terminar la prueba decides si sigues.'
            : 'Tu plan de hoy no tiene cobro automático. Al contratar uno, la facturación pasa a ser mensual por tarjeta y puedes cambiarlo o cancelarlo cuando quieras.'}
      </Typography>

      {abierto && (
        <DialogoCambio
          plan={abierto}
          planActual={planActual}
          nombreDeLinea={linea.nombre}
          riesgo={bloqueosTardios
            ? { ...linea.riesgos[abierto.key]!, nivel: 'bloquea', bloqueos: bloqueosTardios }
            : linea.riesgos[abierto.key]!}
          precio={linea.precios[abierto.key] ?? abierto.price}
          priceId={priceIds[abierto.key] ?? ''}
          adicionales={linea.addons}
          tieneSuscripcion={tieneSuscripcion}
          aceptado={aceptado}
          onAceptar={setAceptado}
          ocupado={ocupado}
          onCerrar={cerrar}
          onConfirmar={cambiar}
          checkoutAction={checkoutAction}
          diasDePrueba={pruebaPorFamilia?.[abierto.familia] ?? null}
        />
      )}
    </Box>
  );
}

// ─── El diálogo ──────────────────────────────────────────────────────────────

/**
 * El detalle largo de un cambio: qué bloquea, qué se pierde y qué pasa al
 * confirmar.
 *
 * Vive aparte de la tarjeta porque son dos densidades distintas: en la tarjeta
 * cabe una línea y aquí cabe el «cómo lo resuelvo» de cada motivo, que es
 * justo lo que convierte un «no se puede» en algo accionable en vez de en un
 * correo a soporte.
 */
function DialogoCambio({
  plan, planActual, nombreDeLinea, riesgo, precio, priceId, adicionales, tieneSuscripcion,
  aceptado, onAceptar, ocupado, onCerrar, onConfirmar, checkoutAction, diasDePrueba,
}: {
  plan: PlanDef;
  planActual: PlanDef;
  /** La línea desde la que se pulsó. El plan solo no identifica lo que compra. */
  nombreDeLinea: string;
  riesgo: RiesgoDeCambio;
  precio: number;
  priceId: string;
  adicionales: string[];
  tieneSuscripcion: boolean;
  aceptado: boolean;
  onAceptar: (v: boolean) => void;
  ocupado: boolean;
  onCerrar: () => void;
  onConfirmar: (plan: PlanDef, tipo: 'upgrade' | 'downgrade') => void;
  checkoutAction: (formData: FormData) => void;
  /** Con valor, el formulario abre una prueba sin tarjeta en vez del checkout. */
  diasDePrueba: number | null;
}) {
  const bloqueado = riesgo.nivel === 'bloquea';
  const sube      = plan.price > planActual.price;
  const tipo: 'upgrade' | 'downgrade' = sube ? 'upgrade' : 'downgrade';

  const motivos: { clave: ClaveMotivo; texto: string; detalle: string | null }[] = [
    ...riesgo.bloqueos.map(b => ({ clave: 'bloquea' as const, texto: b.mensaje, detalle: b.comoResolver })),
    ...riesgo.avisos.map(a  => ({ clave: 'avisa'   as const, texto: a.mensaje, detalle: a.comoResolver })),
  ];

  // Sin bloqueos ni avisos el diálogo se quedaría vacío, y un diálogo vacío
  // que pide confirmar un cobro parece un error. Se dice lo que sí pasa.
  if (motivos.length === 0) {
    motivos.push({
      clave: 'ok',
      texto: 'No pierdes nada con este cambio.',
      detalle: 'Conservas tus clientes, comprobantes, inventario y contabilidad. Solo cambian los topes de tu plan.',
    });
  }

  /**
   * Qué le va a pasar al dinero. Depende de por dónde va el cambio, no del
   * nivel de riesgo: con suscripción se modifica la que hay, y sin ella el
   * botón lleva al checkout de Stripe y no hay prorrateo que explicar.
   */
  const mecanica = !tieneSuscripcion
    ? diasDePrueba
      ? `Empiezas hoy con ${diasDePrueba} días de prueba, sin tarjeta. Después son ${usd(precio)} al mes; puedes cambiar o cancelar cuando quieras.`
      : `Vas al pago seguro de Stripe para contratar ${nombreDeLinea} · ${plan.name} por ${usd(precio)} al mes.`
    : sube
      ? `${usd(precio)} al mes. El cambio aplica de inmediato y se cobra ahora solo la diferencia del período que queda.`
      : `${usd(precio)} al mes. El cambio entra en vigor al terminar tu ciclo ya pagado; hasta entonces conservas ${planActual.name}.`;

  // La casilla solo cuando hay algo que aceptar. Pedir «entiendo lo que
  // pierdo» cuando no se pierde nada es un trámite inventado.
  const pideCasilla = riesgo.avisos.length > 0;
  const puedeSeguir = !bloqueado && (!pideCasilla || aceptado) && !ocupado;

  return (
    <Dialog open onClose={onCerrar} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: { borderRadius: '18px' } } }}>
      <Box sx={{ p: '22px 24px 16px', borderBottom: `1px solid ${BORDE}` }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: GRIS }}>
          {bloqueado
            ? 'No se puede hacer todavía'
            : tieneSuscripcion
              ? 'Confirmar el cambio'
              : diasDePrueba ? 'Empezar tu prueba' : 'Confirmar la contratación'}
        </Typography>
        <Typography component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-.3px', color: TINTA, mt: 0.875 }}>
          {bloqueado ? `No puedes pasar a ${plan.name} ahora` : `Pasar a ${plan.name}`}
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: TEXTO_MEDIO, mt: 0.875, lineHeight: 1.5 }}>
          {bloqueado
            ? 'El cambio dejaría datos sin plan que los sostenga. Resuelve lo de abajo y vuelve a intentarlo.'
            : mecanica}
        </Typography>
      </Box>

      <DialogContent sx={{ p: '18px 24px', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {motivos.map((m, i) => {
          const tono = TONO_MOTIVO[m.clave];
          const Icono = m.clave === 'bloquea' ? CircleSlash : m.clave === 'avisa' ? TriangleAlert : Check;
          return (
            <Box key={`${m.clave}-${i}`} sx={{
              display: 'flex', gap: 1.375, alignItems: 'flex-start', p: 1.5, borderRadius: '11px',
              bgcolor: tono.fondo, border: `1px solid ${tono.borde}`,
            }}>
              <Icono size={16} color={tono.color} style={{ flexShrink: 0, marginTop: 1 }} />
              <Box>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tono.color, lineHeight: 1.45 }}>
                  {m.texto}
                </Typography>
                {m.detalle && (
                  <Typography sx={{ fontSize: '0.78rem', color: TEXTO_MEDIO, mt: 0.375, lineHeight: 1.5 }}>
                    {m.detalle}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </DialogContent>

      <Box sx={{ p: '16px 24px 22px', borderTop: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {!bloqueado && pideCasilla && (
          <FormControlLabel
            sx={{ mr: 'auto', ml: 0 }}
            control={
              <Checkbox size="small" checked={aceptado} onChange={e => onAceptar(e.target.checked)}
                sx={{ color: '#c3c8d6', '&.Mui-checked': { color: AZUL } }} />
            }
            label={<Typography sx={{ fontSize: '0.78rem', color: TEXTO_MEDIO }}>Entiendo lo que pierdo</Typography>}
          />
        )}
        <Button variant="outlined" onClick={onCerrar} disabled={ocupado}
          sx={{ height: 38, borderRadius: '10px', textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', borderColor: '#d7dae5', color: TINTA }}>
          {bloqueado ? 'Entendido' : 'Ahora no'}
        </Button>

        {!bloqueado && (
          tieneSuscripcion ? (
            <Button variant="contained" disableElevation disabled={!puedeSeguir}
              onClick={() => onConfirmar(plan, tipo)}
              startIcon={ocupado ? <CircularProgress size={13} color="inherit" /> : undefined}
              sx={{ height: 38, borderRadius: '10px', textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', bgcolor: NAVY, '&:hover': { bgcolor: '#0c2059' } }}>
              {sube ? `Cambiar a ${plan.name}` : 'Programar el cambio'}
            </Button>
          ) : (
            // El checkout termina en una redirección fuera del sistema, así que
            // va por Server Action y no por el fetch de arriba.
            <Box component="form" action={checkoutAction}>
              <input type="hidden" name="priceId" value={priceId} />
              <input type="hidden" name="addons" value={adicionales.join(',')} />
              <Button type="submit" variant="contained" disableElevation disabled={!puedeSeguir || !priceId}
                sx={{ height: 38, borderRadius: '10px', textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', bgcolor: NAVY, '&:hover': { bgcolor: '#0c2059' } }}>
                {diasDePrueba ? `Empezar ${diasDePrueba} días gratis` : `Contratar ${usd(precio)}/mes`}
              </Button>
            </Box>
          )
        )}
      </Box>
    </Dialog>
  );
}
