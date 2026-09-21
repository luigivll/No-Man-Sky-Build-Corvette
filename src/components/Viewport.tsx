"use client";

import type { ComponentType } from "react";
import { ShipCanvas } from "@/three/Scene";
import type { AssemblyResult } from "@/domain/types";

/**
 * Thin wrapper so the heavy three.js module is only ever pulled in on the
 * client (`next/dynamic` with `ssr: false` in the page).
 */
export const Viewport: ComponentType<{
  assembly: AssemblyResult;
  onCapture?: (register: () => string | null) => void;
}> = ShipCanvas;
