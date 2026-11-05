import { NextResponse } from "next/server";
import { hasDashboardSession } from "@/lib/dashboard-auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);
const STORAGE_BUCKET = "jayey-media";
const STORAGE_OBJECT = "store/music";

export async function POST(request: Request) {
  if (!hasDashboardSession(request)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_SIZE + 64 * 1024) {
    return NextResponse.json({ error: "O arquivo de áudio excede o limite de 5 MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo enviado." }, { status: 400 });
  }

  const file = formData.get("music");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Selecione um arquivo de áudio." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "O arquivo de áudio excede o limite de 5 MB." }, { status: 413 });
  }
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Formato não aceito. Envie um arquivo MP3, M4A, OGG, WAV ou WebM de até 5 MB." },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const apiKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !apiKey) {
    return NextResponse.json(
      { error: "O armazenamento de áudio não está configurado no servidor." },
      { status: 503 },
    );
  }

  const objectPath = STORAGE_OBJECT.split("/").map(encodeURIComponent).join("/");
  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`,
      {
        method: "POST",
        headers: {
          apikey: apiKey,
          ...(apiKey.startsWith("sb_secret_")
            ? {}
            : { Authorization: `Bearer ${apiKey}` }),
          "Content-Type": file.type,
          "x-upsert": "true",
        },
        body: await file.arrayBuffer(),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível conectar ao armazenamento de áudio." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    console.error("Supabase music upload failed", { status: response.status });
    return NextResponse.json(
      {
        error:
          response.status === 404
            ? "O espaço de áudio ainda não foi criado. Configure o bucket jayey-media no Supabase e tente novamente."
            : `Não foi possível salvar a música no Supabase (HTTP ${response.status}).`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ uploaded: true });
}
