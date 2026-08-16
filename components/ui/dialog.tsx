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
  /**
   * Tope de ancho de MUI. Por defecto `sm` (600 px), que es lo que había.
   *
   * Hace falta como prop porque MUI escribe `max-width` en el paper con más
   * especificidad que Tailwind: un `max-w-none` en `className` no lo mueve, y
   * el diálogo se quedaba en 600 px sin decir por qué. `false` lo suelta del
   * todo y deja mandar al `className`.
   */
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

function DialogContent({ children, className, style, maxWidth = 'sm' }: DialogContentProps) {
  const { open, setOpen } = React.useContext(DialogContext);

  /**
   * Cabecera y botones se quedan fijos; TODO lo demás se envuelve en una zona
   * que desplaza.
   *
   * Se hace aquí y no pantalla por pantalla porque de los 67 diálogos del
   * sistema solo dos usaban `DialogBody`: los otros 65 cuelgan su contenido
   * suelto entre la cabecera y los botones, y sin un contenedor que desplace
   * lo que sobra se recorta —eso es lo que dejaba los botones «Cancelar» y
   * «Crear ítem» fuera de la pantalla en cuanto el formulario crecía.
   *
   * Envolver a mano los 65 sería el mismo arreglo repetido 65 veces, y el
   * diálogo número 66 volvería a nacer roto.
   */
  const { fijosArriba, cuerpo, fijosAbajo } = React.useMemo(() => {
    const arriba: React.ReactNode[] = [];
    const medio:  React.ReactNode[] = [];
    const abajo:  React.ReactNode[] = [];

    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) {
        if (child != null && child !== false) medio.push(child);
        return;
      }
      if (child.type === DialogHeader) { arriba.push(child); return; }
      if (child.type === DialogFooter) { abajo.push(child);  return; }
      // `DialogBody` ya trae su propio desplazamiento: se respeta tal cual.
      if (child.type === DialogBody)   { abajo.length ? abajo.push(child) : medio.push(child); return; }
      medio.push(child);
    });

    return { fijosArriba: arriba, cuerpo: medio, fijosAbajo: abajo };
  }, [children]);

  const cuerpoYaDesplaza = cuerpo.length === 1
    && React.isValidElement(cuerpo[0])
    && cuerpo[0].type === DialogBody;

  return (
    <MuiDialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth={maxWidth}
      fullWidth
      /**
       * `disableEnforceFocus` — sin esto NINGÚN desplegable funciona dentro de
       * un diálogo.
       *
       * Los `Select`, `Popover` y `Tooltip` de Radix montan su contenido en un
       * portal colgado de `document.body`, o sea FUERA de este diálogo. El
       * guardián de foco de MUI devuelve el foco al diálogo en cuanto se va, y
       * como la lista desplegada le queda por fuera, la cierra en el mismo
       * momento de abrirla: el usuario ve un desplegable que no responde.
       *
       * Va aquí, en el componente compartido, y no en cada pantalla: el
       * problema es de la mezcla MUI + Radix, así que lo tenían TODOS los
       * diálogos del sistema.
       */
      disableEnforceFocus
      slotProps={{
        paper: {
          sx: {
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            maxHeight: '90dvh',
            /**
             * Columna flexible, y el que se estira es el cuerpo.
             *
             * Antes el paper era `overflow: hidden` a secas: al crecer el
             * contenido más de 90dvh, lo que sobraba se recortaba en seco y
             * los botones de abajo —Cancelar, Crear ítem— quedaban fuera de
             * la pantalla, sin barra para llegar a ellos. Pasaba en el
             * formulario avanzado de productos y en cualquier diálogo largo.
             *
             * Con `display:flex` + `minHeight:0`, el `DialogBody` (que ya
             * tiene `overflowY:auto`) se queda con el sobrante y desplaza, y
             * la cabecera y los botones se quedan siempre a la vista.
             */
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          },
          className,
          style,
        } as object,
      }}
    >
      {fijosArriba}
      {cuerpoYaDesplaza ? cuerpo : (
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {cuerpo}
        </div>
      )}
      {fijosAbajo}
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
  // `flexShrink: 0` para que la cabecera no se comprima cuando el cuerpo crece.
  return (
    <div
      className={['px-6 pt-5 pb-0', className].filter(Boolean).join(' ')}
      style={{ flexShrink: 0 }}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <MuiDialogActions
      // Los botones son lo único que no puede desaparecer de un diálogo: sin
      // ellos no hay forma de guardar ni de salir salvo la X. Anclados abajo,
      // fuera del área que desplaza, y con un borde que los separa del cuerpo
      // cuando hay contenido corrido por debajo.
      sx={{
        px: 3, pb: 2.5, pt: 2, gap: 1,
        flexShrink: 0,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '& > :not(:first-of-type)': { ml: 0 },
      }}
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
      // El que se estira y el único que desplaza. `minHeight: 0` es lo que se
      // olvida siempre: sin él un hijo flexible se niega a encoger por debajo
      // de su contenido y el desbordamiento se escapa del paper en vez de
      // producir una barra aquí dentro.
      sx={{ px: 3, py: 2, overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}
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
