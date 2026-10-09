'use client';

import type { IceServerConfig } from './conexion';

export interface LlamadaDTO {
  id: number;
  ticketId: number;
  status: 'pendiente' | 'activa' | 'terminada' | 'rechazada';
  requestedBy: number;
  // Solo viene poblado desde el poll (obtenerLlamadaVigente); iniciarLlamada/responderLlamada devuelven la fila cruda sin join, así que acá llega undefined.
  requestedByName?: string | null;
  createdAt: string;
  answeredAt: string | null;
}

export interface SignalDTO {
  id: number;
  fromRole: 'user' | 'agent';
  kind: 'offer' | 'answer';
  payload: RTCSessionDescriptionInit;
  createdAt: string;
}

export async function iniciarLlamada(ticketId: number): Promise<LlamadaDTO> {
  const res = await fetch('/api/zero-tickets/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'No se pudo iniciar la llamada');
  }
  return (await res.json()).call;
}

export async function responderLlamada(callId: number, accept: boolean): Promise<LlamadaDTO> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'No se pudo responder la llamada');
  }
  return (await res.json()).call;
}

/**
 * `role` es de qué lado de la llamada está quien manda/lee, y NO es opcional:
 * el servidor no puede deducirlo solo de la identidad porque una misma
 * persona puede ser dueña del ticket y agente a la vez (ver
 * requireCallParticipant). Si las dos puntas terminan con el mismo rol,
 * cada una descarta las señales de la otra y el handshake nunca cierra.
 */
export async function mandarSenal(
  callId: number,
  kind: 'offer' | 'answer',
  sdp: RTCSessionDescriptionInit,
  role: 'user' | 'agent',
): Promise<void> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, sdp, role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'No se pudo mandar la señal');
  }
}

export async function leerSenales(callId: number, desde: number, role: 'user' | 'agent'): Promise<SignalDTO[]> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/signal?desde=${desde}&role=${role}`);
  if (!res.ok) return [];
  return (await res.json()).signals;
}

export async function terminarLlamada(callId: number, reason: string): Promise<void> {
  await fetch(`/api/zero-tickets/calls/${callId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).catch(() => {});
}

export async function obtenerIceServers(): Promise<IceServerConfig[]> {
  const res = await fetch('/api/zero-tickets/calls/ice-servers');
  if (!res.ok) return [{ urls: 'stun:stun.l.google.com:19302' }];
  return (await res.json()).iceServers;
}
