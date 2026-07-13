'use client';

import { createTheme } from '@mui/material/styles';

const TEAL = {
  50:  '#f0fdfa',
  100: '#ccfbf1',
  200: '#99f6e4',
  300: '#5eead4',
  400: '#2dd4bf',
  500: '#14b8a6',
  600: '#0d9488',
  700: '#0f766e',
  800: '#115e59',
  900: '#134e4a',
};

export const muiTheme = createTheme({
  palette: {
    primary: {
      light:        TEAL[500],
      main:         TEAL[600],
      dark:         TEAL[700],
      contrastText: '#ffffff',
    },
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    success: {
      main: '#10b981',
    },
    background: {
      default: '#f9fafb',
      paper:   '#ffffff',
    },
    text: {
      primary:   '#111827',
      secondary: '#6b7280',
      disabled:  '#9ca3af',
    },
    divider: '#e5e7eb',
    grey: {
      50:  '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    },
  },
  typography: {
    fontFamily: '"Inter var", Inter, system-ui, -apple-system, sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: {
      textTransform: 'none',
      fontWeight:    600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  shadows: [
    'none',
    '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  ],
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight:   600,
          fontSize:     '0.875rem',
          lineHeight:   1.5,
        },
        sizeSmall: {
          padding:  '4px 12px',
          fontSize: '0.8125rem',
        },
        sizeMedium: {
          padding: '6px 16px',
        },
        sizeLarge: {
          padding:  '8px 22px',
          fontSize: '0.9375rem',
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border:       '1px solid #e5e7eb',
          borderRadius: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        outlined: {
          borderColor: '#e5e7eb',
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: '8px !important',
          fontSize:     '0.875rem',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& fieldset': {
            borderColor: '#d1d5db',
          },
          '&:hover fieldset': {
            borderColor: '#9ca3af',
          },
        },
        input: {
          padding: '8px 12px',
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          fontSize:   '0.8125rem',
          fontWeight: 500,
          color:      '#374151',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius:  6,
          fontSize:      '0.75rem',
          fontWeight:    600,
          height:        'auto',
          padding:       '2px 0',
        },
        label: {
          paddingLeft:  8,
          paddingRight: 8,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1f2937',
          fontSize:        '0.75rem',
          borderRadius:    6,
        },
        arrow: {
          color: '#1f2937',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#f9fafb',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight:    600,
          fontSize:      '0.6875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color:         '#6b7280',
          borderBottom:  '1px solid #e5e7eb',
        },
        body: {
          fontSize:  '0.875rem',
          color:     '#374151',
          borderBottom: '1px solid #f3f4f6',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#f9fafb',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow:    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize:   '1.125rem',
          fontWeight: 600,
          padding:    '20px 24px 12px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '0 24px 24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding:    '0 24px 20px',
          gap:        8,
          '& > :not(:first-of-type)': {
            marginLeft: 0,
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius:  12,
          boxShadow:     '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
          border:        '1px solid #e5e7eb',
          minWidth:      160,
        },
        list: {
          padding: '4px',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontSize:     '0.875rem',
          padding:      '6px 10px',
          gap:          8,
          '& svg': {
            fontSize: '1rem',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #e5e7eb',
          minHeight:    44,
        },
        indicator: {
          height:          2,
          borderRadius:    '2px 2px 0 0',
          backgroundColor: '#0d9488',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight:    500,
          fontSize:      '0.875rem',
          minHeight:     44,
          padding:       '8px 16px',
          color:         '#6b7280',
          '&.Mui-selected': {
            color:      '#0d9488',
            fontWeight: 600,
          },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontSize:   '0.875rem',
          fontWeight: 600,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#e5e7eb',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          height:       6,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          border: 'none',
        },
      },
    },
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color:           '#111827',
          borderBottom:    '1px solid #e5e7eb',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size:    'small',
      },
    },
    MuiSelect: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontSize:    '0.6875rem',
          fontWeight:  700,
          minWidth:    18,
          height:      18,
          padding:     '0 4px',
          borderRadius: 9,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
        sizeSmall: {
          padding: 4,
        },
      },
    },
  },
});
