import { Suspense } from 'react';
import { Login } from '../login';
import { EsqueletoDeAcceso } from '../_esqueleto';

export default function SignUpPage() {
  return (
    <Suspense fallback={<EsqueletoDeAcceso />}>
      <Login mode="signup" />
    </Suspense>
  );
}
