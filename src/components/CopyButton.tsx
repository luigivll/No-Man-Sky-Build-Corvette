"use client";

import { useState } from "react";
import { Icon } from "./Icon";

export default function CopyButton({
  text,
  label = "Copy list",
  copiedLabel = "Copied",
  className = "btn btn-ghost",
  icon = "Copy",
}: {
  text: string | (() => string);
  label?: string;
  copiedLabel?: string;
  className?: string;
  icon?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const value = typeof text === "function" ? text() : text;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (e.g. non-secure context): fall back to a textarea.
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } finally {
        document.body.removeChild(area);
      }
    }
  }

  return (
    <button type="button" className={className} onClick={handleCopy}>
      <Icon name={copied ? "Check" : icon} className="h-3.5 w-3.5" />
      {copied ? copiedLabel : label}
    </button>
  );
}
