import { readFileSync } from "node:fs";
import path from "node:path";
import LegacyPage from "@/components/legacy-page";

export default function HomePage() {
  const legacyDir = path.join(process.cwd(), "src", "legacy");
  const markup = readFileSync(
    path.join(legacyDir, "store.html"),
    "utf8",
  );
  const css = readFileSync(path.join(legacyDir, "store.css"), "utf8");

  return (
    <LegacyPage
      markup={markup}
      css={css}
      scripts={["/supabase-config.js", "/js/store.js", "/js/jay-chat.js"]}
    />
  );
}
