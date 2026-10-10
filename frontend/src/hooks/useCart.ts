import type { ProductDTO } from '@pos/shared';
import { useCallback, useEffect, useState } from 'react';

export interface CartItem {
  productId: number;
  name: string;
  sku: string;
  unit: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  quantity: number;
}

export type AddResult = { ok: true } | { ok: false; reason: 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK'; available: number };

function load(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.productId === 'number' && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

/** Shopping cart, persisted per user in localStorage so a page refresh never loses a sale in progress. */
export function useCart(userId: number | undefined) {
  const key = `pos-cart-${userId ?? 'anon'}`;
  const [items, setItems] = useState<CartItem[]>(() => load(key));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* storage full or disabled — cart still works in memory */
    }
  }, [key, items]);

  const add = useCallback(
    (p: ProductDTO, qty = 1): AddResult => {
      const existing = items.find((i) => i.productId === p.id);
      const nextQty = (existing?.quantity ?? 0) + qty;
      if (p.stock <= 0) return { ok: false, reason: 'OUT_OF_STOCK', available: 0 };
      if (nextQty > p.stock) return { ok: false, reason: 'INSUFFICIENT_STOCK', available: p.stock };
      setItems((prev) => {
        const found = prev.find((i) => i.productId === p.id);
        const fresh = { name: p.name, sku: p.sku, unit: p.unit, price: p.sellingPrice, stock: p.stock, imageUrl: p.imageUrl };
        if (found) return prev.map((i) => (i.productId === p.id ? { ...i, ...fresh, quantity: i.quantity + qty } : i));
        return [...prev, { productId: p.id, quantity: qty, ...fresh }];
      });
      return { ok: true };
    },
    [items],
  );

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(quantity, Math.max(i.stock, 1)) } : i)),
    );
  }, []);

  const remove = useCallback((productId: number) => setItems((prev) => prev.filter((i) => i.productId !== productId)), []);
  const clear = useCallback(() => setItems([]), []);

  /** Refreshes price/stock/name from the server (e.g. after a "prices changed" error). */
  const sync = useCallback((products: ProductDTO[]) => {
    const byId = new Map(products.map((p) => [p.id, p]));
    setItems((prev) =>
      prev
        .filter((i) => byId.has(i.productId) && byId.get(i.productId)!.isActive)
        .map((i) => {
          const p = byId.get(i.productId)!;
          return { ...i, name: p.name, price: p.sellingPrice, stock: p.stock, quantity: Math.min(i.quantity, p.stock) };
        })
        .filter((i) => i.quantity > 0),
    );
  }, []);

  return { items, add, setQuantity, remove, clear, sync };
}
