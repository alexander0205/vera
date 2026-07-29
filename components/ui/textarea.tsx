'use client';

import * as React from 'react';
import MuiTextField from '@mui/material/TextField';

type TextareaProps = Omit<React.ComponentProps<'textarea'>, 'ref'>;

function Textarea({
  className, value, defaultValue, onChange, placeholder,
  disabled, required, id, name, rows, maxLength, ...htmlInputProps
}: TextareaProps) {
  return (
    <MuiTextField
      multiline
      rows={rows}
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
        '& .MuiOutlinedInput-root': { borderRadius: '8px' },
        '& .MuiOutlinedInput-input': { fontSize: '0.875rem' },
      }}
      slotProps={{
        htmlInput: { ...htmlInputProps, maxLength, className },
      }}
    />
  );
}

export { Textarea };
