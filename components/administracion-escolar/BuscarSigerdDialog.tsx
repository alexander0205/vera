'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';
import { Search, Loader2, AlertTriangle, UserCheck } from 'lucide-react';
import { aFechaISO } from '@/lib/sigerd/fechas';

/**
 * Buscar un alumno en SIGERD y traerse su ficha.
 *
 * Sirve para el alta: en vez de teclear nombre, apellidos, fecha de nacimiento
 * y RNE de un papel —donde una letra mal escrita crea un alumno que después no
 * cruza con el MINERD—, se busca en el portal y se copia lo que ya está bien.
 *
 * Dos avisos que la pantalla tiene que dar, y por qué:
 *
 * 1. **El buscador es NACIONAL.** El endpoint del portal no filtra por centro:
 *    "María" devuelve menores de cualquier escuela del país. Quien busca tiene
 *    que saberlo para no dar por hecho que lo que sale es de su colegio.
 *
 * 2. **Marcar los que ya existen.** Si el alumno ya se importó, volver a
 *    crearlo deja dos fichas del mismo niño con la mitad de los pagos en cada
 *    una. Por eso se consulta cuáles de los resultados ya están.
 */

/** Fila tal como la devuelve el portal. Los nombres son suyos, no nuestros. */
interface FilaSigerd {
  IdEstudiante?: number;
  Nombres?: string;
  Nombre2?: string | null;
  Apellido1?: string;
  Apellido2?: string | null;
  CodigoRNE?: string | null;
  Nui?: string | null;
  FechaNacimiento?: string | null;
}

/** Lo que se le devuelve al formulario de alta, ya en nuestro vocabulario. */
export interface EstudianteDeSigerd {
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  codigoRne: string;
  sigerdId: number | null;
  /**
   * Qué poner como código de matrícula cuando el colegio no usa uno propio.
   *
   * Se prefiere el RNE —es el Registro Nacional del Estudiante, el número con
   * el que el MINERD identifica al alumno y el que el colegio maneja en papel—
   * y solo si falta se cae al id interno de SIGERD. El RNE viene vacío en parte
   * del padrón, así que la alternativa hace falta de verdad.
   */
  codigoSugerido: string;
  /** De la ficha del portal: sexo normalizado. Vacío si no se pudo traer. */
  sexo: string;
  /**
   * Los campos extra de la ficha (dirección, acta, contacto…), ya con nuestros
   * nombres de columna. Vacío si la ficha no se pudo traer: el buscador solo
   * devuelve ocho columnas y el resto vive en la página de detalle del portal.
   */
  campos: Record<string, string>;
  /**
   * Los responsables que el portal tenía para el alumno, ya dados de alta como
   * tutores del colegio. Vacío si no tenía o si no se pudieron traer.
   *
   * Ninguno viene marcado como responsable de pago: eso exige un contacto de
   * Facturación y SIGERD no sabe nada de eso. Lo marca el usuario.
   */
  tutores: TutorDeSigerd[];
}

export interface TutorDeSigerd {
  tutorId: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  clientId: number | null;
  relacion: string;
  /** Ya existía en el colegio y se reutilizó en vez de duplicarlo. */
  reutilizado: boolean;
}

function nombreCompleto(f: FilaSigerd): string {
  return [f.Nombres, f.Nombre2].filter(Boolean).join(' ').trim();
}
function apellidosDe(f: FilaSigerd): string {
  return [f.Apellido1, f.Apellido2].filter(Boolean).join(' ').trim();
}

/** Un criterio del buscador. Enter busca desde cualquiera de ellos. */
function CampoBusqueda({ etiqueta, valor, onCambiar, onBuscar, tipo, autoFocus }: {
  etiqueta: string; valor: string; onCambiar: (v: string) => void;
  onBuscar: () => void; tipo?: string; autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{etiqueta}</Label>
      <Input
        type={tipo}
        value={valor}
        autoFocus={autoFocus}
        onChange={(e) => onCambiar(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onBuscar(); } }}
      />
    </div>
  );
}

export function BuscarSigerdDialog({ open, onClose, onElegir }: {
  open: boolean;
  onClose: () => void;
  onElegir: (e: EstudianteDeSigerd) => void;
}) {
  /**
   * Los siete criterios que acepta el portal.
   *
   * Con nombre y primer apellido no basta: el padrón es nacional y «María
   * Pérez» devuelve decenas. Los tres identificadores —RNE, NUI e id de
   * SIGERD— encuentran a UNA persona, y con ellos el segundo apellido y la
   * fecha de nacimiento se puede afinar cuando solo se tiene el nombre.
   *
   * Antes solo había dos campos, y quien tenía dos apellidos los escribía
   * juntos en «Primer apellido» — el portal no encontraba a nadie y parecía
   * que el alumno no existía.
   */
  const [criterios, setCriterios] = useState({
    nombres: '', primerApellido: '', segundoApellido: '',
    rne: '', nui: '', idEstudiante: '', fechaNacimiento: '',
  });
  const puso = (k: keyof typeof criterios) => (v: string) =>
    setCriterios((c) => ({ ...c, [k]: v }));
  const [buscando, setBuscando] = useState(false);
  /** Id de SIGERD cuya ficha se está trayendo. null = ninguna. */
  const [trayendoFicha, setTrayendoFicha] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinCredenciales, setSinCredenciales] = useState(false);
  const [filas, setFilas] = useState<FilaSigerd[] | null>(null);
  /** sigerdId → id del estudiante que ya tenemos. */
  const [yaEstan, setYaEstan] = useState<Map<number, number>>(new Map());

  async function buscar() {
    const puestos = Object.entries(criterios).filter(([, v]) => v.trim() !== '');
    if (puestos.length === 0) {
      setError('Escribe al menos un dato: nombre, apellido, RNE, NUI o id de SIGERD.');
      return;
    }
    setBuscando(true);
    setError(null);
    setSinCredenciales(false);
    setFilas(null);
    try {
      const params = new URLSearchParams();
      for (const [clave, valor] of puestos) params.set(clave, valor.trim());
      // 25 y no 500: si hacen falta más, lo que hace falta es afinar la
      // búsqueda, no leer una lista de menores de todo el país.
      params.set('porPagina', '25');

      const res = await fetch(`/api/sigerd/estudiantes?${params}`);
      const json = await res.json();
      if (!res.ok) {
        if (json.codigo === 'sin-credenciales') setSinCredenciales(true);
        throw new Error(json.error ?? 'No se pudo consultar SIGERD.');
      }

      const rows: FilaSigerd[] = json.datos?.rows ?? [];
      setFilas(rows);

      // ¿Cuáles ya están? Se pregunta después de tener los resultados para no
      // retrasar lo que el usuario espera ver.
      const ids = rows.map((r) => r.IdEstudiante).filter((n): n is number => typeof n === 'number');
      if (ids.length > 0) {
        const r2 = await fetch(`/api/administracion-escolar/estudiantes/por-sigerd?ids=${ids.join(',')}`);
        const j2 = await r2.json().catch(() => ({}));
        const mapa = new Map<number, number>();
        for (const e of j2.existentes ?? []) if (e.sigerdId) mapa.set(e.sigerdId, e.id);
        setYaEstan(mapa);
      } else {
        setYaEstan(new Map());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar SIGERD.');
    } finally {
      setBuscando(false);
    }
  }

  /**
   * Trae la ficha completa del alumno y cierra con todo lo que el portal tenga.
   *
   * El listado del buscador se queda en ocho columnas; la dirección, el acta y
   * los teléfonos están en la página de detalle, que es UNA petición más por
   * alumno. Se pide aquí, al elegirlo, y no antes: pedirla para cada fila de
   * cada búsqueda serían decenas de viajes al portal para descartarlos casi
   * todos.
   *
   * Si la ficha falla —el portal se cae, la sesión caduca— NO se bloquea el
   * alta: se cierra con los cuatro campos del listado, que es exactamente lo
   * que hacía antes. Lo que falte se escribe a mano.
   */
  async function elegir(f: FilaSigerd) {
    const rne = (f.CodigoRNE ?? '').trim();
    const id = typeof f.IdEstudiante === 'number' ? f.IdEstudiante : null;

    const base: EstudianteDeSigerd = {
      nombres: nombreCompleto(f),
      apellidos: apellidosDe(f),
      fechaNacimiento: aFechaISO(f.FechaNacimiento) ?? '',
      codigoRne: rne,
      sigerdId: id,
      codigoSugerido: rne || (id != null ? String(id) : ''),
      sexo: '',
      campos: {},
      tutores: [],
    };

    if (id == null) { onElegir(base); onClose(); return; }

    setTrayendoFicha(id);
    try {
      // Las dos a la vez: son páginas distintas del portal y una no depende de
      // la otra. En serie, el usuario esperaría la suma de ambas.
      const [resFicha, resTutores] = await Promise.allSettled([
        fetch(`/api/sigerd/estudiantes/${id}/ficha`),
        fetch('/api/administracion-escolar/tutores/desde-sigerd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idEstudianteSigerd: id }),
        }),
      ]);

      const traido = { ...base };

      // Envuelto en `datos`, como el buscador: lo pone `conSesionSigerdAuto`.
      if (resFicha.status === 'fulfilled' && resFicha.value.ok) {
        const j = (await resFicha.value.json()).datos ?? {};
        // La ficha manda sobre el listado: es la misma fuente, pero completa y
        // con los nombres partidos como el ministerio los tiene.
        traido.nombres = j.nombres || base.nombres;
        traido.apellidos = j.apellidos || base.apellidos;
        traido.fechaNacimiento = j.fechaNacimiento || base.fechaNacimiento;
        traido.sexo = j.sexo || '';
        traido.campos = j.campos ?? {};
      }

      // Que fallen los tutores no invalida la ficha, ni al revés: cada trozo
      // que llegue se aprovecha.
      if (resTutores.status === 'fulfilled' && resTutores.value.ok) {
        traido.tutores = ((await resTutores.value.json()).datos?.tutores ?? []) as TutorDeSigerd[];
      }

      onElegir(traido);
    } catch {
      onElegir(base);
    } finally {
      setTrayendoFicha(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent maxWidth={false} className="flex !h-[70vh] !w-[70vw] !max-w-none flex-col">
        <ModalHeader title="Buscar en SIGERD"
          subtitle="Trae los datos del alumno desde el portal del MINERD." />

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {/* Nombre arriba porque es por donde se empieza casi siempre. */}
            <div className="grid gap-3 sm:grid-cols-3">
              <CampoBusqueda etiqueta="Nombres" valor={criterios.nombres}
                onCambiar={puso('nombres')} onBuscar={buscar} autoFocus />
              <CampoBusqueda etiqueta="Primer apellido" valor={criterios.primerApellido}
                onCambiar={puso('primerApellido')} onBuscar={buscar} />
              <CampoBusqueda etiqueta="Segundo apellido" valor={criterios.segundoApellido}
                onCambiar={puso('segundoApellido')} onBuscar={buscar} />
            </div>

            {/* Los identificadores. Cualquiera de los tres devuelve a UNA
                persona, así que se pueden usar solos y sin el nombre. */}
            <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <CampoBusqueda etiqueta="RNE" valor={criterios.rne}
                onCambiar={puso('rne')} onBuscar={buscar} />
              <CampoBusqueda etiqueta="NUI / cédula" valor={criterios.nui}
                onCambiar={puso('nui')} onBuscar={buscar} />
              <CampoBusqueda etiqueta="Id de SIGERD" valor={criterios.idEstudiante}
                onCambiar={puso('idEstudiante')} onBuscar={buscar} />
              <CampoBusqueda etiqueta="Fecha de nacimiento" tipo="date"
                valor={criterios.fechaNacimiento}
                onCambiar={puso('fechaNacimiento')} onBuscar={buscar} />
            </div>

            <div className="flex justify-end">
              <Button className="bg-zero-600 hover:bg-zero-700" onClick={() => void buscar()} disabled={buscando}>
                {buscando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                Buscar
              </Button>
            </div>
          </div>

          {sinCredenciales ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Este colegio no tiene guardadas sus credenciales de SIGERD</p>
                <p className="mt-0.5">
                  Guárdalas en{' '}
                  <Link href="/escolar/configuracion/sigerd" className="font-medium underline">
                    Configuración → SIGERD
                  </Link>{' '}
                  y vuelve a intentarlo.
                </p>
              </div>
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          {filas !== null && filas.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-sm text-gray-500">
              Ningún alumno con esos datos. Prueba con menos letras o solo el apellido.
            </p>
          )}

          {filas !== null && filas.length > 0 && (
            <>
              <p className="text-xs text-gray-400">
                {filas.length} resultado{filas.length !== 1 ? 's' : ''} · el buscador del portal
                cubre todo el país, no solo tu centro.
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                {filas.map((f, i) => {
                  const id = f.IdEstudiante;
                  const existeId = id != null ? yaEstan.get(id) : undefined;
                  return (
                    <div key={id ?? i}
                      className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0 hover:bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {apellidosDe(f)}, {nombreCompleto(f)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {f.CodigoRNE ? `RNE ${f.CodigoRNE}` : 'sin RNE'}
                          {f.FechaNacimiento ? ` · ${f.FechaNacimiento}` : ''}
                          {id != null ? ` · SIGERD ${id}` : ''}
                        </p>
                      </div>
                      {existeId ? (
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <UserCheck className="h-4 w-4" />
                          Ya está en tu sistema
                          <Link href={`/escolar/estudiantes/${existeId}`}
                            className="font-medium text-zero-600 hover:underline">
                            ver ficha
                          </Link>
                        </span>
                      ) : (
                        <Button size="sm" variant="outline"
                          disabled={trayendoFicha != null}
                          onClick={() => void elegir(f)}>
                          {trayendoFicha === id
                            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Trayendo ficha…</>
                            : 'Usar este'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
