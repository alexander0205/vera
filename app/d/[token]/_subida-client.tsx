'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, FileUp, Loader2, RotateCcw } from 'lucide-react';

/**
 * Subida de documentos desde el teléfono de la familia.
 *
 * Dos maneras de traer el papel, y las dos hacen falta:
 *   · **Cámara** (`<input capture>`): el padre tiene el acta en la mano. Se usa
 *     la cámara del sistema y no un visor propio como en las fotos de alumno —
 *     para un documento el enfoque y el encuadre de la app nativa son mejores,
 *     y encima funciona sin HTTPS.
 *   · **Archivo**: lo escanearon en el trabajo y lo tienen en PDF, o lo
 *     fotografiaron ayer. Obligar a repetir la foto sería absurdo.
 *
 * El QR lleva `?c=1` y abre directo la pantalla de un documento con el botón de
 * cámara grande: quien escanea ya tiene el papel delante. El enlace pelado
 * enseña la lista y deja elegir. No se dispara la cámara sola al cargar porque
 * el navegador del móvil solo abre el selector desde un gesto del usuario —
 * intentarlo sin él no hace nada y deja la pantalla muda.
 *
 * De este alumno no se enseña más que el nombre de pila: la página se sirve sin
 * sesión y un enlace se reenvía.
 */

const ACEPTA = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 8 * 1024 * 1024;

interface Documento {
  requeridoId: number;
  nombre: string;
  ayuda: string | null;
  exigencia: string;
  cantidad: number;
  entregado: boolean;
  archivos: number;
  rechazado: boolean;
  noAplica: boolean;
}

interface Datos {
  estudiante: string;
  unSoloDocumento: boolean;
  documentos: Documento[];
  expiraEn: string;
}

export function SubidaFamiliaClient({ token, camaraPrimero }: { token: string; camaraPrimero: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const camaraRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const destino = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/documentos-familia/${token}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Enlace no válido'); return; }
      setDatos(json);
      setError(null);
    } catch {
      setError('No se pudo conectar. Revisa la conexión e intenta otra vez.');
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);

  const elegir = (requeridoId: number, comoFoto: boolean) => {
    destino.current = requeridoId;
    setAviso(null);
    (comoFoto ? camaraRef : archivoRef).current?.click();
  };

  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const requeridoId = destino.current;
    e.target.value = '';
    if (!file || requeridoId == null) return;

    if (file.size > MAX_BYTES) {
      setAviso(`El archivo pesa más de ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Prueba con una foto más pequeña.`);
      return;
    }

    setSubiendo(requeridoId);
    try {
      const fd = new FormData();
      fd.append('requeridoId', String(requeridoId));
      fd.append('archivo', file);
      const res = await fetch(`/api/documentos-familia/${token}`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 410 = el enlace murió mientras subía. No tiene arreglo desde aquí.
        if (res.status === 410) { setError(json.error ?? 'El enlace caducó'); return; }
        setAviso(json.error ?? 'No se pudo subir. Intenta otra vez.');
        return;
      }
      await cargar();
    } catch {
      setAviso('No se pudo subir. Revisa la conexión e intenta otra vez.');
    } finally {
      setSubiendo(null);
    }
  };

  if (cargando) {
    return <Marco><Loader2 className="mx-auto h-8 w-8 animate-spin text-zero-600" /></Marco>;
  }

  if (error || !datos) {
    return (
      <Marco>
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold">{error ?? 'Enlace no válido'}</h1>
        <p className="mt-2 text-sm text-gray-500">
          Escríbele al colegio para que te mande uno nuevo.
        </p>
      </Marco>
    );
  }

  const pendientes = datos.documentos.filter((d) => !d.entregado && !d.noAplica).length;
  // Con el QR y un solo documento se salta la lista: la pantalla es ese
  // documento y su botón de cámara.
  const directo = camaraPrimero && datos.documentos.length === 1 ? datos.documentos[0] : null;

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={subir} />
      <input ref={archivoRef} type="file" accept={ACEPTA} hidden onChange={subir} />

      <div className="mx-auto w-full max-w-lg px-4 py-6">
        <header className="mb-5 text-center">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Documentos de</p>
          <h1 className="text-xl font-semibold text-gray-900">{datos.estudiante}</h1>
          {!directo && (
            <p className="mt-1 text-sm text-gray-500">
              {pendientes === 0
                ? 'Ya mandaste todo. Gracias.'
                : `Faltan ${pendientes} de ${datos.documentos.length}.`}
            </p>
          )}
        </header>

        {aviso && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {aviso}
          </p>
        )}

        <div className="space-y-3">
          {(directo ? [directo] : datos.documentos).map((d) => (
            <TarjetaDocumento
              key={d.requeridoId}
              d={d}
              destacado={directo != null}
              subiendo={subiendo === d.requeridoId}
              onFoto={() => elegir(d.requeridoId, true)}
              onArchivo={() => elegir(d.requeridoId, false)}
            />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          El colegio revisa lo que mandas. Si algo no se lee bien te lo volverá a pedir.
        </p>
      </div>
    </div>
  );
}

function TarjetaDocumento({ d, destacado, subiendo, onFoto, onArchivo }: {
  d: Documento;
  destacado: boolean;
  subiendo: boolean;
  onFoto: () => void;
  onArchivo: () => void;
}) {
  if (d.noAplica) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 opacity-60">
        <p className="font-medium text-gray-700">{d.nombre}</p>
        <p className="text-xs text-gray-500">El colegio marcó que no hace falta.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">{d.nombre}</p>
          {/* Antes del estado: es lo que hay que leer ANTES de sacar la foto. */}
          {d.ayuda && <p className="mt-0.5 text-xs text-gray-600">{d.ayuda}</p>}
          <p className="mt-0.5 text-xs text-gray-500">
            {d.rechazado
              ? 'El colegio pidió que lo mandes otra vez.'
              : d.entregado
                ? `${d.archivos} ${d.archivos === 1 ? 'archivo enviado' : 'archivos enviados'}`
                : d.exigencia === 'si_aplica'
                  ? 'Solo si lo tienes'
                  : d.cantidad > 1 ? `Hacen falta ${d.cantidad}` : 'Hace falta'}
          </p>
        </div>
        {d.entregado && !d.rechazado && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-4 w-4" />
          </span>
        )}
      </div>

      <div className={`mt-3 flex gap-2 ${destacado ? 'flex-col' : ''}`}>
        <button
          type="button"
          onClick={onFoto}
          disabled={subiendo}
          className={`flex items-center justify-center gap-2 rounded-xl bg-zero-600 font-semibold text-white disabled:opacity-60 ${
            destacado ? 'h-14 w-full text-base' : 'h-11 flex-1 text-sm'
          }`}
        >
          {subiendo
            ? <><Loader2 className="h-5 w-5 animate-spin" />Enviando…</>
            : <><Camera className="h-5 w-5" />{d.entregado ? 'Otra foto' : 'Tomar foto'}</>}
        </button>
        <button
          type="button"
          onClick={onArchivo}
          disabled={subiendo}
          className={`flex items-center justify-center gap-2 rounded-xl border border-gray-300 font-medium text-gray-700 disabled:opacity-60 ${
            destacado ? 'h-12 w-full text-sm' : 'h-11 flex-1 text-sm'
          }`}
        >
          {d.entregado
            ? <><RotateCcw className="h-4 w-4" />Subir otro archivo</>
            : <><FileUp className="h-4 w-4" />Subir archivo</>}
        </button>
      </div>
    </div>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center">
        {children}
      </div>
    </div>
  );
}
