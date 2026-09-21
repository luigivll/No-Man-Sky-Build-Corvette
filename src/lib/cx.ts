import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cx = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

export const formatUnits = (value: number): string =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(2)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(0)}k`
      : `${value}`;

export const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
