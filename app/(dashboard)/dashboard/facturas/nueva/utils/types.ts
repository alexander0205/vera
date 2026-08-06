// Tipos compartidos del formulario de Nueva Factura.

export interface Cliente {
  id:          number;
  razonSocial: string;
  rnc:         string | null;
  email:       string | null;
  telefono:    string | null;
  /** Todos los dependientes del cliente. Solo viene en resultados de búsqueda. */
  dependientes?: string[];
}

export interface Producto {
  id:          number;
  nombre:      string;
  descripcion: string | null;
  precioDOP:   number;
  tasaItbis:   string;
  tipo:        string;
  referencia:  string | null;
  // Inventario
  stockActual:          number;
  stockMinimo:          number;
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
}

/** Datos de un borrador guardado para pre-rellenar el form */
export interface BorradorInicial {
  id:                   number;
  tipoEcf:              string;
  clientId:             number | null;
  rncComprador:         string | null;
  razonSocialComprador: string | null;
  emailComprador:       string | null;
  telefonoComprador:    string | null;
  tipoPago:             number | null;
  fechaLimitePago:      string | null;
  /** Fecha de emisión guardada (YYYY-MM-DD) — para restaurar al editar. */
  fechaEmision:         string | null;
  ncfModificado:        string | null;
  notas:                string | null;
  terminosCondiciones:  string | null;
  pieFactura:           string | null;
  retenciones:          string | null; // JSON string
  comentario:           string | null;
  lineasJson:           string | null; // JSON string de ItemLinea[]
  dependienteId:        number | null;
  dependienteNombre:    string | null;
  // Metadatos de venta — para restaurar al editar un borrador
  almacenId?:           number | null;
  vendedorId?:          number | null;
  listaPreciosId?:      number | null;
  // Pago — para restaurar el split al editar un borrador.
  pagoRecibido?:        boolean;
  pagoFecha?:           string | null;
  pagoLineas?:          { metodo: string; valor: string; cuenta?: string; referencia?: string }[];
}

export interface ItemLinea {
  id: number;
  productoId?: number;
  nombreItem: string;
  referencia: string;
  descripcionItem: string;
  cantidadItem: number;
  precioUnitarioItem: number;
  descuentoPct: number;
  tasaItbis: 'exento' | '0.18' | '0.16' | '0';
  indicadorBienoServicio: '1' | '2';
  unidadMedida?: string;
  /** Beneficiario por línea (dependiente del cliente). */
  dependienteId?: number | null;
  dependienteNombre?: string;
}

export interface ResultadoEmision {
  ok:              boolean;
  modo:            'emitir' | 'borrador';
  encf?:           string;
  trackId?:        string;
  estado:          string;
  codigoSeguridad?: string;
  montoTotal?:     number;
  documentoId:     number;
  pagoRecibido?:   boolean;
  pagoMetodo?:     string | null;
  pagoValor?:      number | null;
}

export interface Retencion {
  id:          string;
  nombre:      string;
  porcentaje:  number;
  tipo:        'itbis' | 'isr' | 'otro';
  monto:       number;
  manual:      boolean;
}

export interface SecuenciaInfo {
  id?:               number;
  encf:              string | null;
  numero?:           number;
  disponibles:       number;
  agotada:           boolean;
  vencida?:          boolean;
  sinSecuencia?:     boolean;
  sinNcf?:           boolean;
  fechaVencimiento?: string;
  pieDeFactura?:     string | null;
  hasta?:            number;
}

export interface Plazo {
  id:        string;
  label:     string;
  dgiiTipo:  number;        // 1=contado, 2=crédito, 3=gratuito, 4=uso
  dias:      number | null; // null = sin auto-cálculo
  esManual?: boolean;
  custom?:   boolean;
}

export interface EmpresaPerfil {
  razonSocial:     string | null;
  nombreComercial: string | null;
  logo:            string | null;
  rnc:             string | null;
  firma:           string | null;
  // Config de recargo por mora (para avisar términos al elegir crédito)
  recargoMoraActivo?:     boolean;
  recargoMoraPorcentaje?: number;  // basis points
  recargoMoraDiasGracia?: number;
  // Plazo de pago por defecto. null = de contado; N = crédito a N días.
  plazoPagoDefaultDias?:  number | null;
  // Toggle empresa: alerta double-check del método de pago (combina con permiso).
  alertaMetodoPagoActivo?: boolean;
  // Términos y condiciones que se precargan en un comprobante NUEVO.
  terminosCondicionesDefault?: string | null;
}

export const PLAZOS_BASE: Plazo[] = [
  { id: 'contado',  label: 'De contado',         dgiiTipo: 1, dias: null            },
  { id: '8d',       label: '8 días',             dgiiTipo: 2, dias: 8               },
  { id: '15d',      label: '15 días',            dgiiTipo: 2, dias: 15              },
  { id: '30d',      label: '30 días',            dgiiTipo: 2, dias: 30              },
  { id: '60d',      label: '60 días',            dgiiTipo: 2, dias: 60              },
  { id: 'manual',   label: 'Vencimiento manual', dgiiTipo: 2, dias: null, esManual: true },
  { id: 'gratuito', label: 'Gratuito',           dgiiTipo: 3, dias: null            },
  { id: 'uso',      label: 'Uso o Consumo',      dgiiTipo: 4, dias: null            },
];

export const TASA_ITBIS = [
  { value: '0.18',  label: 'ITBIS 18%' },
  { value: '0.16',  label: 'ITBIS 16%' },
  { value: '0',     label: 'ITBIS 0%' },
  { value: 'exento', label: 'Exento' },
];

export const RETENCIONES_PREDEFINIDAS = [
  // ITBIS
  { id: 'itbis_30',  nombre: 'Retención ITBIS',         porcentaje: 30,  tipo: 'itbis' as const, descripcion: 'Retención 30% del ITBIS (Estado y entidades públicas)' },
  { id: 'itbis_75',  nombre: 'Retención ITBIS',         porcentaje: 75,  tipo: 'itbis' as const, descripcion: 'Retención 75% del ITBIS (Grandes Contribuyentes designados)' },
  { id: 'itbis_100', nombre: 'Retención ITBIS',         porcentaje: 100, tipo: 'itbis' as const, descripcion: 'Retención 100% del ITBIS' },
  // ISR
  { id: 'isr_alq',   nombre: 'Alquileres',              porcentaje: 10,  tipo: 'isr'   as const, descripcion: 'ISR sobre alquileres pagados a personas físicas (10%)' },
  { id: 'isr_hon',   nombre: 'Honorarios por servicios', porcentaje: 10, tipo: 'isr'   as const, descripcion: 'ISR honorarios profesionales y servicios (10%)' },
  { id: 'isr_otras', nombre: 'Otras rentas',            porcentaje: 10,  tipo: 'isr'   as const, descripcion: 'ISR otras rentas (10%)' },
  { id: 'isr_div',   nombre: 'Dividendos',              porcentaje: 10,  tipo: 'isr'   as const, descripcion: 'ISR retención dividendos (10%)' },
];
