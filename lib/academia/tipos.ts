/** Lo que viaja de la Academia al navegador. Sin la transcripción, que pesa. */
export interface VideoLista {
  id: number;
  slug: string;
  titulo: string;
  descripcion: string;
  modulo: string;
  pantalla: string | null;
  duracionSeg: number;
  vimeoId: string;
  vimeoHash: string | null;
  miniaturaUrl: string | null;
  publicado: boolean;
  visto: boolean;
  avanceSeg: number;
}

export interface VideoDetalle extends VideoLista {
  capitulos: { t: number; titulo: string }[];
  transcripcion: { t: number; texto: string }[];
}

/** Un resultado del buscador. */
export interface ResultadoLista {
  video: VideoLista;
  /** El tramo que responde, o `null` si solo coincidió el título o la descripción. */
  momento: { t: number; texto: string } | null;
}
