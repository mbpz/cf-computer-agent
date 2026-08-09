import { DurableObject } from "cloudflare:workers";
import { type DurableObjectStorageLike, getWorkspace, withWorkspace } from "@cloudflare/computer";
import { safeId, searchNotes, type NoteRecord, type SearchDocument } from "./search";
import { UI } from "./ui";

const INDEX_PATH = "/workspace/.memory/index.json";
const MAX_NOTE_BYTES = 128 * 1024;
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

export class KnowledgeBase extends withWorkspace(
  class extends DurableObject<Env> {},
  (self) => ({
    storage: (self as unknown as { ctx: DurableObjectState }).ctx.storage as unknown as DurableObjectStorageLike,
  }),
) {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(UI, { headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" } });
    }
    if (!url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("personal"));
    using workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true });
      if (url.pathname === "/api/notes" && request.method === "GET") return json({ notes: await readIndex(workspace) });
      if (url.pathname === "/api/notes" && request.method === "POST") {
        const body = await bodyAs<Partial<{ id: string; title: string; tags: string[]; content: string }>>(request);
        if (!body.title?.trim() || !body.content?.trim()) return json({ error: "title and content are required" }, 400);
        if (new TextEncoder().encode(body.content).byteLength > MAX_NOTE_BYTES) return json({ error: "note exceeds 128 KiB" }, 413);
        const index = await readIndex(workspace);
        const now = new Date().toISOString();
        const baseId = safeId(body.id || body.title);
        const existing = index.find((note) => note.id === baseId);
        const note: NoteRecord = {
          id: baseId,
          title: body.title.trim().slice(0, 160),
          tags: Array.isArray(body.tags) ? body.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 20) : [],
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          path: `/workspace/notes/${baseId}.md`,
        };
        await workspace.fs.mkdir("/workspace/notes", { recursive: true });
        await workspace.fs.mkdir("/workspace/.memory", { recursive: true });
        await workspace.fs.writeFile(note.path, body.content);
        const next = [note, ...index.filter((item) => item.id !== note.id)];
        await workspace.fs.writeFile(INDEX_PATH, JSON.stringify(next));
        return json({ note }, existing ? 200 : 201);
      }
      if (url.pathname === "/api/search" && request.method === "GET") {
        const hits = await retrieve(workspace, url.searchParams.get("q") || "");
        return json({ hits });
      }
      if (url.pathname === "/api/chat" && request.method === "POST") {
        const { question } = await bodyAs<{ question?: string }>(request);
        if (!question?.trim()) return json({ error: "question is required" }, 400);
        const sources = await retrieve(workspace, question, 6);
        if (!sources.length) return json({ answer: "知识库中没有足够依据回答这个问题。请先添加相关笔记。", sources: [] });
        const context = sources.map((source, i) => `[${i + 1}] ${source.title}\n${source.excerpt}`).join("\n\n");
        const result = await env.AI.run(MODEL, {
          messages: [
            { role: "system", content: "你是个人知识库助手。只能依据给定资料回答；不得编造。用中文简洁回答，事实后标注 [1] 形式的来源编号。资料不足时明确说明。" },
            { role: "user", content: `问题：${question}\n\n资料：\n${context}` },
          ],
          max_tokens: 700,
        });
        const answer = typeof result === "string" ? result : (result as { response?: string }).response || "模型没有返回文本。";
        return json({ answer, sources });
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error instanceof Error ? error.message : "internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function authorized(request: Request, env: Env): boolean {
  if (!env.APP_TOKEN) return true;
  return request.headers.get("authorization") === `Bearer ${env.APP_TOKEN}`;
}

async function readIndex(workspace: Awaited<ReturnType<typeof getWorkspace>>): Promise<NoteRecord[]> {
  try {
    const raw = await workspace.fs.readFile(INDEX_PATH, "utf8");
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

async function retrieve(workspace: Awaited<ReturnType<typeof getWorkspace>>, query: string, limit = 8) {
  const index = await readIndex(workspace);
  const documents: SearchDocument[] = [];
  for (const note of index) {
    try { documents.push({ ...note, content: await workspace.fs.readFile(note.path, "utf8") }); }
    catch (error) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
  }
  return searchNotes(query, documents, limit);
}

async function bodyAs<T>(request: Request): Promise<T> {
  if (!(request.headers.get("content-type") || "").includes("application/json")) throw new Error("content-type must be application/json");
  return request.json<T>();
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
