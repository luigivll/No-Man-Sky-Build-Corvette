import type { Metadata, Viewport } from "next";
import "@fontsource/orbitron/latin-500.css";
import "@fontsource/orbitron/latin-700.css";
import "@fontsource/orbitron/latin-900.css";
import "@fontsource/rajdhani/latin-400.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BuildProvider } from "@/components/BuildProvider";

export const metadata: Metadata = {
  title: "NMS Corvette Shipyard | Builder, Randomizer & Iconic Blueprints",
  description:
    "Companion tool for the No Man's Sky Corvette Workshop (Voyagers 6.0): browse every part, build a shopping list, randomize by role, and replicate iconic pop-culture ships.",
};

export const viewport: Viewport = {
  themeColor: "#03050a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void-950 text-slate-200 antialiased">
        <BuildProvider>
          <div className="app-grid-bg scanlines relative flex min-h-screen flex-col">
            <Navbar />
            <main className="relative z-10 mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>
            <Footer />
          </div>
        </BuildProvider>
      </body>
    </html>
  );
}
