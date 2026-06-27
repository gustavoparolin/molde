import { create } from "zustand";
import { apiRequest } from "../services/apiClient";

// Reference store for the `Item` slice — load/create/update/remove backed by the API.
// Copy this shape (state + async actions calling apiRequest) for your real entities.

export type Item = {
  id: string;
  ownerUserId: string;
  title: string;
  body?: string;
  createdAt: string;
  updatedAt: string;
};

type ItemsState = {
  items: Item[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: { title: string; body?: string }) => Promise<void>;
  update: (id: string, input: { title?: string; body?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useItemsStore = create<ItemsState>((set, get) => ({
  items: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const { items } = await apiRequest<{ items: Item[] }>("/items");
      set({ items });
    } finally {
      set({ loading: false });
    }
  },

  create: async (input) => {
    const { item } = await apiRequest<{ item: Item }>("/items", {
      method: "POST",
      body: JSON.stringify(input),
    });
    set({ items: [item, ...get().items] });
  },

  update: async (id, input) => {
    const { item } = await apiRequest<{ item: Item }>(`/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    set({ items: get().items.map((i) => (i.id === id ? item : i)) });
  },

  remove: async (id) => {
    await apiRequest<void>(`/items/${id}`, { method: "DELETE" });
    set({ items: get().items.filter((i) => i.id !== id) });
  },
}));
