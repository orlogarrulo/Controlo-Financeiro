/**
 * Pastas Windows no PC, sincronizadas com a app (Chrome / Edge).
 *
 * Estrutura (dentro da pasta que o utilizador escolher):
 *   campus cidade/
 *     Nome do aluno (ID)/
 *       ficha de matrícula/
 *       recibos/
 *       faturas/
 *   campus Nova Vida/
 *     …
 *
 * O browser só escreve depois de uma autorização explícita (File System Access API).
 * A permissão fica gravada neste PC/origem; matrículas, recibos e faturas novos
 * actualizam as pastas automaticamente enquanto a permissão estiver activa.
 */
import type { Aluno, DocumentoAluno } from "@/data/types";
import { formatKz } from "@/lib/format";
import { alunosAll, useFinance } from "@/lib/store";
import { LOGO_FICHA_JPEG_B64, LOGO_FICHA_W, LOGO_FICHA_H } from "@/lib/logo-ficha-pdf";

export const PASTA_CAMPUS_CIDADE = "campus cidade";
export const PASTA_CAMPUS_NOVA_VIDA = "campus Nova Vida";
export const SUBPASTAS_ALUNO = ["ficha de matrícula", "recibos", "faturas"] as const;

const DB_NAME = "ecc-pastas-pc";
const DB_STORE = "kv";
const HANDLE_KEY = "root";

export type PastasPcStatus = {
  suportado: boolean;
  ligada: boolean;
  nomePasta: string;
  precisaAutorizacao: boolean;
  aSincronizar: boolean;
  ultimaSync: string;
  alunos: number;
  campusCidade: number;
  campusNovaVida: number;
  erro: string;
};

type StatusListener = (s: PastasPcStatus) => void;

const listeners = new Set<StatusListener>();
let rootHandle: FileSystemDirectoryHandle | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let syncing = false;
let ultimaSync = "";
let ultimoErro = "";
let precisaAutorizacao = false;

function emptyStatus(): PastasPcStatus {
  return {
    suportado: typeof window !== "undefined" && "showDirectoryPicker" in window,
    ligada: Boolean(rootHandle),
    nomePasta: rootHandle?.name || "",
    precisaAutorizacao,
    aSincronizar: syncing,
    ultimaSync,
    alunos: 0,
    campusCidade: 0,
    campusNovaVida: 0,
    erro: ultimoErro,
  };
}

function emit() {
  const s = emptyStatus();
  for (const fn of listeners) fn(s);
}

export function onPastasPcStatus(fn: StatusListener): () => void {
  listeners.add(fn);
  fn(emptyStatus());
  return () => listeners.delete(fn);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function campusPasta(aluno: Pick<Aluno, "transferidoCampusCidade" | "obs" | "nome">): string {
  if (aluno.transferidoCampusCidade) return PASTA_CAMPUS_CIDADE;
  const blob = `${aluno.obs || ""} ${aluno.nome || ""}`;
  if (/campus\s*cidade/i.test(blob)) return PASTA_CAMPUS_CIDADE;
  return PASTA_CAMPUS_NOVA_VIDA;
}

export function nomePastaAluno(aluno: Pick<Aluno, "nome" | "id">): string {
  const nome = (aluno.nome || "Sem nome")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const id = (aluno.id || "sem-id").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").slice(0, 24);
  return `${nome} (${id})`;
}

async function ensureDir(parent: FileSystemDirectoryHandle, name: string) {
  return parent.getDirectoryHandle(name, { create: true });
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

async function writeBytes(dir: FileSystemDirectoryHandle, name: string, data: Uint8Array) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

function linha(label: string, value: string | number | undefined | null) {
  const v = value === undefined || value === null || value === "" ? "—" : String(value);
  return `${label}: ${v}`;
}

/** Texto seguro para PDF WinAnsi: acentos de FR/PT ficam correctos. */
function pdfTexto(s: string): string {
  const extra: Record<string, number> = {
    "\u0152": 0x8c, "\u0153": 0x9c, "\u20ac": 0x80, "\u201c": 0x93, "\u201d": 0x94,
    "\u2018": 0x91, "\u2019": 0x92, "\u2013": 0x96, "\u2014": 0x97, "\u2026": 0x85,
  };
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0) ?? 63;
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += "\\" + c.toString(8).padStart(3, "0");
    else if (extra[ch]) out += "\\" + extra[ch].toString(8).padStart(3, "0");
    else out += "?";
  }
  return out;
}

function campusVisivel(campus: string): string {
  return campus.replace(/^campus\s+/i, "").trim() || campus;
}

/** PDF A4: logotipo, caixas, foto, francês, sem valores. */
function pdfFormulario(aluno: Aluno, campus: string, quando: string): Uint8Array {
  const v = (x: string | number | undefined | null) =>
    x === undefined || x === null || String(x).trim() === "" ? "" : String(x);
  const cmds: string[] = [];
  const text = (x: number, y: number, size: number, s: string) => {
    cmds.push("BT", `/F1 ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfTexto(s)}) Tj`, "ET");
  };
  const box = (x: number, y: number, w: number, h: number) => {
    cmds.push(`${x} ${y} ${w} ${h} re S`);
  };
  const field = (x: number, y: number, w: number, label: string, value: string) => {
    text(x, y + 15, 8, label);
    box(x, y, w, 13);
    text(x + 4, y + 3, 9, value.slice(0, Math.max(8, Math.floor(w / 5.2))));
  };

  cmds.push("q", "78 0 0 78 40 748 cm", "/Im1 Do", "Q");
  text(128, 800, 13, "École Consulaire");
  text(128, 784, 9, "de la République du Congo");
  text(128, 768, 11, "FICHE D'INSCRIPTION");
  text(128, 754, 8, `Campus ${campusVisivel(campus)}`);
  box(455, 742, 100, 84);
  text(488, 778, 9, "PHOTO");
  text(468, 764, 7, "coller ici");

  field(40, 708, 170, "Matricule", v(aluno.id));
  field(220, 708, 200, "Classe", v(aluno.turma));
  field(430, 708, 125, "Sexe", v(aluno.sexo));
  field(40, 672, 515, "Nom complet", v(aluno.nome));
  field(40, 636, 170, "Date de naissance", v(aluno.dataNascimento));
  field(220, 636, 335, "Lieu de naissance", v(aluno.lugarNascimento));
  field(40, 600, 250, "Carte d'identité", v(aluno.bi));
  field(300, 600, 255, "NIF", v(aluno.nif));

  text(40, 578, 10, "FILIATION ET RESPONSABLE");
  field(40, 546, 515, "Nom du père", v(aluno.pai));
  field(40, 510, 515, "Nom de la mère", v(aluno.mae));
  field(40, 474, 330, "Responsable légal", v(aluno.encarregado));
  field(380, 474, 175, "Téléphone", v(aluno.telefone));
  field(40, 438, 250, "E-mail", v(aluno.email));
  field(300, 438, 255, "Famille", v(aluno.familia));
  field(40, 402, 515, "Adresse", v(aluno.morada));

  text(40, 380, 10, "SANTÉ");
  field(40, 348, 165, "Groupe sanguin", v(aluno.grupoSanguineo));
  field(215, 348, 165, "Allergies médicaments", v(aluno.alergiasMedicamentos));
  field(390, 348, 165, "Allergies alimentaires", v(aluno.alergiasAlimentares));
  field(40, 312, 515, "Clinique la plus proche", v(aluno.clinicaProxima));

  text(40, 290, 10, "OBSERVATIONS");
  box(40, 214, 515, 68);
  text(46, 264, 9, v(aluno.obs).slice(0, 95));

  text(40, 196, 9, "Signature du responsable");
  box(40, 148, 230, 36);
  text(300, 196, 9, "Date");
  box(300, 148, 140, 36);
  text(40, 42, 8, `Mise à jour ${quando}`);

  const stream = cmds.join("\n");
  const logo = Uint8Array.from(atob(LOGO_FICHA_JPEG_B64), (c) => c.charCodeAt(0));
  const objects: Array<string | Uint8Array> = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n",
    `6 0 obj << /Type /XObject /Subtype /Image /Width ${LOGO_FICHA_W} /Height ${LOGO_FICHA_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >> stream\n`,
    logo,
    "\nendstream\nendobj\n",
  ];
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [enc.encode("%PDF-1.4\n")];
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(parts.reduce((n, b) => n + b.length, 0));
    parts.push(typeof obj === "string" ? enc.encode(obj) : obj);
  }
  const xref = parts.reduce((n, b) => n + b.length, 0);
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) tail += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  tail += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  parts.push(enc.encode(tail));
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}

function nomeFicheiroDoc(d: DocumentoAluno) {
  const n = `${d.numero || d.id || "doc"}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 60);
  return `${n}.txt`;
}

async function syncAluno(
  campusDir: FileSystemDirectoryHandle,
  aluno: Aluno,
  docs: DocumentoAluno[],
  quando: string,
) {
  const campus = campusPasta(aluno);
  const pasta = await ensureDir(campusDir, nomePastaAluno(aluno));
  const ficha = await ensureDir(pasta, "ficha de matrícula");
  const recibos = await ensureDir(pasta, "recibos");
  const faturas = await ensureDir(pasta, "faturas");
  await writeBytes(ficha, "ficha-de-matricula.pdf", pdfFormulario(aluno, campus, quando));
  try {
    await ficha.removeEntry("ficha-de-matricula.txt");
  } catch {
    /* o txt antigo pode não existir */
  }
  await writeText(
    pasta,
    "_ecc-aluno.txt",
    `id=${aluno.id}\r\ncampus=${campus}\r\nactualizado=${quando}\r\n`,
  );

  const doAluno = docs.filter((d) => d.alunoId === aluno.id);
  const recs = doAluno.filter((d) => d.tipo === "recibo");
  const fats = doAluno.filter((d) => d.tipo === "fatura");
  if (aluno.recibo) {
    await writeText(
      recibos,
      "recibo-matricula.txt",
      [
        "Recibo indicado na matrícula",
        linha("Número", aluno.recibo),
        linha("Aluno", aluno.nome),
        linha("Valor líquido", formatKz(aluno.liquido || 0)),
        linha("Data", aluno.dataPag),
        linha("Estado", aluno.statusPag),
        `Actualizado em ${quando}`,
        "",
      ].join("\r\n"),
    );
  }
  for (const d of recs) await writeText(recibos, nomeFicheiroDoc(d), docTexto(d, aluno, quando));
  for (const d of fats) await writeText(faturas, nomeFicheiroDoc(d), docTexto(d, aluno, quando));
  await writeText(
    recibos,
    "_lista.txt",
    recs.length
      ? recs.map((d) => `${d.numero}\t${d.estado}\t${formatKz(d.valor || 0)}\t${d.emitidoEm || ""}`).join("\r\n") +
          "\r\n"
      : `Sem recibos emitidos no arquivo.\r\nMatrícula: ${aluno.recibo || "—"}\r\nActualizado ${quando}\r\n`,
  );
  await writeText(
    faturas,
    "_lista.txt",
    fats.length
      ? fats.map((d) => `${d.numero}\t${d.estado}\t${formatKz(d.valor || 0)}\t${d.emitidoEm || ""}`).join("\r\n") +
          "\r\n"
      : `Sem faturas emitidas no arquivo.\r\nActualizado ${quando}\r\n`,
  );
}

export async function sincronizarPastasPc(handle?: FileSystemDirectoryHandle): Promise<{
  alunos: number;
  campusCidade: number;
  campusNovaVida: number;
}> {
  const root = handle || rootHandle;
  if (!root) throw new Error("Escolha primeiro a pasta do PC.");
  const perm = await root.queryPermission?.({ mode: "readwrite" });
  if (perm === "denied") {
    precisaAutorizacao = true;
    emit();
    throw new Error("Permissão recusada. Volte a ligar a pasta.");
  }
  if (perm !== "granted") {
    const asked = await root.requestPermission?.({ mode: "readwrite" });
    if (asked !== "granted") {
      precisaAutorizacao = true;
      emit();
      throw new Error("Autorize a pasta no Chrome ou Edge para a app poder criar as pastas.");
    }
  }
  precisaAutorizacao = false;
  syncing = true;
  ultimoErro = "";
  emit();
  try {
    const st = useFinance.getState();
    const alunos = alunosAll(st.alunosExtra || [], st.alunosOverrides || {}, st.alunosDeletedIds || []);
    const docs = st.documentosAluno || [];
    const quando = new Date().toLocaleString("pt-PT");
    const cidade = await ensureDir(root, PASTA_CAMPUS_CIDADE);
    const nova = await ensureDir(root, PASTA_CAMPUS_NOVA_VIDA);
    let nCidade = 0;
    let nNova = 0;
    for (const aluno of alunos) {
      const campus = campusPasta(aluno);
      if (campus === PASTA_CAMPUS_CIDADE) nCidade += 1;
      else nNova += 1;
      await syncAluno(campus === PASTA_CAMPUS_CIDADE ? cidade : nova, aluno, docs, quando);
    }
    await writeText(
      root,
      "_LEIA-ME-PASTAS.txt",
      [
        "Pastas criadas e actualizadas pela app École Consulaire.",
        `Última sincronização: ${quando}`,
        `Alunos: ${alunos.length} · campus cidade: ${nCidade} · campus Nova Vida: ${nNova}`,
        "",
        "Não renomeie «campus cidade» nem «campus Nova Vida».",
        "Cada aluno tem: ficha de matrícula / recibos / faturas.",
        "Nova matrícula, alteração ou novo recibo/fatura volta a escrever estes ficheiros.",
        "",
      ].join("\r\n"),
    );
    ultimaSync = quando;
    return { alunos: alunos.length, campusCidade: nCidade, campusNovaVida: nNova };
  } catch (e) {
    ultimoErro = e instanceof Error ? e.message : "Falha ao sincronizar pastas";
    throw e;
  } finally {
    syncing = false;
    emit();
  }
}

/** Debounce: matrícula / recibo / fatura disparam actualização da pasta. */
export function agendarSyncPastasPc() {
  if (!rootHandle || syncing) {
    if (!rootHandle) return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void sincronizarPastasPc().catch((e) => {
      ultimoErro = e instanceof Error ? e.message : "Falha ao sincronizar";
      emit();
    });
  }, 1200);
}

export async function ligarPastaPc(): Promise<string> {
  if (!("showDirectoryPicker" in window)) {
    throw new Error("Use Chrome ou Edge no Windows. O Firefox não deixa a app criar pastas no PC.");
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "ecc-pastas-alunos" });
  rootHandle = handle;
  await idbSet(HANDLE_KEY, handle);
  precisaAutorizacao = false;
  emit();
  await sincronizarPastasPc(handle);
  return handle.name;
}

export async function desligarPastaPc() {
  rootHandle = null;
  await idbDel(HANDLE_KEY);
  ultimaSync = "";
  emit();
}

export async function restaurarPastaPc() {
  if (typeof window === "undefined" || !("showDirectoryPicker" in window)) return;
  try {
    const saved = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
    if (!saved) return;
    rootHandle = saved;
    const perm = await saved.queryPermission?.({ mode: "readwrite" });
    precisaAutorizacao = perm !== "granted";
    emit();
    if (perm === "granted") agendarSyncPastasPc();
  } catch {
    /* sem pasta ligada */
  }
}

/** Pedido de gesto do utilizador quando o Chrome precisa de reautorizar. */
export async function reautorizarPastaPc() {
  if (!rootHandle) throw new Error("Ainda não há pasta ligada.");
  const perm = await rootHandle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") throw new Error("Permissão não concedida.");
  precisaAutorizacao = false;
  await sincronizarPastasPc(rootHandle);
}

export function iniciarSyncPastasPc() {
  if (started || typeof window === "undefined") return;
  started = true;
  void restaurarPastaPc();
  useFinance.subscribe((state, prev) => {
    if (!rootHandle) return;
    if (
      state.alunosExtra !== prev.alunosExtra ||
      state.alunosOverrides !== prev.alunosOverrides ||
      state.alunosDeletedIds !== prev.alunosDeletedIds ||
      state.documentosAluno !== prev.documentosAluno
    ) {
      agendarSyncPastasPc();
    }
  });
}
