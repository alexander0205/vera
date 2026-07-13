'use client';

import * as React from 'react';
import MuiTextField from '@mui/material/TextField';

type InputProps = Omit<React.ComponentProps<'input'>, 'size' | 'ref'>;

function Input({
  className, type, value, defaultValue, onChange, placeholder,
  disabled, required, id, name, style, readOnly, ...htmlInputProps
}: InputProps) {
  // Color pickers don't work well as MUI TextField — pass through as native
  if (type === 'color') {
    return (
      <input
        type="color"
        value={value as string}
        defaultValue={defaultValue as string}
        onChange={onChange}
        disabled={disabled}
        id={id}
        name={name}
        className={['rounded-lg border border-gray-200 cursor-pointer p-0.5', className].filter(Boolean).join(' ')}
        style={style}
      />
    );
  }

  return (
    <MuiTextField
      type={type}
      placeholder={placeholder}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange as React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>}
      disabled={disabled}
      required={required}
      id={id}
      name={name}
      fullWidth
      size="small"
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
          ...(readOnly && { bgcolor: 'grey.50' }),
        },
        '& .MuiOutlinedInput-input': { py: '10px', fontSize: '0.875rem' },
      }}
      slotProps={{
        htmlInput: {
          ...htmlInputProps,
          readOnly,
          className,
          style,
        },
      }}
    />
  );
}

export { Input };
