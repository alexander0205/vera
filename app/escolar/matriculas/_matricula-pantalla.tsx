'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { hayHistorialPropio } from '@/lib/hooks/useVolver';
import { MatriculaFormulario, type MatriculaEditable } from '@/components/administracion-escolar/MatriculaFormulario';
import {
  cargarArranque, destinoAlSalir, titulosDeMatricula, type CargaDeLaMatricula,
} from '@/lib/administracion-escolar/matricula-pantalla';

/**
 * «Nueva matrícula» y «Editar matrícula», a pantalla completa.
 *
 * Las dos direcciones montan esto mismo: lo único que cambia es si hay una
 * matrícula que cargar. Era un diálogo encima de la ficha del alumno o del
 * listado, y quien lo abría le pasaba lo que ya tenía a la vista —quién es el
 * alumno, en qué años está matriculado, si es su primera vez—. Una dirección
 * se puede abrir sola o recargar, así que aquí se pide todo eso antes de
 * enseñar el formulario, a las mismas rutas que alimentan la ficha y con sus
 * mismas reglas (`cargarArranque`, en `matricula-pantalla.ts`).
 *
 * El formulario no se monta hasta tenerlo TODO: al montarse copia lo que
 * recibe a sus campos, y si le llegara a trozos borraría lo que la persona ya
 * hubiera escrito.
 *
 * Quién puede entrar lo decide la página de servidor (hace falta el permiso de
 * gestionar, el mismo que enseñaba los botones que abrían el diálogo); guardar
 * lo vuelve a comprobar la API.
 */

/** La matrícula tal como la devuelve su ruta: siempre trae de quién es. */
type MatriculaDeLaRuta = MatriculaEditable & { estudianteId: number };

type Carga = { estado: 'cargando' } | CargaDeLaMatricula<MatriculaDeLaRuta>;

interface Props {
  modo: 'nueva' | 'editar';
  /** Al editar. `null` = el id de la dirección no era un número. */
  matriculaId: number | null;
  /** Al crear: el alumno ya decidido (`?estudiante=`), si lo hay. */
  estudianteId: number | null;
  /** A dónde regresar. Ya validado por la página; `null` = el destino de siempre. */
  volver: string | null;
}

export default function MatriculaPantalla({ modo, matriculaId, estudianteId, volver }: Props) {
  const router = useRouter();
  // El formulario decide con los permisos qué se puede tocar. Mientras llegan
  // valen «ninguno», y abriendo la dirección directamente las tarjetas salían
  // un instante sin lápices ni desplegable: se espera, como en «Cargo a varios».
  const { isLoading: cargandoPermisos } = usePermissions();

  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCarga({ estado: 'cargando' });
    // No lanza: sin red o con el servidor caído devuelve «fallo».
    void cargarArranque<MatriculaDeLaRuta>({ modo, matriculaId, estudianteId }, (ruta) => fetch(ruta))
      .then((c) => { if (vigente) setCarga(c); });
    return () => { vigente = false; };
  }, [modo, matriculaId, estudianteId, intento]);

  // De quién es, para saber a dónde se vuelve cuando la dirección no lo dice.
  // Un alumno que no existe no cuenta: su ficha tampoco existiría.
  const alumnoId = carga.estado === 'lista' ? carga.arranque.estudianteFijoId
    : carga.estado === 'no-existe' ? null
    : estudianteId;
  const salida = destinoAlSalir({ volver, estudianteId: alumnoId });

  /**
   * Salir, por cualquiera de las tres puertas (guardar, cancelar, el enlace de
   * arriba), sin dejar este formulario en el historial.
   *
   * Con un `push` quedaba justo detrás de la pantalla de origen, y la ficha
   * vuelve con «atrás»: «Volver a estudiantes» traía de nuevo al formulario, y
   * de ahí otra vez a la ficha, sin salir nunca.
   *
   * Si quien abrió esta pantalla dijo a dónde volver y se llegó navegando, el
   * origen ES la entrada anterior: se retrocede. Si no (dirección abierta
   * directa, recarga, o el alta de un alumno, que no manda `volver` porque lo
   * que hay detrás es el alta), se reemplaza esta entrada por el destino.
   */
  const salir = useCallback((destino: string) => {
    if (volver && hayHistorialPropio()) router.back();
    else router.replace(destino);
  }, [router, volver]);

  // El enlace sigue siendo un enlace (abrir en otra pestaña funciona); el clic
  // normal sale por la misma puerta que «Cancelar».
  const alPulsarVolver = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    salir(salida.href);
  };

  if (carga.estado === 'no-existe') {
    return (
      <section className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">
          {carga.que === 'matricula'
            ? 'Esa matrícula no existe o no pertenece a este colegio.'
            : 'Ese estudiante no existe o no pertenece a este colegio.'}
        </p>
        <Link href={salida.href} onClick={alPulsarVolver} className="mt-3 inline-flex items-center gap-1 text-sm text-zero-600">
          <ArrowLeft className="h-4 w-4" aria-hidden />{salida.etiqueta}
        </Link>
      </section>
    );
  }

  const editando = modo === 'editar';

  return (
    <section className="space-y-5 p-4 sm:p-6">
      <Link href={salida.href} onClick={alPulsarVolver}
        className="inline-flex items-center gap-1 self-start text-sm text-gray-500 transition-colors hover:text-zero-600">
        <ArrowLeft className="h-4 w-4" aria-hidden />{salida.etiqueta}
      </Link>

      {carga.estado === 'fallo' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-800">
            {editando ? 'No se pudo cargar la matrícula.' : 'No se pudieron cargar los datos del estudiante.'}
          </p>
          <p className="mt-1 text-sm text-red-700">No se ha cambiado nada. Revisa tu conexión e inténtalo otra vez.</p>
          <div className="mt-3">
            <Button variant="outline" onClick={() => setIntento((n) => n + 1)}>Intentar otra vez</Button>
          </div>
        </div>
      ) : carga.estado === 'cargando' || cargandoPermisos ? (
        <div role="status" className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-zero-600" aria-hidden />
          <span className="sr-only">Cargando…</span>
        </div>
      ) : (
        <>
          <Cabecera {...titulosDeMatricula({ editando, esPrimera: carga.arranque.esPrimera })} />

          {/* Ancho completo, como la ficha del alumno y el listado desde los
              que se llega: con un tope, las dos columnas quedaban tan estrechas
              como en el diálogo. */}
          <MatriculaFormulario
            matricula={carga.arranque.matricula}
            estudianteFijoId={carga.arranque.estudianteFijoId}
            estudianteFijoNombre={carga.arranque.estudianteFijoNombre}
            periodosOcupados={carga.arranque.periodosOcupados}
            codigoSugerido={carga.arranque.codigoSugerido}
            onCancelar={() => salir(salida.href)}
            onGuardado={(deQuien) => {
              // El aviso sale del `Toaster` del armazón de la aplicación:
              // sobrevive al cambio de pantalla y se lee ya en la de origen.
              toast.success(editando ? 'Matrícula actualizada' : 'Matrícula creada');
              // Al matricular desde Matriculación el alumno se eligió dentro
              // del formulario: ahora se sabe quién es, y si la dirección no
              // decía a dónde volver se va a su ficha.
              salir(destinoAlSalir({ volver, estudianteId: deQuien }).href);
            }}
          />
        </>
      )}
    </section>
  );
}

function Cabecera({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <header>
      <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitulo}</p>
    </header>
  );
}
