'use client';

import * as React from 'react';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogContentText from '@mui/material/DialogContentText';
import MuiDialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import { X } from 'lucide-react';

// State context
const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  modal?: boolean;
}

function Dialog({ open: openProp, onOpenChange, defaultOpen = false, children, modal = true }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open    = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

function DialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogContext);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(true);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: React.MouseEventHandler }>, {
      onClick: handleClick,
    });
  }

  return (
    <span onClick={handleClick} style={{ cursor: 'pointer', display: 'inline-flex' }}>
      {children}
    </span>
  );
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DialogClose({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: React.MouseEventHandler }>, {
      onClick: () => setOpen(false),
    });
  }

  return (
    <span onClick={() => setOpen(false)} style={{ cursor: 'pointer' }}>
      {children ?? (
        <IconButton size="small">
          <X className="h-4 w-4" />
        </IconButton>
      )}
    </span>
  );
}

function DialogOverlay({ className }: { className?: string }) {
  return null; // MUI Dialog handles backdrop internally
}

interface DialogContentProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function DialogContent({ children, className, style }: DialogContentProps) {
  const { open, setOpen } = React.useContext(DialogContext);

  return (
    <MuiDialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            maxHeight: '90dvh',
            overflow: 'hidden',
          },
          className,
          style,
        } as object,
      }}
    >
      {children}
      <IconButton
        onClick={() => setOpen(false)}
        size="small"
        sx={{
          position: 'absolute',
          right: 12,
          top: 12,
          color: 'text.secondary',
          '&:hover': { bgcolor: 'grey.100' },
        }}
      >
        <X className="h-4 w-4" />
      </IconButton>
    </MuiDialog>
  );
}

function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['px-6 pt-5 pb-0', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  );
}

function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <MuiDialogActions
      sx={{ px: 3, pb: 2.5, gap: 1, '& > :not(:first-of-type)': { ml: 0 } }}
      className={className}
      {...(props as object)}
    >
      {children}
    </MuiDialogActions>
  );
}

function DialogTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <MuiDialogTitle
      sx={{ fontSize: '1.125rem', fontWeight: 600, p: 0, mb: 0.5, pr: 6 }}
      className={className}
      {...(props as object)}
    >
      {children}
    </MuiDialogTitle>
  );
}

function DialogDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <MuiDialogContentText
      sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}
      className={className}
      {...(props as object)}
    >
      {children}
    </MuiDialogContentText>
  );
}

// DialogBody — wraps content between header and footer
function DialogBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <MuiDialogContent
      sx={{ px: 3, py: 2, overflowY: 'auto' }}
      className={className}
      {...(props as object)}
    >
      {children}
    </MuiDialogContent>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogBody,
};
