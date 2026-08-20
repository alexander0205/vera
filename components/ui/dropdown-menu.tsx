'use client';

import * as React from 'react';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import MuiDivider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { Check, ChevronRight, Circle } from 'lucide-react';

// Context for anchor el
const DropdownMenuContext = React.createContext<{
  anchorEl: HTMLElement | null;
  setAnchorEl: (el: HTMLElement | null) => void;
  open: boolean;
}>({ anchorEl: null, setAnchorEl: () => {}, open: false });

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <DropdownMenuContext.Provider value={{ anchorEl, setAnchorEl, open }}>
      <div style={{ display: 'inline-block' }}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setAnchorEl } = React.useContext(DropdownMenuContext);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement>; 'data-state'?: string }>,
      { onClick: handleClick }
    );
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  );
}

function DropdownMenuPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'center';
  sideOffset?: number;
}

function DropdownMenuContent({ children, className, align = 'start', sideOffset = 4 }: DropdownMenuContentProps) {
  const { anchorEl, setAnchorEl, open } = React.useContext(DropdownMenuContext);

  return (
    <MuiMenu
      anchorEl={anchorEl}
      open={open}
      onClose={() => setAnchorEl(null)}
      onClick={() => setAnchorEl(null)}
      transformOrigin={{
        horizontal: align === 'end' ? 'right' : 'left',
        vertical:   'top',
      }}
      anchorOrigin={{
        horizontal: align === 'end' ? 'right' : 'left',
        vertical:   'bottom',
      }}
      slotProps={{
        paper: {
          elevation: 0,
          sx: {
            borderRadius: '12px',
            border:       '1px solid #e5e7eb',
            boxShadow:    '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
            minWidth:     160,
            mt:           `${sideOffset}px`,
            '& .MuiList-root': { p: '4px' },
            className,
          } as object,
        },
      }}
    >
      {children}
    </MuiMenu>
  );
}

function DropdownMenuGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  className?: string;
  onSelect?: () => void;
  onClick?: React.MouseEventHandler;
  variant?: 'default' | 'destructive';
  inset?: boolean;
  asChild?: boolean;
  disabled?: boolean;
}

function DropdownMenuItem({
  children,
  className,
  onSelect,
  onClick,
  variant = 'default',
  inset,
  asChild,
  disabled,
}: DropdownMenuItemProps) {
  const isDestructive = variant === 'destructive';

  const handleClick = (e: React.MouseEvent) => {
    onClick?.(e);
    onSelect?.();
  };

  if (asChild && React.isValidElement(children)) {
    return (
      <MuiMenuItem
        disabled={disabled}
        onClick={handleClick}
        sx={{
          borderRadius: '6px',
          fontSize:     '0.875rem',
          color:        isDestructive ? 'error.main' : 'text.primary',
          gap:          1,
          pl:           inset ? 4 : 1.25,
          py:           '6px',
          '&:hover': { bgcolor: isDestructive ? 'error.lighter' : 'grey.100' },
          '& a': { color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', width: '100%' },
        }}
        className={className}
        disableRipple={false}
      >
        {children}
      </MuiMenuItem>
    );
  }

  return (
    <MuiMenuItem
      disabled={disabled}
      onClick={handleClick}
      sx={{
        borderRadius: '6px',
        fontSize:     '0.875rem',
        color:        isDestructive ? 'error.main' : 'text.primary',
        gap:          1,
        pl:           inset ? 4 : 1.25,
        py:           '6px',
        '&:hover': { bgcolor: isDestructive ? '#fef2f2' : 'grey.50' },
        '& svg': { fontSize: '1rem', color: isDestructive ? 'error.main' : 'text.secondary' },
      }}
      className={className}
    >
      {children}
    </MuiMenuItem>
  );
}

function DropdownMenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
  className,
}: {
  children: React.ReactNode;
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  className?: string;
}) {
  return (
    <MuiMenuItem
      onClick={() => onCheckedChange?.(!checked)}
      sx={{ borderRadius: '6px', fontSize: '0.875rem', gap: 1, py: '6px' }}
      className={className}
    >
      <span className="flex h-4 w-4 items-center justify-center">
        {checked && <Check className="h-3.5 w-3.5 text-zero-600" />}
      </span>
      {children}
    </MuiMenuItem>
  );
}

function DropdownMenuRadioGroup({
  children,
  value,
  onValueChange,
}: {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  return <>{children}</>;
}

function DropdownMenuRadioItem({
  children,
  value,
  className,
}: {
  children: React.ReactNode;
  value: string;
  className?: string;
}) {
  return (
    <MuiMenuItem
      sx={{ borderRadius: '6px', fontSize: '0.875rem', gap: 1, py: '6px' }}
      className={className}
    >
      <span className="flex h-4 w-4 items-center justify-center">
        <Circle className="h-2 w-2 fill-zero-600 text-zero-600" />
      </span>
      {children}
    </MuiMenuItem>
  );
}

function DropdownMenuLabel({
  children,
  className,
  inset,
}: {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <Typography
      component="div"
      sx={{
        px:     inset ? 4 : 1.25,
        py:     '6px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color:  'text.secondary',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
      className={className}
    >
      {children}
    </Typography>
  );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return <MuiDivider sx={{ my: 0.5, borderColor: '#e5e7eb' }} className={className} />;
}

function DropdownMenuShortcut({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={['ml-auto text-xs text-gray-400 tracking-widest', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}

function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DropdownMenuSubTrigger({
  children,
  className,
  inset,
}: {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <MuiMenuItem
      sx={{ borderRadius: '6px', fontSize: '0.875rem', gap: 1, py: '6px', pl: inset ? 4 : 1.25 }}
      className={className}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
    </MuiMenuItem>
  );
}

function DropdownMenuSubContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
