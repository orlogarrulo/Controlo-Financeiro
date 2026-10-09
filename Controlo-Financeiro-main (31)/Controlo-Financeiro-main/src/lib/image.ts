/** Compressão de imagens para o store e sincronização na nuvem. */

/** Tamanho máximo da data-URL da foto do aluno para ir à nuvem (~40–55 KB). */
export const ALUNO_FOTO_MAX_SYNC = 55_000;

/**
 * Comprime um ficheiro de imagem (JPEG) com dimensões e qualidade configuráveis.
 */
export async function compressImage(
  file: File,
  max = 1400,
  quality = 0.72,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Comprime foto de aluno de forma agressiva para caber no localStorage e na nuvem.
 * - Lado maior ≤ 320 px
 * - Qualidade adaptativa até a data-URL ficar ≤ ALUNO_FOTO_MAX_SYNC
 */
export async function compressStudentPhoto(
  source: File | string,
): Promise<{ dataUrl: string; bytesApprox: number; quality: number }> {
  let bitmap: ImageBitmap;
  if (typeof source === "string") {
    const res = await fetch(source);
    const blob = await res.blob();
    bitmap = await createImageBitmap(blob);
  } else {
    bitmap = await createImageBitmap(source);
  }

  const max = 320;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);
  try {
    bitmap.close();
  } catch {
    /* ignore */
  }

  // Qualidade decrescente até caber no limite de sincronização
  const qualities = [0.58, 0.5, 0.42, 0.35, 0.28];
  let dataUrl = canvas.toDataURL("image/jpeg", qualities[0]);
  let usedQ = qualities[0];
  for (const q of qualities) {
    dataUrl = canvas.toDataURL("image/jpeg", q);
    usedQ = q;
    if (dataUrl.length <= ALUNO_FOTO_MAX_SYNC) break;
  }

  // Aproximação: data-URL base64 ≈ 4/3 do binário
  const bytesApprox = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  return { dataUrl, bytesApprox, quality: usedQ };
}

/** Formata tamanho legível (ex.: "28 KB"). */
export function formatPhotoSize(bytesApprox: number): string {
  if (bytesApprox < 1024) return `${bytesApprox} B`;
  return `${Math.round(bytesApprox / 1024)} KB`;
}
