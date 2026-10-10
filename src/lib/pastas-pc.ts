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

/** PDF A4 de ficha: caixas alinhadas, lugar da foto, sem valores. */
function pdfFormulario(aluno: Aluno, campus: string, quando: string): Uint8Array {
  const v = (x: string | number | undefined | null) =>
    x === undefined || x === null || String(x).trim() === "" ? "" : String(x);
  const esc = (s: string) =>
    s.normalize("NFC").replace(/[^\x20-\xff]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const cmds: string[] = [];
  const text = (x: number, y: number, size: number, s: string) => {
    cmds.push("BT", `/F1 ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${esc(s)}) Tj`, "ET");
  };
  const box = (x: number, y: number, w: number, h: number) => {
    cmds.push(`${x} ${y} ${w} ${h} re S`);
  };
  const field = (x: number, y: number, w: number, label: string, value: string) => {
    text(x, y + 16, 8, label);
    box(x, y, w, 14);
    text(x + 4, y + 4, 9, value.slice(0, Math.floor(w / 5)));
  };

  text(40, 800, 14, "Ecole Consulaire du Congo - Luanda");
  text(40, 782, 11, "FICHA DE MATRICULA");
  text(40, 766, 8, `Campus ${campus}    Actualizada ${quando}`);
  box(430, 730, 120, 90);
  text(462, 770, 9, "FOTO");
  text(448, 756, 7, "colar aqui");

  field(40, 720, 250, "ID", v(aluno.id));
  field(300, 720, 110, "Turma", v(aluno.turma));
  field(40, 684, 510, "Nome completo", v(aluno.nome));
  field(40, 648, 150, "Data de nascimento", v(aluno.dataNascimento));
  field(200, 648, 200, "Lugar de nascimento", v(aluno.lugarNascimento));
  field(410, 648, 140, "Sexo", v(aluno.sexo));
  field(40, 612, 250, "B.I.", v(aluno.bi));
  field(300, 612, 250, "NIF", v(aluno.nif));

  text(40, 590, 10, "FILIACAO E ENCARREGADO");
  field(40, 558, 510, "Nome do pai", v(aluno.pai));
  field(40, 522, 510, "Nome da mae", v(aluno.mae));
  field(40, 486, 330, "Encarregado de educacao", v(aluno.encarregado));
  field(380, 486, 170, "Telefone", v(aluno.telefone));
  field(40, 450, 250, "E-mail", v(aluno.email));
  field(300, 450, 250, "Familia", v(aluno.familia));
  field(40, 414, 510, "Morada", v(aluno.morada));

  text(40, 392, 10, "SAUDE");
  field(40, 360, 165, "Grupo sanguineo", v(aluno.grupoSanguineo));
  field(215, 360, 165, "Alergias medicamentos", v(aluno.alergiasMedicamentos));
  field(390, 360, 160, "Alergias alimentares", v(aluno.alergiasAlimentares));
  field(40, 324, 510, "Clinica mais proxima", v(aluno.clinicaProxima));

  text(40, 302, 10, "OBSERVACOES");
  box(40, 230, 510, 64);
  text(46, 276, 9, v(aluno.obs).slice(0, 90));

  text(40, 200, 9, "Assinatura do encarregado");
  box(40, 150, 230, 36);
  text(300, 200, 9, "Data");
  box(300, 150, 140, 36);
  text(40, 120, 8, "Documento para o dossier do aluno. Sem valores. Gerado pela app.");

  const stream = cmds.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function docTexto(d: DocumentoAluno, aluno: Aluno | undefined, quando: string) {
  const linhas = (d.linhas || [])
    .filter((l) => l.on !== false)
    .map((l) => `  - ${l.label}: ${formatKz(l.value || 0)}`)
    .join("\r\n");
  return [
    `École Consulaire · ${d.tipo === "recibo" ? "Recibo" : "Fatura"} ${d.numero}`,
    `Actualizado automaticamente pela app em ${quando}`,
    "",
    linha("Tipo", d.tipo),
    linha("Modelo", d.modelo),
    linha("Número", d.numero),
    linha("Aluno", d.alunoNome || aluno?.nome),
    linha("ID aluno", d.alunoId),
    linha("Turma", aluno?.turma),
    linha("Mês", d.mesRef || d.mesKey),
    linha("Valor", formatKz(d.valor || 0)),
    linha("Estado", d.estado),
    linha("Emitido em", d.emitidoEm),
    linha("Pago em", d.pagoEm),
    linha("Fatura de origem", d.faturaNumero),
    linha("Código verificação", d.codigoVerificacao),
    linha("Notas", d.notas),
    linhas ? `\r\nLinhas:\r\n${linhas}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\r\n");
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
