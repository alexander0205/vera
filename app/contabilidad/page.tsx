import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePermission, hasPermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { getTeamModules } from '@/lib/auth/modules';
import { getEstadoConfiguracion } from '@/lib/contabilidad/validacion';
import { contarPendientesPorOrigen, verificarCuadre } from '@/lib/contabilidad/libro-diario';
import { asientosPorOrigen, MODULOS_CONTABLES } from '@/lib/contabilidad/panorama';
import { rangoDelMes } from '@/lib/nomina/periodos';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Settings, Scale, Inbox } from 'lucide-react';
import { GenerarPendientes } from './_generar-pendientes';

export const metadata = { title: 'Contabilidad · Zero' };

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * Panorama contable. Responde lo que se preguntó en la reunión de integración:
 * ¿lo que registran los módulos está llegando a la contabilidad? Por módulo,
 * los asientos que generó en el mes y los documentos que siguen sin el suyo.
 */
export default async function PanoramaContablePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePermission('contabilidad:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const sp = await searchParams;
  const mesActual = hoyRD().slice(0, 7);
  const mes = sp.mes && MES_VALIDO.test(sp.mes) ? sp.mes : mesActual;
  const { inicio, fin } = rangoDelMes(mes);

  const [estado, pendientes, cuadre, movimientos, modulosTeam, puedeGenerar] = await Promise.all([
    getEstadoConfiguracion(teamId),
    contarPendientesPorOrigen(teamId),
    verificarCuadre(teamId),
    asientosPorOrigen(teamId, inicio, fin),
    getTeamModules(teamId),
    hasPermission('contabilidad:gestionar'),
  ]);

  const totalPendientes = Object.values(pendientes).reduce((s, n) => s + n, 0);
  const descuadrados = cuadre.asientosDescuadrados.length;

  const modulos = MODULOS_CONTABLES
    .map((m) => {
      const fuentes = m.fuentes.map((f) => ({
        ...f,
        mov: movimientos[f.origen] ?? { asientos: 0, totalCents: 0, ultimo: null },
        sinAsentar: f.pendientes.reduce((s, k) => s + pendientes[k], 0),
      }));
      return {
        ...m,
        fuentes,
        asientos: fuentes.reduce((s, f) => s + f.mov.asientos, 0),
        sinAsentar: fuentes.reduce((s, f) => s + f.sinAsentar, 0),
      };
    })
    // Nómina solo si la empresa la tiene (o si ya dejó rastro en el libro).
    .filter((m) => m.clave !== 'nomina' || modulosTeam.includes('nomina') || m.asientos > 0 || m.sinAsentar > 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookOpen className="h-6 w-6 text-zero-600" /> Contabilidad
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que registran los módulos llega aquí como asientos. Esta pantalla dice si está llegando.
          </p>
        </div>
        <nav className="flex items-center gap-1 text-sm" aria-label="Mes">
          <Link href={`/contabilidad?mes=${moverMes(mes, -1)}`} className="rounded-md border p-1.5 hover:bg-muted" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[10rem] text-center font-medium" data-testid="mes-panorama">
            {nombreMes(mes).charAt(0).toUpperCase() + nombreMes(mes).slice(1)}
          </span>
          {mes < mesActual ? (
            <Link href={`/contabilidad?mes=${moverMes(mes, 1)}`} className="rounded-md border p-1.5 hover:bg-muted" aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="rounded-md border p-1.5 opacity-40"><ChevronRight className="h-4 w-4" /></span>
          )}
        </nav>
      </div>

      {/* Estado */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Estado
          titulo="Registro automático"
          ok={estado.activa}
          valor={estado.activa ? 'Encendido' : 'Apagado'}
          // La nómina asienta al momento; ventas, compras y caja las recoge el barrido de cada madrugada.
          sub={estado.activa ? 'Nómina al momento; lo demás cada madrugada o con el botón' : 'No se genera ningún asiento hasta encenderlo'}
          href="/contabilidad/configuracion"
          icono={<Settings className="h-4 w-4" />}
        />
        <Estado
          titulo="Configuración"
          ok={estado.completa}
          valor={estado.completa ? 'Completa' : `${estado.huecos.length} por completar`}
          sub={estado.completa ? 'Cada módulo sabe a qué cuenta va' : estado.huecos.slice(0, 2).map((h) => h.que).join(' · ')}
          href="/contabilidad/configuracion"
          icono={<Settings className="h-4 w-4" />}
        />
        <Estado
          titulo="Libro diario"
          ok={descuadrados === 0}
          valor={descuadrados === 0 ? 'Cuadra' : `${descuadrados} descuadrado${descuadrados === 1 ? '' : 's'}`}
          sub={descuadrados === 0 ? 'Todo asiento tiene el debe igual al haber' : 'Hay asientos con debe distinto del haber'}
          href="/contabilidad/libro-diario"
          icono={<Scale className="h-4 w-4" />}
        />
        <Card>
          <CardContent className="space-y-2 p-4" data-testid="estado-pendientes">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Inbox className="h-4 w-4" /> Sin asentar</div>
            <div className={`text-xl font-semibold ${totalPendientes > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {totalPendientes > 0 ? `${totalPendientes} documento${totalPendientes === 1 ? '' : 's'}` : 'Al día'}
            </div>
            {puedeGenerar && totalPendientes > 0 && (
              <GenerarPendientes habilitado={estado.activa} motivo="Enciende el registro automático en Configuración" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Por módulo */}
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">De dónde salen los asientos de {nombreMes(mes)}</h2>
      <div className="space-y-3">
        {modulos.map((m) => (
          <Card key={m.clave} data-testid={`modulo-${m.clave}`}>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
                <div>
                  <div className="font-semibold">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.descripcion}</div>
                </div>
                {m.sinAsentar > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="h-3 w-3" /> {m.sinAsentar} sin asentar
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" /> Al día
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                {/* Mismo ancho de columnas en todas las tarjetas: se leen como una sola tabla. */}
                <table className="w-full min-w-[40rem] table-fixed text-sm">
                  <colgroup>
                    <col />
                    <col className="w-24" />
                    <col className="w-40" />
                    <col className="w-28" />
                    <col className="w-28" />
                    <col className="w-32" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Qué genera el asiento</th>
                      <th className="px-4 py-2 text-right font-medium">Asientos</th>
                      <th className="px-4 py-2 text-right font-medium">Monto</th>
                      <th className="px-4 py-2 font-medium">Último</th>
                      <th className="px-4 py-2 text-right font-medium">Sin asentar</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {m.fuentes.map((f) => (
                      <tr key={f.origen} className="border-t" data-testid={`fuente-${f.origen}`}>
                        <td className="px-4 py-2">{f.label}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{f.mov.asientos}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{f.mov.asientos > 0 ? fmtDOP(f.mov.totalCents) : '—'}</td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">{f.mov.ultimo ? fmtFechaCorta(f.mov.ultimo) : '—'}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${f.sinAsentar > 0 ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}>
                          {f.pendientes.length === 0 ? '—' : f.sinAsentar}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/contabilidad/libro-diario?origenTipo=${f.origen}&desde=${inicio}&hasta=${fin}`}
                            className="whitespace-nowrap text-xs font-medium text-zero-700 hover:underline"
                          >
                            Ver en el libro
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Estado({ titulo, ok, valor, sub, href, icono }: {
  titulo: string; ok: boolean; valor: string; sub: string; href: string; icono: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition hover:border-zero-300">
        <CardContent className="space-y-1 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icono} {titulo}</div>
          <div className={`text-xl font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{valor}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
