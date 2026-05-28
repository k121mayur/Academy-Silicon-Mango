import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SelectedBatchState {
  selectedBatchId: string | null;
  setSelectedBatchId: (id: string | null) => void;
}

export const useSelectedBatch = create<SelectedBatchState>()(
  persist(
    (set) => ({
      selectedBatchId: null,
      setSelectedBatchId: (id) => set({ selectedBatchId: id }),
    }),
    { name: "instructor-selected-batch" }
  )
);
