'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ListaAlumnosLote } from '@/components/administracion-escolar/cargo-lote/ListaAlumnosLote';
import { ConfirmarCobroDialog } from '@/components/administracion-escolar/cargo-lote/ConfirmarCobroDialog';
import {
  alumnosConCargoVivo, fraseDeDuplicados, fraseDeQuitados,
  fraseDelCobro, marcarLosQueYaLoTienen,
  type DetalleRevisado, type FraseDelCobro,
} from '@/lib/administracion-escolar/cargo-lote';
import { vencimientoDe } from '@/lib/administracion-escolar/calendario';
import {
  ERRORES_AL_COMPROBAR, avisoDeCalendario, avisoDeLaCarga, conteoDeLaCarga, errorDeLaCarga,
  necesitaMes, todosLoTienen,
} from '@/lib/administracion-escolar/cargo-desde-tarifa';
import { mesesDelPeriodo, type MesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { mesEnLetras } from '@/lib/administracion-escolar/cargo-lote';
import { NativeSelect } from '@/components/ui/native-select';
import { fmtDOP, hoyRD } from '@/lib/utils/format';

/**
 * «Cargar a estudiantes»: cobrarle el concepto de una fila de Tarifas a los
 * alumnos de ESA fila.
 *
 * Toma lo imprescindible de «Cargo a varios alumnos» —la lista con casillas,
 * «ya lo tiene», la frase de lo que va a pasar y el «¿seguro?»— y quita todo
 * lo que aquí ya está contestado: el concepto es el de la fila y no se puede
 * cambiar ni crear otro, el curso es el de la fila y el monto es su tarifa. Lo
 * único que queda por decidir es a cuáles de esos alumnos se les cobra y hasta
 * cuándo pueden pagar.
 *
 * Lo que no se puede romper:
 *  - la frase y lo que se manda al crear salen del MISMO cuerpo
 *    (`cuerpoDelCargo`), así que la pantalla no puede decir una cosa y cobrar
 *    otra;
 *  - nunca se crea con la lista de marcados vacía: el servidor la leería como
 *    «a todos los del curso»;
 *  - «ya lo tiene» se mira dos veces —lo que dice la revisión y lo que se ve
 *    al listar los cargos del concepto—, porque el servidor, preguntando sin
 *    mes, no ve los cargos que sí lo tienen;
 *  - si el crear se queda sin respuesta no se deja repetir a ciegas: solo
 *    queda volver a mirar la lista, donde el que se creó ya sale como «ya lo
 *    tiene».
 *
 * Las reglas y los textos que no necesitan pantalla están en
 * `lib/administracion-escolar/cargo-desde-tarifa.ts`.
 */

/** Hasta diez páginas de cargos; más que eso no es el colegio para el que está hecho esto. */
const PAGINAS_DE_CARGOS = 10;

interface Generacion { creados: number; omitidos: number; total: number; detalles: DetalleRevisado[] }

/** El cuerpo de `POST /cargos/generar` de este cargo, sin `dryRun` ni marcados. */
interface CuerpoDelCargo {
  periodoId: number;
  cursoIds: number[];
  conceptoId: number;
  /** El mes de la colegiatura. `null` en todo lo demás: ese cobro va una vez al año. */
  mes: number | null;
  anio: number;
  montoCentavos: number;
  fechaVencimiento: string | null;
}

/** El año escolar con sus fechas, para saber qué meses tiene. */
interface PeriodoConFechas { fechaInicio: string | null; fechaFin: string | null }

/** El mes que viene puesto: el de hoy si cae dentro del año escolar. */
function mesInicial(meses: MesDelPeriodo[]): MesDelPeriodo | null {
  const [anio, mes] = hoyRD().split('-').map(Number);
  return meses.find((m) => m.mes === mes && m.anio === anio) ?? meses[0] ?? null;
}

/**
 * Quién tiene ya este concepto cobrado este año escolar, pagado o no.
 *
 * Si no se puede saber no se devuelve una lista a medias: se dice por qué y la
 * lista no se enseña. Una lista incompleta dejaría marcado a quien ya lo
 * tiene, que es justo lo que se quiere evitar.
 */
async function alumnosConEseConcepto(
  conceptoId: number, periodoId: number,
): Promise<number[] | keyof typeof ERRORES_AL_COMPROBAR> {
  const pagina = async (n: number) => {
    const r = await fetch(
      `/api/administracion-escolar/cargos?conceptoId=${conceptoId}&periodoId=${periodoId}&porPagina=200&pagina=${n}`,
    );
    if (!r.ok) throw new Error('cargos');
    return (await r.json()) as { cargos?: { estudianteId: number; estado: string }[]; paginas?: number };
  };
  try {
    const primera = await pagina(1);
    const paginas = Number(primera.paginas) || 1;
    if (paginas > PAGINAS_DE_CARGOS) return 'demasiados';
    const resto = await Promise.all(Array.from({ length: paginas - 1 }, (_, i) => pagina(i + 2)));
    return alumnosConCargoVivo([primera, ...resto].flatMap((p) => p.cargos ?? []));
  } catch {
    return 'sin-respuesta';
  }
}

export function CargarConceptoDialog({
  concepto, grupoNombre, montoCentavos, periodo, cursoIds, onCerrar, onCreado,
}: {
  /** El concepto de la fila. Desde aquí no se cambia ni se crea otro. */
  concepto: { id: number; nombre: string; tipo: string };
  /** El curso de la fila, como se dice en una frase: «Inicial - Matutina», «1ro». */
  grupoNombre: string;
  /** La tarifa de la fila: lo que paga cada alumno. */
  montoCentavos: number;
  periodo: { id: number; nombre: string; activo: boolean };
  /** Las secciones de la fila. Nunca vacía: sin alumnos no se ofrece la acción. */
  cursoIds: number[];
  onCerrar: () => void;
  /** Se crearon cargos: quien abrió el diálogo puede refrescar lo que tenga en pantalla. */
  onCreado?: (creados: number) => void;
}) {
  const hoy = hoyRD();
  const conMes = necesitaMes(concepto.tipo);
  const aviso = avisoDeLaCarga(concepto.tipo);
  /**
   * Los meses del año escolar. Solo se piden cuando el cobro es de los que van
   * por mes: la pantalla de Tarifas no trae las fechas del período, y pedirlas
   * siempre sería una llamada de más en el caso normal.
   */
  const [meses, setMeses] = useState<MesDelPeriodo[] | null>(null);
  const [mes, setMes] = useState<MesDelPeriodo | null>(null);
  /**
   * Hasta cuándo pueden pagar NO se pregunta aquí: sale del concepto, que ya
   * lo tiene configurado («Tiene fecha de vencimiento, N días después»).
   *
   * Preguntarlo era pedir dos veces lo mismo y abrir la puerta a que el mismo
   * cobro venciera a siete días desde Tarifas y a treinta desde el plan del
   * año. `undefined` = todavía no se sabe; `null` = este cobro no vence.
   */
  const [diasParaPago, setDiasParaPago] = useState<number | null | undefined>(undefined);
  /** Cuántas cuotas tiene este cobro en este año escolar. `null` = aún no se sabe. */
  const [cuotas, setCuotas] = useState<number | null>(null);
  const [revision, setRevision] = useState<Generacion | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [mirando, setMirando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** El crear se quedó sin respuesta: lo único que se ofrece es volver a mirar. */
  const [soloVolverAMirar, setSoloVolverAMirar] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [creando, setCreando] = useState(false);

  /**
   * Lo que se manda, entero. De aquí salen la frase, el diálogo de confirmar y
   * el cuerpo de crear: si cada cosa lo armara por su lado podrían decir una
   * cosa y cobrar otra.
   *
   * El mes va en `null` a propósito: esta acción no cobra mensualidades (se
   * bloquean antes, en el botón), y con mes «ya lo tiene» se decidiría distinto.
   */
  const cuerpoDelCargo = useCallback((): CuerpoDelCargo => ({
    periodoId: periodo.id,
    cursoIds,
    conceptoId: concepto.id,
    mes: conMes && mes ? mes.mes : null,
    // El año es el del mes elegido; sin mes, el de hoy, que es como lo manda
    // la pantalla de «Cargo a varios alumnos».
    anio: conMes && mes ? mes.anio : Number(hoyRD().slice(0, 4)),
    montoCentavos,
    // La misma regla que usa el plan del año: la fecha de emisión es hoy y el
    // plazo lo pone el concepto. Sin plazo configurado, el cargo no vence.
    fechaVencimiento: vencimientoDe(hoyRD(), diasParaPago ?? null),
  }), [periodo.id, cursoIds, concepto.id, montoCentavos, diasParaPago, conMes, mes]);

  /** Cada «volver a mirar» sube esto: lo que venga de una pregunta vieja no se pinta. */
  const preguntaVigente = useRef(0);

  const mirar = useCallback(async () => {
    const estaVez = preguntaVigente.current + 1;
    preguntaVigente.current = estaVez;
    setMirando(true);
    setError(null);
    setSoloVolverAMirar(false);
    /*
     * Quién lo tiene ya se pregunta aparte SOLO cuando el cargo va sin mes: el
     * servidor, preguntado sin mes, no ve los cargos que sí lo tienen. Con mes
     * —una colegiatura— el servidor ya cuenta los repetidos de ESE mes, y
     * mirar además todos los del año marcaría como «ya lo tiene» a quien pagó
     * septiembre cuando se está cobrando octubre.
     */
    const cuerpo = cuerpoDelCargo();
    const quienesLoTienen = cuerpo.mes === null
      ? alumnosConEseConcepto(concepto.id, periodo.id)
      : Promise.resolve<number[]>([]);
    try {
      const res = await fetch('/api/administracion-escolar/cargos/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cuerpo, dryRun: true }),
      });
      const data = await res.json().catch(() => null);
      if (estaVez !== preguntaVigente.current) return;
      if (!res.ok || !data || !Array.isArray(data.detalles)) {
        setError(errorDeLaCarga('mirar', res.ok ? 500 : res.status, data?.error).texto);
        setRevision(null);
        return;
      }
      const conEseConcepto = await quienesLoTienen;
      if (estaVez !== preguntaVigente.current) return;
      if (!Array.isArray(conEseConcepto)) {
        setError(ERRORES_AL_COMPROBAR[conEseConcepto]);
        setRevision(null);
        return;
      }
      const mirado = marcarLosQueYaLoTienen(data as Generacion, new Set(conEseConcepto));
      setRevision(mirado);
      // Vienen marcados todos los que pueden recibirlo: el caso normal es
      // cobrárselo al curso entero, y quitar dos marcas es menos trabajo que
      // poner cuarenta.
      setSeleccion(new Set(
        mirado.detalles.filter((d) => d.resultado !== 'duplicado').map((d) => d.estudianteId),
      ));
    } catch {
      if (estaVez === preguntaVigente.current) {
        setError(errorDeLaCarga('mirar', 0).texto);
        setRevision(null);
      }
    } finally {
      if (estaVez === preguntaVigente.current) setMirando(false);
    }
  }, [concepto.id, periodo.id, cuerpoDelCargo]);

  /**
   * El plazo que el concepto tiene configurado. Si no se puede leer se toma
   * como «sin fecha límite», que es lo que menos daño hace: un cargo sin
   * vencimiento no entra en mora ni se pinta como atrasado, y la fecha se le
   * puede poner después desde la ficha del alumno.
   */
  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const r = await fetch('/api/administracion-escolar/conceptos');
        if (!r.ok) throw new Error('conceptos');
        const d = await r.json();
        const suyo = (d.conceptos ?? []).find((c: { id: number }) => c.id === concepto.id);
        if (!vigente) return;
        const dias = suyo?.diasParaPago;
        setDiasParaPago(typeof dias === 'number' ? dias : null);
      } catch {
        if (vigente) setDiasParaPago(null);
      }
    })();
    return () => { vigente = false; };
  }, [concepto.id]);

  /**
   * ¿Este cobro tiene calendario? Si lo tiene, quien pone sus cargos es el
   * plan del año y hay que decirlo (ver `avisoDeCalendario`).
   *
   * Si no se puede leer no se inventa un aviso: se deja sin él. Un ámbar que
   * sale por un fallo de red enseña a no hacer caso de los ámbares.
   */
  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/administracion-escolar/conceptos/${concepto.id}/cuotas?periodoId=${periodo.id}`,
        );
        if (!r.ok) throw new Error('cuotas');
        const d = await r.json();
        if (vigente) setCuotas(Array.isArray(d.cuotas) ? d.cuotas.length : 0);
      } catch {
        if (vigente) setCuotas(0);
      }
    })();
    return () => { vigente = false; };
  }, [concepto.id, periodo.id]);

  /**
   * Los meses del año escolar, solo para los cobros que van por mes.
   *
   * Si no se pueden leer, el diálogo lo dice y no deja cobrar: sin mes, el
   * cargo de una colegiatura se guardaría suelto y el de octubre taparía al de
   * septiembre.
   */
  useEffect(() => {
    if (!conMes) return;
    let vigente = true;
    void (async () => {
      try {
        const r = await fetch('/api/administracion-escolar/periodos');
        if (!r.ok) throw new Error('periodos');
        const d = await r.json();
        const suyo: PeriodoConFechas | undefined = (d.periodos ?? [])
          .find((p: { id: number }) => p.id === periodo.id);
        const lista = mesesDelPeriodo(suyo?.fechaInicio, suyo?.fechaFin);
        if (!vigente) return;
        setMeses(lista);
        setMes(mesInicial(lista));
      } catch {
        if (vigente) setMeses([]);
      }
    })();
    return () => { vigente = false; };
  }, [conMes, periodo.id]);

  /**
   * Se mira al abrir y cada vez que se cambia de mes: «ya lo tiene» es de ese
   * mes y de ningún otro. Cambiar la fecha límite NO vuelve a preguntar — a
   * quién se le debe no depende de hasta cuándo puede pagar.
   */
  const claveDeLaPregunta = conMes ? (mes ? `${mes.anio}-${mes.mes}` : null) : 'sin-mes';
  const miradaHecha = useRef<string | null>(null);
  useEffect(() => {
    if (claveDeLaPregunta === null) return;
    if (miradaHecha.current === claveDeLaPregunta) return;
    miradaHecha.current = claveDeLaPregunta;
    void mirar();
  }, [claveDeLaPregunta, mirar]);

  function alternar(estudianteId: number) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (!n.delete(estudianteId)) n.add(estudianteId);
      return n;
    });
  }

  function marcarVarios(ids: number[], marcar: boolean) {
    setSeleccion((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (marcar) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }

  async function crear() {
    if (creando || seleccion.size === 0) return;
    setCreando(true);
    setError(null);
    const cuerpo = cuerpoDelCargo();
    try {
      const res = await fetch('/api/administracion-escolar/cargos/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cuerpo, estudianteIds: [...seleccion] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        const fallo = errorDeLaCarga('cobrar', res.ok ? 500 : res.status, data?.error);
        setError(fallo.texto);
        setSoloVolverAMirar(fallo.volverAMirar);
        setConfirmando(false);
        return;
      }
      // El número es el del SERVIDOR, no el que se marcó: entre mirar y
      // confirmar alguien pudo crear el mismo cargo desde otra pantalla.
      const creados = Number(data.creados) || 0;
      toast.success(
        creados === 1 ? `1 cargo de «${concepto.nombre}» creado` : `${creados} cargos de «${concepto.nombre}» creados`,
        { description: `${fmtDOP(cuerpo.montoCentavos)} a cada uno · ${fmtDOP(creados * cuerpo.montoCentavos)} en total` },
      );
      onCreado?.(creados);
      onCerrar();
    } catch {
      const fallo = errorDeLaCarga('cobrar', 0);
      setError(fallo.texto);
      setSoloVolverAMirar(fallo.volverAMirar);
      setConfirmando(false);
    } finally {
      setCreando(false);
    }
  }

  const cuerpo = cuerpoDelCargo();
  const aCobrar = revision ? revision.creados : 0;
  const yaLoTienen = revision ? revision.omitidos : 0;
  const nadaQueCobrar = revision !== null && todosLoTienen({ aCobrar, yaLoTienen });

  const frase: FraseDelCobro | null = revision ? fraseDelCobro({
    montoCentavos: cuerpo.montoCentavos,
    cobro: concepto.nombre,
    mesTexto: cuerpo.mes ? mesEnLetras(cuerpo.mes, cuerpo.anio) : null,
    aMano: false,
    grupo: grupoNombre,
    marcados: seleccion.size,
    enLaLista: revision.total,
    fechaVencimiento: cuerpo.fechaVencimiento,
    hoy,
  }) : null;

  const quitados = revision
    ? revision.detalles
      .filter((d) => d.resultado !== 'duplicado' && !seleccion.has(d.estudianteId))
      .map((d) => d.nombre)
    : [];
  const notas = [
    quitados.length > 0 ? fraseDeQuitados(quitados) : null,
    yaLoTienen > 0 ? fraseDeDuplicados(yaLoTienen) : null,
  ].filter((n): n is string => n !== null);
  // El ámbar del tipo de cobro se repite al confirmar: es lo que más cuesta
  // deshacer, y el diálogo de «¿seguro?» tapa el del cuerpo.
  const avisoCalendario = cuotas === null ? null : avisoDeCalendario(cuotas);
  const avisos = [
    aviso,
    avisoCalendario,
    periodo.activo ? null : `Es del año escolar «${periodo.nombre}», que no es el que está en curso.`,
  ].filter((a): a is string => a !== null);

  /** El año escolar no tiene fechas, así que no hay meses que elegir. */
  const sinMeses = conMes && meses !== null && meses.length === 0;
  // No se cobra hasta saber el plazo del concepto: sin eso, el cargo nacería
  // sin fecha de vencimiento cuando sí la tiene configurada.
  const puedeCobrar = revision !== null && seleccion.size > 0 && !mirando
    && diasParaPago !== undefined && !soloVolverAMirar && !sinMeses;

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o && !creando) onCerrar(); }}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-gray-100 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-zero-600" />
              {`Cargar «${concepto.nombre}» a los alumnos de ${grupoNombre}`}
            </DialogTitle>
            {/* El concepto, el curso y el monto se dicen, no se preguntan: son
                los de la fila desde la que se abrió esto. */}
            <p className="text-sm text-gray-500">
              {`${fmtDOP(montoCentavos)} por alumno · Año escolar ${periodo.nombre}`}
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {/* El aviso del tipo de cobro va ARRIBA del todo y no junto al
                botón: lo que cambia aquí no es si se puede cobrar, sino qué se
                va a cobrar —la tarifa de la fila, sin beca—, y eso hay que
                leerlo antes de repasar la lista, no después. */}
            {aviso && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {aviso}
              </p>
            )}
            {avisoCalendario && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {avisoCalendario}
              </p>
            )}

            {conMes && (
              <div className="grid gap-1.5">
                <Label htmlFor="carga-mes">¿De qué mes?</Label>
                {sinMeses ? (
                  <p id="carga-mes-sin-fechas" className="text-sm text-amber-800">
                    {`El año escolar «${periodo.nombre}» no tiene fechas, así que no se sabe qué meses tiene. Ponle fechas en Estructura y vuelve.`}
                  </p>
                ) : meses === null ? (
                  <p className="text-sm text-gray-500">Buscando los meses del año escolar…</p>
                ) : (
                  <div className="w-56">
                    <NativeSelect id="carga-mes" value={mes ? `${mes.anio}-${mes.mes}` : ''}
                      onChange={(e) => setMes(meses.find((m) => `${m.anio}-${m.mes}` === e.target.value) ?? null)}>
                      {meses.map((m) => (
                        <option key={`${m.anio}-${m.mes}`} value={`${m.anio}-${m.mes}`}>
                          {mesEnLetras(m.mes, m.anio)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                {/* Por qué el mes manda: es lo que decide quién sale en gris. */}
                {!sinMeses && (
                  <p className="text-xs text-gray-500">
                    Quien ya tenga este cobro de ese mes sale en gris y no se le cobra otra vez.
                  </p>
                )}
              </div>
            )}

            {mirando && !sinMeses && (
              <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando a los alumnos…
              </p>
            )}

            {!mirando && error && (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p role="alert" className="text-sm text-red-700">{error}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void mirar()}>
                  Volver a mirar
                </Button>
              </div>
            )}

            {!mirando && !error && revision && (
              <>
                <p className="text-sm text-gray-600">{conteoDeLaCarga({ aCobrar, yaLoTienen })}</p>
                {nadaQueCobrar ? (
                  <p className="rounded-lg border border-zero-200 bg-zero-50 px-3 py-2 text-sm text-zero-800">
                    {`Todos los alumnos de ${grupoNombre} ya tienen este cargo. No hay nada que cobrar.`}
                  </p>
                ) : revision.detalles.length === 0 ? (
                  <p className="py-4 text-sm text-gray-500">
                    {`No hay alumnos matriculados en ${grupoNombre} este año escolar.`}
                  </p>
                ) : (
                  <ListaAlumnosLote
                    detalles={revision.detalles}
                    seleccion={seleccion}
                    /* El curso es uno solo y está en el título: repetirlo en
                       cada fila no distingue a nadie. */
                    cursoPorAlumno={new Map()}
                    aMano={false}
                    onAlternar={alternar}
                    onMarcarVarios={marcarVarios}
                  />
                )}
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-gray-100 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-left">
              {frase?.principal && (
                <>
                  <p className="text-sm text-gray-900">{frase.principal}</p>
                  <p className="text-xs text-gray-500">{`${frase.total} · ${frase.plazo}`}</p>
                </>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={onCerrar} disabled={creando}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => setConfirmando(true)} disabled={!puedeCobrar}>
                {seleccion.size === 1 ? 'Cobrar a 1 alumno' : `Cobrar a ${seleccion.size} alumnos`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* El «¿seguro?» de siempre: esto no tiene deshacer, un cargo mal puesto
          se anula alumno por alumno. */}
      <ConfirmarCobroDialog
        abierto={confirmando}
        frase={frase}
        marcados={seleccion.size}
        notas={notas}
        avisos={avisos}
        creando={creando}
        error={error}
        onCerrar={() => setConfirmando(false)}
        onConfirmar={() => void crear()}
      />
    </>
  );
}
