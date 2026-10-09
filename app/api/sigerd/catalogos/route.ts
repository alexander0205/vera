import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  aniosAcademicos,
  centrosPorDistritos,
  seccionesPorServicio,
  serviciosPorCentro,
  tiposPeriodosPorServicio,
} from '@/lib/sigerd/consultas';
import { conSesionSigerd, faltaParametro, numero } from '@/lib/sigerd/ruta';

export const dynamic = 'force-dynamic';

const TIPOS = ['servicios', 'grados', 'secciones', 'anios', 'centros'] as const;
type Tipo = (typeof TIPOS)[number];

/**
 * Catálogos de SIGERD, todos por el mismo endpoint para no multiplicar rutas
 * que hacen lo mismo.
 *
 * `GET /api/sigerd/catalogos?tipo=servicios&idCentro=`
 * `GET /api/sigerd/catalogos?tipo=grados&idServicioCentro=`
 * `GET /api/sigerd/catalogos?tipo=secciones&idServicioCentro=&idTipoPeriodo=`
 * `GET /api/sigerd/catalogos?tipo=anios&idServicioCentro=`
 * `GET /api/sigerd/catalogos?tipo=centros&distritos=1,2,3`
 *
 * El orden natural de uso es: centro → servicios → grados → secciones, porque
 * cada nivel necesita el id del anterior.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const tipo = sp.get('tipo') as Tipo | null;

  if (!tipo || !TIPOS.includes(tipo)) {
    return NextResponse.json(
      { error: `Parámetro "tipo" inválido. Valores: ${TIPOS.join(', ')}.`, codigo: 'parametro-invalido' },
      { status: 400 },
    );
  }

  const idAnoAcademico = numero(sp, 'idAnoAcademico') ?? undefined;

  switch (tipo) {
    case 'servicios': {
      const idCentro = numero(sp, 'idCentro');
      if (idCentro === null) return faltaParametro('idCentro');
      return conSesionSigerd((cli) => serviciosPorCentro(cli, { idCentro, idAnoAcademico }));
    }

    case 'grados': {
      const idServicioCentro = numero(sp, 'idServicioCentro');
      if (idServicioCentro === null) return faltaParametro('idServicioCentro');
      return conSesionSigerd((cli) => tiposPeriodosPorServicio(cli, { idServicioCentro, idAnoAcademico }));
    }

    case 'secciones': {
      const idServicioCentro = numero(sp, 'idServicioCentro');
      const idTipoPeriodo = numero(sp, 'idTipoPeriodo');
      if (idServicioCentro === null) return faltaParametro('idServicioCentro');
      if (idTipoPeriodo === null) return faltaParametro('idTipoPeriodo');
      return conSesionSigerd((cli) =>
        seccionesPorServicio(cli, { idServicioCentro, idTipoPeriodo, idAnoAcademico }),
      );
    }

    case 'anios': {
      const idServicioCentro = numero(sp, 'idServicioCentro');
      if (idServicioCentro === null) return faltaParametro('idServicioCentro');
      return conSesionSigerd((cli) => aniosAcademicos(cli, idServicioCentro));
    }

    case 'centros': {
      const crudo = (sp.get('distritos') ?? '').split(',').map((d) => d.trim()).filter(Boolean);
      if (!crudo.length) return faltaParametro('distritos');

      // Los distritos van dentro de la ruta del portal: solo dígitos.
      if (crudo.some((d) => !/^\d+$/.test(d))) {
        return NextResponse.json(
          { error: 'Los distritos deben ser numéricos, separados por coma.', codigo: 'parametro-invalido' },
          { status: 400 },
        );
      }

      const incluirCerrados = sp.get('incluirCerrados');
      return conSesionSigerd((cli) =>
        centrosPorDistritos(cli, {
          distritos: crudo,
          incluirCerrados: incluirCerrados === null ? undefined : incluirCerrados === 'true',
        }),
      );
    }
  }
}
