'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate as revalidar } from 'swr';
import {
  AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronRight, Download,
  HandCoins, Loader2, Mail, MessageCircle, Pencil, Receipt, Smartphone,
} from 'lucide-react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Button } from '@/components/ui/button';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { useVolver } from '@/lib/hooks/useVolver';
import { useTabUrl, useUrlParams } from '@/lib/hooks/useUrlEstado';
import { EnlacePagoFamilia } from '@/components/administracion-escolar/EnlacePagoFamilia';
import { PeriodosDeLaFamilia } from '@/components/administracion-escolar/PeriodosDeLaFamilia';
import { FacturaDrawer } from '@/components/administracion-escolar/FacturaDrawer';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { DetalleResponsable } from '@/lib/administracion-escolar/responsables';
import type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

/**
 * La ficha completa de una familia.
 *
 * La primera versión volcaba las cinco tablas una debajo de otra: quince
 * renglones repitiendo el mismo nombre de alumno, sin un total por hijo, sin
 * saber qué está vencido y sin poder sacar nada de ahí. Se leía como un dump
 * de la base, no como el estado de cuenta de una familia.
 *
 * Ahora: las cifras arriba, un reparto visual de dónde está la deuda, y el
 * detalle en pestañas —cada una con su exportación—. El estado de cuenta va
 * AGRUPADO POR HIJO, que es como se cobra y como se discute por teléfono.
 */

const traer = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('No se pudo cargar');
  return r.json();
});

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const AVISO_TEXTO: Record<string, string> = {
  'al-emitir': 'Factura nueva',
  'al-vencer': 'Venció hoy',
  'antes-mora': 'Antes del recargo',
};

const VISTAS = ['cuenta', 'pagos', 'facturas', 'avisos'] as const;

/** Descarga en el navegador, sin pasar por el servidor. */
function descargarCsv(nombre: string, filas: (string | number)[][]) {
  // Punto y coma y BOM: Excel en español abre así el archivo en columnas. Con
  // coma, un importe «RD$1,200.00» partía la fila.
  const csv = filas.map((f) => f.map((v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FamiliaPerfilClient({ clientId, perfilEmpresa }: {
  clientId: number;
  perfilEmpresa: EmpresaPerfil | null;
}) {
  const volver = useVolver('/escolar/responsables');
  const [vista, setVista] = useTabUrl('v', VISTAS, 'cuenta');

  const { permissions } = usePermissions();
  // Facturar toca dos módulos: mueve dinero en el escolar y emite un documento
  // en Facturación. Sin las dos, las casillas no se pintan.
  const puedeFacturar = permissions.includes('administracion-escolar:pagos')
    && permissions.includes('facturas:crear');

  /**
   * El cajón de facturar vive en la URL, no en un `useState`.
   *
   * Era estado suelto: recargar lo cerraba, no se podía mandar el enlace a
   * quien tiene que cobrar, y el «atrás» del navegador —el gesto natural para
   * cerrar algo que se abrió encima— sacaba de la ficha entera. Las pestañas
   * de más abajo ya vivían en la query; esto solo termina de aplicar la misma
   * regla a lo que se abre encima de ellas.
   *
   *   ?factura=nueva                  → todo lo que la familia debe sin facturar
   *   ?factura=c:12,13                → esos cargos (viene de «Facturar juntos»)
   *   ?factura=p:2811.44.3            → un mes por adelantado (matrícula.cuota.concepto)
   */
  const { params, setParams } = useUrlParams();
  const enCurso = params.get('factura');

  const cajon = useMemo(() => {
    if (!enCurso) return null;
    if (enCurso.startsWith('c:')) {
      const ids = enCurso.slice(2).split(',')
        .map(Number).filter((n) => Number.isInteger(n) && n > 0);
      return ids.length ? { cargos: ids, previsto: null } : null;
    }
    if (enCurso.startsWith('p:')) {
      const [m, c, k] = enCurso.slice(2).split('.').map(Number);
      return [m, c, k].every((n) => Number.isInteger(n) && n > 0)
        ? { cargos: null, previsto: { matriculaId: m, cuotaId: c, conceptoId: k } }
        : null;
    }
    // Cualquier otra cosa se trata como «Nueva factura» a secas antes que
    // dejar la ficha con un cajón que no abre y una URL que parece decir que sí.
    return { cargos: null, previsto: null };
  }, [enCurso]);

  const abrirCajon = (valor: string) => setParams({ factura: valor });

  const { data, error, isLoading } = useSWR<DetalleResponsable>(
    `/api/administracion-escolar/responsables/${clientId}`, traer,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const hoy = new Date().toISOString().slice(0, 10);

  /**
   * El estado de cuenta agrupado por hijo.
   *
   * Es el orden en que se habla con la familia: «de Alisa debes esto, de
   * Samil esto otro». Una lista plana de quince renglones con el mismo nombre
   * repetido no permite ni ver el subtotal de cada uno.
   */
  const porHijo = useMemo(() => {
    // Por el ID del alumno y no por su nombre: dos hermanos homónimos —o el
    // mismo alumno registrado dos veces— se sumaban en una fila con el doble
    // de deuda, y no había manera de notarlo mirando la pantalla.
    const m = new Map<number, {
      alumno: string; total: number; pendiente: number; vencido: number;
      cargos: NonNullable<DetalleResponsable['cargos']>;
    }>();
    for (const g of data?.cargos ?? []) {
      const k = g.estudianteId;
      const e = m.get(k) ?? { alumno: g.alumno || 'Sin alumno', total: 0, pendiente: 0, vencido: 0, cargos: [] };
      e.total += g.montoCentavos;
      e.pendiente += g.saldoCentavos;
      // Vencido solo cuenta lo YA facturado: sin factura emitida no hay
      // documento que pueda estar vencido, aunque la fecha del plan ya pasara.
      // Lo que toca con un cargo sin facturar es emitirlo, no perseguir un pago.
      if (g.saldoCentavos > 0 && g.ecfDocumentId != null && g.fechaVencimiento && g.fechaVencimiento < hoy) {
        e.vencido += g.saldoCentavos;
      }
      e.cargos.push(g);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.pendiente - a.pendiente);
  }, [data?.cargos, hoy]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }
  if (error || !data?.contacto) {
    return (
      <Box component="section" sx={{ mx: 'auto', maxWidth: 900, p: 3 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Esa familia no existe o no pertenece a este colegio.
        </Typography>
        <Button variant="link" onClick={volver} className="mt-3 px-0">
          <ArrowLeft className="h-4 w-4" />Volver a responsables
        </Button>
      </Box>
    );
  }

  const c = data.contacto;

  /*
    Las cuatro cifras tienen que contar EL MISMO dinero.

    «Facturado» salía solo de los cargos y «Pendiente» sumaba además las
    facturas sueltas, así que la familia 1022 enseñaba a la vez «100 % cobrado»
    y «Pendiente RD$500»: los RD$500 eran de una factura fuera del plan, que
    para el numerador no existía. Ahora las dos caras cuentan cargos + facturas
    sueltas, y la barra mide sobre esa misma base.
  */
  const facturadoCargos = data.cargos.reduce((s, g) => s + g.montoCentavos, 0);
  const pendienteCargos = data.cargos.reduce((s, g) => s + g.saldoCentavos, 0);
  const deudaFacturas = data.facturas.reduce(
    (s, f) => s + Math.max(0, f.montoTotal - f.pagadoCentavos), 0);
  const facturadoSueltas = data.facturas.reduce((s, f) => s + f.montoTotal, 0);
  // Acotado al monto: un cobro de más —una transferencia redonda sobre una
  // factura con centavos— no puede hacer que lo cobrado pase de lo facturado.
  const cobradoSueltas = data.facturas.reduce(
    (s, f) => s + Math.min(f.pagadoCentavos, f.montoTotal), 0);

  const facturado = facturadoCargos + facturadoSueltas;
  const pendiente = pendienteCargos + deudaFacturas;
  const cobrado = (facturadoCargos - pendienteCargos) + cobradoSueltas;
  const vencido = porHijo.reduce((s, h) => s + h.vencido, 0);
  const totalPagado = data.pagos.reduce((s, p) => s + p.montoCentavos, 0);

  /*
    Lo pendiente, partido en lo que ya se puede cobrar y lo que falta por emitir.

    El rojo de «Pendiente»/«Debe» es de lo primero: una factura emitida (suelta o
    de un cargo) con el saldo abierto. Un cargo aún sin facturar se debe, pero lo
    que toca con él es emitirlo; pintarlo en rojo lo hacía leer como una cuota
    vencida y perseguir un pago que todavía no se puede cobrar.
  */
  const pendientePorFacturar = data.cargos
    .filter((g) => g.ecfDocumentId == null)
    .reduce((s, g) => s + Math.max(0, g.saldoCentavos), 0);
  const pendientePorCobrar = Math.max(0, pendiente - pendientePorFacturar);

  /*
    Lo que se puede meter en una factura nueva.

    No basta con «no tiene factura»: el prefill exige que el cargo esté
    COBRABLE, y en cuanto uno solo de la lista no lo está devuelve 409 y tumba
    la preparación ENTERA —los otros seis se pierden con él—. Un cargo saldado
    a mano, o uno cerrado sin comprobante, bastaba para dejar «Nueva factura»
    inservible en esa familia.
  */
  const COBRABLES = ['pendiente', 'parcial', 'vencido'];
  const sinFacturar = data.cargos.filter((g) =>
    g.ecfDocumentId == null && g.saldoCentavos > 0 && COBRABLES.includes(g.estado));
  const cargosSaldados = data.cargos.filter((g) => g.saldoCentavos <= 0).length;
  // El más reciente por fecha, no el primero de la lista: el orden que llega
  // de la consulta no es contrato de esta pantalla.
  const ultimoPago = [...data.pagos].sort((a, b) => b.fechaPago.localeCompare(a.fechaPago))[0] ?? null;
  // Se redondea hacia abajo: un 99.6% cobrado no puede decir «100%» mientras
  // quede un peso vivo. Y al revés, si de verdad está todo, tiene que decir 100.
  const pctCobrado = facturado > 0
    ? (cobrado >= facturado ? 100 : Math.floor((cobrado / facturado) * 100))
    : 0;
  // Cobrado, pero tan poco que redondea a cero. Se dice «menos de 1%» en vez
  // de «0%», que con un pago ya aplicado se lee como que no entró nada.
  const casiNada = cobrado > 0 && pctCobrado === 0;

  const canales = [
    { icon: Mail, label: 'Correo', valor: c.email?.trim() || null },
    { icon: MessageCircle, label: 'WhatsApp', valor: c.whatsapp?.trim() || c.celular?.trim() || null },
    { icon: Smartphone, label: 'SMS', valor: c.celular?.trim() || c.whatsapp?.trim() || null },
  ];
  const sinCanal = canales.every((x) => !x.valor);

  return (
    <section className="space-y-5 p-6">
      <button type="button" onClick={volver}
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-zero-600">
        <ArrowLeft className="h-4 w-4" />Volver a responsables
      </button>

      {/*
        Tarjeta blanca, no la banda violeta de antes.

        El violeta estaba para no confundir esta ficha con la de un alumno —se
        leía «Debe RD$14,800» creyendo que era del niño—. Esa distinción ahora
        la hace el texto: el rótulo «Familia · responsable de pago» encima del
        nombre y el «N hijos matriculados» en la línea de datos. El color deja
        de gritar y la pantalla se parece al resto del sistema.
      */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: '16px',
          borderColor: '#E6E8F0',
          boxShadow: '0 1px 2px rgba(15,17,24,.03)',
          p: { xs: 2, sm: '20px 22px' },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'center' },
          gap: 2.25,
        }}
      >
        <Box sx={{
          width: 60, height: 60, flex: '0 0 60px', borderRadius: '50%',
          bgcolor: '#EDF1FE', color: '#2A48C4',
          display: 'grid', placeItems: 'center',
          fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.5px',
        }}>
          {c.razonSocial.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '.07em', color: '#8A90A0', mb: 0.25,
          }}>
            Familia · responsable de pago
          </Typography>
          <Typography component="h1" sx={{
            m: 0, fontSize: { xs: '1.375rem', sm: '1.625rem' }, fontWeight: 600,
            letterSpacing: '-0.9px', lineHeight: 1.15,
          }}>
            {c.razonSocial}
          </Typography>

          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.75,
            mt: 1.125, flexWrap: 'wrap',
          }}>
            <Typography component="span" sx={{ fontSize: '0.78125rem', color: '#6B7280' }}>
              RNC / Cédula{' '}
              <Box component="strong" sx={{ color: '#1E2433', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {c.rnc ?? '—'}
              </Box>
            </Typography>
            <Separador />
            <Typography component="span" sx={{ fontSize: '0.78125rem', color: '#6B7280' }}>
              {data.hijos.length} {data.hijos.length === 1 ? 'hijo matriculado' : 'hijos matriculados'}
            </Typography>
            <Separador />
            {pendiente <= 0 ? (
              <Pastilla tono="verde" icono={<Check className="h-3 w-3" />}>Al día</Pastilla>
            ) : pendientePorCobrar > 0 ? (
              <Pastilla tono="rojo" icono={<AlertTriangle className="h-3 w-3" />}>
                Debe {fmtDOP(pendiente)}
              </Pastilla>
            ) : (
              // Todo lo que se debe está aún sin facturar: no se alarma, se
              // emite. Lo dice en vez de pintarlo en rojo.
              <Pastilla tono="gris" icono={<Receipt className="h-3 w-3" />}>
                Por facturar {fmtDOP(pendiente)}
              </Pastilla>
            )}
            <Pastilla tono="gris">
              {sinCanal ? 'No se le puede avisar' : 'Cuenta activa'}
            </Pastilla>
          </Box>
        </Box>

        {/* Por dónde escribirle y su enlace de pago. No están en el diseño de
            referencia, pero es lo que se busca cuando el padre llama diciendo
            que no le llegó nada: hay que ver por dónde sí se le puede escribir
            y copiarle el enlace. */}
        <Box sx={{
          flexShrink: 0, minWidth: { md: 190 },
          borderLeft: { md: '1px solid #EDEFF5' }, pl: { md: 2.25 },
        }}>
          <Typography sx={{
            fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '.07em', color: '#8A90A0',
          }}>
            Se le puede avisar por
          </Typography>
          <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            {canales.map((x) => (
              <Box component="span" key={x.label}
                title={x.valor ? `${x.label}: ${x.valor}` : `Sin ${x.label}`}
                sx={{ display: 'inline-flex', color: x.valor ? '#3658E1' : '#C3C8D4' }}>
                <x.icon className="h-4 w-4" />
              </Box>
            ))}
          </Box>
          <Box sx={{ mt: 1 }}>
            <EnlacePagoFamilia clientId={clientId} />
          </Box>
        </Box>

        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.125, flex: '0 0 auto',
          alignSelf: { xs: 'flex-start', md: 'center' },
        }}>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/clientes/${clientId}/editar`}>
              <Pencil className="mr-1.5 h-4 w-4" />Editar contacto
            </Link>
          </Button>
          {puedeFacturar && (
            <Button
              variant="default"
              size="sm"
              // Explícito: «Nueva factura» arranca de todo lo que la familia
              // debe sin facturar, no de lo que quedara de un «Adelantar».
              onClick={() => abrirCajon('nueva')}
            >
              <Receipt className="mr-1.5 h-4 w-4" />Nueva factura
            </Button>
          )}
        </Box>
      </Paper>

      <FacturaDrawer
        abierto={cajon != null}
        onCerrar={() => {
          setParams({ factura: null });
          // Las DOS consultas. La cabecera saca la deuda de una y los meses
          // de otra: refrescando solo la primera, las cifras de arriba
          // cambiaban y los cargos de abajo seguían diciendo «Sin facturar»
          // encima de una factura que acababa de salir.
          void revalidar(`/api/administracion-escolar/responsables/${clientId}`);
          void revalidar(`/api/administracion-escolar/responsables/${clientId}/periodos`);
        }}
        perfilEmpresa={perfilEmpresa}
        // Solo los cargos QUE AÚN NO TIENEN FACTURA. Volver a facturar uno ya
        // facturado le cobraría dos veces a la familia: el error que más caro
        // sale y el que nadie nota hasta que el padre reclama.
        cargosIniciales={cajon?.previsto ? [] : (cajon?.cargos ?? sinFacturar.map((g) => g.id))}
        // La familia de esta ficha, para cuando no hay ningún cargo que
        // facturar: sin esto el cajón abría sin comprador y sin beneficiarios.
        clienteInicial={{
          id: clientId, razonSocial: c.razonSocial,
          rnc: c.rnc, email: c.email, telefono: c.telefono ?? c.celular,
        }}
        previsto={cajon?.previsto ?? null}
      />

      {/*
        Las cuatro cifras en UNA tarjeta con divisores, no en cuatro tarjetas
        sueltas. Son las cuatro caras del mismo dinero —lo facturado se cobra o
        se queda pendiente, y lo pendiente vence o no— y separarlas en cajas
        las hacía leer como cuatro datos sin relación.
      */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: '16px', borderColor: '#E6E8F0', overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15,17,24,.03)',
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          <Cifra icon={Receipt} label="Facturado" valor={fmtDOP(facturado)}
            detalle={[
              `${data.cargos.length} ${data.cargos.length === 1 ? 'cargo' : 'cargos'} del año escolar`,
              // Se nombran aparte porque no salen del plan de cobro: si no,
              // la cifra no cuadra con los cargos que se ven más abajo.
              data.facturas.length > 0
                ? `${data.facturas.length} ${data.facturas.length === 1 ? 'factura suelta' : 'facturas sueltas'}`
                : null,
            ].filter(Boolean).join(' · ')}
            primera />
          <Cifra icon={HandCoins} label="Cobrado" valor={fmtDOP(cobrado)}
            detalle={`${data.pagos.length} ${data.pagos.length === 1 ? 'pago aplicado' : 'pagos aplicados'}`}
            tono={cobrado > 0 ? 'verde' : 'gris'} />
          <Cifra icon={AlertTriangle} label="Pendiente" valor={fmtDOP(pendiente)}
            // Rojo solo por lo emitido sin cobrar. Si además queda por facturar,
            // se dice aparte para no mezclarlo con lo que ya es exigible.
            detalle={pendientePorCobrar > 0 && pendientePorFacturar > 0
              ? `Por cobrar ${fmtDOP(pendientePorCobrar)} · por facturar ${fmtDOP(pendientePorFacturar)}`
              : pendientePorCobrar > 0
              ? (deudaFacturas > 0 ? `con ${fmtDOP(deudaFacturas)} de facturas sueltas` : 'Del plan de cobro')
              : pendientePorFacturar > 0 ? 'Aún por facturar'
              : 'Nada por cobrar'}
            tono={pendientePorCobrar > 0 ? 'rojo' : 'gris'} />
          <Cifra icon={CalendarDays} label="Vencido" valor={fmtDOP(vencido)}
            // Solo del plan de cobro: una factura suelta no lleva fecha de
            // vencimiento en el módulo, y contarla aquí sería inventarle una.
            detalle={vencido > 0 ? 'Ya pasó su fecha · del plan de cobro' : 'Sin atrasos registrados'}
            tono={vencido > 0 ? 'rojo' : 'gris'} />
        </Box>

        {/* Cuánto de lo facturado ya entró. Sin nada emitido no hay porcentaje
            que enseñar: 0 de 0 sería un 0% que parece un problema. */}
        {(data.cargos.length > 0 || data.facturas.length > 0) && (
          <Box sx={{
            borderTop: '1px solid #EDEFF5', bgcolor: '#FBFCFE',
            px: 2.75, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.75,
          }}>
            <Box component="span" sx={{
              flex: 1, minWidth: 0, height: 6, borderRadius: 999,
              bgcolor: '#E7EBF6', overflow: 'hidden', display: 'block',
            }}>
              <Box component="span" sx={{
                display: 'block', height: 6, borderRadius: 999,
                // Con un 0.3% la barra medía menos de un píxel y se veía
                // vacía justo cuando el renglón de al lado decía que ya hay
                // un cargo cobrado. Se le da un mínimo para que se vea que
                // algo entró.
                width: casiNada ? '4px' : `${pctCobrado}%`,
                minWidth: cobrado > 0 ? '4px' : 0,
                bgcolor: pctCobrado === 100 ? '#0F7A4A' : '#3658E1',
              }} />
            </Box>
            <Typography component="span" sx={{ fontSize: '0.71875rem', color: '#4A5164', whiteSpace: 'nowrap' }}>
              <Box component="strong" sx={{ fontWeight: 600, color: pctCobrado === 100 ? '#0F7A4A' : '#2A48C4' }}>
                {casiNada ? 'menos de 1%' : `${pctCobrado}%`} cobrado
              </Box>
              {data.cargos.length > 0 && (
                <>{' · '}{cargosSaldados} de {data.cargos.length} cargos cobrados</>
              )}
              {/* Lo que antes hacía que la barra dijera 100 % con dinero vivo.
                  Ahora ni se esconde ni descuadra: se nombra. */}
              {deudaFacturas > 0 && (
                <>{' · '}{fmtDOP(deudaFacturas)} en facturas sueltas</>
              )}
            </Typography>
          </Box>
        )}
      </Paper>

      {/*
        Aquí vivían tres paneles —«Deuda por hijo», «Cómo está esa deuda» y
        «Hijos · N»— que ahora dicen lo mismo que las tarjetas de abajo: cada
        hijo trae su curso, su estado, lo que debe y sus meses. Dejarlos era
        enseñar la misma deuda tres veces en la misma pantalla, y la tercera
        contradecía a la primera en cuanto una consulta se refrescaba antes
        que la otra.

        Los hijos SIN matrícula no se pierden: `PeriodosDeLaFamilia` sale de
        la misma tabla y con el mismo filtro (`facturar_a_client_id`), y a
        quien no tiene matrícula le pinta su tarjeta diciéndolo.
      */}
      {/* Los meses de todos los hijos, cada uno con los suyos.
          Antes esto era una sola línea por hijo —«sin plan», «activa»— y para
          ver de qué meses se trataba había que entrar ficha por ficha. El
          cobro no se hace por alumno: el padre llama una vez y pregunta por
          los dos. Aquí se marcan cargos de los dos y sale UNA factura. */}
      <PeriodosDeLaFamilia
        clientId={clientId}
        puedeFacturar={puedeFacturar}
        // «Facturar juntos» va al mismo sitio que «Adelantar»: el formulario
        // completo por la derecha, con esos cargos ya cargados. Antes abría el
        // diálogo rápido, que es otra pantalla con otras reglas — y sobre todo
        // otra manera de no vincular los cargos.
        onFacturar={(ids) => abrirCajon(`c:${ids.join(',')}`)}
        // «Adelantar» va derecho al formulario completo. El diálogo rápido no
        // aportaba nada aquí: el mes ya está elegido, y lo que hace falta —el
        // beneficiario, el descuento de la beca, cobrar en el acto— vive en el
        // formulario grande.
        onFacturarPrevisto={(p) =>
          abrirCajon(`p:${p.matriculaId}.${p.cuotaId}.${p.conceptoId}`)}
      />

      {/*
        El detalle, en pestañas.

        «Estado de cuenta» ya no repite los cargos hijo por hijo: eso está
        arriba, en la tarjeta de cada uno. Aquí quedan las tres cifras que se
        miran al descolgar el teléfono —cuánto debe hoy, cuánto está vencido y
        cuándo pagó la última vez— y las tres se leen de un vistazo.
      */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: '16px', borderColor: '#E6E8F0', overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15,17,24,.03)',
        }}
      >
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, px: 2.75,
          borderBottom: '1px solid #EDEFF5', overflowX: 'auto',
        }}>
          {([['cuenta', 'Estado de cuenta'],
             ['pagos', `Pagos (${data.pagos.length})`],
             ['facturas', `Facturas sueltas (${data.facturas.length})`],
             ['avisos', `Recordatorios (${data.avisosProgramados.length + data.avisos.length})`]] as const)
            .map(([v, etiqueta]) => (
            <Box
              key={v}
              component="button"
              type="button"
              onClick={() => setVista(v)}
              aria-current={vista === v ? 'page' : undefined}
              sx={{
                height: 48, px: 1.5, flex: '0 0 auto', cursor: 'pointer',
                bgcolor: 'transparent', border: 0, font: 'inherit',
                borderBottom: '2px solid',
                borderColor: vista === v ? '#3658E1' : 'transparent',
                color: vista === v ? '#102A72' : '#6B7280',
                fontSize: '0.8125rem', fontWeight: vista === v ? 600 : 500,
                whiteSpace: 'nowrap', transition: 'color .15s',
                '&:hover': { color: '#102A72' },
              }}
            >
              {etiqueta}
            </Box>
          ))}
          <Box sx={{ flex: 1 }} />
          <Box sx={{ flex: '0 0 auto', py: 0.875 }}>
            <Button size="sm" variant="outline" onClick={() => exportar(vista, data)}>
              <Download className="mr-1.5 h-4 w-4" />Exportar
            </Button>
          </Box>
        </Box>

        <Box sx={{ px: 2.75, pt: 0.75, pb: 1.75 }}>
          {vista === 'cuenta' && (
            <>
              <FilaResumen
                icono={<HandCoins size={17} />}
                tono={pendiente > 0 ? 'rojo' : 'verde'}
                titulo="Saldo al día de hoy"
                detalle={pendiente > 0
                  ? `${porHijo.filter((h) => h.pendiente > 0).length} de ${porHijo.length} estudiantes con saldo`
                  : 'No hay saldo pendiente en ningún estudiante'}
                monto={fmtDOP(pendiente)}
              />
              <FilaResumen
                icono={<AlertTriangle size={17} />}
                tono={vencido > 0 ? 'rojo' : 'gris'}
                titulo="Vencido"
                detalle={vencido > 0
                  ? 'Ya pasó su fecha de pago · genera mora si está configurada'
                  : 'Sin atrasos registrados'}
                monto={fmtDOP(vencido)}
              />
              <FilaResumen
                icono={<Receipt size={17} />}
                tono="azul"
                titulo="Último pago recibido"
                detalle={ultimoPago
                  ? [ultimoPago.encf || ultimoPago.codigo, fmtFechaCorta(ultimoPago.fechaPago), ultimoPago.metodo]
                      .filter(Boolean).join(' · ')
                  : 'Todavía no ha pagado nada'}
                monto={ultimoPago ? fmtDOP(ultimoPago.montoCentavos) : '—'}
                href={ultimoPago ? `/dashboard/facturas/${ultimoPago.ecfDocumentId}` : undefined}
                ultima
              />
            </>
          )}

          {vista === 'pagos' && (
            data.pagos.length === 0 ? <Vacio texto="Todavía no ha pagado nada." /> : (
              <TablaLista
                columnas={[
                  { nombre: 'Fecha', ancho: '100px' },
                  { nombre: 'Alumno' },
                  { nombre: 'Factura', ancho: '150px' },
                  { nombre: 'Método', ancho: '120px' },
                  { nombre: 'Referencia', ancho: '130px' },
                  { nombre: 'Monto', ancho: '120px', alinear: 'right' },
                ]}
                filas={data.pagos.map((x) => ({
                  key: String(x.id),
                  celdas: [
                    fmtFechaCorta(x.fechaPago),
                    x.alumno ?? '—',
                    <Enlace key="f" href={`/dashboard/facturas/${x.ecfDocumentId}`}>
                      {x.encf || x.codigo || `#${x.ecfDocumentId}`}
                    </Enlace>,
                    <Box key="m" component="span" sx={{ textTransform: 'capitalize' }}>{x.metodo ?? '—'}</Box>,
                    x.referencia ?? '—',
                    <Num key="n">{fmtDOP(x.montoCentavos)}</Num>,
                  ],
                }))}
                pie={['Total cobrado', fmtDOP(totalPagado)]}
              />
            )
          )}

          {vista === 'facturas' && (
            data.facturas.length === 0 ? (
              <Vacio texto="Ninguna factura fuera del plan de cobro." />
            ) : (
              <TablaLista
                columnas={[
                  { nombre: 'Fecha', ancho: '100px' },
                  { nombre: 'Comprobante' },
                  { nombre: 'Monto', ancho: '120px', alinear: 'right' },
                  { nombre: 'Pagado', ancho: '120px', alinear: 'right' },
                  { nombre: 'Pendiente', ancho: '120px', alinear: 'right' },
                ]}
                filas={data.facturas.map((f) => {
                  const saldo = Math.max(0, f.montoTotal - f.pagadoCentavos);
                  return {
                    key: String(f.id),
                    celdas: [
                      fmtFechaCorta(f.fecha),
                      <Enlace key="c" href={`/dashboard/facturas/${f.id}`}>
                        {f.encf || f.codigo || `#${f.id}`}
                      </Enlace>,
                      <Num key="m">{fmtDOP(f.montoTotal)}</Num>,
                      <Num key="p" apagada={f.pagadoCentavos <= 0}>
                        {f.pagadoCentavos > 0 ? fmtDOP(f.pagadoCentavos) : '—'}
                      </Num>,
                      <Num key="s" tono={saldo > 0 ? 'rojo' : undefined}>{fmtDOP(saldo)}</Num>,
                    ],
                  };
                })}
              />
            )
          )}

          {vista === 'avisos' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1.5 }}>
              {/* Lo que le VA a salir, con la misma cuenta que usa el cron:
                  si aquí no aparece, el motor tampoco lo va a mandar. */}
              <Box>
                <Rotulo>Programados</Rotulo>
                {data.avisosProgramados.length === 0 ? (
                  /*
                    Sin afirmar POR QUÉ está vacío.

                    Decía «sus cargos no tienen avisos encendidos», y eso es
                    solo uno de los tres motivos: también sale vacío cuando el
                    concepto sí los tiene encendidos pero el cargo ya está
                    pagado —un cargo saldado no se recuerda—, y cuando las
                    fechas de aviso ya pasaron. Afirmando la causa equivocada,
                    quien lo lee se va a revisar una configuración que estaba
                    bien.
                  */
                  <Vacio texto="No hay ningún recordatorio por salir. Los avisos se encienden por concepto y solo salen sobre cargos con saldo pendiente." />
                ) : (
                  <TablaLista
                    columnas={[
                      { nombre: 'Cuándo sale', ancho: '110px' },
                      { nombre: 'Alumno' },
                      { nombre: 'Aviso' },
                      { nombre: 'Canales', ancho: '150px' },
                      { nombre: 'Monto', ancho: '120px', alinear: 'right' },
                    ]}
                    filas={data.avisosProgramados.map((a, i) => ({
                      key: `${a.estudianteId}-${a.tipo}-${i}`,
                      celdas: [
                        fmtFechaCorta(a.fecha),
                        a.alumno,
                        <Box key="t">
                          {AVISO_TEXTO[a.tipo] ?? a.tipo}
                          {a.concepto && (
                            <Typography sx={{ fontSize: '0.65625rem', color: '#9AA0AC' }}>{a.concepto}</Typography>
                          )}
                        </Box>,
                        <Box key="c" component="span" sx={{ textTransform: 'capitalize' }}>{a.canales.join(', ')}</Box>,
                        <Num key="m">{fmtDOP(a.montoCentavos)}</Num>,
                      ],
                    }))}
                  />
                )}
              </Box>

              <Box>
                <Rotulo>Ya enviados</Rotulo>
                {data.avisos.length === 0 ? (
                  <Vacio texto="Todavía no se le ha mandado ningún recordatorio." />
                ) : (
                  <TablaLista
                    columnas={[
                      { nombre: 'Cuándo', ancho: '110px' },
                      { nombre: 'Alumno' },
                      { nombre: 'Aviso' },
                      { nombre: 'Canal', ancho: '110px' },
                      { nombre: 'A dónde fue' },
                    ]}
                    filas={data.avisos.map((a) => ({
                      key: String(a.id),
                      celdas: [
                        fmtFechaCorta(a.enviadoAt),
                        a.alumno,
                        <Box key="t">
                          {AVISO_TEXTO[a.tipo] ?? a.tipo}
                          {a.concepto && (
                            <Typography sx={{ fontSize: '0.65625rem', color: '#9AA0AC' }}>{a.concepto}</Typography>
                          )}
                        </Box>,
                        <Box key="c" component="span" sx={{ textTransform: 'capitalize' }}>{a.canal}</Box>,
                        // El destino de ese día, no el de hoy: eso es lo que lo
                        // convierte en constancia.
                        a.destino ?? '—',
                      ],
                    }))}
                  />
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Paper>

    </section>
  );
}

/** Saca a CSV lo que se está mirando, no la ficha entera. */
function exportar(vista: (typeof VISTAS)[number], d: DetalleResponsable) {
  const nombre = (d.contacto?.razonSocial ?? 'familia').replace(/[^\w]+/g, '-').toLowerCase();
  if (vista === 'cuenta') {
    descargarCsv(`estado-de-cuenta-${nombre}.csv`, [
      ['Alumno', 'Concepto', 'Mes', 'Año', 'Vence', 'Factura', 'Monto', 'Pendiente', 'Estado'],
      ...d.cargos.map((g) => [
        g.alumno, g.concepto ?? '', g.mes ? MESES[g.mes] : '', g.anio,
        g.fechaVencimiento ?? '', g.encf || g.codigo || '',
        (g.montoCentavos / 100).toFixed(2), (g.saldoCentavos / 100).toFixed(2), g.estado,
      ]),
    ]);
  } else if (vista === 'pagos') {
    descargarCsv(`pagos-${nombre}.csv`, [
      ['Fecha', 'Alumno', 'Factura', 'Método', 'Referencia', 'Monto'],
      ...d.pagos.map((p) => [
        p.fechaPago.slice(0, 10), p.alumno ?? '', p.encf || p.codigo || '',
        p.metodo ?? '', p.referencia ?? '', (p.montoCentavos / 100).toFixed(2),
      ]),
    ]);
  } else if (vista === 'facturas') {
    descargarCsv(`facturas-${nombre}.csv`, [
      ['Fecha', 'Comprobante', 'Monto', 'Pagado', 'Pendiente'],
      ...d.facturas.map((f) => [
        f.fecha.slice(0, 10), f.encf || f.codigo || '',
        (f.montoTotal / 100).toFixed(2), (f.pagadoCentavos / 100).toFixed(2),
        (Math.max(0, f.montoTotal - f.pagadoCentavos) / 100).toFixed(2),
      ]),
    ]);
  } else {
    // Las DOS tablas de la pestaña, no solo los enviados.
    //
    // La pantalla enseña «Programados» y «Ya enviados» y el CSV traía la
    // segunda: quien exportaba para preparar las llamadas del día se llevaba
    // justo lo que YA había salido y nada de lo que estaba por salir. La
    // columna «Estado» es la que distingue las dos mitades dentro del archivo.
    descargarCsv(`recordatorios-${nombre}.csv`, [
      ['Estado', 'Cuándo', 'Alumno', 'Aviso', 'Canal', 'Destino', 'Monto'],
      ...d.avisosProgramados.map((a) => [
        'Programado', a.fecha.slice(0, 10), a.alumno,
        AVISO_TEXTO[a.tipo] ?? a.tipo, a.canales.join(', '), '',
        (a.montoCentavos / 100).toFixed(2),
      ]),
      ...d.avisos.map((a) => [
        'Enviado', a.enviadoAt.slice(0, 16).replace('T', ' '), a.alumno,
        AVISO_TEXTO[a.tipo] ?? a.tipo, a.canal, a.destino ?? '', '',
      ]),
    ]);
  }
}

/* ── Piezas de la ficha ────────────────────────────────────────────────────
 *
 * Todas en MUI y sin una clase de Tailwind. Son las que se repiten por toda
 * la pantalla —los chips de la cabecera, las cuatro cifras, los paneles, las
 * barras y las tablas de cada pestaña—, así que aquí es donde el cambio de
 * librería se nota de verdad: cambiando estas seis se convierte casi todo lo
 * que se ve, sin tocar la lógica que las llama.
 *
 * El violeta se mantiene a propósito: distingue la ficha de la FAMILIA de la
 * del ALUMNO, que tienen la misma forma y se confundían.
 */

/** La rayita vertical que separa los datos de la cabecera. */
function Separador() {
  return <Box component="span" sx={{ width: '1px', height: 13, bgcolor: '#E2E6F2', flexShrink: 0 }} />;
}

const PASTILLA = {
  verde: { bg: '#E8F6EF', fg: '#0F7A4A' },
  rojo:  { bg: '#FDECEC', fg: '#B4231F' },
  gris:  { bg: '#F2F4FA', fg: '#4A5164' },
} as const;

/** Etiqueta de estado: «Al día», «Debe RD$…», «Cuenta activa». */
function Pastilla({ tono, icono, children }: {
  tono: keyof typeof PASTILLA; icono?: React.ReactNode; children: React.ReactNode;
}) {
  const c = PASTILLA[tono];
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.75,
      height: 24, px: 1.25, borderRadius: '7px',
      bgcolor: c.bg, color: c.fg, fontSize: '0.71875rem', fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {icono}{children}
    </Box>
  );
}

const TONOS = {
  gris:  '#0F1118',
  verde: '#0F7A4A',
  rojo:  '#B4231F',
} as const;

/**
 * Una de las cuatro cifras de la banda.
 *
 * El número se escribe grande y con `clamp`, no con un tamaño fijo: «Facturado»
 * puede ser RD$299,520.00 y a 26px en una columna de 230px se salía de la
 * tarjeta. Y `tabular-nums` porque los cuatro números se leen en fila y con
 * cifras de ancho distinto no cuadran entre sí.
 */
function Cifra({ icon: Icon, label, valor, detalle, tono = 'gris', primera = false }: {
  icon: typeof Receipt; label: string; valor: string; detalle: string;
  tono?: keyof typeof TONOS;
  /** La primera no lleva divisor: sería una raya pegada al borde de la tarjeta. */
  primera?: boolean;
}) {
  return (
    <Box sx={{
      px: 2.75, py: 2.25, minWidth: 0,
      borderLeft: primera ? '1px solid transparent' : '1px solid #EDEFF5',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box component="span" sx={{ display: 'flex', color: TONOS[tono] === '#0F1118' ? '#2A48C4' : TONOS[tono] }}>
          <Icon className="h-[15px] w-[15px]" />
        </Box>
        <Typography component="span" noWrap sx={{
          fontSize: '0.6875rem', fontWeight: 600, color: '#8A90A0',
          textTransform: 'uppercase', letterSpacing: '.07em',
        }}>
          {label}
        </Typography>
      </Box>
      <Typography noWrap sx={{
        mt: 1, fontSize: 'clamp(1.1875rem, 1.55vw, 1.625rem)', fontWeight: 600,
        letterSpacing: '-0.9px', color: TONOS[tono], fontVariantNumeric: 'tabular-nums',
      }}>
        {valor}
      </Typography>
      <Typography noWrap sx={{ mt: 0.375, fontSize: '0.71875rem', color: '#9AA0AC' }}>
        {detalle}
      </Typography>
    </Box>
  );
}

const TONO_FILA = {
  verde: { bg: '#E8F6EF', fg: '#0F7A4A' },
  rojo:  { bg: '#FDECEC', fg: '#B4231F' },
  azul:  { bg: '#EDF1FE', fg: '#2A48C4' },
  gris:  { bg: '#F2F4FA', fg: '#8A90A0' },
} as const;

/**
 * Un renglón del resumen: icono, qué es, el detalle y la cifra.
 *
 * Sustituye al acordeón que repetía los cargos hijo por hijo. Ese detalle ya
 * está arriba en la tarjeta de cada uno, y tenerlo dos veces hacía que las dos
 * copias se contradijeran en cuanto una de las dos consultas se refrescaba
 * antes que la otra.
 */
function FilaResumen({ icono, tono, titulo, detalle, monto, href, ultima = false }: {
  icono: React.ReactNode;
  tono: keyof typeof TONO_FILA;
  titulo: string;
  detalle: string;
  monto: string;
  /** Si lleva, la fila entera es un enlace. */
  href?: string;
  ultima?: boolean;
}) {
  const c = TONO_FILA[tono];
  const cuerpo = (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.75, py: 1.75,
      borderBottom: ultima ? 'none' : '1px solid #F1F3F9',
      cursor: href ? 'pointer' : 'default',
      transition: 'background .12s',
      '&:hover': href ? { bgcolor: '#FBFCFE' } : undefined,
    }}>
      <Box sx={{
        width: 36, height: 36, flex: '0 0 36px', borderRadius: '10px',
        bgcolor: c.bg, color: c.fg, display: 'grid', placeItems: 'center',
      }}>
        {icono}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.84375rem', fontWeight: 600, color: '#0F1118' }}>{titulo}</Typography>
        <Typography noWrap sx={{ mt: 0.25, fontSize: '0.75rem', color: '#8A90A0' }}>{detalle}</Typography>
      </Box>
      <Typography sx={{
        flex: '0 0 auto', fontSize: '0.9375rem', fontWeight: 600,
        color: tono === 'rojo' ? '#B4231F' : tono === 'verde' ? '#0F7A4A' : '#0F1118',
        letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums',
      }}>
        {monto}
      </Typography>
      {href && <ChevronRight size={15} style={{ flexShrink: 0, color: '#C3C8D4' }} />}
    </Box>
  );
  return href
    ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{cuerpo}</Link>
    : cuerpo;
}

/** Cifra alineada a la derecha, con dígitos de ancho fijo. */
function Num({ children, tono, apagada = false }: {
  children: React.ReactNode; tono?: 'rojo'; apagada?: boolean;
}) {
  return (
    <Box component="span" sx={{
      display: 'block', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
      fontWeight: tono === 'rojo' ? 600 : 500,
      color: tono === 'rojo' ? '#B4231F' : apagada ? '#C3C8D4' : '#1E2433',
    }}>
      {children}
    </Box>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <Box component="span" sx={{
        fontSize: '0.78125rem', color: '#3658E1', fontVariantNumeric: 'tabular-nums',
        '&:hover': { textDecoration: 'underline' },
      }}>
        {children}
      </Box>
    </Link>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{
      mb: 0.75, fontSize: '0.65625rem', fontWeight: 600, color: '#8A90A0',
      textTransform: 'uppercase', letterSpacing: '.07em',
    }}>
      {children}
    </Typography>
  );
}

/**
 * Tabla de lista, en rejilla y no en `<table>`.
 *
 * Con `subgrid` cada fila se alinea con la cabecera sin repetir los anchos, y
 * la fila entera puede llevar su propio fondo al pasar por encima — que en un
 * `<table>` obliga a pintar celda por celda.
 */
function TablaLista({ columnas, filas, pie }: {
  columnas: { nombre: string; ancho?: string; alinear?: 'left' | 'right' | 'center' }[];
  filas: { key: string; celdas: React.ReactNode[] }[];
  /** Fila de total: etiqueta a la izquierda y cifra en la última columna. */
  pie?: [string, string];
}) {
  const plantilla = columnas.map((c) => c.ancho ?? 'minmax(120px, 1fr)').join(' ');
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: plantilla, minWidth: 620 }}>
        {columnas.map((c) => (
          <Box key={c.nombre} sx={{
            fontSize: '0.65625rem', fontWeight: 600, color: '#8A90A0',
            textTransform: 'uppercase', letterSpacing: '.07em',
            pt: 1.5, pb: 1, pr: 1.25, textAlign: c.alinear ?? 'left',
          }}>
            {c.nombre}
          </Box>
        ))}

        {filas.map((f) => (
          <Box key={f.key} sx={{
            gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid',
            alignItems: 'center', borderTop: '1px solid #F1F3F9',
            transition: 'background .12s', '&:hover': { bgcolor: '#FBFCFE' },
          }}>
            {f.celdas.map((celda, i) => (
              <Box key={i} sx={{
                py: 1.375, pr: 1.25, minWidth: 0,
                fontSize: '0.8125rem', color: '#1E2433',
                textAlign: columnas[i]?.alinear ?? 'left',
              }}>
                {celda}
              </Box>
            ))}
          </Box>
        ))}

        {pie && (
          <Box sx={{
            gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid',
            borderTop: '1.5px solid #E2E6F2', bgcolor: '#FBFCFE',
          }}>
            <Box sx={{
              gridColumn: `1 / ${columnas.length}`, py: 1.5,
              fontSize: '0.78125rem', fontWeight: 600, color: '#4A5164',
            }}>
              {pie[0]}
            </Box>
            <Box sx={{
              py: 1.5, pr: 1.25, textAlign: 'right', fontSize: '0.9375rem',
              fontWeight: 600, color: '#102A72', letterSpacing: '-0.4px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {pie[1]}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <Typography
      variant="body2"
      sx={{
        borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider',
        px: 2, py: 4, textAlign: 'center', color: 'text.secondary',
      }}
    >
      {texto}
    </Typography>
  );
}
