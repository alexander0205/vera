import { Suspense } from 'react';
import { Login } from '../login';
import { EsqueletoDeAcceso } from '../_esqueleto';

export default function SignInPage() {
  return (
    <Suspense fallback={<EsqueletoDeAcceso />}>
      <Login mode="signin" />
    </Suspense>
  );
}
