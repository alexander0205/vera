'use client';

import * as React from 'react';
import MuiCard from '@mui/material/Card';
import MuiCardContent from '@mui/material/CardContent';
import MuiCardHeader from '@mui/material/CardHeader';
import MuiCardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

function Card({ className, style, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <MuiCard
      elevation={0}
      className={className}
      style={style}
      sx={{
        border:       '1px solid #e5e7eb',
        borderRadius: '12px',
        overflow:     'hidden',
      }}
      {...(props as object)}
    >
      {children}
    </MuiCard>
  );
}

function CardHeader({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      className={className}
      sx={{ px: 3, pt: 2.5, pb: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      {...(props as object)}
    >
      {children}
    </Box>
  );
}

function CardTitle({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Typography
      variant="subtitle1"
      sx={{ fontWeight: 600, color: 'text.primary' }}
      className={className}
      component="div"
      {...(props as object)}
    >
      {children}
    </Typography>
  );
}

function CardDescription({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      className={className}
      component="div"
      {...(props as object)}
    >
      {children}
    </Typography>
  );
}

function CardAction({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box className={className} sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }} {...(props as object)}>
      {children}
    </Box>
  );
}

function CardContent({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <MuiCardContent
      className={className}
      sx={{ px: 3, pt: 1.5, pb: '16px !important' }}
      {...(props as object)}
    >
      {children}
    </MuiCardContent>
  );
}

function CardFooter({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <MuiCardActions
      className={className}
      sx={{ px: 3, pb: 2.5, pt: 0, gap: 1 }}
      {...(props as object)}
    >
      {children}
    </MuiCardActions>
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
