'use client';

/**
 * Lo que ve el padre.
 *
 * Estilos en línea y sin librerías a propósito, igual que /pay/[token]: es una
 * página pública que se abre desde WhatsApp en un móvil con mala cobertura, y
 * no tiene por qué arrastrar el CSS del panel del colegio.
 *
 * El orden de la pantalla es el orden en que se hace la gestión — qué debo,
 * a dónde lo mando, y la prueba de que lo mandé — porque el padre que llega
 * aquí quiere salir en un minuto.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VistaLinkPago } from '@/lib/administracion-escolar/link-pago';
import { ZonaArchivo } from '@/components/shared/ZonaArchivo';

const AZUL = '#1d4ed8';
const BORDE = '#d8dae0';
const TENUE = '#6b7280';
const VERDE = '#15803d';
const VERDE_BORDE = '#bbf7d0';

function dinero(centavos: number): string {
  return `RD$${(centavos / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fecha(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/**
 * Cómo se llama el documento según lo que sea.
 *
 * En RD el RNC lleva 9 dígitos y la cédula 11. Llamarlo por su nombre importa:
 * el padre que ve «RNC» encima de once dígitos duda de si el dato está mal y
 * llama al colegio en vez de transferir.
 */
function etiquetaDocumento(doc: string): string {
  return doc.replace(/\D/g, '').length === 11 ? 'Cédula' : 'RNC';
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Copiable({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copiar ${valor}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        } catch {
          // Sin permiso de portapapeles (http, o un navegador viejo): el valor
          // está a la vista y se puede seleccionar a mano.
        }
      }}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer', padding: 4,
        color: copiado ? '#059669' : '#9ca3af', fontSize: 12, lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      {copiado ? '✓' : '⧉'}
    </button>
  );
}

function FilaDato({ etiqueta, valor, copiable, destacado }: {
  etiqueta: string; valor: string | null; copiable?: boolean; destacado?: boolean;
}) {
  if (!valor) return null;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderBottom: `1px solid ${BORDE}`,
    }}>
      <span style={{ fontSize: 13, color: TENUE, flexShrink: 0 }}>{etiqueta}</span>
      <span style={{
        fontSize: 14, textAlign: 'right', wordBreak: 'break-word',
        fontWeight: destacado ? 700 : 500, color: destacado ? AZUL : '#111827',
      }}>
        {valor}
        {copiable && <Copiable valor={valor} />}
      </span>
    </div>
  );
}

// ─── Pantalla ────────────────────────────────────────────────────────────────

export function PagarClient({ token, facturaId, vista, tarjetaHabilitada }: {
  token: string;
  /** Enlace de UNA factura: se cobra solo ella. `null` es el enlace agregado. */
  facturaId: number | null;
  vista: VistaLinkPago;
  tarjetaHabilitada: boolean;
}) {
  const router = useRouter();

  const [metodo, setMetodo] = useState<'tarjeta' | 'transferencia'>('transferencia');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [otroMonto, setOtroMonto] = useState(false);
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  const { transferencia: t, cargos, totalCentavos } = vista;
  const sinDeuda = cargos.length === 0;
  // Pagada de verdad: el servidor solo arma `facturaPagada` cuando la factura
  // existe, es de este responsable y su estado de pago es PAGADA. No basta con
  // que no haya cargos: un enlace sin deuda también puede ser una factura cuyo
  // comprobante todavía espera aprobación, y eso NO es un recibo.
  const pagada = Boolean(vista.facturaPagada);

  /**
   * Guarda el archivo y, si es imagen, su miniatura.
   *
   * Ver la foto antes de mandarla es la única forma de que el padre note que
   * salió movida o cortada. Una foto ilegible es un comprobante que el colegio
   * rechaza tres días después, cuando ya nadie se acuerda.
   */
  function elegir(f: File | null) {
    setArchivo(f);
    setError('');
    setListo(false);
    setPrevia((anterior) => {
      // Se libera la anterior: cada objectURL se queda en memoria hasta que se
      // revoca, y aquí se cambia de foto tantas veces como haga falta.
      if (anterior) URL.revokeObjectURL(anterior);
      return f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
    });
  }

  async function subir() {
    if (!archivo) { setError('Adjunta el comprobante'); return; }
    setSubiendo(true); setError('');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      if (otroMonto && monto) fd.append('monto', monto);
      if (referencia.trim()) fd.append('referencia', referencia.trim());

      // El mismo acotado que trajo la página: si es el enlace de una factura, el
      // comprobante entra contra esa factura, no contra toda la deuda.
      const url = facturaId != null
        ? `/api/pagar/${token}/comprobante?f=${facturaId}`
        : `/api/pagar/${token}/comprobante`;
      const r = await fetch(url, { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error ?? 'No se pudo enviar el comprobante'); return; }

      elegir(null);
      setListo(true);
      // Recarga del servidor: el aviso de «pendiente de aprobación» sale de la
      // base, no de este estado, para que siga ahí si el padre vuelve a entrar.
      router.refresh();
    } catch {
      setError('No hubo conexión. Revisa tus datos e inténtalo otra vez.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f5', color: '#111827' }}>
      {/* Barra */}
      <header style={{
        background: '#fff', borderBottom: `1px solid ${BORDE}`, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {vista.colegio.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vista.colegio.logo} alt="" width={34} height={34}
              style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: '50%', background: AZUL, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 15, flexShrink: 0,
            }}>{vista.colegio.nombre.charAt(0)}</div>
          )}
          <span style={{
            fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{vista.colegio.nombre}</span>
        </div>
        <span style={{ fontSize: 13, color: TENUE, whiteSpace: 'nowrap' }}>
          Pago seguro por <span style={{ color: AZUL, fontWeight: 600 }}>Zero Colegios</span>
        </span>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 16px 56px' }}>
        <h1 style={{
          fontSize: 30, fontWeight: 700, margin: '0 0 6px',
          color: pagada ? VERDE : AZUL,
        }}>
          {pagada ? 'Factura pagada' : vista.facturaScope ? 'Pago de factura' : 'Pagos pendientes'}
        </h1>
        <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 22px' }}>
          {vista.facturaScope ? (
            pagada
              ? <>La factura{' '}
                  <b>{vista.facturaScope.codigo || vista.facturaScope.encf || `#${vista.facturaScope.id}`}</b>{' '}
                  está saldada. No hay nada que pagar.</>
              : sinDeuda
                // Sin saldo pero sin pago confirmado: el comprobante puede estar
                // esperando aprobación, y eso se ve en el aviso de abajo.
                ? <>Esta factura no tiene saldo pendiente.</>
                : <>Estás pagando la factura{' '}
                    <b>{vista.facturaScope.codigo || vista.facturaScope.encf || `#${vista.facturaScope.id}`}</b>.
                    Revisa el importe y realiza tu transferencia.</>
          ) : (
            sinDeuda
              ? 'No tienes cargos pendientes en este momento.'
              : 'Revisa lo que debes y realiza tu transferencia.'
          )}
        </p>

        {/* Recibo. Va antes del resumen porque es la respuesta a lo que el padre
            vino a comprobar; el resto de la página es de cobro y aquí ya no hay
            nada que cobrar. */}
        {pagada && vista.facturaPagada ? (
          <section style={{
            background: '#fff', border: `1px solid ${VERDE_BORDE}`, borderLeft: `4px solid ${VERDE}`,
            borderRadius: 6, padding: '18px 20px', marginBottom: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: VERDE }}>Comprobante de pago</h2>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
                {dinero(vista.facturaPagada.montoCentavos)}
              </span>
            </div>

            {vista.facturaPagada.lineas.length > 0 ? (
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: '#374151' }}>
                {vista.facturaPagada.lineas.map((l, i) => (
                  <li key={`${l.estudiante}-${l.concepto}-${i}`}>
                    <b>{l.estudiante}</b> · {l.concepto}
                  </li>
                ))}
              </ul>
            ) : null}

            {vista.facturaPagada.pagos.length > 0 ? (
              <div style={{ marginTop: 14, borderTop: `1px solid ${BORDE}`, paddingTop: 12 }}>
                {vista.facturaPagada.pagos.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                    fontSize: 14, color: '#374151', padding: '3px 0',
                  }}>
                    <span>Pagado el {fecha(p.fecha)} · {p.metodo}</span>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{dinero(p.montoCentavos)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Resumen */}
        <section style={{
          background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          marginBottom: 18,
        }}>
          <div style={{ padding: '18px 20px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>Estudiantes</h2>
            {vista.estudiantes.length === 0 ? (
              <p style={{ fontSize: 14, color: TENUE, margin: 0 }}>—</p>
            ) : (
              <>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
                  {vista.estudiantes.map((e) => <li key={e}>{e}</li>)}
                </ul>
                <p style={{ fontSize: 13, color: AZUL, margin: '8px 0 0' }}>
                  {vista.estudiantes.length} {vista.estudiantes.length === 1 ? 'estudiante' : 'estudiantes'}
                </p>
              </>
            )}
          </div>

          <div style={{ padding: '18px 20px', borderLeft: `1px solid ${BORDE}` }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>Responsable</h2>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>{vista.responsable.nombre}</p>
            {vista.responsable.email && (
              <p style={{ fontSize: 13, color: '#374151', margin: '0 0 2px' }}>{vista.responsable.email}</p>
            )}
            {vista.responsable.telefono && (
              <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{vista.responsable.telefono}</p>
            )}
          </div>

          <div style={{ padding: '18px 20px', borderLeft: `1px solid ${BORDE}` }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
              Saldo pendiente total
            </h2>
            <p style={{ fontSize: 28, fontWeight: 700, color: AZUL, margin: 0, lineHeight: 1.2 }}>
              {dinero(totalCentavos)}
            </p>
          </div>
        </section>

        {/* Detalle */}
        {!sinDeuda && (
          <section style={{
            background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6,
            marginBottom: 18, overflowX: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  {['Concepto', 'Estudiante', 'Vence', 'Monto'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 3 ? 'right' : 'left', fontSize: 13, fontWeight: 600,
                      color: '#374151', padding: '13px 16px', borderBottom: `1px solid ${BORDE}`,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cargos.map((c) => (
                  <tr key={c.cargoId}>
                    <td style={celda}>{c.concepto}</td>
                    <td style={celda}>{c.estudiante}</td>
                    <td style={{ ...celda, whiteSpace: 'nowrap', color: c.vencido ? '#b91c1c' : '#111827' }}>
                      {fecha(c.fechaVencimiento)}{c.vencido ? ' · vencido' : ''}
                    </td>
                    <td style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {dinero(c.montoCentavos)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} style={{ ...celda, fontWeight: 700, background: '#fafafa' }}>Total a pagar</td>
                  <td style={{
                    ...celda, textAlign: 'right', fontWeight: 700, background: '#fafafa',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{dinero(totalCentavos)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* Estado de lo ya enviado */}
        {vista.comprobantes.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            {vista.comprobantes.map((c) => {
              const estilo = c.estado === 'pendiente'
                ? { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', icono: '⏳',
                    titulo: 'Transferencia pendiente de aprobación',
                    texto: 'Recibimos tu comprobante. El pago queda pendiente hasta que el colegio verifique la transferencia.' }
                : c.estado === 'aprobado'
                ? { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#065f46', icono: '✓',
                    titulo: 'Pago confirmado',
                    texto: 'El colegio verificó tu transferencia.' }
                : { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', icono: '✕',
                    titulo: 'Comprobante rechazado',
                    texto: c.motivoRechazo ?? 'El colegio no pudo verificar esta transferencia.' };
              return (
                <div key={c.id} style={{
                  background: estilo.bg, border: `1px solid ${estilo.bd}`, borderRadius: 6,
                  padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.2 }}>{estilo.icono}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: estilo.fg, margin: '0 0 2px' }}>
                      {estilo.titulo} · {dinero(c.montoCentavos)}
                    </p>
                    <p style={{ fontSize: 13, color: estilo.fg, margin: 0, lineHeight: 1.55 }}>
                      {estilo.texto}
                    </p>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {!sinDeuda && (
          <>
            {/* Método */}
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Método de pago</h2>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12, marginBottom: 18,
            }}>
              {/* La tarjeta sigue el mismo interruptor que el resto del sistema:
                  sin credenciales de la pasarela en producción no se ofrece, en
                  vez de enseñar un botón que devuelve un error. */}
              <button type="button" disabled={!tarjetaHabilitada}
                onClick={() => setMetodo('tarjeta')}
                style={opcion(metodo === 'tarjeta', !tarjetaHabilitada)}>
                <span>Tarjeta</span>
                {!tarjetaHabilitada && (
                  <span style={{ fontSize: 12, color: TENUE, fontWeight: 400 }}>No disponible</span>
                )}
              </button>
              <button type="button" onClick={() => setMetodo('transferencia')}
                style={opcion(metodo === 'transferencia', false)}>
                <span>Transferencia bancaria</span>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  border: `5px solid ${metodo === 'transferencia' ? AZUL : '#cbd5e1'}`,
                  background: '#fff',
                }} />
              </button>
            </div>

            {metodo === 'transferencia' && (
              t.completo ? (
                <>
                  {/* Las cuentas. Una tarjeta por banco: el padre busca EL SUYO
                      —transferir dentro del mismo banco no cobra comisión— y
                      una tabla corrida de seis filas por cuenta lo esconde. */}
                  <section style={{ marginBottom: 18 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 600, color: AZUL, margin: '0 0 4px' }}>
                      {t.cuentas.length === 1
                        ? 'Información para transferencia'
                        : 'Elige el banco donde tienes tu cuenta'}
                    </h2>
                    {t.cuentas.length > 1 && (
                      <p style={{ fontSize: 12, color: TENUE, margin: '0 0 10px' }}>
                        Transferir dentro de tu mismo banco suele ser gratis y llega al momento.
                      </p>
                    )}

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 12,
                    }}>
                      {t.cuentas.map((c) => (
                        <div key={c.id} style={{
                          background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6,
                        }}>
                          <div style={{
                            padding: '11px 14px', borderBottom: `1px solid ${BORDE}`,
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'baseline', gap: 8,
                          }}>
                            <span style={{ fontSize: 15, fontWeight: 700 }}>{c.banco}</span>
                            {c.tipoCuenta && (
                              <span style={{ fontSize: 12, color: TENUE }}>{c.tipoCuenta}</span>
                            )}
                          </div>
                          <div style={{ padding: '10px 14px' }}>
                            <p style={{ fontSize: 11, color: TENUE, margin: '0 0 2px' }}>Número de cuenta</p>
                            <p style={{
                              fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: '0.02em',
                              display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-all',
                            }}>
                              {c.numeroCuenta}<Copiable valor={c.numeroCuenta} />
                            </p>
                          </div>
                          {(c.titular || c.documento) && (
                            <div style={{ padding: '0 14px 12px' }}>
                              {c.titular && (
                                <>
                                  <p style={{ fontSize: 11, color: TENUE, margin: '0 0 2px' }}>A nombre de</p>
                                  <p style={{ fontSize: 13, margin: 0 }}>{c.titular}</p>
                                </>
                              )}
                              {/* El documento va DENTRO de la tarjeta porque es del
                                  titular de esta cuenta, no del colegio: puede
                                  haber una a nombre de la fundación con otro RNC,
                                  y el banco rebota la transferencia si no cuadra
                                  con el titular. */}
                              {c.documento && (
                                <p style={{
                                  fontSize: 12, color: TENUE, margin: '6px 0 0',
                                  display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                  {etiquetaDocumento(c.documento)}: <b style={{ color: '#111827' }}>{c.documento}</b>
                                  <Copiable valor={c.documento} />
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Lo que NO cambia según el banco: va una sola vez, debajo. */}
                  <section style={{
                    background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6, marginBottom: 18,
                  }}>
                    <FilaDato etiqueta="Referencia" valor={vista.referencia} copiable />
                    <FilaDato etiqueta="Total a transferir" valor={dinero(totalCentavos)} copiable destacado />
                    <p style={{
                      fontSize: 12, color: TENUE, margin: 0, padding: '10px 14px',
                      borderTop: `1px solid ${BORDE}`, lineHeight: 1.6,
                    }}>
                      Escribe la referencia <b>{vista.referencia}</b> en el concepto de la
                      transferencia. Es lo que le permite al colegio saber que el pago es tuyo.
                      {t.instrucciones ? ` ${t.instrucciones}` : ''}
                    </p>
                  </section>

                  {/* Comprobante */}
                  <section style={{
                    background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6,
                    padding: '16px 16px 18px', marginBottom: 18,
                  }}>
                    <h2 style={{ fontSize: 14, fontWeight: 600, color: AZUL, margin: '0 0 4px' }}>
                      Adjuntar comprobante
                    </h2>
                    <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 12px', lineHeight: 1.6 }}>
                      Adjunta aquí tu comprobante de pago. Luego de enviarlo, el pago quedará
                      como <b>pendiente de aprobación</b> hasta ser validado por el colegio.
                    </p>

                    {archivo ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
                        border: `1px solid ${BORDE}`, borderRadius: 8, padding: 12,
                        background: '#fafafa',
                      }}>
                        {previa ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previa} alt="" width={54} height={54}
                            style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                        ) : (
                          <div style={{
                            width: 54, height: 54, borderRadius: 6, flexShrink: 0,
                            background: '#e5e7eb', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#4b5563',
                          }}>PDF</div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{
                            fontSize: 14, fontWeight: 600, margin: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{archivo.name}</p>
                          <p style={{ fontSize: 12, color: TENUE, margin: '2px 0 0' }}>
                            {(archivo.size / 1024).toFixed(0)} KB · listo para enviar
                          </p>
                        </div>
                        <button type="button" onClick={() => elegir(null)}
                          style={{
                            border: 'none', background: 'transparent', color: TENUE,
                            cursor: 'pointer', fontSize: 13, padding: 6, flexShrink: 0,
                          }}>
                          Quitar
                        </button>
                      </div>
                    ) : (
                      /* La misma zona que usa Facturación: clic, cámara,
                         arrastrar y pegar, con la compresión incluida. Una foto
                         de celular pesa 3–8 MB y aquí el tope son 5. */
                      <div style={{ marginBottom: 14 }}>
                        <ZonaArchivo
                          pegar
                          onArchivos={(fs) => elegir(fs[0] ?? null)}
                          titulo="Haz clic aquí y adjunta tu comprobante"
                          ayuda="Una foto o un PDF · hasta 5 MB"
                        />
                      </div>
                    )}

                    <div style={{
                      background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 6,
                      padding: '10px 12px', fontSize: 12, color: '#1e40af', lineHeight: 1.6,
                      marginBottom: 14,
                    }}>
                      Que se vea el monto transferido y la referencia. Si le haces una foto a
                      la pantalla del banco, revisa que se lea antes de enviarla.
                    </div>

                    {/* El monto se pide solo si el padre lo pide: la mayoría
                        transfiere el total, y un campo más es una duda más. Pero
                        transferir de menos es normal, y sin esto el colegio
                        aprobaría una cifra que nunca llegó al banco. */}
                    {otroMonto ? (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          Monto transferido (RD$)
                          <input type="number" inputMode="decimal" min="1" step="0.01"
                            value={monto} onChange={(e) => setMonto(e.target.value)}
                            placeholder={(totalCentavos / 100).toFixed(2)}
                            style={campo} />
                        </label>
                        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          Referencia del banco (opcional)
                          <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                            placeholder="Número de la transacción" style={campo} />
                        </label>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setOtroMonto(true)}
                        style={{
                          border: 'none', background: 'transparent', color: AZUL, cursor: 'pointer',
                          fontSize: 13, padding: 0, marginBottom: 14, display: 'block',
                        }}>
                        ¿Transferiste un monto distinto a {dinero(totalCentavos)}?
                      </button>
                    )}

                    {error && (
                      <p style={{
                        fontSize: 13, color: '#991b1b', background: '#fef2f2',
                        border: '1px solid #fecaca', borderRadius: 6, padding: '9px 12px',
                        margin: '0 0 12px',
                      }}>{error}</p>
                    )}
                    {listo && !error && (
                      <p style={{
                        fontSize: 13, color: '#065f46', background: '#ecfdf5',
                        border: '1px solid #a7f3d0', borderRadius: 6, padding: '9px 12px',
                        margin: '0 0 12px',
                      }}>
                        Comprobante enviado. El colegio lo revisará y te confirmará.
                      </p>
                    )}

                    <button type="button" onClick={subir} disabled={subiendo || !archivo}
                      style={{
                        background: subiendo || !archivo ? '#93a3c9' : AZUL, color: '#fff',
                        border: 'none', borderRadius: 6, padding: '11px 22px',
                        fontSize: 14, fontWeight: 600,
                        cursor: subiendo || !archivo ? 'default' : 'pointer',
                      }}>
                      {subiendo ? 'Enviando…' : 'Enviar comprobante'}
                    </button>
                  </section>
                </>
              ) : (
                <section style={{
                  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
                  padding: '14px 16px', marginBottom: 18, fontSize: 13, color: '#92400e',
                  lineHeight: 1.6,
                }}>
                  El colegio todavía no publicó su cuenta bancaria. Llámalos para coordinar
                  el pago{vista.colegio.telefonoAyuda ? ` al ${vista.colegio.telefonoAyuda}` : ''}.
                </section>
              )
            )}
          </>
        )}

        {/* Ayuda */}
        {(vista.colegio.telefonoAyuda || vista.colegio.horarioAyuda) && (
          <section style={{
            background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6,
            padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 20 }}>?</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>¿Necesitas ayuda?</p>
              <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>
                {vista.colegio.telefonoAyuda && (
                  <>Llámanos al <a href={`tel:${vista.colegio.telefonoAyuda.replace(/[^\d+]/g, '')}`}
                    style={{ color: AZUL, fontWeight: 600 }}>{vista.colegio.telefonoAyuda}</a></>
                )}
                {vista.colegio.telefonoAyuda && vista.colegio.horarioAyuda && ' · '}
                {vista.colegio.horarioAyuda}
              </p>
            </div>
          </section>
        )}

        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 26 }}>
          🔒 Página segura y protegida
        </p>
      </main>
    </div>
  );
}

const celda: React.CSSProperties = {
  fontSize: 14, padding: '13px 16px', borderBottom: `1px solid ${BORDE}`,
};

const campo: React.CSSProperties = {
  border: `1px solid ${BORDE}`, borderRadius: 6, padding: '9px 11px', fontSize: 14,
  minWidth: 170,
};

function opcion(activo: boolean, deshabilitado: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    background: '#fff', textAlign: 'left',
    border: `1px solid ${activo ? AZUL : BORDE}`,
    boxShadow: activo ? `inset 0 0 0 1px ${AZUL}` : 'none',
    borderRadius: 6, padding: '14px 16px', fontSize: 14, fontWeight: 600,
    color: deshabilitado ? '#9ca3af' : activo ? AZUL : '#111827',
    cursor: deshabilitado ? 'default' : 'pointer',
  };
}
