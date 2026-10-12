import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agenda Fácil | Gestão para padel",
    template: "%s · Agenda Fácil",
  },
  description: "Organize aulas, acompanhe alunos e gerencie mensalidades de padel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
