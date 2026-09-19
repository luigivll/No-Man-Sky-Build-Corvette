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
  style = "corvette",
}: {
  part: Part;
  size?: number;
  style?: string;
}) {
  const scene = useMemo(() => {
    const mesh = buildPartMesh(part, { style });
    return projectScene(mesh, { yaw: -0.75, pitch: -0.4, zoom: 0.95 }, size, size, {
      padding: 1.35,
    });
  }, [part, size, style]);

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
        {scene.faces.map((face, index) => {
          const isGlow = face.kind === "emissive" || face.kind === "trim";
          return (
            <polygon
              key={index}
              points={face.points}
              fill={face.fill}
              opacity={face.opacity}
              stroke={isGlow ? face.fill : "rgba(3,6,12,0.45)"}
              strokeWidth={isGlow ? 1.6 : 0.3}
              strokeOpacity={isGlow ? 0.5 : 1}
            />
          );
        })}
      </svg>
    </div>
  );
}
