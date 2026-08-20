'use client';

import React, { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  User, IdCard, Phone, FileText, MapPin, Award, type LucideIcon,
} from 'lucide-react';
import { SEXOS, ESTADOS_ESTUDIANTE, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';
import {
  CAMPOS_SIGERD_ESTUDIANTE, GRUPOS_SIGERD, type GrupoCampo,
} from '@/lib/administracion-escolar/estudiante-sigerd-campos';

/**
 * Las piezas del formulario del estudiante, compartidas entre el alta y la
 * edición.
 *
 * Vivían solo en la pantalla de alta, así que editar un estudiante enseñaba
 * cinco campos mientras crearlo enseñaba veintisiete: los veintitrés de la
 * ficha extendida (RNE, teléfonos, acta de nacimiento, dirección, subsidio) no
 * tenían por dónde entrar una vez creado el alumno. La API ya los aceptaba
 * —`limpiarCamposSigerd` con `soloPresentes`—; lo que faltaba eran los campos.
 *
 * Compartir el formulario es lo que impide que vuelvan a separarse: un campo
 * nuevo en `CAMPOS_SIGERD_ESTUDIANTE` aparece en las dos pantallas a la vez.
 */

/** Ícono + subtítulo de cada categoría de la ficha extendida. */
const CATEGORIA: Record<GrupoCampo, { icon: LucideIcon; hint: string }> = {
  'Identidad':          { icon: IdCard,   hint: 'Nacionalidad, estado civil y RNE' },
  'Contacto':           { icon: Phone,    hint: 'Teléfonos y WhatsApp' },
  'Acta de nacimiento': { icon: FileText, hint: 'Datos de la Junta Central Electoral' },
  'Dirección':          { icon: MapPin,   hint: 'Domicilio del estudiante' },
  'Programa y subsidio':{ icon: Award,    hint: 'Jornada y tarjetas de subsidio' },
};

/** Los campos extra, en blanco. Punto de partida de los dos formularios. */
export function camposExtraVacios(): Record<string, string> {
  return Object.fromEntries(CAMPOS_SIGERD_ESTUDIANTE.map((c) => [c.key, '']));
}

/**
 * Los mismos campos, tomados de un estudiante ya guardado. Los nulos de la base
 * pasan a cadena vacía: un `<Input>` con `value={null}` se vuelve no controlado
 * y React avisa por consola en cuanto se escribe.
 */
export function camposExtraDe(estudiante: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    CAMPOS_SIGERD_ESTUDIANTE.map((c) => [c.key, (estudiante[c.key] as string | null) ?? '']),
  );
}

export interface DatosBasicos {
  nombres: string;
  apellidos: string;
  sexo: string;
  fechaNacimiento: string;
}

/**
 * Núcleo obligatorio. `estado` solo se enseña donde tiene sentido —la edición—,
 * y por eso viaja aparte en vez de dentro de `DatosBasicos`.
 */
export function DatosEstudiante<T extends DatosBasicos>({
  form, onChange, estado, onEstadoChange, autoFocus = true, campoError,
}: {
  form: T;
  onChange: (parche: Partial<DatosBasicos>) => void;
  estado?: string;
  onEstadoChange?: (v: string) => void;
  autoFocus?: boolean;
  /** Campo que el guardado rechazó, para marcarlo donde está. */
  campoError?: 'nombres' | 'apellidos' | null;
}) {
  const edad = calcularEdad(form.fechaNacimiento);
  return (
    <Categoria icon={User} titulo="Datos del estudiante" hint="Información principal" requerido>
      <Field label="Nombres *">
        <Input autoFocus={autoFocus} value={form.nombres}
          error={campoError === 'nombres'}
          onChange={(e) => onChange({ nombres: e.target.value })} />
      </Field>
      <Field label="Apellidos *">
        <Input value={form.apellidos}
          error={campoError === 'apellidos'}
          onChange={(e) => onChange({ apellidos: e.target.value })} />
      </Field>
      <Field label="Sexo">
        <Select value={form.sexo} onValueChange={(v) => onChange({ sexo: v })}>
          <SelectTrigger aria-label="Sexo" className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
          <SelectContent>
            {SEXOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label={`Fecha de nacimiento${edad != null ? ` · ${edad} años` : ''}`}>
        <Input type="date" value={form.fechaNacimiento}
          onChange={(e) => onChange({ fechaNacimiento: e.target.value })} />
      </Field>
      {estado !== undefined && onEstadoChange && (
        <Field label="Estado">
          <Select value={estado} onValueChange={onEstadoChange}>
            <SelectTrigger aria-label="Estado" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESTADOS_ESTUDIANTE.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
    </Categoria>
  );
}

/** Las cinco tarjetas opcionales de la ficha extendida. */
export function CamposSigerd({ valores, onChange }: {
  valores: Record<string, string>;
  onChange: (key: string, v: string) => void;
}) {
  return (
    <>
      {GRUPOS_SIGERD.map((grupo) => {
        const meta = CATEGORIA[grupo];
        return (
          <Categoria key={grupo} icon={meta.icon} titulo={grupo} hint={meta.hint}>
            {CAMPOS_SIGERD_ESTUDIANTE.filter((c) => c.grupo === grupo).map((c) => (
              <Field key={c.key} label={c.label}>
                <Input
                  type={c.tipo === 'tel' ? 'tel' : 'text'}
                  value={valores[c.key] ?? ''}
                  placeholder={c.placeholder}
                  onChange={(e) => onChange(c.key, e.target.value)}
                />
              </Field>
            ))}
          </Categoria>
        );
      })}
    </>
  );
}

/** Tarjeta de una categoría del formulario. */
export function Categoria({ icon: Icon, titulo, hint, requerido, resaltado, children }: {
  icon: LucideIcon; titulo: string; hint?: string; requerido?: boolean;
  /** La tarjeta lleva lo que falta: borde rojo para encontrarla de un vistazo. */
  resaltado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border bg-white p-6 shadow-sm ${
      resaltado ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'
    }`}>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zero-50 text-zero-600">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
            {requerido
              ? <span className="rounded-full bg-zero-50 px-2 py-0.5 text-[10px] font-medium text-zero-700">Obligatorio</span>
              : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Opcional</span>}
          </div>
          {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

/**
 * Campo con su etiqueta REALMENTE asociada al control (htmlFor ↔ id generado),
 * para que tenga nombre accesible y el clic en la etiqueta enfoque el control.
 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
    </div>
  );
}
