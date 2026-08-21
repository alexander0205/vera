'use client';

import type { IceServerConfig } from './conexion';

export interface LlamadaDTO {
  id: number;
  ticketId: number;
  status: 'pendiente' | 'activa' | 'terminada' | 'rechazada';
  requestedBy: number;
  // Solo viene poblado desde el poll (obtenerLlamadaVigente); iniciarLlamada/responderLlamada devuelven la fila cruda sin join, así que acá llega undefined.
  requestedByName: string | null;
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
  if (!res.ok) throw new Error('No se pudo responder la llamada');
  return (await res.json()).call;
}

export async function mandarSenal(callId: number, kind: 'offer' | 'answer', sdp: RTCSessionDescriptionInit): Promise<void> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, sdp }),
  });
  if (!res.ok) throw new Error('No se pudo mandar la señal');
}

export async function leerSenales(callId: number, desde: number): Promise<SignalDTO[]> {
  const res = await fetch(`/api/zero-tickets/calls/${callId}/signal?desde=${desde}`);
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
