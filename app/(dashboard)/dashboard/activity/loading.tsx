import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';

export default function ActivityPageSkeleton() {
  return (
    <Box sx={{ p: { xs: 2, lg: 4 } }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 3 }}>
        Activity Log
      </Typography>
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6' }}>
          <Skeleton variant="text" width={160} height={24} />
        </Box>
        <Box sx={{ px: 3, py: 3, minHeight: 88, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map(i => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Skeleton variant="circular" width={32} height={32} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={18} />
                <Skeleton variant="text" width="30%" height={14} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
