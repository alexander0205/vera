/**
 * Provincias y municipios de la República Dominicana
 * Fuente: División Territorial oficial DGII / ONE
 */

export interface ProvinciaData {
  nombre: string;
  municipios: string[];
}

export const PROVINCIAS: ProvinciaData[] = [
  {
    nombre: 'Distrito Nacional',
    municipios: ['Santo Domingo de Guzmán'],
  },
  {
    nombre: 'Azua',
    municipios: [
      'Azua de Compostela', 'Las Charcas', 'Las Yayas de Viajama',
      'Padre Las Casas', 'Peralta', 'Sabana Yegua', 'Pueblo Viejo',
      'Tábara Arriba', 'Yayas de Viajama',
    ],
  },
  {
    nombre: 'Bahoruco',
    municipios: ['Neyba', 'Galván', 'Los Ríos', 'Tamayo', 'Villa Jaragua'],
  },
  {
    nombre: 'Barahona',
    municipios: [
      'Barahona', 'Cabral', 'El Peñón', 'Enriquillo', 'Fundación',
      'Jaquimeyes', 'La Ciénaga', 'Las Salinas', 'Paraíso', 'Polo', 'Vincchio',
    ],
  },
  {
    nombre: 'Dajabón',
    municipios: ['Dajabón', 'El Pino', 'Loma de Cabrera', 'Partido', 'Restauración'],
  },
  {
    nombre: 'Duarte',
    municipios: [
      'San Francisco de Macorís', 'Arenoso', 'Castillo',
      'Eugenio María de Hostos', 'Las Guaranas', 'Pimentel', 'Villa Riva',
    ],
  },
  {
    nombre: 'El Seibo',
    municipios: ['El Seibo', 'Miches'],
  },
  {
    nombre: 'Elías Piña',
    municipios: [
      'Comendador', 'Bánica', 'El Llano', 'Hondo Valle',
      'Juan Santiago', 'Pedro Santana',
    ],
  },
  {
    nombre: 'Espaillat',
    municipios: ['Moca', 'Cayetano Germosén', 'Gaspar Hernández', 'Jamao al Norte'],
  },
  {
    nombre: 'Hato Mayor',
    municipios: ['Hato Mayor del Rey', 'El Valle', 'Sabana de la Mar'],
  },
  {
    nombre: 'Hermanas Mirabal',
    municipios: ['Salcedo', 'Tenares', 'Villa Tapia'],
  },
  {
    nombre: 'Independencia',
    municipios: [
      'Jimaní', 'Cristóbal', 'Duvergé', 'La Descubierta', 'Mella', 'Postrer Río',
    ],
  },
  {
    nombre: 'La Altagracia',
    municipios: ['Higüey', 'San Rafael del Yuma'],
  },
  {
    nombre: 'La Romana',
    municipios: ['La Romana', 'Casa de Campo', 'Guaymate', 'Villa Hermosa'],
  },
  {
    nombre: 'La Vega',
    municipios: ['Concepción de La Vega', 'Constanza', 'Jarabacoa', 'Jima Abajo'],
  },
  {
    nombre: 'María Trinidad Sánchez',
    municipios: ['Nagua', 'Cabrera', 'El Factor', 'Río San Juan'],
  },
  {
    nombre: 'Monseñor Nouel',
    municipios: ['Bonao', 'Maimón', 'Piedra Blanca'],
  },
  {
    nombre: 'Monte Cristi',
    municipios: [
      'Monte Cristi', 'Castañuelas', 'Guayubín', 'Las Matas de Santa Cruz',
      'Pepillo Salcedo', 'Villa Vásquez',
    ],
  },
  {
    nombre: 'Monte Plata',
    municipios: [
      'Monte Plata', 'Bayaguana', 'Peralvillo', 'Rancho Arriba',
      'Sabana Grande de Boyá', 'Yamasá',
    ],
  },
  {
    nombre: 'Pedernales',
    municipios: ['Pedernales', 'Oviedo'],
  },
  {
    nombre: 'Peravia',
    municipios: ['Baní', 'Nizao'],
  },
  {
    nombre: 'Puerto Plata',
    municipios: [
      'Puerto Plata', 'Altamira', 'Guananico', 'Imbert', 'Los Hidalgos',
      'Luperón', 'Sosúa', 'Villa Isabela', 'Villa Montellano',
    ],
  },
  {
    nombre: 'Samaná',
    municipios: ['Samaná', 'Las Galeras', 'Las Terrenas', 'Sánchez'],
  },
  {
    nombre: 'San Cristóbal',
    municipios: [
      'San Cristóbal', 'Bajos de Haina', 'Cambita Garabitos', 'Los Cacaos',
      'Palenque', 'San Gregorio de Nigua', 'Villa Altagracia', 'Yaguate',
    ],
  },
  {
    nombre: 'San José de Ocoa',
    municipios: ['San José de Ocoa', 'Rancho Arriba', 'Sabana Larga'],
  },
  {
    nombre: 'San Juan',
    municipios: [
      'San Juan de la Maguana', 'Bohechío', 'El Cercado',
      'Juan de Herrera', 'Las Matas de Farfán', 'Vallejuelo',
    ],
  },
  {
    nombre: 'San Pedro de Macorís',
    municipios: [
      'San Pedro de Macorís', 'Consuelo', 'Guayacanes',
      'Quisqueya', 'Ramón Santana', 'San José de Los Llanos',
    ],
  },
  {
    nombre: 'Sánchez Ramírez',
    municipios: ['Cotuí', 'Cevicos', 'Fantino', 'La Mata'],
  },
  {
    nombre: 'Santiago',
    municipios: [
      'Santiago de los Caballeros', 'Bisonó', 'Jánico', 'Licey al Medio',
      'Puñal', 'Sabana Iglesia', 'San José de Las Matas', 'Tamboril', 'Villa González',
    ],
  },
  {
    nombre: 'Santiago Rodríguez',
    municipios: ['Sabaneta', 'Monción', 'San Ignacio de Sabaneta'],
  },
  {
    nombre: 'Santo Domingo',
    municipios: [
      'Santo Domingo Este', 'Boca Chica', 'Los Alcarrizos',
      'Pedro Brand', 'San Antonio de Guerra', 'Santo Domingo Norte', 'Santo Domingo Oeste',
    ],
  },
  {
    nombre: 'Valverde',
    municipios: ['Mao', 'Esperanza', 'Laguna Salada'],
  },
];

/** Devuelve los municipios de una provincia, o [] si no se encuentra. */
export function getMunicipios(provinciaNombre: string): string[] {
  return PROVINCIAS.find(p => p.nombre === provinciaNombre)?.municipios ?? [];
}
