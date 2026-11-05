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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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
    const responseText = await response.text();
    let storageError: unknown = null;
    try {
      storageError = JSON.parse(responseText);
    } catch {
      storageError = null;
    }
    const storageMessage =
      isRecord(storageError) && typeof storageError.message === "string"
        ? storageError.message
        : isRecord(storageError) && typeof storageError.error === "string"
          ? storageError.error
          : "";
    console.error("Supabase music upload failed", {
      status: response.status,
      code:
        isRecord(storageError) && typeof storageError.error === "string"
          ? storageError.error
          : undefined,
    });

    let error =
      `Não foi possível salvar a música no Supabase (HTTP ${response.status}).`;
    if (/mime|content.?type/i.test(storageMessage)) {
      error =
        "O Supabase recusou o formato de áudio. Execute novamente o arquivo supabase-music.sql no SQL Editor do projeto Supabase usado pelo site.";
    } else if (response.status === 400) {
      error =
        "O Supabase recusou o arquivo. Verifique se o bucket jayey-media existe e execute novamente supabase-music.sql no SQL Editor do projeto Supabase usado pelo site.";
    } else if (response.status === 413) {
      error =
        "O Supabase recusou o arquivo por exceder o limite permitido. Envie um áudio de até 5 MB.";
    } else if (response.status === 404) {
      error =
        "O espaço de áudio ainda não foi criado. Execute supabase-music.sql no SQL Editor do Supabase e tente novamente.";
    }

    return NextResponse.json(
      { error },
      { status: 502 },
    );
  }

  return NextResponse.json({ uploaded: true });
}
