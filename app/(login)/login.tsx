'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { LogoZero } from '@/components/marca-zero';
import { signIn, signUp } from './actions';
import { ActionState } from '@/lib/auth/middleware';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import MuiButton from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect  = searchParams.get('redirect');
  const priceId   = searchParams.get('priceId');
  const inviteId  = searchParams.get('inviteId');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );
  const [showPwd, setShowPwd] = useState(false);

  return (
    <Box
      sx={{
        minHeight:      '100dvh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        bgcolor:        '#f9fafb',
        p:              2,
      }}
    >
      {/* Sin loader de pantalla completa acá a propósito: `pending` también se
          prende cuando las credenciales están mal, así que taparía la pantalla
          para después mostrar el error. El spinner del botón es el aviso
          correcto para un formulario que puede fallar. */}
      <Box sx={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            1.5,
              mb:             1.5,
            }}
          >
            <LogoZero alto={38} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {mode === 'signin'
              ? 'Inicia sesión en tu cuenta'
              : 'Crea tu cuenta gratis'}
          </Typography>
        </Box>

        {/* Card */}
        <Paper
          elevation={0}
          sx={{
            border:       '1px solid #e5e7eb',
            borderRadius: '16px',
            p:            3.5,
            bgcolor:      '#ffffff',
          }}
        >
          <Box
            component="form"
            action={formAction}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
          >
            <input type="hidden" name="redirect" value={redirect || ''} />
            <input type="hidden" name="priceId"  value={priceId  || ''} />
            <input type="hidden" name="inviteId" value={inviteId || ''} />

            {/* Email */}
            <Box>
              <Typography
                component="label"
                htmlFor="email"
                sx={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'text.primary', mb: 0.75 }}
              >
                Email
              </Typography>
              <TextField
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email ?? ''}
                required
                slotProps={{ htmlInput: { maxLength: 50 } }}
                placeholder="tu@empresa.com"
                fullWidth
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                  '& .MuiOutlinedInput-input': { py: '10px', fontSize: '0.875rem' },
                }}
              />
            </Box>

            {/* Password */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography
                  component="label"
                  htmlFor="password"
                  sx={{ fontSize: '0.8125rem', fontWeight: 500, color: 'text.primary' }}
                >
                  Contraseña
                </Typography>
                {mode === 'signin' && (
                  <Typography
                    component={Link}
                    href="/forgot-password"
                    sx={{ fontSize: '0.8125rem', color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                  >
                    ¿Olvidaste tu contraseña?
                  </Typography>
                )}
              </Box>
              <TextField
                id="password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                defaultValue={state.password ?? ''}
                required
                placeholder="••••••••"
                fullWidth
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                  '& .MuiOutlinedInput-input': { py: '10px', fontSize: '0.875rem' },
                }}
                slotProps={{
                  htmlInput: { minLength: 8, maxLength: 100 },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          tabIndex={-1}
                          onClick={() => setShowPwd(v => !v)}
                          edge="end"
                          size="small"
                          aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                          {showPwd
                            ? <EyeOff style={{ width: 16, height: 16, color: '#9ca3af' }} />
                            : <Eye    style={{ width: 16, height: 16, color: '#9ca3af' }} />
                          }
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>

            {/* Error */}
            {state?.error && (
              <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.875rem' }}>
                {state.error}
              </Alert>
            )}

            {/* Submit */}
            <MuiButton
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              disabled={pending}
              disableElevation
              size="large"
              sx={{
                borderRadius: '10px',
                py:           '10px',
                fontWeight:   700,
                fontSize:     '0.9375rem',
              }}
              startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {pending
                ? 'Verificando...'
                : mode === 'signin'
                  ? 'Iniciar sesión'
                  : 'Crear cuenta'}
            </MuiButton>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {mode === 'signin' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
              <Typography
                component={Link}
                href={mode === 'signin' ? '/sign-up' : '/sign-in'}
                sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                {mode === 'signin' ? 'Regístrate gratis' : 'Inicia sesión'}
              </Typography>
            </Typography>
          </Box>
        </Paper>

        {/* Support */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 3 }}
        >
          ¿Necesitas ayuda?{' '}
          <Box
            component="a"
            href="mailto:soporte@zero.com.do"
            sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            soporte@zero.com.do
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}
