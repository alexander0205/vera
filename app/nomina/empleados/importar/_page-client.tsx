'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import type { ResultadoImportacionEmpleados } from '@/lib/nomina/empleados-importar';

// Carga masiva de empleados y salarios desde Excel, en dos pasos: primero la vista
// previa y después aplicar. La vista previa no es un cálculo aparte: el servidor
// corre la importación entera con las mismas reglas y la deshace, así lo que se
// ve aquí es exactamente lo que pasa al aplicar.

const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (cents: number | null | undefined) => (cents == null ? '—' : RD.format(cents / 100));

export default function ImportarEmpleadosClient() {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionEmpleados | null>(null);
  const [trabajando, setTrabajando] = useState<'revisando' | 'aplicando' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ocupadoRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(f: File, aplicar: boolean): Promise<ResultadoImportacionEmpleados | null> {
    const fd = new FormData();
    fd.append('archivo', f);
    if (aplicar) fd.append('aplicar', '1');
    const res = await fetch('/api/nomina/empleados/importar', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'No se pudo procesar el archivo.');
      return null;
    }
    return body as ResultadoImportacionEmpleados;
  }

  async function elegir(f: File | undefined) {
    if (!f || ocupadoRef.current) return;
    ocupadoRef.current = true;
    setArchivo(f);
    setResultado(null);
    setError(null);
    setTrabajando('revisando');
    try {
      const r = await enviar(f, false);
      if (r) setResultado(r);
    } catch {
      setError('No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setTrabajando(null);
      ocupadoRef.current = false;
    }
  }

  async function aplicar() {
    if (!archivo || ocupadoRef.current) return;
    ocupadoRef.current = true;
    setError(null);
    setTrabajando('aplicando');
    try {
      const r = await enviar(archivo, true);
      if (!r) return;
      // Entre la vista previa y el clic alguien pudo tocar los empleados: si la
      // corrida real encontró errores, se enseñan en vez de dar por hecho.
      if (!r.aplicado) { setResultado(r); return; }
      toast.success(`Importado: ${r.creados.length} creado${r.creados.length === 1 ? '' : 's'}, ${r.actualizados.length} actualizado${r.actualizados.length === 1 ? '' : 's'}`);
      router.push('/nomina/empleados');
    } catch {
      setError('No se pudo aplicar. No se guardó nada: intenta de nuevo.');
    } finally {
      setTrabajando(null);
      ocupadoRef.current = false;
    }
  }

  const hayErrores = (resultado?.errores.length ?? 0) > 0;
  const hayCambios = !!resultado && resultado.creados.length + resultado.actualizados.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <button
        type="button" onClick={() => router.push('/nomina/empleados')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Empleados
      </button>

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileSpreadsheet className="h-6 w-6 text-zero-600" /> Importar empleados desde Excel
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Descarga la plantilla (ya trae a tus empleados), complétala o corrígela en Excel y súbela. La
          <strong> cédula</strong> es la llave: una nueva crea al empleado y una que ya existe lo actualiza.
          Una celda vacía no borra nada e importar <strong>nunca da de baja</strong> a nadie.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="gap-1.5">
          <a href="/api/nomina/empleados/plantilla"><Download className="h-4 w-4" /> Descargar plantilla</a>
        </Button>
        <Button onClick={() => inputRef.current?.click()} disabled={trabajando !== null} className="gap-1.5">
          <Upload className="h-4 w-4" /> {archivo ? 'Elegir otro archivo' : 'Elegir archivo .xlsx'}
        </Button>
        <input
          ref={inputRef} hidden type="file" data-testid="archivo-empleados"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ''; }}
        />
        {archivo && <span className="text-sm text-muted-foreground">{archivo.name}</span>}
        {trabajando === 'revisando' && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Revisando el archivo…
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {resultado && hayErrores && (
        <div className="mt-5 space-y-3">
          <div role="alert" className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No se aplicó nada: {resultado.errores.length === 1 ? 'hay 1 fila' : `hay ${resultado.errores.length} filas`} con
              problemas. Corrígelas en Excel y vuelve a subir el archivo.
            </span>
          </div>
          <Card><CardContent className="max-h-72 overflow-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Fila</th><th className="px-3 py-2 font-medium">Cédula</th><th className="px-3 py-2 font-medium">Problema</th>
              </tr></thead>
              <tbody>
                {resultado.errores.map((e, i) => (
                  <tr key={i} className="border-b last:border-0 align-top" data-testid="error-fila">
                    <td className="px-3 py-2 tabular-nums">{e.fila}</td>
                    <td className="px-3 py-2 tabular-nums">{e.cedula || '—'}</td>
                    <td className="px-3 py-2 [overflow-wrap:anywhere]">{e.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </div>
      )}

      {resultado && !hayErrores && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Resumen titulo="Se crean" valor={resultado.creados.length} />
            <Resumen titulo="Se actualizan" valor={resultado.actualizados.length} />
            <Resumen titulo="Sin cambios" valor={resultado.sinCambios} />
            <Resumen titulo="Se omiten" valor={resultado.omitidos.length} />
          </div>

          {resultado.avisos.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="avisos">
              <p className="font-medium">Revisa antes de aplicar</p>
              {resultado.avisos.map((a, i) => (
                <p key={i} className="flex items-start gap-2 [overflow-wrap:anywhere]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Fila {a.fila}: {a.mensaje}
                </p>
              ))}
            </div>
          )}

          {resultado.creados.length > 0 && (
            <Bloque titulo={`Empleados nuevos (${resultado.creados.length})`}>
              {resultado.creados.map((c) => (
                <div key={c.cedula} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-0">
                  <span className="min-w-0 [overflow-wrap:anywhere]"><strong>{c.nombre}</strong> <span className="text-muted-foreground">· {c.cedula}</span></span>
                  <span className="shrink-0 tabular-nums">{pesos(c.salarioCents)}{c.incentivoCents ? ` + ${pesos(c.incentivoCents)}` : ''}</span>
                </div>
              ))}
            </Bloque>
          )}

          {resultado.actualizados.length > 0 && (
            <Bloque titulo={`Cambios en empleados que ya existen (${resultado.actualizados.length})`}>
              {resultado.actualizados.map((a) => (
                <div key={a.cedula} className="border-b px-3 py-2 text-sm last:border-0">
                  <div className="[overflow-wrap:anywhere]"><strong>{a.nombre}</strong> <span className="text-muted-foreground">· {a.cedula} · fila {a.fila}</span></div>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {a.cambios.map((c) => (
                      <li key={c.campo} className="[overflow-wrap:anywhere]">
                        {c.campo}: <span className="line-through">{c.antes}</span> → <strong className="text-foreground">{c.despues}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Bloque>
          )}

          {resultado.omitidos.length > 0 && (
            <Bloque titulo={`Omitidos (${resultado.omitidos.length})`}>
              {resultado.omitidos.map((o) => (
                <div key={o.cedula} className="border-b px-3 py-2 text-sm last:border-0 [overflow-wrap:anywhere]">
                  <strong>{o.nombre}</strong> <span className="text-muted-foreground">· fila {o.fila} · {o.motivo}</span>
                </div>
              ))}
            </Bloque>
          )}

          {hayCambios ? (
            <div className="flex items-center justify-end gap-3">
              <Badge variant="outline">Todo o nada: si algo falla, no se guarda nada</Badge>
              <Button onClick={aplicar} disabled={trabajando !== null} className="gap-1.5">
                {trabajando === 'aplicando' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Aplicar {resultado.creados.length + resultado.actualizados.length} cambio{resultado.creados.length + resultado.actualizados.length === 1 ? '' : 's'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">El archivo no cambia nada: todo coincide con lo que ya está en Zero.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{titulo}</div>
      <Card><CardContent className="max-h-80 overflow-auto p-0">{children}</CardContent></Card>
    </div>
  );
}
