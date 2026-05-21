'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { createContribuyenteForTeam } from '@/lib/ecf-api/sync';
import {
  certificados,
  ncfRangos,
  ncfRangosExtras,
  dgiiStatus,
  contribuyentes,
  EcfApiError,
} from '@/lib/ecf-api/client';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireAdmin() {
  const u = await getUser();
  if (!u || u.platformRole !== 'admin') redirect('/dashboard');
  return u;
}

async function teamCp(teamId: number): Promise<string> {
  const [t] = await db.select({ cp: teams.ecfCodigoPublico }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!t?.cp) throw new Error('Team sin vínculo a ecf-api');
  return t.cp;
}

function errToMsg(e: unknown): string {
  if (e instanceof EcfApiError) {
    try {
      const j = JSON.parse(e.message);
      return j.message ?? j.error ?? e.message;
    } catch {
      return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

// ─── Vincular / crear contribuyente ──────────────────────────────────────────

export async function vincularContribuyente(formData: FormData) {
  await requireAdmin();
  const teamId = parseInt(formData.get('teamId') as string);
  if (isNaN(teamId)) return;

  try {
    await createContribuyenteForTeam(teamId);
    revalidatePath(`/admin/empresas/${teamId}`);
    redirect(`/admin/empresas/${teamId}?ok=vinculado_ecf`);
  } catch (e) {
    // Re-throw redirects (Next.js internals)
    if (e && typeof e === 'object' && 'digest' in e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    const msg = errToMsg(e);
    redirect(`/admin/empresas/${teamId}?error=ecf_${encodeURIComponent(msg)}`);
  }
}

export async function actualizarContribuyente(formData: FormData) {
  await requireAdmin();
  const teamId = parseInt(formData.get('teamId') as string);
  const ambiente = formData.get('ambiente') as 'TesteCF' | 'CerteCF' | 'Produccion';
  if (isNaN(teamId)) return;

  const cp = await teamCp(teamId);

  try {
    // ecf-api es la única fuente de verdad del ambiente.
    await contribuyentes.update(cp, { ambiente });
    revalidatePath(`/admin/empresas/${teamId}`);
    redirect(`/admin/empresas/${teamId}?ok=ambiente_actualizado`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    redirect(`/admin/empresas/${teamId}?error=ecf_${encodeURIComponent(errToMsg(e))}`);
  }
}

// ─── Certificado P12 ──────────────────────────────────────────────────────────

export async function subirCertificado(formData: FormData) {
  await requireAdmin();
  const teamId = parseInt(formData.get('teamId') as string);
  const password = formData.get('password') as string;
  const file = formData.get('file') as File;

  if (isNaN(teamId) || !password || !file) return;

  const cp = await teamCp(teamId);
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    await certificados.upload(cp, buf, password);
    revalidatePath(`/admin/empresas/${teamId}`);
    redirect(`/admin/empresas/${teamId}?ok=cert_subido`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    redirect(`/admin/empresas/${teamId}?error=cert_${encodeURIComponent(errToMsg(e))}`);
  }
}

export async function revocarCertificado(formData: FormData) {
  await requireAdmin();
  const teamId = parseInt(formData.get('teamId') as string);
  const certId = formData.get('certId') as string;
  if (isNaN(teamId) || !certId) return;

  try {
    await certificados.revoke(certId);
    revalidatePath(`/admin/empresas/${teamId}`);
    redirect(`/admin/empresas/${teamId}?ok=cert_revocado`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    redirect(`/admin/empresas/${teamId}?error=cert_${encodeURIComponent(errToMsg(e))}`);
  }
}

// ─── Rangos NCF ───────────────────────────────────────────────────────────────

export async function registrarRango(formData: FormData) {
  await requireAdmin();
  const teamId = parseInt(formData.get('teamId') as string);
  const tipoComprobante = (formData.get('tipoComprobante') as string).trim();
  const desde = parseInt(formData.get('desde') as string);
  const hasta = parseInt(formData.get('hasta') as string);
  const fechaVencimiento = (formData.get('fechaVencimiento') as string).trim();

  if (isNaN(teamId) || !tipoComprobante || isNaN(desde) || isNaN(hasta) || !fechaVencimiento) return;

  const cp = await teamCp(teamId);

  try {
    await ncfRangos.create(cp, { tipoComprobante, desde, hasta, fechaVencimiento });
    revalidatePath(`/admin/empresas/${teamId}`);
    redirect(`/admin/empresas/${teamId}?ok=rango_registrado`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    redirect(`/admin/empresas/${teamId}?error=rango_${encodeURIComponent(errToMsg(e))}`);
  }
}

export async function eliminarRango(formData: FormData) {
  await requireAdmin();
  const teamId = parseInt(formData.get('teamId') as string);
  const rangoId = formData.get('rangoId') as string;
  if (isNaN(teamId) || !rangoId) return;

  const cp = await teamCp(teamId);

  try {
    await ncfRangosExtras.delete(cp, rangoId);
    revalidatePath(`/admin/empresas/${teamId}`);
    redirect(`/admin/empresas/${teamId}?ok=rango_eliminado`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    redirect(`/admin/empresas/${teamId}?error=rango_${encodeURIComponent(errToMsg(e))}`);
  }
}

// ─── DGII Token refresh ──────────────────────────────────────────────────────

export async function refrescarTokenDgii(formData: FormData) {
  await requireAdmin();
  const teamId = parseInt(formData.get('teamId') as string);
  if (isNaN(teamId)) return;

  const cp = await teamCp(teamId);

  try {
    await dgiiStatus.refreshToken(cp);
    revalidatePath(`/admin/empresas/${teamId}`);
    redirect(`/admin/empresas/${teamId}?ok=token_refrescado`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && typeof e.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
    redirect(`/admin/empresas/${teamId}?error=token_${encodeURIComponent(errToMsg(e))}`);
  }
}
