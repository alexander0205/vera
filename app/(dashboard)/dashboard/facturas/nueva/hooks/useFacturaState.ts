'use client';

import { useReducer } from 'react';
import type { ItemLinea } from '../utils/types';
import { itemVacio } from '../utils/calculos';

/**
 * Reducer dedicado al manejo de líneas (items) de la factura.
 *
 * El resto del estado del formulario (cliente, fechas, retenciones, etc.)
 * se mantiene en useState dentro del componente principal porque cada
 * pieza tiene side-effects propios (localStorage, fetches, recálculos
 * de fechas, etc.) que se prestan mejor a state local.
 *
 * Para items en cambio, todas las acciones son puras y bien definidas:
 * ADD, UPDATE, REMOVE, SET, RESET, APPLY_LISTA_PRECIOS, APPLY_PRODUCTO.
 */
export type ItemsAction =
  | { type: 'SET';      items: ItemLinea[] }
  | { type: 'ADD' }
  | { type: 'REMOVE';   id: number }
  | { type: 'UPDATE';   id: number; field: keyof ItemLinea; value: string | number | null }
  | { type: 'UPDATE_BENEFICIARIO'; id: number; dependienteId: number | null; dependienteNombre: string }
  | { type: 'CLEAR_BENEFICIARIOS' }
  | { type: 'APPLY_PRODUCTO'; idx: number; patch: Partial<ItemLinea> & { productoId: number } }
  | { type: 'APPLY_LISTA_PORC'; porcentaje: number }
  | { type: 'FORCE_EXENTO' }
  | { type: 'RESET' };

export function itemsReducer(state: ItemLinea[], action: ItemsAction): ItemLinea[] {
  switch (action.type) {
    case 'SET':
      return action.items;
    case 'ADD':
      return [...state, itemVacio()];
    case 'REMOVE':
      return state.filter(i => i.id !== action.id);
    case 'UPDATE':
      return state.map(i => i.id === action.id ? { ...i, [action.field]: action.value } : i);
    case 'UPDATE_BENEFICIARIO':
      return state.map(i =>
        i.id === action.id
          ? { ...i, dependienteId: action.dependienteId, dependienteNombre: action.dependienteNombre }
          : i,
      );
    case 'CLEAR_BENEFICIARIOS':
      return state.map(i => ({ ...i, dependienteId: null, dependienteNombre: '' }));
    case 'APPLY_PRODUCTO':
      return state.map((item, i) => i === action.idx ? { ...item, ...action.patch } : item);
    case 'APPLY_LISTA_PORC': {
      const factor = action.porcentaje / 10000;
      return state.map(item => {
        if (!item.productoId) return item;
        const nuevoPrecio = Math.round(item.precioUnitarioItem * (1 - factor) * 100) / 100;
        return { ...item, precioUnitarioItem: Math.max(0, nuevoPrecio) };
      });
    }
    case 'FORCE_EXENTO':
      return state.map(i => ({ ...i, tasaItbis: 'exento' as const }));
    case 'RESET':
      return [itemVacio()];
    default:
      return state;
  }
}

/** Hook conveniente que envuelve useReducer + estado inicial */
export function useItemsState(initial?: ItemLinea[]) {
  return useReducer(itemsReducer, initial && initial.length ? initial : [itemVacio()]);
}
