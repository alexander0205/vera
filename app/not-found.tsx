import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { CircleIcon } from 'lucide-react';

export default function NotFound() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <Box sx={{ maxWidth: 400, p: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <CircleIcon size={48} color="#f97316" />
        </Box>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
          Page Not Found
        </Typography>
        <Typography sx={{ color: '#6b7280' }}>
          The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </Typography>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Button
            variant="outlined"
            sx={{ borderRadius: '99px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151', mx: 'auto', display: 'flex', maxWidth: 192 }}
          >
            Back to Home
          </Button>
        </Link>
      </Box>
    </Box>
  );
}
