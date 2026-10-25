import { Suspense } from 'react';
import PorRevisarClient from './_page-client';

export const metadata = { title: 'Por revisar · Zero' };

export default function Page() {
  return (
    <Suspense>
      <PorRevisarClient />
    </Suspense>
  );
}
