import { SiteHeader } from '@/components/site-header';
import { ContactoForm } from '@/components/contacto-form';
import { Receipt } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function HomePage() {
  return (
    <Box component="main" sx={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #fff, #f9fafb)' }}>
      <SiteHeader />

      <Box component="section" sx={{ py: { xs: 8, sm: 12 } }}>
        <Box sx={{ maxWidth: '48rem', mx: 'auto', px: { xs: 2, sm: 3, lg: 4 } }}>
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 3 }}>
              <Receipt size={32} color="#3658e1" />
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>Zero</Typography>
            </Box>
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', mb: 2, fontSize: { xs: '1.875rem', sm: '2.25rem' } }}>
              Facturación Electrónica DGII
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', sm: '1.125rem' }, color: '#4b5563', maxWidth: '36rem', mx: 'auto' }}>
              Servicio de e-CF para empresas dominicanas. ¿Quieres integrar tu sistema con la DGII?
              Déjanos tus datos y te contactamos.
            </Typography>
          </Box>

          <Box
            id="contacto"
            sx={{ bgcolor: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', p: { xs: 3, sm: 4 } }}
          >
            <ContactoForm />
          </Box>

          <Typography sx={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', mt: 4 }}>
            ¿Ya tienes cuenta?{' '}
            <Box component="a" href="/sign-in" sx={{ color: '#3658e1', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
              Iniciar sesión
            </Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
