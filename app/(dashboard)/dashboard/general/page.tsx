'use client';

import { useActionState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { Loader2 } from 'lucide-react';
import { updateAccount } from '@/app/(login)/actions';
import { User } from '@/lib/db/schema';
import useSWR from 'swr';
import { Suspense } from 'react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ActionState = {
  name?: string;
  error?: string;
  success?: string;
};

type AccountFormProps = {
  state: ActionState;
  nameValue?: string;
  emailValue?: string;
};

function AccountForm({ state, nameValue = '', emailValue = '' }: AccountFormProps) {
  return (
    <>
      <MuiTextField
        id="name" name="name" label="Nombre" placeholder="Ingresa tu nombre"
        defaultValue={state.name || nameValue} required size="small" fullWidth
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
      />
      <MuiTextField
        id="email" name="email" type="email" label="Email" placeholder="Ingresa tu email"
        defaultValue={emailValue} required size="small" fullWidth
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
      />
    </>
  );
}

function AccountFormWithData({ state }: { state: ActionState }) {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  return <AccountForm state={state} nameValue={user?.name ?? ''} emailValue={user?.email ?? ''} />;
}

export default function GeneralPage() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(updateAccount, {});

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 600 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 3 }}>
        Configuración general
      </Typography>

      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
        <CardContent sx={{ p: '20px !important' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 2.5 }}>
            Información de la cuenta
          </Typography>
          <Box component="form" action={formAction} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Suspense fallback={<AccountForm state={state} />}>
              <AccountFormWithData state={state} />
            </Suspense>
            {state.error && (
              <Typography variant="body2" sx={{ color: 'error.main' }}>{state.error}</Typography>
            )}
            {state.success && (
              <Typography variant="body2" sx={{ color: 'success.main' }}>{state.success}</Typography>
            )}
            <MuiButton
              type="submit"
              variant="contained"
              color="primary"
              disableElevation
              disabled={isPending}
              startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
            >
              {isPending ? 'Guardando...' : 'Guardar cambios'}
            </MuiButton>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
