import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NMS Corvette Shipyard",
  description:
    "3D corvette visualiser, fusion generator, pop-culture blueprint hangar and NMS Save Editor exporter for the No Man's Sky Corvette Workshop.",
  applicationName: "NMS Corvette Shipyard",
};

export const viewport: Viewport = {
  themeColor: "#04060b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="starfield">{children}</body>
    </html>
  );
}
