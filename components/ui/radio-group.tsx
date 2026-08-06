'use client';

import * as React from 'react';
import MuiRadioGroup from '@mui/material/RadioGroup';
import MuiRadio from '@mui/material/Radio';
import FormControlLabel from '@mui/material/FormControlLabel';

const RadioGroupContext = React.createContext<{
  value: string;
  onChange: (v: string) => void;
}>({ value: '', onChange: () => {} });

interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children?: React.ReactNode;
  className?: string;
}

function RadioGroup({ value: valueProp, defaultValue = '', onValueChange, children, className }: RadioGroupProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const value = valueProp ?? internalValue;

  const onChange = (v: string) => {
    setInternalValue(v);
    onValueChange?.(v);
  };

  return (
    <RadioGroupContext.Provider value={{ value, onChange }}>
      <div
        role="radiogroup"
        className={['flex flex-col gap-2', className].filter(Boolean).join(' ')}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

interface RadioGroupItemProps {
  value: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

function RadioGroupItem({ value, id, disabled, className }: RadioGroupItemProps) {
  const { value: groupValue, onChange } = React.useContext(RadioGroupContext);
  const checked = groupValue === value;

  return (
    <button
      type="button"
      role="radio"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(value)}
      className={[
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-zero-500 focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-zero-600 bg-zero-600' : 'border-gray-300 bg-white hover:border-zero-400',
        className,
      ].filter(Boolean).join(' ')}
    >
      {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
    </button>
  );
}

export { RadioGroup, RadioGroupItem };
