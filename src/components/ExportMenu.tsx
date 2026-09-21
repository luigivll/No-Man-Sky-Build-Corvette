"use client";

import { useRef, useState } from "react";
import { useShipyard } from "@/lib/store";
import { useAssembly } from "@/lib/useAssembly";
import { Button } from "./ui";
import { downloadBlob, downloadJson, slugify } from "@/lib/download";
import { buildInventoryExport, buildShipExport } from "@/export/nms-save";
import { idTable, loadIdOverrides, saveIdOverrides } from "@/export/part-ids";
import { verifiedCount } from "@/export/part-ids";
import type { NmsIdMapping } from "@/domain/types";

export function ExportMenu({ getScreenshot }: { getScreenshot: () => string | null }) {
  const { document, assembly, verdict } = useAssembly();
  const busy = useShipyard((state) => state.busy);
  const setBusy = useShipyard((state) => state.setBusy);
  const notify = useShipyard((state) => state.notify);
  const [open, setOpen] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const exportPdf = async () => {
    setBusy(true);
    try {
      const screenshot = getScreenshot();
      const response = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, screenshot }),
      });
      if (!response.ok) throw new Error(await response.text());
      downloadBlob(await response.blob(), `${slugify(document.name)}-blueprint.pdf`);
      notify("Build manual generated", "success");
    } catch (error) {
      notify(`PDF failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const exportProject = () => {
    downloadJson(document, `${slugify(document.name)}.corvette.json`);
    notify("Project file saved", "success");
  };

  const importProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as typeof document;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.placements)) {
        throw new Error("Not a shipyard project file");
      }
      useShipyard.getState().replaceDocument(parsed);
      notify(`Loaded ${parsed.placements.length} modules from ${file.name}`, "success");
    } catch (error) {
      notify(`Import failed: ${error instanceof Error ? error.message : "bad file"}`, "error");
    }
  };

  const verified = verifiedCount();

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={exportPdf} disabled={busy || !verdict.flyable}>
          {busy ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-plasma/40 border-t-plasma" />
          ) : (
            <Icon name="doc" />
          )}
          {busy ? "Rendering…" : "Build Manual (PDF)"}
        </Button>

        <Button variant="accent" onClick={() => setOpen((value) => !value)}>
          <Icon name="chip" />
          NMS Save Editor
          <span className="ml-1 text-[9px] opacity-60">{open ? "▴" : "▾"}</span>
        </Button>

        <Button onClick={exportProject} title="Save the blueprint as a shareable project file">
          <Icon name="save" />
          Project
        </Button>

        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importProject(file);
            event.target.value = "";
          }}
        />
        <Button onClick={() => fileInput.current?.click()} title="Load a .corvette.json file">
          <Icon name="upload" />
          Import
        </Button>
      </div>

      {!verdict.flyable && (
        <p className="mt-1.5 text-right text-[10px] text-alarm">
          Not flyable yet — fix the errors in the inspector to unlock the PDF.
        </p>
      )}

      {open && (
        <div className="panel animate-pop absolute right-0 top-full z-40 mt-2 w-[380px] p-4">
          <p className="label mb-2">Export to NMS Save Editor (GoatFungus)</p>
          <p className="mb-3 text-[11px] leading-relaxed text-ink-dim">
            A corvette is stored as a ship <em>and</em> a base. Export the hull layout and paste it over the{" "}
            <code className="text-plasma">Objects</code> array of your corvette inside{" "}
            <code className="text-plasma">PersistentPlayerBases</code>, or inject the modules straight into your
            inventory.
          </p>

          <div className="flex flex-col gap-2">
            <Button
              variant="accent"
              onClick={() => {
                downloadJson(buildShipExport(document, assembly), `${slugify(document.name)}.nms-ship.json`);
                notify("Full ship export written", "success");
              }}
            >
              <Icon name="rocket" /> Export complete ship
            </Button>
            <Button
              onClick={() => {
                downloadJson(buildInventoryExport(document), `${slugify(document.name)}.nms-inventory.json`);
                notify("Inventory export written", "success");
              }}
            >
              <Icon name="box" /> Export parts to inventory
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                loadIdOverrides();
                setShowIds((value) => !value);
              }}
            >
              <Icon name="key" /> Edit id mapping ({verified}/{idTable().length} verified)
            </Button>
          </div>

          <ol className="mt-3 space-y-1 text-[10px] leading-relaxed text-ink-faint">
            <li>1. Back up your save.</li>
            <li>2. Build a throwaway corvette in-game and name it something findable.</li>
            <li>3. Editor ▸ Edit raw JSON ▸ BaseContext ▸ PlayerStateData ▸ PersistentPlayerBases.</li>
            <li>4. Paste the file&apos;s <code>playerShipBase.Objects</code> over that entry&apos;s Objects.</li>
            <li>5. Save, launch, finalise at the Corvette Workshop.</li>
          </ol>

          {showIds && <IdMapper />}
        </div>
      )}
    </div>
  );
}

function IdMapper() {
  const [rows, setRows] = useState(() => idTable());
  const notify = useShipyard((state) => state.notify);

  const update = (partId: string, patch: Partial<NmsIdMapping>) => {
    const next = rows.map((row) => (row.partId === partId ? { ...row, ...patch } : row));
    setRows(next);
  };

  return (
    <div className="mt-3 border-t border-edge pt-3">
      <p className="label mb-2">Part → internal id</p>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {rows.map((row) => (
          <div key={row.partId} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5 text-[10px]">
            <span className="truncate text-ink-dim" title={row.name}>
              {row.name}
            </span>
            <input
              value={row.objectId}
              onChange={(event) => update(row.partId, { objectId: event.target.value })}
              className="panel-inset telemetry px-1.5 py-1 text-[10px] text-plasma outline-none focus:border-plasma/50"
            />
            <span className={row.verified ? "text-verdant" : "text-ink-faint"} title={row.verified ? "Verified" : "Inferred"}>
              {row.verified ? "✓" : "?"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            const table: Record<string, NmsIdMapping> = {};
            for (const row of rows) {
              table[row.partId] = { objectId: row.objectId, itemId: row.objectId, verified: row.verified };
            }
            saveIdOverrides(table);
            notify("Id mapping saved locally", "success");
          }}
        >
          Save mapping
        </Button>
        <Button size="sm" onClick={() => downloadJson(idTable(), "nms-part-ids.json")}>
          Download table
        </Button>
      </div>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    doc: "M7 3h7l4 4v13H7zM14 3v4h4",
    chip: "M9 3h6v3h3v6h3v6h-3v3H9v-3H6V9H3V3h6zM11 9h5v5h-5z",
    save: "M5 4h11l3 3v13H5zM8 4v6h8V4M8 20v-6h8v6",
    upload: "M12 20V8m0 0 4 4m-4-4L8 12M4 4h16",
    rocket: "M12 3c4 3 6 8 6 12l-3 3H9l-3-3c0-4 2-9 6-12zM9 18l-2 3m8-3 2 3",
    box: "M4 8l8-4 8 4-8 4zM4 8v8l8 4 8-4V8",
    key: "M15 3a5 5 0 1 1-4.6 7H4v3H2v-5h8.4A5 5 0 0 1 15 3z",
  };
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d={paths[name] ?? paths.doc} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
