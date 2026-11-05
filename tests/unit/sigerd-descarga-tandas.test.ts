/**
 * La descarga de SIGERD por tandas: `iniciarDescarga` deja la lista de lo que
 * falta, `avanzarDescarga` la recorre hasta el plazo y se puede retomar con
 * otra sesión, y `armarDump` da el mismo volcado que la descarga de una vez.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llamadas = vi.hoisted(() => ({ fichaEstudiante: [] as { id: number; precargar?: boolean }[], fichaPersonal: [] as number[], condicion: 0 }));

const arbol = () => ({
  idRegional: 10, idDistrito: 3, idCentro: 1001,
  servicios: [
    {
      idServicio: 1,
      grados: [
        { idGrado: 11, secciones: [{ idSeccion: 111, estudiantes: [{ id: 1 }, { id: 2 }] }, { idSeccion: 112, estudiantes: [{ id: 3 }] }] },
        { idGrado: 12, secciones: [{ idSeccion: 121, estudiantes: [{ id: 3 }, { id: 4 }] }] },
      ],
    },
  ],
  totales: { servicios: 1, grados: 2, secciones: 3, estudiantes: 5, seccionesConError: 0 },
});

vi.mock('@/lib/sigerd/sync', () => ({ recopilarCentro: async () => arbol() }));
vi.mock('@/lib/sigerd/consultas', () => ({
  condicionFinalPorSeccion: async (_c: unknown, p: { idSeccion: number }) => { llamadas.condicion++; return { rows: [{ seccion: p.idSeccion }] }; },
}));
vi.mock('@/lib/sigerd/ficha', () => ({
  traerFichaEstudiante: async (_c: unknown, id: number, o: { precargar?: boolean }) => {
    llamadas.fichaEstudiante.push({ id, precargar: o.precargar });
    return { idSigerd: id };
  },
}));
vi.mock('@/lib/sigerd/ficha-personal', () => ({
  traerFichaPersonal: async (_c: unknown, id: number) => { llamadas.fichaPersonal.push(id); return { idPersona: id }; },
}));
vi.mock('@/lib/sigerd/parientes', () => ({ traerParientesEstudiante: async () => [] }));
vi.mock('@/lib/sigerd/personal', () => ({
  contextoCentroSesion: async () => ({ idRegional: 10, idDistrito: 3, idCentro: 1001 }),
  // El grid repite a la persona 7 por tener dos puestos.
  personalDeCentro: async () => [{ Id: 7 }, { Id: 8 }, { Id: 7 }],
  catalogoPuestos: async () => [{ id: 1 }],
}));

const cli = {} as never;
const todo = { anoAcademico: 26, conCondicionFinal: true, conFichaPersonal: true, conFichaEstudiante: true };

beforeEach(() => {
  llamadas.fichaEstudiante = [];
  llamadas.fichaPersonal = [];
  llamadas.condicion = 0;
});

describe('iniciarDescarga', () => {
  it('trae la estructura y el personal, y deja en lista lo pesado sin pedirlo', async () => {
    const { iniciarDescarga } = await import('@/lib/sigerd/descargar');
    const p = await iniciarDescarga(cli, todo);

    expect(p.pendientes.filter((t) => t.tipo === 'condicion')).toHaveLength(3);
    // La persona repetida en el grid tiene una sola ficha.
    expect(p.pendientes.filter((t) => t.tipo === 'ficha-personal').map((t) => (t as { id: number }).id)).toEqual([7, 8]);
    // El estudiante 3 sale en dos secciones: una sola ficha.
    expect(p.pendientes.filter((t) => t.tipo === 'ficha-estudiante').map((t) => (t as { id: number }).id)).toEqual([1, 2, 3, 4]);
    expect(p.total).toBe(9);
    expect(llamadas.fichaEstudiante).toHaveLength(0);
    expect(llamadas.condicion).toBe(0);
  });

  it('sin fichas pedidas no deja nada pendiente', async () => {
    const { iniciarDescarga } = await import('@/lib/sigerd/descargar');
    const p = await iniciarDescarga(cli, { anoAcademico: 26 });
    expect(p.pendientes).toEqual([]);
  });
});

describe('avanzarDescarga', () => {
  it('para en el plazo y otra llamada sigue donde quedó, sin repetir', async () => {
    const { iniciarDescarga, avanzarDescarga } = await import('@/lib/sigerd/descargar');
    const p = await iniciarDescarga(cli, todo);

    // Plazo ya vencido: no hace nada.
    expect(await avanzarDescarga(cli, p, Date.now() - 1)).toBe(0);
    expect(p.pendientes).toHaveLength(9);

    // Retomar con la lista guardada como JSON, como entre dos llamadas.
    const retomada = JSON.parse(JSON.stringify(p));
    expect(await avanzarDescarga(cli, retomada, Infinity)).toBe(9);
    expect(retomada.pendientes).toEqual([]);
    expect(llamadas.fichaEstudiante.map((f) => f.id)).toEqual([1, 2, 3, 4]);
    expect(llamadas.fichaPersonal).toEqual([7, 8]);
    expect(retomada.estructura.servicios[0].grados[1].secciones[0].condicionFinal).toEqual([{ seccion: 121 }]);
  });

  it('abre el módulo del portal solo con la primera ficha de cada llamada', async () => {
    const { iniciarDescarga, avanzarDescarga } = await import('@/lib/sigerd/descargar');
    const p = await iniciarDescarga(cli, { anoAcademico: 26, conFichaEstudiante: true });

    // Primera llamada: dos fichas (el plazo se cierra tras la segunda).
    let n = 0;
    const real = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => (n++ < 2 ? real() : real() + 10_000_000));
    await avanzarDescarga(cli, p, real() + 1000);
    vi.restoreAllMocks();
    // Segunda llamada (otra sesión): vuelve a abrir el módulo una vez.
    await avanzarDescarga(cli, p, Infinity);

    expect(llamadas.fichaEstudiante.map((f) => f.precargar)).toEqual([true, false, true, false]);
  });
});

describe('armarDump', () => {
  it('da los mismos totales que la descarga de una vez', async () => {
    const { iniciarDescarga, avanzarDescarga, armarDump, descargarTodo } = await import('@/lib/sigerd/descargar');
    const p = await iniciarDescarga(cli, todo);
    await avanzarDescarga(cli, p, Infinity);
    const porTandas = armarDump(p);
    const deUnaVez = await descargarTodo(cli, todo);

    expect(porTandas.totales).toEqual(deUnaVez.totales);
    expect(porTandas.totales).toMatchObject({ estudiantes: 5, empleados: 3, nFichasEstudiante: 4, nParientes: 0 });
    expect(porTandas.contexto).toEqual({ idRegional: 10, idDistrito: 3, idCentro: 1001 });
  });
});
