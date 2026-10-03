"use client";

import { useMemo } from "react";
import { useShipyard } from "./store";
import { assemble } from "@/engine/assembly";
import { validate } from "@/engine/validation";

/** Derives the solved assembly and its rule verdict from the live document. */
export function useAssembly() {
  const document = useShipyard((state) => state.document);

  const assembly = useMemo(() => assemble(document), [document]);
  const verdict = useMemo(() => validate(assembly), [assembly]);

  return { document, assembly, verdict };
}
