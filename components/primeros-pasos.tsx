/**
 * Lo que ve una empresa que todavía no ha facturado nada.
 *
 * Antes veía el panel completo con todo en cero —RD$0.00, 0 comprobantes, 0
 * secuencias— y encima un aviso rojo de «Sin secuencias disponibles». Los
 * ceros no informan de nada cuando no hay historia que resumir, y el aviso
 * rojo dice que algo está ROTO cuando en realidad no ha empezado. La primera
 * pantalla del sistema no debería parecer una avería.
 *
 * Esto lo cambia por lo único útil en ese momento: qué hay que hacer, en qué
 * orden, y qué está hecho ya.
 *
 * Se calcula en el servidor con los datos que el panel ya trae. No es el
 * `OnboardingChecklist`, que pide su estado por `fetch` después de pintar —de
 * ahí que parpadee— y que se puede esconder para siempre con un clic. Estos
 * pasos no se esconden: mientras no haya un comprobante emitido, esto ES el
 * panel.
 */

import Link from 'next/link';
import { Check, FileCheck2, Package, Users, Receipt, ArrowRight } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import MuiButton from '@mui/material/Button';

export interface EstadoPrimerosPasos {
  tieneCertificado: boolean;
  secuenciasDisponibles: number;
  productos: number;
  clientes: number;
}

interface Paso {
  clave: string;
  titulo: string;
  detalle: string;
  href: string;
  cta: string;
  icono: typeof Users;
  hecho: boolean;
}

/**
 * El orden NO es cosmético: es el orden en que las cosas se desbloquean.
 *
 * La DGII va primera porque sin certificado y sin secuencias no hay factura
 * que valga, por muchos clientes y productos que se carguen. Lo que se vende
 * va antes que a quién, porque una factura sin líneas no existe y un cliente
 * sin nada que venderle tampoco sirve todavía.
 */
export function pasosDe(estado: EstadoPrimerosPasos, tieneFacturas: boolean): Paso[] {
  return [
    {
      clave: 'dgii',
      titulo: 'Habilítate ante la DGII',
      detalle:
        'Sube tu certificado digital y registra las secuencias de e-NCF que te asignaron. '
        + 'Sin esto los comprobantes no tienen validez fiscal.',
      href: '/dashboard/habilitacion',
      cta: 'Empezar habilitación',
      icono: FileCheck2,
      hecho: estado.tieneCertificado && estado.secuenciasDisponibles > 0,
    },
    {
      clave: 'productos',
      titulo: 'Registra lo que vendes',
      detalle:
        'Tus productos o servicios, con su precio y su ITBIS. Es lo que después eliges '
        + 'al armar una factura, en vez de escribirlo cada vez.',
      href: '/dashboard/productos',
      cta: 'Agregar productos',
      icono: Package,
      hecho: estado.productos > 0,
    },
    {
      clave: 'clientes',
      titulo: 'Agrega tus clientes',
      detalle:
        'Con el RNC o la cédula. Lo buscamos en el padrón de la DGII y te traemos el '
        + 'nombre ya escrito como está registrado.',
      href: '/dashboard/clientes',
      cta: 'Agregar clientes',
      icono: Users,
      hecho: estado.clientes > 0,
    },
    {
      clave: 'factura',
      titulo: 'Emite tu primera factura',
      detalle: 'Sale con su e-NCF y viaja a la DGII sola. Aquí verás si fue aceptada.',
      href: '/dashboard/facturas/nueva',
      cta: 'Nueva factura',
      icono: Receipt,
      hecho: tieneFacturas,
    },
  ];
}

export function PrimerosPasos({ estado }: { estado: EstadoPrimerosPasos }) {
  const pasos = pasosDe(estado, false);
  const hechos = pasos.filter(p => p.hecho).length;

  // El primero sin hacer es el único con botón lleno. Cuatro botones azules a
  // la vez no son cuatro invitaciones: son ninguna.
  const siguiente = pasos.find(p => !p.hecho);

  return (
    <Box sx={{ maxWidth: 780 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {/* Sin el nombre de la empresa a propósito. Metido en la frase daba
              «Vamos a poner a CENTRO DE ESTUDIO TRANSNACIONAL DE HISPANOAMERICA
              CETHA SRL a facturar»: los nombres legales dominicanos son largos
              y van en mayúsculas, y dentro de un titular gritan. Además ya está
              arriba, en el selector de empresa. */}
          Vamos a ponerte a facturar
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Cuatro pasos. Cuando emitas la primera factura, esta pantalla pasa a ser tu panel
          con ingresos, cobros y comprobantes.
        </Typography>

        {/* La cuenta solo aparece cuando hay algo que contar: «0 de 4» el primer
            día es un cero más, y de esos ya venimos. */}
        {hechos > 0 && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, fontWeight: 600, color: 'primary.main' }}>
            {hechos} de {pasos.length} listos
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {pasos.map((p, i) => {
          const esSiguiente = p.clave === siguiente?.clave;
          const Icono = p.icono;
          return (
            <Paper
              key={p.clave}
              variant="outlined"
              sx={{
                borderRadius: '14px',
                p: 2.5,
                display: 'flex',
                gap: 2,
                alignItems: 'flex-start',
                borderColor: esSiguiente ? 'primary.main' : 'divider',
                bgcolor: p.hecho ? 'action.hover' : 'background.paper',
              }}
            >
              {/* Número o palomita. El número importa: dice que hay un orden y
                  que este es su sitio en la fila. */}
              <Box
                sx={{
                  flexShrink: 0,
                  width: 34, height: 34,
                  borderRadius: '10px',
                  display: 'grid', placeItems: 'center',
                  bgcolor: p.hecho ? 'success.main' : esSiguiente ? 'primary.main' : 'action.selected',
                  color: p.hecho || esSiguiente ? '#fff' : 'text.secondary',
                  fontWeight: 700, fontSize: 14,
                }}
              >
                {p.hecho ? <Check style={{ width: 18, height: 18 }} /> : i + 1}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Icono style={{ width: 16, height: 16, opacity: 0.55 }} />
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: p.hecho ? 'text.secondary' : 'text.primary',
                      textDecoration: p.hecho ? 'line-through' : 'none',
                    }}
                  >
                    {p.titulo}
                  </Typography>
                </Box>

                {/* Al paso ya hecho no se le repite la explicación: lo que hay
                    que leer es lo que falta. */}
                {!p.hecho && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75, lineHeight: 1.55 }}>
                    {p.detalle}
                  </Typography>
                )}

                {!p.hecho && (
                  <Link href={p.href} style={{ textDecoration: 'none' }}>
                    <MuiButton
                      size="small"
                      variant={esSiguiente ? 'contained' : 'text'}
                      endIcon={<ArrowRight style={{ width: 15, height: 15 }} />}
                      sx={{ mt: 1.5, fontWeight: 600, textTransform: 'none' }}
                    >
                      {p.cta}
                    </MuiButton>
                  </Link>
                )}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
