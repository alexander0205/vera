'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DownloadCloud, GraduationCap } from 'lucide-react';

/**
 * «Tienes X alumnos de SIGERD sin matricular. ¿Matricularlos a todos?»
 *
 * Sale en Matriculación y en Configuración › SIGERD, y solo cuando hay alguien
 * que matricular: con cero no dice nada. El botón lleva a la pantalla
 * «Matricular desde SIGERD», donde se revisa alumno por alumno antes de crear
 * nada (`/escolar/matriculas/desde-sigerd`).
 */

interface Pendientes {
  disponible: boolean;
  periodo: { id: number; nombre: string } | null;
  grupos: unknown[];
  porMatricular: number;
}

export function MatricularSigerdAviso() {
  const [datos, setDatos] = useState<Pendientes | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch('/api/administracion-escolar/matriculas/desde-sigerd')
      // Sin permiso o sin SIGERD el aviso simplemente no sale.
      .then(async (res) => (res.ok ? (await res.json()) as Pendientes : null))
      .catch(() => null)
      .then((d) => { if (vigente) setDatos(d); });
    return () => { vigente = false; };
  }, []);

  if (!datos?.disponible || datos.porMatricular === 0) return null;

  const n = datos.porMatricular;
  const nSecciones = datos.grupos.length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zero-200 bg-gradient-to-r from-zero-50 to-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zero-100 text-zero-700">
          <DownloadCloud className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Tienes {n} alumno{n !== 1 ? 's' : ''} de SIGERD sin matricular
            <span className="font-normal text-gray-500"> · {datos.periodo?.nombre}</span>
          </p>
          <p className="text-xs text-gray-600">
            SIGERD ya dice en qué grado y sección está cada uno ({nSecciones} sección{nSecciones !== 1 ? 'es' : ''}).
            Revísalos y matricúlalos de una vez.
          </p>
        </div>
      </div>
      <Button className="shrink-0 bg-zero-600 hover:bg-zero-700" asChild>
        <Link href="/escolar/matriculas/desde-sigerd">
          <GraduationCap className="mr-2 h-4 w-4" />Revisar y matricular
        </Link>
      </Button>
    </div>
  );
}
