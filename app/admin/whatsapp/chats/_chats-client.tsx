'use client';

/**
 * Buzón de WhatsApp del número de Zero: lo que sale y lo que entra.
 *
 * Lee del CRM, que es donde viven de verdad los mensajes. No se guarda copia
 * aquí a propósito: dos copias del mismo hilo se separan en cuanto una falla,
 * y entonces ninguna de las dos sirve para responder «¿qué le dijimos a esta
 * señora?».
 */

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { MessageSquare, RefreshCw, AlertTriangle, Clock, ArrowLeft, Check, CheckCheck, XCircle } from 'lucide-react';

/**
 * Los cuatro estados que reporta Meta por webhook.
 *
 * «entregado» y «leído» son distintos y la diferencia importa: un aviso de
 * cobro entregado-y-no-leído durante días dice que ese número está muerto,
 * y eso no se ve si se pintan los dos igual.
 */
const ENTREGA: Record<string, { icono: typeof Check; color: string; texto: string }> = {
  enviado:   { icono: Check,      color: '#9ca3af', texto: 'Enviado' },
  entregado: { icono: CheckCheck, color: '#9ca3af', texto: 'Entregado' },
  leido:     { icono: CheckCheck, color: '#3658e1', texto: 'Leído' },
  fallido:   { icono: XCircle,    color: '#dc2626', texto: 'No se entregó' },
};

function Entrega({ estado }: { estado: string | null }) {
  const e = estado ? ENTREGA[estado] : null;
  if (!e) return null;
  const Icono = e.icono;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: e.color }}>
      <Icono size={11} />
      <Box component="span" sx={{ fontSize: '0.625rem' }}>{e.texto}</Box>
    </Box>
  );
}

interface Conversacion {
  id: string;
  phone: string;
  name: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
  canReply: boolean;
}

interface Mensaje {
  id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  text: string | null;
  deliveryStatus: string | null;
  timestamp: string;
}

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

function cuando(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
}

export default function ChatsClient() {
  const [convs, setConvs]     = useState<Conversacion[]>([]);
  const [sel, setSel]         = useState<Conversacion | null>(null);
  const [msgs, setMsgs]       = useState<Mensaje[]>([]);
  const [cargando, setCarg]   = useState(true);
  const [cargandoMsgs, setCM] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCarg(true); setError(null);
    try {
      const r = await fetch('/api/admin/whatsapp/chats');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudieron leer las conversaciones');
      setConvs(d.conversations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setCarg(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function abrir(c: Conversacion) {
    setSel(c); setMsgs([]); setCM(true);
    try {
      const r = await fetch(`/api/admin/whatsapp/chats?conversationId=${encodeURIComponent(c.id)}`);
      const d = await r.json();
      if (r.ok) setMsgs(d.messages ?? []);
    } finally { setCM(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <MessageSquare size={20} color="#111827" />
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>Conversaciones</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>del número de Zero</Typography>
        <Box component="button" onClick={cargar} disabled={cargando}
          sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75, border: '1px solid #e5e7eb', bgcolor: '#fff', borderRadius: '8px', px: 1.5, py: 0.75, cursor: 'pointer', fontSize: '0.8125rem', color: '#4b5563', '&:hover': { bgcolor: '#f9fafb' } }}>
          <RefreshCw size={13} /> Actualizar
        </Box>
        <Box component="a" href="/admin/whatsapp"
          sx={{ fontSize: '0.8125rem', color: '#3658e1', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
          Estado de la conexión
        </Box>
      </Box>

      {error && (
        <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5, display: 'flex', gap: 1 }}>
          <AlertTriangle size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.8125rem', color: '#991b1b' }}>{error}</Typography>
        </Box>
      )}

      {cargando ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
      ) : convs.length === 0 && !error ? (
        <Box sx={{ ...CARD, p: 5, textAlign: 'center' }}>
          <MessageSquare size={32} color="#d1d5db" />
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#374151', mt: 1.5 }}>
            Todavía no hay ninguna conversación
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 0.5, maxWidth: 460, mx: 'auto', lineHeight: 1.6 }}>
            Aquí aparecerá cada mensaje que salga o entre por el número de Zero. Si esperabas ver
            algo, revisa primero el <Box component="a" href="/admin/whatsapp" sx={{ color: '#3658e1' }}>estado de la conexión</Box>.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 2, alignItems: 'start' }}>
          {/* Lista */}
          <Box sx={{ ...CARD, overflow: 'hidden', display: { xs: sel ? 'none' : 'block', md: 'block' } }}>
            {convs.map((c, i) => (
              <Box key={c.id} component="button" onClick={() => abrir(c)}
                sx={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', px: 2, py: 1.5,
                  bgcolor: sel?.id === c.id ? '#eef2fe' : '#fff', '&:hover': { bgcolor: sel?.id === c.id ? '#eef2fe' : '#f9fafb' },
                }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name || c.phone}
                  </Typography>
                  {c.unread > 0 && (
                    <Box sx={{ bgcolor: '#3658e1', color: '#fff', borderRadius: '999px', fontSize: '0.625rem', fontWeight: 700, px: 0.75, minWidth: 18, textAlign: 'center' }}>
                      {c.unread}
                    </Box>
                  )}
                  <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', flexShrink: 0 }}>{cuando(c.lastMessageAt)}</Typography>
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.lastMessage ?? '—'}
                </Typography>
                {!c.canReply && (
                  // Pasaron 24 h desde el último mensaje del contacto: un texto
                  // libre acá se rechaza con 422 y solo pasa una plantilla.
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <Clock size={10} color="#b45309" />
                    <Typography sx={{ fontSize: '0.625rem', color: '#92400e' }}>Fuera de las 24 h — solo plantilla</Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Box>

          {/* Hilo */}
          <Box sx={{ ...CARD, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
            {!sel ? (
              <Box sx={{ m: 'auto', textAlign: 'center', p: 4 }}>
                <Typography sx={{ fontSize: '0.8125rem', color: '#9ca3af' }}>Elige una conversación</Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ borderBottom: '1px solid #f3f4f6', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box component="button" onClick={() => setSel(null)}
                    sx={{ display: { xs: 'flex', md: 'none' }, border: 'none', bgcolor: 'transparent', cursor: 'pointer', p: 0, color: '#6b7280' }}>
                    <ArrowLeft size={16} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{sel.name || sel.phone}</Typography>
                    <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', fontFamily: 'monospace' }}>{sel.phone}</Typography>
                  </Box>
                </Box>

                <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: '#f9fafb', maxHeight: 520, overflowY: 'auto' }}>
                  {cargandoMsgs ? (
                    <Box sx={{ m: 'auto' }}><CircularProgress size={22} /></Box>
                  ) : msgs.length === 0 ? (
                    <Typography sx={{ m: 'auto', fontSize: '0.8125rem', color: '#9ca3af' }}>Sin mensajes</Typography>
                  ) : msgs.map((m) => {
                    const saliente = m.direction === 'outbound';
                    return (
                      <Box key={m.id} sx={{ alignSelf: saliente ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                        <Box sx={{
                          bgcolor: saliente ? '#dcf8c6' : '#fff', border: '1px solid', borderColor: saliente ? '#c5edaa' : '#e5e7eb',
                          borderRadius: '10px', px: 1.5, py: 1,
                        }}>
                          <Typography sx={{ fontSize: '0.8125rem', color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {m.text ?? `[${m.type}]`}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25, justifyContent: saliente ? 'flex-end' : 'flex-start' }}>
                          <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af' }}>
                            {new Date(m.timestamp).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                          {saliente && <Entrega estado={m.deliveryStatus} />}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
