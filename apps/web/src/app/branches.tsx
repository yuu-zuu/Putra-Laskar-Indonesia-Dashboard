import type { Branch, CreateBranchInput } from "@spbu/contracts";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/http.js";
import { isMockMode } from "../data/gateway.js";
import { demoBranch } from "../data/mockData.js";
import { useAuth } from "./auth.js";
import { createClientId } from "../lib/id.js";
import { safeStorage } from "../lib/storage.js";

interface Value {
  branches: Branch[];
  activeBranch: Branch | null;
  setActiveBranchId: (id: string) => void;
  createBranch: (input: CreateBranchInput) => Promise<void>;
  reload: () => Promise<void>;
}
const Context = createContext<Value | null>(null);
const key = "pli-active-branch-v1";
export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState(safeStorage.getItem(key));
  const reload = async () => {
    if (user === null) {
      setBranches([]);
      return;
    }
    const items = isMockMode()
      ? [demoBranch]
      : (await apiRequest<{ items: Branch[] }>("/branches")).items;
    setBranches(items);
    if (!items.some((x) => x.id === selected)) {
      const next = items.find((x) => x.id === user.branchId) ?? items[0] ?? null;
      setSelected(next?.id ?? null);
    }
  };
  useEffect(() => {
    void reload();
  }, [user?.id]);
  const setActiveBranchId = (id: string) => {
    setSelected(id);
    safeStorage.setItem(key, id);
  };
  const createBranch = async (input: CreateBranchInput) => {
    const created = isMockMode()
      ? { id: createClientId(), ...input, active: true }
      : await apiRequest<Branch>("/branches", { method: "POST", body: JSON.stringify(input) });
    setBranches((current) => [...current, created]);
    setActiveBranchId(created.id);
  };
  const activeBranch = branches.find((x) => x.id === selected) ?? null;
  return (
    <Context
      value={useMemo(
        () => ({ branches, activeBranch, setActiveBranchId, createBranch, reload }),
        [branches, activeBranch],
      )}
    >
      {children}
    </Context>
  );
}
export function useBranches() {
  const value = useContext(Context);
  if (value === null) throw new Error("useBranches must be inside BranchProvider");
  return value;
}
