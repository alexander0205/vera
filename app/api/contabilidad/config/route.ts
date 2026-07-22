/**
 * GET   /api/contabilidad/config  — configuración completa + qué falta
 * PATCH /api/contabilidad/config  — guardar cuentas generales, un método, un
 *                                   override de ingreso, o encender/apagar
 *
 * El PATCH despacha por `seccion` para no multiplicar rutas por algo que
 * siempre es "guardar un pedazo de la misma configuración".
 *
 * Permisos: `contabilidad:ver` para leer, `contabilidad:configurar` para
 * escribir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import {
  getConfig, getMetodosConfigurados, getOverridesIngreso,
  guardarConfig, guardarMetodo, borrarMetodo,
  guardarOverrideIngreso, borrarOverrideIngreso,
  ConfigError, type ClaveMetodo,
} from '@/lib/contabilidad/config';
import {
  getEstadoConfiguracion, setContabilidadActiva, ConfigIncompletaError,
} from '@/lib/contabilidad/validacion';

async function autorizar(permiso: 'contabilidad:ver' | 'contabilidad:configurar') {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };

  const teamId = await getTeamIdForUser();
  if (!teamId) return { error: NextResponse.json({ error: 'Sin equipo' }, { status: 403 }) };

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, permiso)) {
    return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  return { user, teamId };
}

export async function GET() {
  const auth = await autorizar('contabilidad:ver');
  if ('error' in auth) return auth.error;
  const { teamId } = auth;

  const [config, metodos, overrides, estado] = await Promise.all([
    getConfig(teamId),
    getMetodosConfigurados(teamId),
    getOverridesIngreso(teamId),
    getEstadoConfiguracion(teamId),
  ]);

  return NextResponse.json({ config, metodos, overrides, estado });
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizar('contabilidad:configurar');
  if ('error' in auth) return auth.error;
  const { user, teamId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  try {
    switch (b.seccion) {
      case 'general': {
        const config = await guardarConfig(teamId, {
          cuentaPorCobrarId:  numeroONulo(b.cuentaPorCobrarId),
          cuentaItbisId:      numeroONulo(b.cuentaItbisId),
          cuentaIngresosId:   numeroONulo(b.cuentaIngresosId),
          cuentaDescuentosId: numeroONulo(b.cuentaDescuentosId),
          cuentaMoraId:       numeroONulo(b.cuentaMoraId),
          // Los dos del Paso 5. Faltaban aquí: la UI los enviaba pero esta ruta
          // los descartaba, y como `guardarConfig` trata `undefined` como "no
          // tocar" (su contrato), respondía 200 sin guardar nada — el peor tipo
          // de fallo, el silencioso. La librería y la UI ya los soportaban.
          cuentaSaldosFavorId: numeroONulo(b.cuentaSaldosFavorId),
          cuentaRetencionesId: numeroONulo(b.cuentaRetencionesId),
        }, user.id);
        return NextResponse.json({ config });
      }

      case 'metodo': {
        if (typeof b.clave !== 'string') {
          return NextResponse.json({ error: 'Falta el método.' }, { status: 400 });
        }
        // cuentaId nulo = quitar el mapeo.
        if (b.cuentaId === null) {
          await borrarMetodo(teamId, b.clave);
          return NextResponse.json({ ok: true });
        }
        if (typeof b.cuentaId !== 'number') {
          return NextResponse.json({ error: 'Falta la cuenta.' }, { status: 400 });
        }
        await guardarMetodo(
          teamId, b.clave as ClaveMetodo, b.cuentaId,
          typeof b.cuentaComisionId === 'number' ? b.cuentaComisionId : null,
          user.id,
        );
        return NextResponse.json({ ok: true });
      }

      case 'ingreso': {
        if (typeof b.id === 'number' && b.cuentaId === null) {
          await borrarOverrideIngreso(teamId, b.id);
          return NextResponse.json({ ok: true });
        }
        if (typeof b.cuentaId !== 'number') {
          return NextResponse.json({ error: 'Falta la cuenta.' }, { status: 400 });
        }
        await guardarOverrideIngreso(teamId, {
          categoriaId: numeroONulo(b.categoriaId),
          productoId:  numeroONulo(b.productoId),
        }, b.cuentaId, user.id);
        return NextResponse.json({ ok: true });
      }

      case 'activar': {
        if (typeof b.activa !== 'boolean') {
          return NextResponse.json({ error: 'Falta el valor.' }, { status: 400 });
        }
        await setContabilidadActiva(teamId, b.activa, user.id);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json(
          { error: 'Sección desconocida. Debe ser: general, metodo, ingreso o activar.' },
          { status: 400 },
        );
    }
  } catch (e) {
    if (e instanceof ConfigIncompletaError) {
      return NextResponse.json({ error: e.message, huecos: e.huecos }, { status: 409 });
    }
    if (e instanceof ConfigError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** `undefined` = no tocar el campo; `null` = borrarlo. Distinción que importa. */
function numeroONulo(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  return undefined;
}
