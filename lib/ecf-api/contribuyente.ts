/**
 * Lógica de registro automático del contribuyente en ECF API.
 *
 * Al entrar a la pantalla de secuencias, si la empresa no tiene codigoPublico
 * se validan los campos requeridos y se registra automáticamente.
 */
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { contribuyentes, EcfApiError } from './client';


export interface CampoFaltante {
  campo: string;
  label: string;
}

/** Devuelve los campos requeridos que le faltan a un team para registrarse. */
export function validarCamposContribuyente(team: {
  rnc: string | null;
  razonSocial: string | null;
  direccion: string | null;
}): CampoFaltante[] {
  const faltantes: CampoFaltante[] = [];
  if (!team.rnc?.trim())         faltantes.push({ campo: 'rnc',        label: 'RNC' });
  if (!team.razonSocial?.trim()) faltantes.push({ campo: 'razonSocial', label: 'Razón Social' });
  if (!team.direccion?.trim())   faltantes.push({ campo: 'direccion',   label: 'Dirección' });
  return faltantes;
}

/**
 * Obtiene el codigoPublico del contribuyente en ecf-api.
 * Si no existe, lo registra automáticamente y guarda el código en la BD.
 *
 * Lanza error si los campos requeridos están incompletos.
 */
export async function ensureContribuyente(teamId: number): Promise<string> {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) throw new Error('Empresa no encontrada');

  // Ya registrado → devolver código existente
  if (team.ecfCodigoPublico) return team.ecfCodigoPublico;

  // Validar campos requeridos
  const faltantes = validarCamposContribuyente(team);
  if (faltantes.length > 0) {
    const labels = faltantes.map((f) => f.label).join(', ');
    throw new ContribuyenteCamposFaltantesError(faltantes, labels);
  }

  // Buscar primero en ecf-api por si el RNC ya está registrado
  const lista = await contribuyentes.list();
  const existente = lista.find(c => c.rnc === team.rnc);

  let codigoPublico: string;
  if (existente) {
    codigoPublico = existente.codigoPublico;
  } else {
    const result = await contribuyentes.create({
      rnc:             team.rnc!,
      nombre:          team.razonSocial!,
      direccion:       team.direccion!,
      nombreComercial: team.nombreComercial ?? undefined,
      telefono:        team.telefono && team.telefono.length <= 12 ? team.telefono : undefined,
      provincia:       team.provincia ?? undefined,
      municipio:       team.municipio ?? undefined,
      ambiente:        mapAmbiente(team.dgiiEnvironment),
    });
    codigoPublico = result.codigoPublico;
  }

  // Persistir codigoPublico para no volver a registrar
  await db
    .update(teams)
    .set({ ecfCodigoPublico: codigoPublico })
    .where(eq(teams.id, teamId));

  return codigoPublico;
}

function mapAmbiente(env: string | null): 'TesteCF' | 'CerteCF' | 'Produccion' {
  if (env === 'CerteCF') return 'CerteCF';
  if (env === 'eCF')     return 'Produccion';
  return 'TesteCF';
}

export class ContribuyenteCamposFaltantesError extends Error {
  constructor(
    public readonly faltantes: CampoFaltante[],
    message: string,
  ) {
    super(`Completa los siguientes campos antes de continuar: ${message}`);
    this.name = 'ContribuyenteCamposFaltantesError';
  }
}
