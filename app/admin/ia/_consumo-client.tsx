'use client';

/**
 * /admin/ia, «Gasto de IA»: lo que gastó cada empresa en el mes (tokens y
 * US$) y, al abrir una, cada conversación. Los datos salen de ia_consumo; el
 * costo se guardó con el precio del día de cada llamada.
 */

import { Fragment, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { ChevronDown, ChevronRight, Coins } from 'lucide-react';
import { usd } from '@/lib/ia/consumo';
import type { ConsumoConversacion, ConsumoEmpresa, ConsumoModelo } from '@/lib/ia/consumo-reporte';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;
const TH = { textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', px: 1.25, py: 1, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' } as const;
const TD = { fontSize: '0.8125rem', px: 1.25, py: 1, borderBottom: '1px solid #f3f4f6', fontVariantNumeric: 'tabular-nums' } as const;
const NUM = { ...TD, textAlign: 'right' } as const;

const miles = (n: number) => n.toLocaleString('es-DO');
const mesActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }).slice(0, 7);
const fechaCorta = (iso: string) => {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const nombreModelo = (m: string) => m.replace(/^(anthropic|google)\//, '');

export default function ConsumoIaClient() {
  const [mes, setMes] = useState(mesActual);
  const [empresas, setEmpresas] = useState<ConsumoEmpresa[] | null>(null);
  const [modelos, setModelos] = useState<ConsumoModelo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [chats, setChats] = useState<Record<string, ConsumoConversacion[] | 'cargando' | 'error'>>({});

  useEffect(() => {
    let vigente = true;
    setEmpresas(null);
    setError(null);
    setAbierta(null);
    fetch(`/api/admin/ia/consumo?mes=${mes}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (r.ok) { setEmpresas(j.empresas ?? []); setModelos(j.modelos ?? []); }
        else setError(j.error ?? 'No se pudo cargar el gasto.');
      })
      .catch(() => vigente && setError('No se pudo cargar el gasto.'));
    return () => { vigente = false; };
  }, [mes]);

  const abrir = (teamId: number | null) => {
    if (teamId == null) return;
    if (abierta === teamId) { setAbierta(null); return; }
    setAbierta(teamId);
    const clave = `${mes}:${teamId}`;
    if (chats[clave] && chats[clave] !== 'error') return;
    setChats((c) => ({ ...c, [clave]: 'cargando' }));
    fetch(`/api/admin/ia/consumo?mes=${mes}&teamId=${teamId}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        setChats((c) => ({ ...c, [clave]: r.ok ? (j.conversaciones ?? []) : 'error' }));
      })
      .catch(() => setChats((c) => ({ ...c, [clave]: 'error' })));
  };

  const total = (empresas ?? []).reduce((a, e) => ({
    costo: a.costo + e.costoUsd, tokens: a.tokens + e.tokensEntrada + e.tokensSalida,
    automaticas: a.automaticas + e.respuestasAutomaticas, ia: a.ia + e.respuestasIa, analisis: a.analisis + e.respuestasAnalisis,
  }), { costo: 0, tokens: 0, automaticas: 0, ia: 0, analisis: 0 });

  return (
    <Box sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Coins size={16} /> Gasto de IA
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Cuánto se usa el chat y cuánto cuesta, por empresa y por modelo. Abre una empresa para ver cada conversación.
          </Typography>
        </Box>
        <TextField type="month" size="small" label="Mes" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)}
          sx={{ width: 170, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {!error && !empresas && <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={20} /></Box>}
      {empresas && empresas.length === 0 && (
        <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', py: 1 }}>Nadie usó la IA en este mes.</Typography>
      )}

      {empresas && empresas.length > 0 && (
        <>
          <Box aria-live="polite" sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '0.8125rem' }}><b>{usd(total.costo)}</b> en total</Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>{miles(total.automaticas)} respuestas automáticas (sin costo)</Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>{miles(total.ia)} con IA, {miles(total.analisis)} de análisis</Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563' }}>{miles(total.tokens)} tokens</Typography>
          </Box>
          {modelos.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr>
                    <Box component="th" sx={TH}>Modelo</Box>
                    <Box component="th" sx={TH}>Por</Box>
                    <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Respuestas</Box>
                    <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Tokens</Box>
                    <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Costo</Box>
                    <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Por respuesta</Box>
                  </tr>
                </thead>
                <tbody>
                  {modelos.map((m) => (
                    <tr key={m.modelo}>
                      <Box component="td" sx={{ ...TD, fontWeight: 600 }}>{nombreModelo(m.modelo)}</Box>
                      <Box component="td" sx={{ ...TD, color: '#4b5563' }}>{m.proveedor === 'typesafe' ? 'Jev (decisiones)' : m.proveedor === 'gateway' ? 'AI Gateway' : m.proveedor === 'anthropic' ? 'Anthropic directo' : m.proveedor}</Box>
                      <Box component="td" sx={NUM}>{miles(m.respuestas)}</Box>
                      <Box component="td" sx={NUM}>{miles(m.tokensEntrada + m.tokensSalida)}</Box>
                      <Box component="td" sx={{ ...NUM, fontWeight: 600 }}>{usd(m.costoUsd)}</Box>
                      <Box component="td" sx={NUM}>{m.respuestas ? usd(m.costoUsd / m.respuestas) : '—'}</Box>
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
          )}
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <Box component="th" sx={TH}>Empresa</Box>
                  <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Chats</Box>
                  <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Personas</Box>
                  <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Automáticas</Box>
                  <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Con IA</Box>
                  <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Tokens entrada</Box>
                  <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Tokens salida</Box>
                  <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Costo</Box>
                  <Box component="th" sx={TH}>Modelos</Box>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => {
                  const clave = `${mes}:${e.teamId}`;
                  const lista = chats[clave];
                  const abiertaAqui = e.teamId != null && abierta === e.teamId;
                  return (
                    <Fragment key={clave}>
                      <Box component="tr" sx={{ cursor: e.teamId != null ? 'pointer' : 'default', '&:hover': { bgcolor: '#f9fafb' } }}
                        onClick={() => abrir(e.teamId)}>
                        <Box component="td" sx={TD}>
                          <Box component="button" type="button" disabled={e.teamId == null} aria-expanded={abiertaAqui}
                            onClick={(ev) => { ev.stopPropagation(); abrir(e.teamId); }}
                            sx={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600, cursor: 'inherit', '&:focus-visible': { outline: '2px solid #2563eb', outlineOffset: 2, borderRadius: '4px' } }}>
                            {e.teamId != null && (abiertaAqui ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                            {e.empresa}
                          </Box>
                        </Box>
                        <Box component="td" sx={NUM}>{miles(e.conversaciones)}</Box>
                        <Box component="td" sx={NUM}>{miles(e.usuarios)}</Box>
                        <Box component="td" sx={NUM}>{miles(e.respuestasAutomaticas)}</Box>
                        <Box component="td" sx={NUM}>
                          {miles(e.respuestasIa)}
                          {e.respuestasAnalisis > 0 && <Box component="span" sx={{ display: 'block', fontSize: '0.7rem', color: '#6b7280' }}>{miles(e.respuestasAnalisis)} de análisis</Box>}
                        </Box>
                        <Box component="td" sx={NUM}>{miles(e.tokensEntrada)}</Box>
                        <Box component="td" sx={NUM}>{miles(e.tokensSalida)}</Box>
                        <Box component="td" sx={{ ...NUM, fontWeight: 600 }}>
                          {usd(e.costoUsd)}
                          {e.costoJevUsd > 0 && <Box component="span" sx={{ display: 'block', fontSize: '0.7rem', color: '#6b7280', fontWeight: 400 }}>Jev {usd(e.costoJevUsd)}</Box>}
                        </Box>
                        <Box component="td" sx={{ ...TD, color: '#4b5563', fontSize: '0.75rem' }}>{e.modelos.map(nombreModelo).join(', ')}</Box>
                      </Box>
                      {abiertaAqui && (
                        <tr>
                          <Box component="td" colSpan={9} sx={{ bgcolor: '#f9fafb', px: 2, py: 1.25, borderBottom: '1px solid #e5e7eb' }}>
                            {lista === 'cargando' && <CircularProgress size={16} />}
                            {lista === 'error' && <Typography sx={{ fontSize: '0.8125rem', color: '#b91c1c' }}>No se pudieron cargar las conversaciones.</Typography>}
                            {Array.isArray(lista) && lista.length === 0 && <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>Sin conversaciones.</Typography>}
                            {Array.isArray(lista) && lista.length > 0 && (
                              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    <Box component="th" sx={TH}>Conversación</Box>
                                    <Box component="th" sx={TH}>Usuario</Box>
                                    <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Respuestas</Box>
                                    <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Tokens</Box>
                                    <Box component="th" sx={{ ...TH, textAlign: 'right' }}>Costo</Box>
                                    <Box component="th" sx={TH}>Última</Box>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lista.map((c) => (
                                    <tr key={`${c.conversacionId}-${c.usuario}`}>
                                      <Box component="td" sx={{ ...TD, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.titulo}>{c.titulo}</Box>
                                      <Box component="td" sx={TD}>{c.usuario}</Box>
                                      <Box component="td" sx={NUM}>{miles(c.mensajes)}</Box>
                                      <Box component="td" sx={NUM}>{miles(c.tokensEntrada + c.tokensSalida)}</Box>
                                      <Box component="td" sx={NUM}>{usd(c.costoUsd)}</Box>
                                      <Box component="td" sx={{ ...TD, whiteSpace: 'nowrap', color: '#4b5563' }}>{fechaCorta(c.ultima)}</Box>
                                    </tr>
                                  ))}
                                </tbody>
                              </Box>
                            )}
                          </Box>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
