import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import LegacyPage from "@/components/legacy-page";

export const metadata: Metadata = {
  title: "Dashboard | Jay Ey",
  description: "Acompanhe as vendas e gerencie o estoque da Jay Ey.",
};

export default function DashboardPage() {
  const legacyDir = path.join(process.cwd(), "src", "legacy");
  const markup = readFileSync(
    path.join(legacyDir, "dashboard.html"),
    "utf8",
  );
  const css = readFileSync(path.join(legacyDir, "dashboard.css"), "utf8");

  return <LegacyPage markup={markup} css={css} scripts={["/js/dashboard.js"]} />;
}
