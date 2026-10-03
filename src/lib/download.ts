"use client";

/** Trigger a browser download from an in-memory payload. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const downloadJson = (data: unknown, filename: string): void =>
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);

export const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "corvette";
