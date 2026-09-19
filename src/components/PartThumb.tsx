"use client";

import { useMemo } from "react";
import { buildPartMesh, projectScene } from "@/lib/render3d";
import type { Part } from "@/lib/types";

/**
 * A small lit render of a single module, drawn with the same software
 * renderer as the full ship preview so every part reads as a real object.
 */
export default function PartThumb({
  part,
  size = 76,
  palette = "gunmetal",
}: {
  part: Part;
  size?: number;
  palette?: string;
}) {
  const scene = useMemo(() => {
    const mesh = buildPartMesh(part, { palette });
    return projectScene(mesh, { yaw: -0.75, pitch: -0.4, zoom: 0.95 }, size, size, {
      padding: 1.35,
    });
  }, [part, size, palette]);

  return (
    <div
      className="relative shrink-0 border border-white/10"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(ellipse at 50% 38%, #10202f 0%, #060c15 60%, #04070d 100%)",
      }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden="true"
        className="block"
      >
        {scene.faces.map((face, index) => (
          <polygon
            key={index}
            points={face.points}
            fill={face.fill}
            opacity={face.opacity}
            stroke="rgba(3,6,12,0.45)"
            strokeWidth={0.3}
          />
        ))}
      </svg>
    </div>
  );
}
