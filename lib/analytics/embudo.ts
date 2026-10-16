/**
 * El embudo de registro, de la base: quién creó una empresa, de dónde vino y
 * hasta dónde llegó.
 *
 * Google Analytics cuenta visitas y clics, pero no sabe quién terminó dentro
 * ni si volvió. Esto sí: cada empresa fundada por registro propio (no las
 * invitadas ni las creadas desde el admin), con su canal de llegada
 * (`REGISTRO_ORIGEN`, ver `lib/analytics/origen-servidor.ts`) y cada paso que
 * dio después. Es lo que lee `/admin/embudo`.
 *
 * Las cuentas se calculan aquí, en funciones puras, para poder probarlas sin
 * base.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { canalDeOrigen, detalleDeOrigen, leerOrigenGuardado, type Canal, type Origen } from './origen';

export interface RegistroEmbudo {
  teamId: number;
  fecha: string;            // ISO
  empresa: string;
  rnc: string | null;
  email: string;
  interno: boolean;         // el dueño es admin de la plataforma: una prueba nuestra
  metodo: 'correo' | 'google';
  verificado: boolean;
  paso: number;             // `onboarding_paso`: 1 sin datos, 3 con RNC, 4 con tamaño
  completado: boolean;      // terminó el alta (prueba abierta)
  estado: string | null;    // estado de la suscripción
  plan: string | null;
  clientes: number;
  documentos: number;
  entradas: number;
  /** Volvió otro día después del registro: entró, o creó un cliente o un documento. */
  volvio: boolean;
  ultimaEntrada: string | null;
  canal: Canal | 'Sin dato';
  detalle: string;
  entrada: string | null;   // página por la que llegó
}

export const PASOS_EMBUDO = [
  { clave: 'registro', titulo: 'Creó la cuenta' },
  { clave: 'verificado', titulo: 'Verificó el correo' },
  { clave: 'empresa', titulo: 'Puso su RNC' },
  { clave: 'tamano', titulo: 'Eligió tamaño' },
  { clave: 'alta', titulo: 'Terminó el alta (prueba)' },
  { clave: 'uso', titulo: 'Creó un cliente o factura' },
  { clave: 'volvio', titulo: 'Volvió otro día' },
  { clave: 'pagando', titulo: 'Pagando' },
] as const;

export type ClavePaso = (typeof PASOS_EMBUDO)[number]['clave'];

/** Hasta qué paso llegó una empresa (cada paso incluye a los anteriores). */
export function pasosAlcanzados(r: RegistroEmbudo): Record<ClavePaso, boolean> {
  const alta = r.completado;
  return {
    registro: true,
    verificado: r.verificado,
    empresa: alta || r.paso >= 3,
    tamano: alta || r.paso >= 4,
    alta,
    uso: r.clientes > 0 || r.documentos > 0,
    volvio: r.volvio,
    pagando: r.estado === 'active',
  };
}

export function contarEmbudo(filas: RegistroEmbudo[]): { clave: ClavePaso; titulo: string; n: number }[] {
  return PASOS_EMBUDO.map((p) => ({
    clave: p.clave,
    titulo: p.titulo,
    n: filas.filter((r) => pasosAlcanzados(r)[p.clave]).length,
  }));
}

export function porCanal(filas: RegistroEmbudo[]) {
  const m = new Map<string, { canal: string; registros: number; alta: number; uso: number; pagando: number }>();
  for (const r of filas) {
    const k = r.canal;
    const fila = m.get(k) ?? { canal: k, registros: 0, alta: 0, uso: 0, pagando: 0 };
    const p = pasosAlcanzados(r);
    fila.registros++;
    if (p.alta) fila.alta++;
    if (p.uso) fila.uso++;
    if (p.pagando) fila.pagando++;
    m.set(k, fila);
  }
  return [...m.values()].sort((a, b) => b.registros - a.registros);
}

type Crudo = {
  teamId: number; fecha: string; empresa: string; rnc: string | null; email: string; rol: string;
  verificado: boolean; google: boolean; paso: number; completado: string | null; estado: string | null;
  plan: string | null; clientes: number; documentos: number; entradas: number; volvio: boolean; ultimaEntrada: string | null;
  canal: string | null; origen: string | null;
};

/** Empresas fundadas por registro propio en los últimos `dias`. */
export async function registrosDelEmbudo(dias: number): Promise<RegistroEmbudo[]> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const filas = await db.execute<Crudo>(sql`
    with altas as (
      select a.team_id, a.user_id, min(a.timestamp) as fecha
      from activity_logs a
      where a.action = 'SIGN_UP' and a.timestamp >= ${desde}
        -- Fundó la empresa (las invitadas registran SIGN_UP sin CREATE_TEAM).
        and exists (select 1 from activity_logs c
                    where c.team_id = a.team_id and c.user_id = a.user_id and c.action = 'CREATE_TEAM')
      group by a.team_id, a.user_id
    )
    select al.team_id as "teamId", al.fecha::text as fecha, t.name as empresa, t.rnc, u.email,
           u.platform_role as rol, u.email_verified as verificado, (u.google_id is not null) as google,
           t.onboarding_paso as paso, t.onboarding_completado_en::text as completado,
           t.subscription_status as estado, t.plan_name as plan,
           (select count(*)::int from clients c where c.team_id = t.id) as clientes,
           (select count(*)::int from ecf_documents d where d.team_id = t.id) as documentos,
           (select count(*)::int from activity_logs x where x.team_id = t.id and x.action = 'SIGN_IN') as entradas,
           -- Volver es otro DÍA: la sesión de Google o la de después de verificar
           -- el correo caen el mismo día del registro y no dicen nada. La sesión
           -- dura días sin pedir clave, así que también cuenta haber creado algo.
           (exists (select 1 from activity_logs x where x.team_id = t.id and x.action = 'SIGN_IN'
                      and x.timestamp::date > al.fecha::date)
            or exists (select 1 from clients c where c.team_id = t.id and c.created_at::date > al.fecha::date)
            or exists (select 1 from ecf_documents d where d.team_id = t.id and d.created_at::date > al.fecha::date)) as volvio,
           (select max(x.timestamp)::text from activity_logs x where x.team_id = t.id and x.action = 'SIGN_IN') as "ultimaEntrada",
           o.resource as canal, o.metadata as origen
    from altas al
    join teams t on t.id = al.team_id
    join users u on u.id = al.user_id
    left join lateral (
      select l.resource, l.metadata from audit_logs l
      where l.team_id = al.team_id and l.action = 'REGISTRO_ORIGEN'
      order by l.id desc limit 1
    ) o on true
    order by al.fecha desc
  `);

  return (filas as unknown as Crudo[]).map((f) => {
    const origen = leerOrigenGuardado(f.origen);
    return {
      teamId: f.teamId,
      fecha: f.fecha,
      empresa: f.empresa,
      rnc: f.rnc,
      email: f.email,
      interno: f.rol === 'admin',
      metodo: f.google ? 'google' : 'correo',
      verificado: !!f.verificado,
      paso: Number(f.paso ?? 1),
      completado: !!f.completado,
      estado: f.estado,
      plan: f.plan,
      clientes: Number(f.clientes),
      documentos: Number(f.documentos),
      entradas: Number(f.entradas),
      volvio: !!f.volvio,
      ultimaEntrada: f.ultimaEntrada,
      // Sin fila de origen = se registró antes de que esto existiera.
      canal: f.canal == null ? 'Sin dato' : (origen ? canalDeOrigen(origen) : (f.canal as Canal)),
      detalle: origen ? detalleDeOrigen(origen) : '—',
      entrada: origen?.l ?? null,
    } satisfies RegistroEmbudo;
  });
}

export type { Origen };
