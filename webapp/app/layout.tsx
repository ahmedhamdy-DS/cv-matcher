import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitMatch — find the roles that actually fit",
  description:
    "Upload your CV and see which open roles genuinely match your experience, with a clear breakdown of strengths and gaps for each.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
