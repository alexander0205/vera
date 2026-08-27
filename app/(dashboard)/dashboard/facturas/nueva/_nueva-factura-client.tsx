'use client';

/**
 * Wrapper cliente con ssr:false para evitar el mismatch de aria-ids
 * de Radix UI durante la hidratación en Next.js 15.
 * Recibe los datos del perfil de empresa desde el server component padre.
 */
import dynamic from 'next/dynamic';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

const NuevaFacturaForm = dynamic(() => import('./NuevaFacturaForm'), {
  ssr: false,
  loading: () => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <CircularProgress size={32} sx={{ color: '#3658e1' }} />
    </Box>
  ),
});

export default function NuevaFacturaFormClient({
  initialPerfil,
  categoriaFija,
  cargosIniciales,
  clienteInicial,
  previsto,
  onVolver,
  sinRedirigirAlVincular,
  modoColegio,
}: {
  initialPerfil: EmpresaPerfil | null;
  /** Fija la categoría de documento (factura-venta, nota-credito, nota-debito, compras, gastos). */
  categoriaFija?: string;
  /** Cargos escolares con los que arrancar, cuando no hay URL donde ponerlos. */
  cargosIniciales?: number[];
  /** A quién facturarle cuando no hay cargos de los que deducirlo. */
  clienteInicial?: { id: number; razonSocial: string; rnc: string | null;
    email: string | null; telefono: string | null } | null;
  /** Un mes del plan que todavía no es cargo. El cargo nace al vincular. */
  previsto?: { matriculaId: number; cuotaId: number; conceptoId: number } | null;
  /** Qué hace «Volver»: dentro de un cajón, cerrarlo en vez de navegar. */
  onVolver?: () => void;
  /** No saltar a la ficha del estudiante al terminar (el formulario va en un cajón). */
  sinRedirigirAlVincular?: boolean;
  /** Ajusta el formulario a un colegio: sin ITBIS, sin plazo, tipo de ingresos 01. */
  modoColegio?: boolean;
}) {
  return (
    <NuevaFacturaForm
      initialPerfil={initialPerfil}
      categoriaFija={categoriaFija}
      cargosIniciales={cargosIniciales}
      clienteInicial={clienteInicial}
      previsto={previsto}
      onVolver={onVolver}
      sinRedirigirAlVincular={sinRedirigirAlVincular}
      modoColegio={modoColegio}
    />
  );
}
