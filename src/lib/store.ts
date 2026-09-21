"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  AssemblyDocument,
  Blueprint,
  DesignBase,
  DesignTag,
  GeneratorOptions,
  Palette,
  PaintRole,
  Placement,
} from "@/domain/types";
import { DEFAULT_PALETTE, PALETTES } from "@/domain/palettes";
import { getBlueprint } from "@/data/blueprints";
import { expandBlueprint } from "@/engine/blueprint";
import { generate, randomSeed } from "@/engine/generator";
import { BUILD_LIMITS } from "@/domain/constants";
import { createId } from "@/lib/id";

export type BuilderMode = "manual" | "generator" | "hangar";

export type CameraPreset = "orbit" | "front" | "side" | "top" | "rear" | "cinematic";

export interface Toast {
  id: string;
  tone: "info" | "success" | "warning" | "error";
  message: string;
}

interface ShipyardState {
  document: AssemblyDocument;
  mode: BuilderMode;
  selectedId: string | null;
  hoveredNodeId: string | null;
  cameraPreset: CameraPreset;

  /* viewport options */
  showSnapPoints: boolean;
  showBounds: boolean;
  wireframe: boolean;
  autoRotate: boolean;
  exploded: number;

  /* generator panel */
  tag: DesignTag;
  base: DesignBase;
  seed: number;
  complexity: number;

  /* palette editing */
  editingPalette: Palette;

  toasts: Toast[];
  past: AssemblyDocument[];
  future: AssemblyDocument[];
  busy: boolean;

  /* actions */
  setName: (name: string) => void;
  setMode: (mode: BuilderMode) => void;
  select: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  toggle: (key: "showSnapPoints" | "showBounds" | "wireframe" | "autoRotate") => void;
  setExploded: (value: number) => void;

  addPart: (partId: string, parentId: string | null, node: string | null, role?: PaintRole) => string | null;
  removePart: (id: string) => void;
  duplicatePart: (id: string) => void;
  setRole: (id: string, role: PaintRole) => void;
  nudge: (id: string, axis: "x" | "y" | "z", delta: number) => void;
  rotate: (id: string, axis: "x" | "y" | "z", delta: number) => void;

  loadBlueprint: (id: string) => void;
  runGenerator: (options?: Partial<GeneratorOptions>) => void;
  rerollSeed: () => void;
  setGeneratorOption: <K extends "tag" | "base" | "complexity" | "seed">(key: K, value: GeneratorOptions[K]) => void;

  setPaletteName: (name: string) => void;
  setPaletteColor: (role: keyof Palette, color: string) => void;
  setWear: (wear: number) => void;
  applyPresetPalette: (palette: Palette) => void;

  reset: () => void;
  undo: () => void;
  redo: () => void;
  replaceDocument: (document: AssemblyDocument) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  setBusy: (busy: boolean) => void;
}

const MAX_HISTORY = 60;

const starterDocument = (): AssemblyDocument => {
  const blueprint = getBlueprint("x-wing");
  return {
    version: 1,
    name: "Red Five",
    author: "NMS Corvette Shipyard",
    palette: { ...blueprint.palette },
    placements: expandBlueprint(blueprint),
  };
};

const pushHistory = (state: ShipyardState, next: AssemblyDocument) => ({
  document: next,
  past: [...state.past, state.document].slice(-MAX_HISTORY),
  future: [],
});

export const useShipyard = create<ShipyardState>()(
  subscribeWithSelector((set, get) => ({
    document: starterDocument(),
    mode: "hangar",
    selectedId: null,
    hoveredNodeId: null,
    cameraPreset: "orbit",
    showSnapPoints: false,
    showBounds: false,
    wireframe: false,
    autoRotate: true,
    exploded: 0,
    tag: "combat-heavy",
    base: "normal",
    seed: 20250827,
    complexity: 42,
    editingPalette: { ...starterDocument().palette },
    toasts: [],
    past: [],
    future: [],
    busy: false,

    setName: (name) => set((state) => pushHistory(state, { ...state.document, name })),
    setMode: (mode) => set({ mode }),
    select: (selectedId) => set({ selectedId }),
    hoverNode: (hoveredNodeId) => set({ hoveredNodeId }),
    setCameraPreset: (cameraPreset) => set({ cameraPreset, autoRotate: false }),
    toggle: (key) => set((state) => ({ [key]: !state[key] }) as Partial<ShipyardState>),
    setExploded: (exploded) => set({ exploded }),

    addPart: (partId, parentId, node, role) => {
      const state = get();
      if (state.document.placements.length >= BUILD_LIMITS.maxParts) {
        get().notify(`Part limit reached (${BUILD_LIMITS.maxParts}). Remove something first.`, "warning");
        return null;
      }
      const id = createId();
      const placement: Placement = { id, partId, parentId, node, role };
      const next = { ...state.document, placements: [...state.document.placements, placement] };
      set({ ...pushHistory(state, next), selectedId: id });
      return id;
    },

    removePart: (id) => {
      const state = get();
      const doomed = new Set<string>([id]);
      // Removing a module takes everything hanging off it with it.
      let grew = true;
      while (grew) {
        grew = false;
        for (const placement of state.document.placements) {
          if (placement.parentId && doomed.has(placement.parentId) && !doomed.has(placement.id)) {
            doomed.add(placement.id);
            grew = true;
          }
        }
      }
      const next = {
        ...state.document,
        placements: state.document.placements.filter((placement) => !doomed.has(placement.id)),
      };
      set({ ...pushHistory(state, next), selectedId: null });
      get().notify(doomed.size > 1 ? `Removed ${doomed.size} linked modules` : "Module removed", "info");
    },

    duplicatePart: (id) => {
      const state = get();
      const source = state.document.placements.find((placement) => placement.id === id);
      if (!source) return;
      const newId = createId();
      const next = {
        ...state.document,
        placements: [...state.document.placements, { ...source, id: newId }],
      };
      set({ ...pushHistory(state, next), selectedId: newId });
    },

    setRole: (id, role) => {
      const state = get();
      const next = {
        ...state.document,
        placements: state.document.placements.map((placement) =>
          placement.id === id ? { ...placement, role } : placement,
        ),
      };
      set(pushHistory(state, next));
    },

    nudge: (id, axis, delta) => {
      const state = get();
      const next = {
        ...state.document,
        placements: state.document.placements.map((placement) =>
          placement.id === id
            ? {
                ...placement,
                offset: {
                  x: placement.offset?.x ?? 0,
                  y: placement.offset?.y ?? 0,
                  z: placement.offset?.z ?? 0,
                  [axis]: (placement.offset?.[axis] ?? 0) + delta,
                },
              }
            : placement,
        ),
      };
      set({ document: next });
    },

    rotate: (id, axis, delta) => {
      const state = get();
      const next = {
        ...state.document,
        placements: state.document.placements.map((placement) =>
          placement.id === id
            ? {
                ...placement,
                rotation: {
                  x: placement.rotation?.x ?? 0,
                  y: placement.rotation?.y ?? 0,
                  z: placement.rotation?.z ?? 0,
                  [axis]: (placement.rotation?.[axis] ?? 0) + delta,
                },
              }
            : placement,
        ),
      };
      set({ document: next });
    },

    loadBlueprint: (id) => {
      const blueprint: Blueprint = getBlueprint(id);
      const state = get();
      const next: AssemblyDocument = {
        version: 1,
        name: blueprint.name,
        author: "The Badass Hangar",
        palette: { ...blueprint.palette },
        placements: expandBlueprint(blueprint),
      };
      set({
        ...pushHistory(state, next),
        editingPalette: { ...blueprint.palette },
        selectedId: null,
        mode: "hangar",
      });
      get().notify(`${blueprint.name} assembled — ${next.placements.length} modules`, "success");
    },

    runGenerator: (options) => {
      const state = get();
      const merged: GeneratorOptions = {
        tag: options?.tag ?? state.tag,
        base: options?.base ?? state.base,
        seed: options?.seed ?? state.seed,
        complexity: options?.complexity ?? state.complexity,
        symmetrical: true,
        palette: state.editingPalette,
      };
      const result = generate(merged);
      const next: AssemblyDocument = {
        version: 1,
        name: `${merged.tag.replace(/-/g, " ")} · ${merged.seed.toString(36).toUpperCase()}`,
        author: "Fusion Generator",
        palette: { ...merged.palette },
        placements: result.placements,
      };
      set({
        ...pushHistory(state, next),
        seed: merged.seed,
        tag: merged.tag,
        base: merged.base,
        complexity: merged.complexity,
        selectedId: null,
      });
      get().notify(`Fusion complete — ${next.placements.length} modules, seed ${merged.seed}`, "success");
    },

    rerollSeed: () => {
      set({ seed: randomSeed() });
      get().runGenerator({ seed: get().seed });
    },

    setGeneratorOption: (key, value) => set({ [key]: value } as Partial<ShipyardState>),

    setPaletteName: (name) => {
      const editingPalette = { ...get().editingPalette, name };
      set((state) => ({ editingPalette, document: { ...state.document, palette: editingPalette } }));
    },
    setPaletteColor: (role, color) => {
      const editingPalette = { ...get().editingPalette, [role]: color } as Palette;
      set((state) => ({ editingPalette, document: { ...state.document, palette: editingPalette } }));
    },
    setWear: (wear) => {
      const editingPalette = { ...get().editingPalette, wear };
      set((state) => ({ editingPalette, document: { ...state.document, palette: editingPalette } }));
    },
    applyPresetPalette: (palette) => {
      const editingPalette = { ...palette };
      set((state) => ({ editingPalette, document: { ...state.document, palette: editingPalette } }));
      get().notify(`Paint scheme “${palette.name}” applied`, "success");
    },

    reset: () => {
      const state = get();
      const next: AssemblyDocument = {
        version: 1,
        name: "New Corvette",
        palette: { ...DEFAULT_PALETTE },
        placements: [
          { id: createId(), partId: "landing-gear", parentId: null, node: null },
        ],
      };
      set({ ...pushHistory(state, next), editingPalette: { ...DEFAULT_PALETTE }, selectedId: null });
      get().notify("Empty bay ready — start with the landing gear", "info");
    },

    undo: () => {
      const state = get();
      const previous = state.past[state.past.length - 1];
      if (!previous) return;
      set({
        document: previous,
        past: state.past.slice(0, -1),
        future: [state.document, ...state.future].slice(0, MAX_HISTORY),
      });
    },

    redo: () => {
      const state = get();
      const [next, ...rest] = state.future;
      if (!next) return;
      set({
        document: next,
        past: [...state.past, state.document].slice(-MAX_HISTORY),
        future: rest,
      });
    },

    replaceDocument: (document) => set((state) => pushHistory(state, document)),

    notify: (message, tone = "info") => {
      const id = createId("t");
      set((state) => ({ toasts: [...state.toasts, { id, tone, message }].slice(-4) }));
      setTimeout(() => get().dismissToast(id), 4200);
    },

    dismissToast: (id) =>
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

    setBusy: (busy) => set({ busy }),
  })),
);

export const PALETTE_PRESETS = PALETTES;
