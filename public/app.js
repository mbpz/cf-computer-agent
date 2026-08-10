const byId = (id) => document.getElementById(id);
const token = () => localStorage.getItem("memory-token") || "";
const headers = () => ({
  "content-type": "application/json",
  authorization: `Bearer ${token()}`,
});

function setToken() {
  const value = prompt("APP_TOKEN（未配置服务端令牌时可留空）", token());
  if (value !== null) localStorage.setItem("memory-token", value);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) throw Error(errorMessage(data, response.statusText));
  return data;
}

function errorMessage(data, fallback) {
  if (data && typeof data.error === "object" && typeof data.error.message === "string") {
    return data.error.message;
  }
  return typeof data?.error === "string" ? data.error : fallback;
}

async function saveNote() {
  const status = byId("save-status");
  try {
    const data = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: byId("title").value,
        tags: byId("tags").value.split(",").map((value) => value.trim()).filter(Boolean),
        content: byId("content").value,
      }),
    });
    status.textContent = `已保存：${data.note.title}`;
    byId("content").value = "";
  } catch (error) {
    status.textContent = error.message;
  }
}

function drawHits(hits, target = byId("results")) {
  target.innerHTML = hits.map((hit) => `<div class="hit"><b>${escapeHtml(hit.title)}</b><p>${escapeHtml(hit.excerpt)}</p>${hit.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`).join("") || "<p class=\"muted\">没有结果</p>";
}

async function search() {
  const results = byId("results");
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(byId("search").value)}`);
    drawHits(data.hits);
  } catch (error) {
    results.textContent = error.message;
  }
}

async function ask() {
  const answer = byId("answer");
  const sources = byId("sources");
  answer.className = "muted";
  answer.textContent = "正在阅读知识库…";
  sources.innerHTML = "";
  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ question: byId("question").value }),
    });
    answer.className = "";
    answer.textContent = data.answer;
    drawHits(data.sources, sources);
  } catch (error) {
    answer.textContent = error.message;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[character]));
}

byId("set-token").addEventListener("click", setToken);
byId("note-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void saveNote();
});
byId("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void search();
});
byId("question-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void ask();
});
