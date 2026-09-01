/**
 * La forma de los meses de una familia: lo que devuelve
 * `GET /api/administracion-escolar/responsables/[id]/periodos`.
 *
 * Vive aquí y no dentro del propio `route.ts` porque quien la consume es un
 * componente de cliente. Importar aunque sea el TIPO desde una ruta mete su
 * módulo en el grafo del cliente, y esa ruta arrastra `db`, la sesión y todo
 * lo demás: la pantalla dejaba de montar con un error de instanciación de
 * módulo, no con un error de tipos.
 *
 * Solo tipos, sin una línea de código: así ni el servidor ni el cliente se
 * llevan nada del otro por importarlo.
 */

export interface FilaMes {
  key: string;
  /** `previsto` = la cuota existe en el calendario pero todavía no es deuda. */
  tipo: 'cargo' | 'previsto';
  cargoId: number | null;
  cuotaId: number | null;
  conceptoId: number | null;
  concepto: string;
  mes: number | null;
  anio: number;
  fechaVencimiento: string | null;
  montoCentavos: number;
  /** 0 en un previsto: no se le debe nada de un cargo que no existe. */
  saldoCentavos: number;
  estado: string;
  ecfDocumentId: number | null;
  encf: string | null;
  codigo: string | null;
}

export interface PeriodoDeHijo {
  matriculaId: number;
  periodoId: number | null;
  periodo: string;
  curso: string;
  activo: boolean;
  facturaRecurrenteId: number | null;
  recurrenteEstado: string | null;
  recurrenteDiaCobro: number | null;
  recurrenteProxima: string | null;
  filas: FilaMes[];
  /** Lo que ya es deuda de este período. Los previstos no cuentan. */
  pendienteCentavos: number;
  /** Saldo de cargos que ya tienen factura y sí se puede cobrar. */
  porCobrarCentavos: number;
  /** Lo que va a salir y todavía no ha salido. */
  previstoCentavos: number;
}

export interface HijoConPeriodos {
  estudianteId: number;
  alumno: string;
  periodos: PeriodoDeHijo[];
}
