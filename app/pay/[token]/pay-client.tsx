'use client';

import { useState } from 'react';
import { fmtMoneda } from '@/lib/factura/core';

interface LineaPago { nombre: string; cantidad: number; totalCentavos: number }

interface Props {
  token: string;
  estadoInicial: string;
  provider: string;
  providerLabel: string;
  montoCentavos: number;
  subtotalCentavos: number;
  itbisCentavos: number;
  businessName: string;
  rncNegocio: string;
  docLabel: string;
  cliente: string;
  rncCliente: string;
  fecha: string | null;
  lineas: LineaPago[];
}

export function PayClient(props: Props) {
  const [estado, setEstado] = useState(props.estadoInicial);
  const [loading, setLoading] = useState(false);
  const [simulador, setSimulador] = useState(false);
  const [error, setError] = useState('');

  const monto = fmtMoneda(props.montoCentavos / 100);
  const yaPagado = estado === 'pagado';
  const noPagable = estado === 'expirado' || estado === 'cancelado';

  async function iniciar() {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/pagos/link/${props.token}/iniciar`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'No se pudo iniciar el pago'); setLoading(false); return; }

      if (data.mode === 'simulador') {
        setSimulador(true); setLoading(false); return;
      }
      if (data.mode === 'redirect') {
        // Auto-submit form POST a la pasarela con TODOS los campos.
        // CardNet → { SESSION } · Azul → todos los campos + AuthHash.
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.action;
        const fields: Record<string, string> = data.fields ?? (data.session ? { SESSION: data.session } : {});
        for (const [name, value] of Object.entries(fields)) {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = name; input.value = String(value);
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }
      setError('Respuesta inesperada'); setLoading(false);
    } catch {
      setError('Error de red'); setLoading(false);
    }
  }

  async function simular(aprobar: boolean) {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/pagos/link/${props.token}/simular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprobar }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Error'); setLoading(false); return; }
      if (data.estado === 'pagado' || data.estado === 'ya_pagado') {
        window.location.href = `/pay/${props.token}/resultado`;
      } else {
        setError('Pago rechazado. Puedes intentar de nuevo.');
        setSimulador(false); setLoading(false);
      }
    } catch {
      setError('Error de red'); setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.badge}>{props.businessName}</div>
        {props.rncNegocio && <div style={styles.rncNeg}>RNC {props.rncNegocio}</div>}
        <div style={styles.label}>{props.docLabel || 'Pago'}</div>
        {props.fecha && (
          <div style={styles.fecha}>
            {new Date(props.fecha).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        )}

        {/* Detalles del cobro */}
        <div style={styles.detBox}>
          {props.cliente && (
            <div style={styles.detRow}>
              <span style={styles.detK}>Cliente</span>
              <span style={styles.detV}>{props.cliente}{props.rncCliente ? ` · ${props.rncCliente}` : ''}</span>
            </div>
          )}
          {props.lineas.length > 0 && (
            <div style={styles.lineas}>
              {props.lineas.map((l, i) => (
                <div key={i} style={styles.linea}>
                  <span style={styles.lineaNom}>{l.cantidad > 1 ? `${l.cantidad}× ` : ''}{l.nombre}</span>
                  <span style={styles.lineaTot}>{fmtMoneda(l.totalCentavos / 100)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={styles.detRow}>
            <span style={styles.detK}>Subtotal</span>
            <span style={styles.detV}>{fmtMoneda(props.subtotalCentavos / 100)}</span>
          </div>
          <div style={styles.detRow}>
            <span style={styles.detK}>ITBIS</span>
            <span style={styles.detV}>{fmtMoneda(props.itbisCentavos / 100)}</span>
          </div>
        </div>

        <div style={styles.montoLabel}>Total a pagar</div>
        <div style={styles.monto}>{monto}</div>

        {yaPagado ? (
          <div style={{ ...styles.status, ...styles.ok }}>✓ Pago recibido</div>
        ) : noPagable ? (
          <div style={{ ...styles.status, ...styles.warn }}>
            {estado === 'expirado' ? 'Este link expiró' : 'Pago cancelado'}
          </div>
        ) : simulador ? (
          <div>
            <div style={styles.simNote}>Gateway de prueba ({props.providerLabel})</div>
            <button style={{ ...styles.btn, ...styles.btnOk }} disabled={loading} onClick={() => simular(true)}>
              {loading ? 'Procesando…' : 'Aprobar pago (simular)'}
            </button>
            <button style={{ ...styles.btn, ...styles.btnGhost }} disabled={loading} onClick={() => simular(false)}>
              Rechazar
            </button>
          </div>
        ) : (
          <button style={{ ...styles.btn, ...styles.btnPay }} disabled={loading} onClick={iniciar}>
            {loading ? 'Procesando…' : `Pagar ${monto}`}
          </button>
        )}

        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.secure}>🔒 Pago seguro vía {props.providerLabel}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap:   { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui, sans-serif' },
  card:   { width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,.08)', padding: 28, textAlign: 'center' },
  badge:  { display: 'inline-block', fontSize: 13, fontWeight: 600, color: '#3658e1', background: '#eef2fe', padding: '4px 12px', borderRadius: 999, marginBottom: 16 },
  rncNeg: { fontSize: 12, color: '#94a3b8', marginTop: -10, marginBottom: 10 },
  label:  { fontSize: 15, fontWeight: 700, color: '#334155' },
  fecha:  { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  cliente:{ fontSize: 13, color: '#64748b', marginTop: 2 },
  detBox: { textAlign: 'left', marginTop: 18, padding: '14px 14px', background: '#f8fafc', borderRadius: 12, border: '1px solid #eef2f7' },
  detRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '3px 0' },
  detK:   { color: '#64748b' },
  detV:   { color: '#0f172a', fontWeight: 600, textAlign: 'right' },
  lineas: { borderBottom: '1px dashed #e2e8f0', paddingBottom: 8, marginBottom: 8 },
  linea:  { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '3px 0' },
  lineaNom: { color: '#334155' },
  lineaTot: { color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' },
  montoLabel: { fontSize: 12, color: '#94a3b8', marginTop: 18, textTransform: 'uppercase', letterSpacing: '.05em' },
  monto:  { fontSize: 40, fontWeight: 800, color: '#0f172a', margin: '4px 0 24px' },
  btn:    { width: '100%', padding: '14px 16px', borderRadius: 12, fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer', marginBottom: 10 },
  btnPay: { background: '#3658e1', color: '#fff' },
  btnOk:  { background: '#16a34a', color: '#fff' },
  btnGhost:{ background: '#f1f5f9', color: '#475569' },
  status: { padding: '14px', borderRadius: 12, fontWeight: 700, fontSize: 16 },
  ok:     { background: '#f0fdf4', color: '#16a34a' },
  warn:   { background: '#fff7ed', color: '#c2410c' },
  simNote:{ fontSize: 12, color: '#94a3b8', marginBottom: 10 },
  error:  { marginTop: 12, color: '#dc2626', fontSize: 14 },
  secure: { marginTop: 18, fontSize: 12, color: '#94a3b8' },
};
