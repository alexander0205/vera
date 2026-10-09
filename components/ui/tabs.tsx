'use client';

import * as React from 'react';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';
import Box from '@mui/material/Box';

// Context to connect Tabs + TabsContent
const TabsContext = React.createContext<{
  value: string;
  onChange: (v: string) => void;
}>({ value: '', onChange: () => {} });

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children?: React.ReactNode;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

function Tabs({ defaultValue = '', value: valueProp, onValueChange, children, className, orientation = 'horizontal' }: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const value    = valueProp ?? internalValue;
  const onChange = (v: string) => {
    setInternalValue(v);
    onValueChange?.(v);
  };

  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={['flex flex-col gap-0', className].filter(Boolean).join(' ')}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'line';
}

function TabsList({ children, className, variant = 'line' }: TabsListProps) {
  const { value, onChange } = React.useContext(TabsContext);

  // Collect trigger values from children
  const triggers = React.Children.toArray(children).filter(
    (c): c is React.ReactElement<{ value?: string; children?: React.ReactNode; disabled?: boolean }> =>
      React.isValidElement(c)
  );

  return (
    <MuiTabs
      value={value}
      onChange={(_, v) => onChange(v as string)}
      className={className}
      slotProps={{
        indicator: { style: { backgroundColor: '#3658e1' } },
      }}
      sx={{
        borderBottom: '1px solid #e5e7eb',
        minHeight: 44,
        '& .MuiTab-root': {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          minHeight: 44,
          color: '#6b7280',
          '&.Mui-selected': { color: '#3658e1', fontWeight: 600 },
        },
      }}
    >
      {triggers.map((trigger, i) => (
        <MuiTab
          key={trigger.props.value ?? i}
          label={trigger.props.children}
          value={trigger.props.value}
          disabled={trigger.props.disabled}
        />
      ))}
    </MuiTabs>
  );
}

interface TabsTriggerProps {
  value: string;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

function TabsTrigger({ value, children, className, disabled }: TabsTriggerProps) {
  // Rendered inside TabsList — props consumed by parent
  return null;
}

interface TabsContentProps {
  value: string;
  children?: React.ReactNode;
  className?: string;
}

function TabsContent({ value, children, className }: TabsContentProps) {
  const { value: active } = React.useContext(TabsContext);
  if (active !== value) return null;
  return (
    <div role="tabpanel" className={['mt-4 outline-none', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
