'use client';
import { useState, useEffect } from 'react';
import { Shield, Smartphone, Key, AlertTriangle, Check, Copy } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';

export default function SecurityPage() {
  const [user, setUser] = useState<{ twoFactorEnabled: boolean; emailVerified: boolean; email: string } | null>(null);
  const [qrUri, setQrUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser);
  }, []);

  async function startSetup() {
    const res = await fetch('/api/auth/2fa/setup');
    const data = await res.json();
    setSecret(data.secret);
    setQrUri(data.uri);
    setSetupMode(true);
  }

  async function verifyAndEnable() {
    setLoading(true); setError('');
    const res = await fetch('/api/auth/2fa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setSetupMode(false);
    setSuccess('2FA activado correctamente');
    setUser(u => u ? { ...u, twoFactorEnabled: true } : u);
    setLoading(false);
  }

  async function disable2FA() {
    setLoading(true); setError('');
    const res = await fetch('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: disablePassword }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setDisableMode(false);
    setSuccess('2FA desactivado');
    setUser(u => u ? { ...u, twoFactorEnabled: false } : u);
    setLoading(false);
  }

  async function sendVerification() {
    await fetch('/api/auth/send-verification', { method: 'POST' });
    setSuccess('Email de verificación enviado. Revisa tu bandeja de entrada.');
  }

  function copySecret() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 640 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Seguridad
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Gestiona la seguridad de tu cuenta
        </Typography>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Email verification */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Shield style={{ width: 18, height: 18, color: '#0d9488' }} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Verificación de email
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                  {user?.email}
                </Typography>
              </Box>
            </Box>
            {user?.emailVerified ? (
              <Chip
                label="Verificado"
                size="small"
                icon={<Check style={{ width: 12, height: 12 }} />}
                sx={{ bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', height: 24, fontSize: '0.6875rem', fontWeight: 600 }}
              />
            ) : (
              <MuiButton variant="outlined" size="small" onClick={sendVerification}
                sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: 'primary.main', color: 'primary.main' }}>
                Enviar verificación
              </MuiButton>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: setupMode || disableMode ? 2 : 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Smartphone style={{ width: 18, height: 18, color: '#0d9488' }} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Autenticación en dos pasos (2FA)
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                  {user?.twoFactorEnabled
                    ? 'Activa — tu cuenta está protegida con TOTP'
                    : 'Usa una app como Google Authenticator o Authy'}
                </Typography>
              </Box>
            </Box>
            {user?.twoFactorEnabled ? (
              <MuiButton variant="outlined" size="small" color="error" onClick={() => setDisableMode(true)}
                sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem' }}>
                Desactivar
              </MuiButton>
            ) : (
              <MuiButton variant="outlined" size="small" onClick={startSetup}
                sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: 'primary.main', color: 'primary.main' }}>
                Activar 2FA
              </MuiButton>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{error}</Alert>
          )}

          {setupMode && (
            <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                1. Escanea el código QR con tu app de autenticación
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUri)}`}
                  alt="QR Code 2FA"
                  style={{ border: '1px solid #e5e7eb', borderRadius: 8 }}
                  width={140}
                  height={140}
                />
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                    O ingresa este código manualmente:
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box component="code" sx={{ bgcolor: 'grey.100', borderRadius: 1, px: 1, py: 0.5, fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {secret}
                    </Box>
                    <IconButton size="small" onClick={copySecret} sx={{ color: copied ? 'success.main' : 'text.secondary' }}>
                      {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    </IconButton>
                  </Box>
                </Box>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                2. Ingresa el código de 6 dígitos
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <MuiTextField
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  size="small"
                  slotProps={{ htmlInput: { maxLength: 6, style: { fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.25em' } } }}
                  sx={{ width: 120, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
                <MuiButton variant="contained" color="primary" disableElevation
                  onClick={verifyAndEnable} disabled={loading || code.length !== 6}
                  sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                  {loading ? 'Verificando...' : 'Activar 2FA'}
                </MuiButton>
                <MuiButton variant="text" onClick={() => setSetupMode(false)}
                  sx={{ borderRadius: '8px', textTransform: 'none', color: 'text.secondary' }}>
                  Cancelar
                </MuiButton>
              </Box>
            </Box>
          )}

          {disableMode && (
            <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
                Desactivar 2FA reduce la seguridad de tu cuenta
              </Alert>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <MuiTextField
                  type="password"
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  placeholder="Confirma tu contraseña"
                  size="small"
                  sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
                <MuiButton variant="contained" color="error" disableElevation
                  onClick={disable2FA} disabled={loading}
                  sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                  {loading ? 'Desactivando...' : 'Desactivar'}
                </MuiButton>
                <MuiButton variant="text" onClick={() => setDisableMode(false)}
                  sx={{ borderRadius: '8px', textTransform: 'none', color: 'text.secondary' }}>
                  Cancelar
                </MuiButton>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Change password */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Key style={{ width: 18, height: 18, color: '#0d9488' }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Contraseña
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                Cambia tu contraseña regularmente
              </Typography>
            </Box>
            <MuiButton variant="outlined" size="small" href="/forgot-password"
              sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: 'primary.main', color: 'primary.main' }}>
              Cambiar
            </MuiButton>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
