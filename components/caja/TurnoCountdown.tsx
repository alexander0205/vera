'use client';

/**
 * Contador regresivo del turno de caja. Se monta en el header del dashboard y
 * del POS.
 *
 * Decisiones de diseño:
 *  - Solo se pinta dentro de la ventana de aviso (default: última hora). Un
 *    badge visible las 8 horas se vuelve parte del decorado y nadie lo mira.
 *  - Avisa UNA vez por hito (60/30/15/vencido). Un toast cada minuto entrena al
 *    cajero a cerrarlo sin leerlo.
 *  - Los hitos ya avisados se recuerdan en localStorage por turnoId: recargar la
 *    página no debe repetir el aviso de los 60 min. Misma convención que el POS,
 *    que ya guarda estado por turnoId.
 *  - Los minutos abiertos los da el servidor (Postgres); acá solo se les suma el
 *    tiempo transcurrido desde el fetch. Restar `apertura_at` en el cliente daría
 *    un número movido por la TZ — ver lib/caja/core.ts:getMinutosAbierto. Un
 *    delta local (Date.now() - fetchedAt) sí es seguro: no depende de la TZ.
 *  - Al servidor se le pregunta cada pocos minutos, por si el turno se cerró en
 *    otra pestaña.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Clock, Lock } from 'lucide-react';
import { calcularEstadoLimite, hitosCruzados, mensajeHito } from '@/lib/caja/limite';

interface TurnoActivo {
  id: number;
  estado: string;
  /** Minutos abiertos según Postgres al momento del fetch. Ver nota de TZ abajo. */
  minutosAbierto: number;
}

interface Respuesta {
  turno: TurnoActivo | null;
  limiteHoras: number | null;
  avisoMinutos: number;
  graciaHoras: number | null;
}

const POLL_MS = 2 * 60_000;  // refetch del turno (cierre en otra pestaña)
const TICK_MS = 30_000;      // recálculo local del contador

function storageKey(turnoId: number) {
  return `caja-avisos-turno-${turnoId}`;
}

function hitosYaAvisados(turnoId: number): Set<number> {
  try {
    const raw = localStorage.getItem(storageKey(turnoId));
    return new Set<number>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function marcarAvisado(turnoId: number, hitos: Set<number>) {
  try {
    localStorage.setItem(storageKey(turnoId), JSON.stringify([...hitos]));
  } catch {
    /* localStorage lleno o bloqueado — el aviso se repetirá, no es crítico */
  }
}

export function TurnoCountdown({ className }: { className?: string }) {
  const [data, setData] = useState<Respuesta | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [, forceTick] = useState(0);
  const avisadosRef = useRef<Set<number> | null>(null);

  // Traer turno + config, y refrescar cada POLL_MS.
  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      fetch('/api/caja/turno-activo')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (vivo && d) { setData(d); setFetchedAt(Date.now()); } })
        .catch(() => { /* offline: el contador se congela, no rompe la página */ });
    cargar();
    const t = setInterval(cargar, POLL_MS);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // Reloj local — solo avanza el contador entre fetches.
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const turno = data?.turno;
  // Delta local desde el fetch: seguro, no depende de la TZ del navegador.
  const minutosAbierto = turno
    ? turno.minutosAbierto + Math.floor((Date.now() - fetchedAt) / 60_000)
    : 0;
  const estado = turno
    ? calcularEstadoLimite(minutosAbierto, data!.limiteHoras, data!.avisoMinutos, data!.graciaHoras)
    : null;

  // Avisos por hito. En efecto aparte: no se dispara un toast al renderizar.
  useEffect(() => {
    if (!turno || !estado || estado.minutosRestantes == null) return;
    if (avisadosRef.current === null) avisadosRef.current = hitosYaAvisados(turno.id);

    const cruzados = hitosCruzados(estado.minutosRestantes, data!.avisoMinutos);
    const nuevos = cruzados.filter(h => !avisadosRef.current!.has(h));
    if (nuevos.length === 0) return;

    // Solo el hito más grave: si se recarga la página vencido, no dispares
    // 60/30/15/10/5/0 de golpe.
    const hito = Math.min(...nuevos);

    // Si YA está bloqueado, el mensaje del hito 0 ("tienes 2h para cerrar")
    // ofrece un plazo que ya se venció. Decir la verdad: ya no puede facturar.
    if (estado.bloqueado) {
      toast.error(
        'Tu turno de caja pasó del límite. No puedes facturar ni cobrar hasta cerrar caja.',
        { duration: 10_000 },
      );
    } else {
      const msg = mensajeHito(hito, data!.graciaHoras);
      if (hito === 0) toast.error(msg, { duration: 10_000 });
      else toast.warning(msg, { duration: 8_000 });
    }

    nuevos.forEach(h => avisadosRef.current!.add(h));
    marcarAvisado(turno.id, avisadosRef.current);
  }, [turno?.id, estado?.minutosRestantes, estado?.bloqueado, data?.avisoMinutos, data?.graciaHoras]);

  if (!turno || !estado?.mostrarContador) return null;

  // Bloqueado y urgente comparten el rojo; 'vencido' ya cuenta hacia el bloqueo.
  const tono = estado.nivel === 'aviso'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-700 border-red-200';

  // El texto cambia de "cuánto te queda para cerrar" a "cuánto te queda ANTES DE
  // QUE TE BLOQUEE": pasado el límite, el plazo que importa es el del bloqueo.
  let texto: string;
  let titulo: string;
  if (estado.nivel === 'bloqueado') {
    texto = 'Cierra caja';
    titulo = `Tu turno lleva ${estado.etiqueta} abierto y pasó del límite. No puedes facturar ni cobrar hasta cerrar caja.`;
  } else if (estado.nivel === 'vencido') {
    texto = estado.minutosHastaBloqueo != null ? `Bloquea en ${estado.etiqueta}` : 'Caja vencida';
    titulo = estado.minutosHastaBloqueo != null
      ? `Tu turno pasó del límite. En ${estado.etiqueta} no podrás seguir facturando hasta cerrar caja.`
      : 'Tu turno de caja pasó del límite. Cierra caja lo antes posible.';
  } else {
    texto = `Cierra en ${estado.etiqueta}`;
    titulo = `Te queda ${estado.etiqueta} para cerrar tu turno de caja.`;
  }

  return (
    <a
      href="/dashboard/caja"
      title={titulo}
      aria-label={titulo}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tono} ${className ?? ''}`}
    >
      {estado.nivel === 'bloqueado'
        ? <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{texto}</span>
    </a>
  );
}
