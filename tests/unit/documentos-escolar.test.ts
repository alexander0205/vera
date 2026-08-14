import { describe, it, expect } from 'vitest';
import {
  resumirChecklist, mismoNivel, normalizarNivel, SEMILLA_DOCUMENTOS,
  type FilaChecklist, type Exigencia, type EstadoDocumento,
} from '@/lib/administracion-escolar/documentos';

function fila(exigencia: Exigencia, estado: EstadoDocumento): FilaChecklist {
  return {
    requeridoId: 1, nombre: 'x', exigencia, cantidad: 1, orden: 0,
    entregadoId: null, estado, archivos: [],
    subidoEn: null, subidoFamilia: false, aprobadoEn: null, aprobadoPor: null, motivo: null,
    esExtra: false, formulario: null,
  };
}

describe('normalizarNivel', () => {
  it('ignora mayúsculas, acentos y espacios', () => {
    expect(normalizarNivel('  PRIMÁRIO ')).toBe('primario');
    expect(mismoNivel('Inicial', 'inicial')).toBe(true);
    expect(mismoNivel('Secundario', 'Primario')).toBe(false);
  });

  it('trata null y vacío como el mismo nivel ausente', () => {
    expect(mismoNivel(null, undefined)).toBe(true);
    expect(mismoNivel(null, '')).toBe(true);
  });
});

describe('resumirChecklist', () => {
  it('un requerido subido pero sin aprobar todavía falta', () => {
    // El punto del flujo: recibir no es aprobar. Si `recibido` contara como
    // hecho, bastaría con que la familia subiera cualquier archivo para que la
    // matrícula figurara completa sin que nadie lo mirara.
    const r = resumirChecklist([fila('requerido', 'recibido')]);
    expect(r.faltanRequeridos).toBe(1);
    expect(r.porAprobar).toBe(1);
    expect(r.completa).toBe(false);
  });

  it('un requerido aprobado ya no falta', () => {
    const r = resumirChecklist([fila('requerido', 'aprobado')]);
    expect(r.faltanRequeridos).toBe(0);
    expect(r.completa).toBe(true);
  });

  it('un requerido rechazado vuelve a faltar', () => {
    const r = resumirChecklist([fila('requerido', 'rechazado')]);
    expect(r.faltanRequeridos).toBe(1);
    expect(r.completa).toBe(false);
  });

  it('un "si aplica" en pendiente deja la matrícula incompleta', () => {
    // "Si aplica" no es "opcional": nadie ha decidido todavía si al alumno le
    // toca. Tratarlo como opcional escondería documentos sin revisar.
    const r = resumirChecklist([fila('si_aplica', 'pendiente')]);
    expect(r.sinResolver).toBe(1);
    expect(r.faltanRequeridos).toBe(0);
    expect(r.completa).toBe(false);
  });

  it('un "si aplica" marcado no aplica queda resuelto', () => {
    const r = resumirChecklist([fila('si_aplica', 'no_aplica')]);
    expect(r.sinResolver).toBe(0);
    expect(r.resueltos).toBe(1);
    expect(r.completa).toBe(true);
  });

  it('un "si aplica" aprobado también queda resuelto', () => {
    const r = resumirChecklist([fila('si_aplica', 'aprobado')]);
    expect(r.sinResolver).toBe(0);
    expect(r.completa).toBe(true);
  });

  it('cuenta una lista mezclada', () => {
    const r = resumirChecklist([
      fila('requerido', 'aprobado'),
      fila('requerido', 'recibido'),
      fila('requerido', 'pendiente'),
      fila('si_aplica', 'no_aplica'),
      fila('si_aplica', 'pendiente'),
    ]);
    expect(r.total).toBe(5);
    expect(r.resueltos).toBe(2);
    expect(r.faltanRequeridos).toBe(2);
    expect(r.sinResolver).toBe(1);
    expect(r.porAprobar).toBe(1);
    expect(r.completa).toBe(false);
  });

  it('una lista vacía está completa', () => {
    const r = resumirChecklist([]);
    expect(r.completa).toBe(true);
    expect(r.total).toBe(0);
  });
});

describe('semilla', () => {
  it('no repite el mismo documento dentro de un nivel y tipo', () => {
    const vistos = new Set<string>();
    for (const d of SEMILLA_DOCUMENTOS) {
      const clave = `${normalizarNivel(d.nivel)}|${d.tipo}|${d.nombre.toLowerCase()}`;
      expect(vistos.has(clave), `duplicado: ${clave}`).toBe(false);
      vistos.add(clave);
    }
  });

  it('las fotos 2x2 llevan cantidad distinta según el tipo', () => {
    const nuevo = SEMILLA_DOCUMENTOS.find(
      (d) => d.nivel === 'Inicial' && d.tipo === 'nuevo' && d.nombre === 'Fotos 2x2');
    const re = SEMILLA_DOCUMENTOS.find(
      (d) => d.nivel === 'Inicial' && d.tipo === 'reinscripcion' && d.nombre === 'Fotos 2x2');
    expect(nuevo?.cantidad).toBe(3);
    expect(re?.cantidad).toBe(2);
  });

  it('Inicial marca "si aplica" lo que depende del centro anterior', () => {
    const siAplica = SEMILLA_DOCUMENTOS
      .filter((d) => d.nivel === 'Inicial' && d.tipo === 'nuevo' && d.exigencia === 'si_aplica')
      .map((d) => d.nombre);
    expect(siAplica).toHaveLength(4);
    expect(siAplica).toContain('Historial del SIGERD');
  });
});
