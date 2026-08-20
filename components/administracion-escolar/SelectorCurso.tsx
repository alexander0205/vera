'use client';

import { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

/**
 * Elegir dónde va el alumno: servicio → grado → sección.
 *
 * Antes era un solo buscador con las secciones aplanadas y el grado como
 * encabezado: "PRIMERO — PRIMARIO · MATUTINA" arriba y debajo "A" y "B". Con
 * diecinueve grados eso son casi cincuenta líneas en un desplegable, y para
 * elegir "Segundo B" había que localizar el encabezado correcto entre los
 * títulos en gris y luego acertar la letra de debajo.
 *
 * Tres campos encadenados dicen lo mismo en tres decisiones cortas, y cada una
 * recorta la siguiente. De paso deja a la vista la jerarquía real del colegio,
 * que en la lista aplanada vivía escondida en el título del grupo.
 */

export interface CursoOpcion {
  id: number; nombre: string;
  gradoId: number; gradoNombre: string;
  servicioId: number; servicioNombre: string; servicioTanda: string | null;
  periodoId: number;
}

export function SelectorCurso({ cursos, periodoId, valor, onChange, disabled, permitirTodos = false }: {
  /** Ya filtrados por activo; aquí solo se recortan por período. */
  cursos: CursoOpcion[];
  /** Año escolar elegido. Sin él no se ofrece nada: las secciones son de un año. */
  periodoId: number | null;
  /** Id de la sección (curso). Vacío mientras no se haya elegido. */
  valor: string;
  onChange: (cursoId: string) => void;
  disabled?: boolean;
  /**
   * Añade «Todos los cursos» como primera opción del servicio, y con ella el
   * valor `'todos'`.
   *
   * Es lo que hace que este mismo control sirva para FILTRAR y no solo para
   * matricular. Antes los filtros usaban un buscador aplanado donde cada línea
   * decía solo «A» o «B» bajo un encabezado en gris; tener dos controles para
   * elegir lo mismo obligaba a aprender los dos.
   *
   * Solo el servicio ofrece «todos»: «todos los grados de Primaria» no se puede
   * expresar con un único id de sección, y fingir que sí —mandando `todos`
   * cuando el usuario acotó a Primaria— generaría cargos a un colegio entero
   * creyendo que se acotó.
   */
  permitirTodos?: boolean;
}) {
  const todos = permitirTodos && valor === 'todos';
  const delPeriodo = useMemo(
    () => cursos.filter((c) => !periodoId || c.periodoId === periodoId),
    [cursos, periodoId],
  );

  /** La sección ya elegida, si la hay. Es la fuente de verdad de los otros dos. */
  const elegido = delPeriodo.find((c) => String(c.id) === valor) ?? null;

  // Servicio y grado a medio elegir, mientras todavía no hay sección. Son
  // estado de la interfaz, no del dato: el formulario del padre solo guarda la
  // sección, que es lo único que se matricula.
  const [servicioTanteo, setServicioTanteo] = useState<number | null>(null);
  const [gradoTanteo, setGradoTanteo] = useState<number | null>(null);

  const servicios = useMemo(() => {
    const m = new Map<number, { id: number; etiqueta: string }>();
    for (const c of delPeriodo) {
      if (!m.has(c.servicioId)) {
        m.set(c.servicioId, {
          id: c.servicioId,
          etiqueta: c.servicioTanda ? `${c.servicioNombre} · ${c.servicioTanda}` : c.servicioNombre,
        });
      }
    }
    return [...m.values()];
  }, [delPeriodo]);

  // Lo elegido manda sobre el tanteo: al abrir una matrícula existente, los tres
  // campos se rellenan solos desde su sección sin sincronizar nada a mano.
  const servicio = todos ? null : (elegido?.servicioId ?? servicioTanteo);
  const grado = todos ? null : (elegido?.gradoId ?? gradoTanteo);

  // Con un solo servicio no hay nada que decidir: se deja puesto. Obligar a
  // elegir entre uno es un clic que no aporta.
  useEffect(() => {
    if (todos) return;   // «Todos» es una elección, no un hueco que rellenar.
    if (servicio == null && servicios.length === 1) setServicioTanteo(servicios[0].id);
  }, [todos, servicio, servicios]);

  // Al cambiar de año escolar, la sección elegida es de otro año y ya no está
  // en la lista: se suelta todo en vez de dejar los campos enseñando algo que
  // no existe.
  //
  // Con el catálogo VACÍO no se suelta nada: vacío significa "todavía no ha
  // llegado", no "esa sección no existe". Sin esta guarda, abrir el diálogo
  // para editar borraba la sección guardada antes de que el fetch respondiera.
  useEffect(() => {
    if (cursos.length === 0) return;
    if (valor && valor !== 'todos' && !delPeriodo.some((c) => String(c.id) === valor)) {
      onChange(permitirTodos ? 'todos' : '');
    }
    setServicioTanteo(null);
    setGradoTanteo(null);
    // Solo cuando cambia el período: lo demás lo resuelve `elegido`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoId, cursos.length === 0]);

  const grados = useMemo(() => {
    if (servicio == null) return [];
    const m = new Map<number, { id: number; nombre: string }>();
    for (const c of delPeriodo) {
      if (c.servicioId === servicio && !m.has(c.gradoId)) m.set(c.gradoId, { id: c.gradoId, nombre: c.gradoNombre });
    }
    return [...m.values()];
  }, [delPeriodo, servicio]);

  const secciones = useMemo(
    () => (grado == null ? [] : delPeriodo.filter((c) => c.gradoId === grado)),
    [delPeriodo, grado],
  );

  /**
   * Cambiar servicio o grado suelta la sección a propósito.
   *
   * Se podría saltar a la primera del grado nuevo, pero entonces el formulario
   * quedaría con un curso que nadie eligió — y en una matrícula eso es meter a
   * un alumno en un aula por descuido. La excepción es cuando solo hay una
   * posible: ahí no se está eligiendo por él, no hay alternativa.
   */
  function elegirServicio(texto: string) {
    if (texto === 'todos') {
      setServicioTanteo(null);
      setGradoTanteo(null);
      onChange('todos');
      return;
    }
    const id = Number(texto) || null;
    onChange(permitirTodos && id == null ? 'todos' : '');
    setGradoTanteo(null);
    setServicioTanteo(id);
    if (id == null) return;
    const suyos = delPeriodo.filter((c) => c.servicioId === id);
    const gradosDe = [...new Set(suyos.map((c) => c.gradoId))];
    if (gradosDe.length === 1) {
      setGradoTanteo(gradosDe[0]);
      if (suyos.length === 1) onChange(String(suyos[0].id));
    }
  }

  function elegirGrado(texto: string) {
    const id = Number(texto) || null;
    onChange(permitirTodos ? 'todos' : '');
    setGradoTanteo(id);
    if (id == null) return;
    const suyas = delPeriodo.filter((c) => c.gradoId === id);
    if (suyas.length === 1) onChange(String(suyas[0].id));
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Servicio{permitirTodos ? '' : ' *'}</Label>
        <NativeSelect value={todos ? 'todos' : servicio != null ? String(servicio) : ''}
          disabled={disabled || servicios.length === 0}
          onChange={(e) => elegirServicio(e.target.value)}>
          {permitirTodos && <option value="todos">Todos los cursos</option>}
          <option value="">{servicios.length ? 'Elige…' : 'Sin servicios'}</option>
          {servicios.map((s) => <option key={s.id} value={String(s.id)}>{s.etiqueta}</option>)}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label>Grado{permitirTodos ? '' : ' *'}</Label>
        <NativeSelect value={grado != null ? String(grado) : ''}
          disabled={disabled || servicio == null}
          onChange={(e) => elegirGrado(e.target.value)}>
          <option value="">{todos ? 'Todos' : servicio == null ? 'Elige el servicio' : 'Elige…'}</option>
          {grados.map((g) => <option key={g.id} value={String(g.id)}>{g.nombre}</option>)}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label>Sección{permitirTodos ? '' : ' *'}</Label>
        <NativeSelect value={todos ? '' : valor} disabled={disabled || grado == null}
          onChange={(e) => onChange(e.target.value || (permitirTodos ? 'todos' : ''))}>
          <option value="">{todos ? 'Todas' : grado == null ? 'Elige el grado' : 'Elige…'}</option>
          {secciones.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
        </NativeSelect>
      </div>
    </div>
  );
}
