import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { assemble } from "@/engine/assembly";
import { validate } from "@/engine/validation";
import type { AssemblyDocument } from "@/domain/types";
import { BlueprintPdf } from "@/export/pdf/blueprint-pdf";
import { buildPdfPayload } from "@/export/pdf/payload";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/blueprint
 * { document: AssemblyDocument, screenshot?: string | null }
 * → application/pdf build manual
 */
export async function POST(request: Request): Promise<Response> {
  let body: { document?: AssemblyDocument; screenshot?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const document = body.document;
  if (!document || !Array.isArray(document.placements) || !document.palette) {
    return NextResponse.json(
      { error: "Missing document. Expected { document: AssemblyDocument }." },
      { status: 400 },
    );
  }

  const assembly = assemble(document);
  const verdict = validate(assembly);
  const payload = buildPdfPayload(
    document,
    assembly,
    typeof body.screenshot === "string" ? body.screenshot : null,
    verdict.issues.map((issue) => `${issue.level.toUpperCase()}: ${issue.message}`),
  );

  const buffer = await renderToBuffer(createElement(BlueprintPdf, payload));

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug(document.name)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

const slug = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "corvette";
