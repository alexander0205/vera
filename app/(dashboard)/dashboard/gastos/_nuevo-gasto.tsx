'use client';

import { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Plus, FileCheck2, Coins, Globe2, UserRound, Upload } from 'lucide-react';
import { SubirComprobante } from '@/components/compras/subir-comprobante';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody,
} from '@/components/ui/dialog';

const OPCIONES = [
  {
    href: '/dashboard/gastos/registrar', icono: FileCheck2, titulo: 'Factura de un proveedor',
    texto: 'Te dio su NCF (B01, E31…). Va al 606, adelanta ITBIS y calcula las retenciones.',
  },
  {
    href: '/dashboard/gastos/nueva?tipo=43', icono: Coins, titulo: 'Gasto menor del personal (e43)',
    texto: 'Taxis, parqueos, peajes y consumibles sin comprobante. Lo emites tú; su ITBIS no se adelanta.',
  },
  {
    href: '/dashboard/compras/nueva', icono: UserRound, titulo: 'Proveedor informal (e41)',
    texto: 'Una persona sin RNC que no puede darte comprobante. Lo emites tú y retienes ITBIS e ISR.',
  },
  {
    href: '/dashboard/gastos/nueva?tipo=47', icono: Globe2, titulo: 'Pago al exterior (e47)',
    texto: 'Servicios de un proveedor fuera del país. Lo emites tú con la retención de ISR.',
  },
] as const;

/** «¿Qué comprobante tienes?»: de eso depende cómo se registra el gasto. */
export function NuevoGasto() {
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  return (
    <>
      <Box component="button" type="button" onClick={() => setAbierto(true)} sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75, bgcolor: '#3658e1', color: '#fff', border: 'none', cursor: 'pointer',
        fontSize: '0.875rem', fontWeight: 600, px: 2, py: 1, borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' },
      }}>
        <Plus size={16} /> Nuevo gasto
      </Box>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>¿Qué comprobante tienes?</DialogTitle>
            <DialogDescription>Cada caso va distinto al 606 y a la contabilidad.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            {/* Primero, porque es el camino corto: quien tiene el papel a mano
                no debería elegir tipo de comprobante y teclearlo todo, sino
                soltar el archivo y repasar lo que salga leído. */}
            <Box
              component="button"
              type="button"
              onClick={() => { setAbierto(false); setSubiendo(true); }}
              data-testid="opcion-subir-comprobante"
              sx={{
                display: 'flex', gap: 1.5, p: 1.5, mb: 1, width: '100%', textAlign: 'left', cursor: 'pointer',
                border: '1px solid #c7d2fe', bgcolor: '#f8faff', borderRadius: '10px',
                '&:hover': { borderColor: '#3658e1' },
              }}
            >
              <Upload size={20} color="#3658e1" style={{ flexShrink: 0, marginTop: 2 }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                  Tengo el archivo: súbelo y se llena solo
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                  El PDF que te mandó el proveedor o una foto. Se lee y te deja el gasto listo para repasarlo.
                </Typography>
              </Box>
            </Box>

            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', pt: 0.5 }}>
              O regístralo a mano
            </Typography>

            {OPCIONES.map((o) => (
              <Link key={o.href} href={o.href} onClick={() => setAbierto(false)} style={{ textDecoration: 'none' }}>
                <Box sx={{ display: 'flex', gap: 1.5, p: 1.5, border: '1px solid #e5e7eb', borderRadius: '10px', mb: 1, '&:hover': { borderColor: '#3658e1', bgcolor: '#f8faff' } }}>
                  <o.icono size={20} color="#3658e1" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{o.titulo}</Typography>
                    <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>{o.texto}</Typography>
                  </Box>
                </Box>
              </Link>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <SubirComprobante control={{ abierto: subiendo, setAbierto: setSubiendo }} />
    </>
  );
}
