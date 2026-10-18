/**
 * `server.json` de Zero para el registro oficial de MCP.
 *
 * El formato es el del esquema `2025-12-11` del registro
 * (https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).
 * Piezas que importan:
 *
 *  - `name` lleva el espacio `do.com.zero` (el dominio `zero.com.do` al revés),
 *    que el registro verifica por un registro TXT en el DNS antes de aceptar la
 *    publicación. Mientras eso no esté hecho, este archivo describe el servidor
 *    pero no está publicado en el registro.
 *  - `description` admite 100 caracteres como máximo.
 *  - `remotes` declara un servidor remoto (sin paquete que instalar) con la
 *    cabecera `Authorization`, que el cliente le pide a la persona y trata como
 *    secreto.
 */

import { ESQUEMA_SERVER_JSON, MCP_BASE, MCP_URL, NOMBRE_EN_REGISTRO } from './conector';
import { SERVIDOR_MCP } from './herramientas';

export const DESCRIPCION_SERVER_JSON =
  'Consulta clientes, facturas, cobros y cuentas por cobrar de tu empresa en Zero. Solo lectura.';

export type ServerJson = {
  $schema: string;
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string;
  remotes: {
    type: 'streamable-http';
    url: string;
    headers: { name: string; description: string; isRequired: boolean; isSecret: boolean; placeholder: string }[];
  }[];
};

export function serverJson(): ServerJson {
  return {
    $schema: ESQUEMA_SERVER_JSON,
    name: NOMBRE_EN_REGISTRO,
    title: SERVIDOR_MCP.titulo,
    description: DESCRIPCION_SERVER_JSON,
    version: SERVIDOR_MCP.version,
    websiteUrl: MCP_BASE,
    remotes: [
      {
        type: 'streamable-http',
        url: MCP_URL,
        headers: [
          {
            name: 'Authorization',
            description:
              'Llave de API de la empresa, con el formato «Bearer emdo_…». Se crea en Zero → Configuración → Llaves de API, con permiso de lectura.',
            isRequired: true,
            isSecret: true,
            placeholder: 'Bearer emdo_TU_LLAVE',
          },
        ],
      },
    ],
  };
}
