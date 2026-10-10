'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { ArrowUpCircle, Sparkles, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { moduloDeRuta } from '@/lib/config/modules';
import { hoyRD } from '@/lib/utils/format';
import { novedadesSinVer, vistasEnCookies, type Novedad, type TipoCambio } from '@/lib/novedades';

/**
 * La ventana de novedades que sale al entrar.
 *
 * Cada vez que se suben cambios, a quien entre al sistema le sale UNA vez una
 * ventana grande con lo nuevo. La cierra —con el botón, con la X, pulsando
 * fuera o con Escape— y no vuelve a salir hasta que haya algo más que contar.
 *
 * Va montada en el layout raíz, que envuelve también la web pública, los
 * enlaces de pago de los padres y las pantallas de imprimir. Por eso se
 * decide en dos pasos:
 *  1. la RUTA: solo dentro de un módulo del sistema. Fuera no se monta ni lo
 *     que lee quién es el usuario, para no suspender una página pública;
 *  2. la PERSONA: tiene que haber sesión, y algo que no haya cerrado ya.
 *
 * Qué se enseña y qué se recuerda está en `lib/novedades.ts`.
 */

const ESTILO: Record<TipoCambio, { label: string; clase: string; Icono: typeof Sparkles }> = {
  nuevo:   { label: 'Nuevo',   clase: 'bg-zero-50 text-zero-700 ring-zero-200',    Icono: Sparkles },
  mejora:  { label: 'Mejora',  clase: 'bg-blue-50 text-blue-700 ring-blue-200',    Icono: ArrowUpCircle },
  arreglo: { label: 'Arreglo', clase: 'bg-amber-50 text-amber-700 ring-amber-200', Icono: Wrench },
};

const leer = (ruta: string) => fetch(ruta).then((r) => (r.ok ? r.json() : null));

export function NovedadesAlEntrar({ novedades }: { novedades: Novedad[] }) {
  const pathname = usePathname();
  // Sin nada fechado que contar, o fuera de un módulo, no hay ventana posible.
  if (novedades.length === 0 || !pathname || moduloDeRuta(pathname) == null) return null;
  return (
    <Suspense fallback={null}>
      <Ventana novedades={novedades} />
    </Suspense>
  );
}

function Ventana({ novedades }: { novedades: Novedad[] }) {
  // La misma clave que usa la cabecera de cada módulo: no es otra petición.
  const { data: usuario } = useSWR<{ id: number } | null>('/api/user', leer, { revalidateOnFocus: false });
  const usuarioId = usuario?.id ?? null;

  // Se calcula ya en el navegador: depende de sus cookies y de su fecha, y el
  // servidor no las ve igual.
  const [porEnsenar, setPorEnsenar] = useState<Novedad[]>([]);
  const [cerrada, setCerrada] = useState(false);

  useEffect(() => {
    if (usuarioId == null) return;
    setPorEnsenar(novedadesSinVer(novedades, vistasEnCookies(document.cookie, usuarioId), hoyRD()));
  }, [usuarioId, novedades]);

  function cerrar() {
    if (cerrada) return;
    setCerrada(true);
    // Se marca lo que se enseñó, no «todo»: lo que llegue después sale solo.
    // `keepalive` para que llegue aunque la persona navegue al cerrarla.
    void fetch('/api/novedades/vistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claves: porEnsenar.map((n) => n.clave) }),
      keepalive: true,
    }).catch(() => { /* si no se pudo marcar, volverá a salir la próxima vez */ });
  }

  const abierta = porEnsenar.length > 0 && !cerrada;
  if (!abierta) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) cerrar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-zero-600" aria-hidden />Novedades en Zero
            </span>
          </DialogTitle>
          <DialogDescription>
            {porEnsenar.length === 1
              ? 'Esto es lo que mejoramos desde la última vez que entraste.'
              : `Estas son las ${porEnsenar.length} cosas que mejoramos desde la última vez que entraste.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {porEnsenar.map((n) => {
            const { label, clase, Icono } = ESTILO[n.tipo] ?? ESTILO.mejora;
            return (
              <div key={n.clave} className="flex flex-col items-start gap-1.5 sm:flex-row sm:gap-3">
                {/* En el teléfono la etiqueta va encima del texto: al lado le
                    comía media ventana y cada entrada ocupaba una pantalla. */}
                <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 sm:mt-0.5 ${clase}`}>
                  <Icono className="h-3 w-3" aria-hidden />{label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{n.titulo}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{n.detalle}</p>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/dashboard/novedades" onClick={cerrar}>Ver todas las novedades</Link>
          </Button>
          <Button onClick={cerrar} className="w-full sm:w-auto">Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
