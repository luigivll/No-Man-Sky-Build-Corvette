"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createBuild, newId } from "@/lib/build";
import type { Build } from "@/lib/types";

const BUILD_KEY = "nms-corvette-shipyard:build:v1";
const HANGAR_KEY = "nms-corvette-shipyard:hangar:v1";

interface BuildContextValue {
  build: Build;
  hangar: Build[];
  hydrated: boolean;
  setBuild: (build: Build) => void;
  mutate: (fn: (build: Build) => Build) => void;
  reset: () => void;
  saveToHangar: (name?: string) => Build;
  removeFromHangar: (id: string) => void;
  loadFromHangar: (id: string) => void;
  clearHangar: () => void;
}

const BuildContext = createContext<BuildContextValue | null>(null);

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function BuildProvider({ children }: { children: ReactNode }) {
  const [build, setBuildState] = useState<Build>(() =>
    createBuild({ name: "Workshop Prototype" }),
  );
  const [hangar, setHangar] = useState<Build[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedBuild = safeParse<Build | null>(
      window.localStorage.getItem(BUILD_KEY),
      null,
    );
    if (storedBuild?.slots) setBuildState(storedBuild);
    const storedHangar = safeParse<Build[]>(
      window.localStorage.getItem(HANGAR_KEY),
      [],
    );
    if (Array.isArray(storedHangar)) setHangar(storedHangar);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(BUILD_KEY, JSON.stringify(build));
  }, [build, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(HANGAR_KEY, JSON.stringify(hangar));
  }, [hangar, hydrated]);

  const setBuild = useCallback((next: Build) => {
    setBuildState({ ...next, id: next.id || newId() });
  }, []);

  const mutate = useCallback((fn: (current: Build) => Build) => {
    setBuildState((current) => fn(current));
  }, []);

  const reset = useCallback(() => {
    setBuildState(createBuild({ name: "Workshop Prototype" }));
  }, []);

  const saveToHangar = useCallback(
    (name?: string) => {
      const saved: Build = {
        ...build,
        id: newId(),
        name: name?.trim() ? name.trim() : build.name,
        createdAt: Date.now(),
      };
      setHangar((current) => [saved, ...current].slice(0, 40));
      return saved;
    },
    [build],
  );

  const removeFromHangar = useCallback((id: string) => {
    setHangar((current) => current.filter((b) => b.id !== id));
  }, []);

  const loadFromHangar = useCallback(
    (id: string) => {
      const found = hangar.find((b) => b.id === id);
      if (found) setBuildState(found);
    },
    [hangar],
  );

  const clearHangar = useCallback(() => setHangar([]), []);

  const value = useMemo<BuildContextValue>(
    () => ({
      build,
      hangar,
      hydrated,
      setBuild,
      mutate,
      reset,
      saveToHangar,
      removeFromHangar,
      loadFromHangar,
      clearHangar,
    }),
    [
      build,
      hangar,
      hydrated,
      setBuild,
      mutate,
      reset,
      saveToHangar,
      removeFromHangar,
      loadFromHangar,
      clearHangar,
    ],
  );

  return <BuildContext.Provider value={value}>{children}</BuildContext.Provider>;
}

export function useBuild(): BuildContextValue {
  const ctx = useContext(BuildContext);
  if (!ctx) throw new Error("useBuild must be used inside <BuildProvider>");
  return ctx;
}
