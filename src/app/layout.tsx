import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Chardin",
  description:
    "An original atmospheric browser world built as a tiny spherical place to explore.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
