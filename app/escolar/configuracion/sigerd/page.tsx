import { MigrarSigerd } from '@/components/administracion-escolar/MigrarSigerd';
import { MatricularSigerdAviso } from '@/components/administracion-escolar/MatricularSigerdAviso';

export default function Page() {
  return (
    <div className="space-y-4">
      {/* Tras cruzar estudiantes, el siguiente paso natural es matricularlos. */}
      <MatricularSigerdAviso />
      <MigrarSigerd />
    </div>
  );
}
