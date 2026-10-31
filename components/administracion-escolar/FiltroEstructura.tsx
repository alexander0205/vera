'use client';

import { useMemo } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { esGradoSinGrado } from '@/lib/administracion-escolar/sin-grado';
import {
  acotarFiltro, completarFiltro, normalizarFiltro, opcionesDelFiltro, SIN_GRADO,
  type CursoFiltrable, type FiltroGrupo,
} from '@/lib/administracion-escolar/filtro-curso';

/**
 * Filtrar un listado por la estructura del colegio: nivel (servicio + tanda),
 * grado y sección, en cascada.
 *
 * Cada pantalla filtraba el curso a su manera y casi todas mal: Estudiantes
 * ofrecía las secciones sueltas de todos los años («A», «B», «A», «B»… sin
 * decir de qué grado), y Documentos y Servicios comparaban la LETRA, así que
 * elegir «A» traía la A de todos los grados. Aquí se elige por id, siempre
 * dentro de un año escolar, y la lógica es la de «Cobrar a grupo»
 * (`filtro-curso.ts`), que ya estaba bien y probada.
 *
 * Pararse en cualquier nivel es un filtro completo: «Primaria» son todos sus
 * grados, «Primero» todas sus secciones. El grado y la sección solo aparecen
 * cuando tienen algo que elegir.
 *
 * No guarda nada: lo que se ve es el `filtro` del padre, recortado a lo que
 * existe ese año (un enlace viejo con un grado del año pasado no deja los
 * desplegables mintiendo).
 *
 * Quien no tiene grado también se puede pedir: «Sin grado» sale en el nivel y
 * trae a los de todos los servicios (ver `sin-grado.ts`).
 */
interface Props {
  /** El catálogo de secciones (`GET /cursos`). Las inactivas se esconden salvo la elegida. */
  cursos: (CursoFiltrable & { activo?: boolean | null; gradoActivo?: boolean | null; servicioActivo?: boolean | null })[];
  periodoId: number | null;
  filtro: FiltroGrupo;
  onChange: (filtro: FiltroGrupo) => void;
  /** Clase para cada desplegable (ancho). */
  className?: string;
  /**
   * Para las listas donde caben también los que no tienen matrícula, que no
   * dependen del catálogo: la opción sale siempre y con este nombre. Sin él sale
   * «Sin grado», y solo si este año hay alguien.
   */
  etiquetaSinGrado?: string;
}

const TODOS = 'todos';
const VALOR_SIN_GRADO = 'sin-grado';

export function FiltroEstructura({ cursos, periodoId, filtro, onChange, className = 'sm:w-44', etiquetaSinGrado }: Props) {
  const visibles = useMemo(
    () => cursos.filter((c) => c.id === filtro.cursoId
      || (c.activo !== false && c.gradoActivo !== false && c.servicioActivo !== false)),
    [cursos, filtro.cursoId],
  );
  const puesto = useMemo(
    () => normalizarFiltro(visibles, periodoId, completarFiltro(visibles, filtro)),
    [visibles, periodoId, filtro],
  );
  const { servicios, grados, secciones, haySinGrado } = useMemo(
    () => opcionesDelFiltro(visibles, periodoId, puesto), [visibles, periodoId, puesto],
  );

  const elegir = (nivel: 'servicio' | 'grado' | 'seccion', valor: string) =>
    onChange(acotarFiltro(puesto, nivel, valor === TODOS ? null : Number(valor)));

  const ofreceSinGrado = haySinGrado || etiquetaSinGrado != null;
  if (servicios.length === 0 && !ofreceSinGrado) return null;

  return (
    <>
      <Select value={puesto.sinGrado ? VALOR_SIN_GRADO : puesto.servicioId == null ? TODOS : String(puesto.servicioId)}
        onValueChange={(v) => (v === VALOR_SIN_GRADO ? onChange(SIN_GRADO) : elegir('servicio', v))}>
        <SelectTrigger className={className}><SelectValue placeholder="Nivel" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Nivel: Todos</SelectItem>
          {/* El servicio automático «Sin grado» ya va dentro de la opción de abajo. */}
          {servicios.filter((s) => !esGradoSinGrado(s.etiqueta)).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.etiqueta}</SelectItem>)}
          {ofreceSinGrado && <SelectItem value={VALOR_SIN_GRADO}>{etiquetaSinGrado ?? 'Sin grado'}</SelectItem>}
        </SelectContent>
      </Select>
      {puesto.servicioId != null && grados.length > 1 && (
        <Select value={puesto.gradoId == null ? TODOS : String(puesto.gradoId)} onValueChange={(v) => elegir('grado', v)}>
          <SelectTrigger className={className}><SelectValue placeholder="Grado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Grado: Todos</SelectItem>
            {grados.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {/* Un servicio de un solo grado salta directo a sus secciones: el grado
          se fija al elegir la sección. */}
      {puesto.servicioId != null && grados.length === 1 && seccionesDelUnicoGrado(visibles, periodoId, puesto).length > 1 && (
        <Select
          value={puesto.cursoId == null ? TODOS : String(puesto.cursoId)}
          onValueChange={(v) => {
            if (v === TODOS) { onChange(acotarFiltro(puesto, 'grado', null)); return; }
            onChange(acotarFiltro(acotarFiltro(puesto, 'grado', grados[0].id), 'seccion', Number(v)));
          }}
        >
          <SelectTrigger className={className}><SelectValue placeholder="Sección" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Sección: Todas</SelectItem>
            {seccionesDelUnicoGrado(visibles, periodoId, puesto).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {puesto.gradoId != null && grados.length > 1 && secciones.length > 1 && (
        <Select value={puesto.cursoId == null ? TODOS : String(puesto.cursoId)} onValueChange={(v) => elegir('seccion', v)}>
          <SelectTrigger className={className}><SelectValue placeholder="Sección" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Sección: Todas</SelectItem>
            {secciones.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </>
  );
}

function seccionesDelUnicoGrado(cursos: CursoFiltrable[], periodoId: number | null, filtro: FiltroGrupo) {
  return cursos.filter((c) => c.periodoId === periodoId && c.servicioId === filtro.servicioId);
}

/** El filtro leído de la URL (`?servicio=&grado=&curso=`); lo que no es un número se ignora. */
export function filtroDeUrl(params: { get(clave: string): string | null }): FiltroGrupo {
  const id = (k: string) => {
    const n = Number(params.get(k));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  if (params.get('sinGrado') === '1') return SIN_GRADO;
  return { servicioId: id('servicio'), gradoId: id('grado'), cursoId: id('curso') };
}

/** El filtro escrito para `setParams`: los niveles vacíos se borran de la URL. */
export function filtroAUrl(f: FiltroGrupo): Record<string, string | null> {
  return {
    servicio: f.servicioId == null ? null : String(f.servicioId),
    grado: f.gradoId == null ? null : String(f.gradoId),
    curso: f.cursoId == null ? null : String(f.cursoId),
    sinGrado: f.sinGrado ? '1' : null,
  };
}
