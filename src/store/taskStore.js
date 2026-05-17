import crypto from "node:crypto";
import Database from "better-sqlite3";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.join(__dirname, "..", "workspace");
const dbPath = path.join(workspaceDir, "tasks.db");

let db = null;

function getDb() {
  if (db) return db;

  fs.mkdir(workspaceDir, { recursive: true }).catch(() => {});
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      phase TEXT NOT NULL DEFAULT 'queued',
      message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      source_data TEXT,
      scout_result TEXT,
      selected_project_ids TEXT,
      audit_result TEXT,
      report TEXT,
      progress_data TEXT,
      memory_snapshot TEXT,
      memory_summary TEXT,
      error TEXT
    )
  `);

  return db;
}

function serializeTask(task) {
  return {
    id: task.id,
    status: task.status,
    phase: task.phase,
    message: task.message,
    created_at: task.createdAt,
    updated_at: task.updatedAt || null,
    source_data: JSON.stringify({
      sourceType: task.sourceType,
      query: task.query,
      cmsType: task.cmsType,
      industry: task.industry,
      localRepoPaths: task.localRepoPaths,
      minAdoption: task.minAdoption,
      useMemory: task.useMemory,
      selectedSkillIds: task.selectedSkillIds
    }),
    scout_result: task.scoutResult ? JSON.stringify(task.scoutResult) : null,
    selected_project_ids: JSON.stringify(task.selectedProjectIds),
    audit_result: task.auditResult ? JSON.stringify(task.auditResult) : null,
    report: task.report,
    progress_data: JSON.stringify(task.progress),
    memory_snapshot: task.memorySnapshot ? JSON.stringify(task.memorySnapshot) : null,
    memory_summary: task.memorySummary ? JSON.stringify(task.memorySummary) : null,
    error: task.error
  };
}

function deserializeTask(row) {
  const sourceData = JSON.parse(row.source_data || "{}");
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceType: sourceData.sourceType,
    query: sourceData.query,
    cmsType: sourceData.cmsType,
    industry: sourceData.industry,
    localRepoPaths: sourceData.localRepoPaths || [],
    minAdoption: sourceData.minAdoption,
    useMemory: sourceData.useMemory,
    selectedSkillIds: sourceData.selectedSkillIds || [],
    scoutResult: row.scout_result ? JSON.parse(row.scout_result) : null,
    selectedProjectIds: JSON.parse(row.selected_project_ids || "[]"),
    auditResult: row.audit_result ? JSON.parse(row.audit_result) : null,
    report: row.report,
    progress: JSON.parse(row.progress_data || "{}"),
    memorySnapshot: row.memory_snapshot ? JSON.parse(row.memory_snapshot) : null,
    memorySummary: row.memory_summary ? JSON.parse(row.memory_summary) : null,
    error: row.error
  };
}

const taskListeners = new Map();

export function createTaskStore() {
  const memory = new Map();

  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
    for (const row of rows) {
      const task = deserializeTask(row);
      if (task.status === "running") {
        task.status = "queued";
        task.phase = "queued";
        task.message = "Task recovered after server restart.";
      }
      memory.set(task.id, task);
    }
  } catch {
    // ignore persistence errors
  }

  function persist(task) {
    try {
      const db = getDb();
      const existing = db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(task.id);
      const data = serializeTask(task);

      if (existing) {
        const fields = Object.keys(data).filter(k => k !== "id").map(k => `${k} = @${k}`).join(", ");
        db.prepare(`UPDATE tasks SET ${fields} WHERE id = @id`).run(data);
      } else {
        const cols = Object.keys(data).join(", ");
        const vals = Object.keys(data).map(k => `@${k}`).join(", ");
        db.prepare(`INSERT INTO tasks (${cols}) VALUES (${vals})`).run(data);
      }
    } catch {
      // ignore persistence errors
    }
  }

  function notifyListeners(task, event = "update") {
    const listeners = taskListeners.get(task.id) || [];
    for (const listener of listeners) {
      try {
        listener({ event, task: { id: task.id, status: task.status, phase: task.phase, message: task.message, progress: task.progress } });
      } catch {
        // ignore listener errors
      }
    }
  }

  return {
    subscribe(id, callback) {
      if (!taskListeners.has(id)) {
        taskListeners.set(id, []);
      }
      taskListeners.get(id).push(callback);
      return () => {
        const list = taskListeners.get(id);
        if (list) {
          const idx = list.indexOf(callback);
          if (idx >= 0) list.splice(idx, 1);
        }
      };
    },

    createTask(input = {}) {
      const task = {
        id: crypto.randomUUID(),
        status: "queued",
        phase: "queued",
        message: "Task accepted.",
        createdAt: new Date().toISOString(),
        updatedAt: null,
        sourceType: input.sourceType || "github",
        query: input.query || 'topic:cms OR "headless cms" OR "content management system"',
        cmsType: input.cmsType || "all",
        industry: input.industry || "all",
        localRepoPaths: Array.isArray(input.localRepoPaths) ? input.localRepoPaths : [],
        minAdoption: Number(input.minAdoption || 100),
        useMemory: input.useMemory !== false,
        selectedSkillIds: Array.isArray(input.selectedSkillIds) ? input.selectedSkillIds : [],
        scoutResult: null,
        selectedProjectIds: [],
        auditResult: null,
        report: null,
        progress: {
          stage: "queued",
          label: "等待开始",
          detail: "",
          percent: 0,
          current: 0,
          total: 0
        },
        memorySnapshot: null,
        memorySummary: null,
        error: null
      };
      memory.set(task.id, task);
      persist(task);
      notifyListeners(task, "created");
      return task;
    },

    listTasks() {
      return Array.from(memory.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    getTask(id) {
      return memory.get(id) || null;
    },

    updateTask(id, patch) {
      const task = memory.get(id);
      if (!task) {
        return null;
      }
      Object.assign(task, patch, { updatedAt: new Date().toISOString() });
      persist(task);
      notifyListeners(task, "update");
      return task;
    },

    completeTask(id, patch) {
      return this.updateTask(id, { ...patch, status: "completed" });
    },

    failTask(id, error) {
      return this.updateTask(id, {
        status: "failed",
        phase: "failed",
        message: "Task failed.",
        error
      });
    }
  };
}