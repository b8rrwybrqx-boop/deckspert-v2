import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Deckspert Dynamic Delivery Coach",
  description: "Upload a presentation video and receive structured executive delivery coaching."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="border-b border-line bg-ink text-white">
          <div className="page-shell flex items-center justify-between py-5">
            <div>
              <p className="text-sm font-semibold tracking-wide text-white/70">Deckspert</p>
              <h1 className="text-2xl font-semibold">Dynamic Delivery Coach</h1>
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
