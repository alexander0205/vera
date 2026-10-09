import { describe, expect, it } from 'vitest';
import {
  CONFIG_DEFAULT, ensamblarContrato, validarContratoEstructuradoRD,
  type EmpleadoContratoExt,
} from '@/lib/nomina/contrato-estructura';

const empleado: EmpleadoContratoExt = {
  nombres: 'Carmen', apellidos: 'Jiménez', cedula: '00112345678', cargo: 'Directora',
  salarioBaseCents: 5_000_000, tipoContrato: 'indefinido', frecuenciaPago: 'mensual',
  fechaIngreso: '2026-01-15', jornada: 'tiempo_completo', turno: 'diurno', diasLibres: 'domingo', vacacionesDias: 14,
  sexo: 'femenino', fechaNacimiento: '1990-01-01', nacionalidad: 'dominicana', estadoCivil: 'soltera', direccion: 'Calle 1, Santo Domingo',
  fechaFinContrato: null, objetoContrato: null,
};
const empresa = {
  nombre: 'ACME SRL', rnc: '130123456', direccion: 'Av. Siempre Viva 1',
  representanteNombre: 'Ana Pérez', representanteCedula: '00111111111',
};
const config = { ...CONFIG_DEFAULT, lugarTrabajo: 'Av. Siempre Viva 1', jornadaTexto: 'lunes a viernes, 8:00 a.m. a 5:00 p.m.' };

describe('modelo estructurado de contrato RD', () => {
  it('exige los extremos del art. 24 antes de emitir', () => {
    expect(validarContratoEstructuradoRD(config, empleado, empresa)).toEqual([]);
    expect(validarContratoEstructuradoRD(config, { ...empleado, direccion: null }, empresa)).toContain('dirección de residencia del trabajador');
  });

  it('documenta modalidad indefinida y no inventa período de prueba', () => {
    const cuerpo = ensamblarContrato(config, empleado, empresa, '2026-08-27');
    expect(cuerpo).toContain('por tiempo indefinido');
    expect(cuerpo).toContain('Ana Pérez');
    expect(cuerpo).not.toContain('período de prueba');
    expect(cuerpo).not.toContain('artículo 80');
  });

  it('exige fecha final en contrato temporal y obra en contrato por obra', () => {
    expect(validarContratoEstructuradoRD(config, { ...empleado, tipoContrato: 'temporal' }, empresa)).toContain('fecha de finalización del contrato temporal');
    expect(validarContratoEstructuradoRD(config, { ...empleado, tipoContrato: 'por_obra' }, empresa)).toContain('obra o servicio determinado');
  });
});

describe('texto libre dentro del contrato', () => {
  it('no duplica el punto cuando quien escribe la plantilla ya lo puso', () => {
    const conPuntos = {
      ...config,
      incluirFunciones: true,
      funciones: 'Impartir docencia y acompañar a los padres.',
      lugarTrabajo: 'el plantel de Santo Domingo Este.',
      jornadaTexto: 'de 7:30 a.m. a 3:30 p.m.',
    };
    const cuerpo = ensamblarContrato(conPuntos, empleado, empresa, '2026-09-12');
    expect(cuerpo).not.toContain('..');
    expect(cuerpo).toContain('acompañar a los padres.');
    expect(cuerpo).toContain('3:30 p.m.');
  });
});
