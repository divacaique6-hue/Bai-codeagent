# Bai-codeagent 改进文档

本文档详细介绍本次改进新增的功能、优化项以及与原有功能的对比。

---

## 改进概述

本次改进共实现 8 个核心功能增强：

| 序号 | 功能 | 优先级 | 状态 |
|------|------|--------|------|
| 1 | SQLite 任务持久化 | 高 | ✅ 已完成 |
| 2 | SSE 实时进度推送 | 高 | ✅ 已完成 |
| 3 | 任务取消功能 | 中 | ✅ 已完成 |
| 4 | FOFA API 集成 | 中 | ✅ 已完成 |
| 5 | Docker 部署支持 | 中 | ✅ 已完成 |
| 6 | 规则层精确化 | 高 | ✅ 已完成 |
| 7 | LLM 提示词改进 | 高 | ✅ 已完成 |
| 8 | 审计 Skill 扩展 | 中 | ✅ 已完成 |

---

## 改进详情

### 1. SQLite 任务持久化

#### 改进前

- 任务存储在内存 Map 中
- 服务重启后所有任务丢失
- 运行中的任务状态无法恢复

```javascript
// 原有的内存存储实现
const tasks = new Map();
function createTaskStore() {
  return {
    createTask(input = {}) {
      const task = { id: crypto.randomUUID(), ... };
      tasks.set(task.id, task);
      return task;
    },
    // ...
  };
}
```

#### 改进后

- 任务持久化到 SQLite 数据库
- 服务重启后任务状态自动恢复
- 运行中任务标记为「待恢复」状态

**新增文件**：`workspace/tasks.db`

**关键代码**：

```javascript
// taskStore.js - SQLite 持久化
import Database from "better-sqlite3";

function createTaskStore() {
  const memory = new Map();
  const db = getDb(); // 初始化 SQLite 连接

  // 服务启动时从数据库恢复任务
  const rows = db.prepare("SELECT * FROM tasks").all();
  for (const row of rows) {
    const task = deserializeTask(row);
    if (task.status === "running") {
      task.status = "queued"; // 重启后标记为待执行
      task.message = "Task recovered after server restart.";
    }
    memory.set(task.id, task);
  }

  // 任务状态变更时自动持久化
  function persist(task) {
    const data = serializeTask(task);
    db.prepare(`INSERT OR REPLACE INTO tasks ...`).run(data);
  }
}
```

**配置变更**：`package.json` 新增依赖

```json
{
  "dependencies": {
    "better-sqlite3": "^11.7.0"
  }
}
```

---

### 2. SSE 实时进度推送

#### 改进前

- 前端每 1.8 秒轮询一次 `/api/tasks/{id}`
- 延迟高，资源浪费用户体验不佳

```javascript
// 原有的轮询实现
refreshTimer = setInterval(refreshAuditPage, 1800);
```

#### 改进后

- 使用 Server-Sent Events 推送任务进度
- 延迟降低到毫秒级
- 服务端主动推送，无需频繁请求

**新增 API**：

```
GET /api/tasks/{taskId}/stream
```

**响应示例**：

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: update
data: {"id":"xxx","status":"running","phase":"audit-analyst","message":"正在审计...","progress":{"stage":"llm-review","label":"正在 LLM 复核","percent":68}}

event: update
data: {"id":"xxx","status":"completed","phase":"completed","message":"审计完成","progress":{"stage":"completed","percent":100}}
```

**前端连接代码**：

```javascript
// public/app.js - SSE 连接
function connectSse(taskId) {
  sseConnection = new EventSource(`/api/tasks/${taskId}/stream`);
  sseConnection.addEventListener("update", (event) => {
    const task = JSON.parse(event.data);
    refreshAuditPage(); // 收到更新后刷新页面
  });
}
```

---

### 3. 任务取消功能

#### 改进前

- 任务启动后无法中断
- 只能等待任务完成或重启服务

#### 改进后

- 用户可随时取消运行中的任务
- 取消后任务状态标记为「cancelled」

**新增 API**：

```
POST /api/tasks/cancel
Body: { "taskId": "xxx" }
```

**前端取消按钮**：

```javascript
// 页面动态渲染取消按钮
${task.status === "running" ? `<button id="cancel-task-button">取消任务</button>` : ""}
```

---

### 4. FOFA API 集成

#### 改进前

- FOFA 配置只支持「仅存档」，不实际调用

```html
<!-- settings.html -->
<input name="fofaApiKey" placeholder="仅存档，不自动调用" />
```

#### 改进后

- 支持 FOFA 资产快速发现
- 新增快速查询 API

**新增 Agent**：`src/agents/fofaScoutAgent.js`

```javascript
export class FofaScoutAgent {
  async run({ query, size = 20 }) {
    const config = await this.getFofaConfig();
    const results = await this.searchAssets(query, config, limit);
    return { status: "completed", projects: results };
  }
}
```

**新增 API**：

```
GET /api/fofa/quick?q=theme:cms+port:80
```

**响应示例**：

```json
{
  "status": "completed",
  "source": "fofa",
  "query": "theme:cms",
  "projects": [
    {
      "id": "fofa-0-xxx",
      "sourceType": "fofa",
      "name": "Strapi CMS",
      "host": "api.example.com",
      "protocol": "https",
      "port": 443,
      "country": "United States",
      "organization": "Cloudflare"
    }
  ]
}
```

**连接测试增强**：

```javascript
// testConnections 新增 FOFA 测试
async function testConnections(settings) {
  const [llmTest, githubTest, fofaTest] = await Promise.all([
    testLlmConnection(llm),
    testGithubConnection(settings.github),
    testFofaConnection(settings.fofa)
  ]);
  return { llm: llmTest, github: githubTest, fofa: fofaTest };
}
```

---

### 5. Docker 部署支持

#### 改进前

- 仅支持本地 `node server.js` 启动

#### 改进后

- 支持 Docker Compose 一键部署
- 支持环境变量配置

**新增文件**：

| 文件 | 说明 |
|------|------|
| `Dockerfile` | 容器镜像定义 |
| `docker-compose.yml` | 服务编排配置 |
| `.dockerignore` | 构建排除文件 |
| `.env.example` | 环境变量模板 |

**Dockerfile 关键内容**：

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3000
VOLUME ["/app/workspace"]
CMD ["node", "server.js"]
```

**启动方式**：

```bash
# 方式1: 使用 Docker Compose
cp .env.example .env
# 编辑 .env 填入 API Key
docker-compose up -d

# 方式2: 直接构建
docker build -t bai-codeagent .
docker run -p 3000:3000 -v $(pwd)/workspace:/app/workspace bai-codeagent
```

---

### 6. 规则层精确化改进

#### 改进前的问题

- 规则太简单，只检查两个简单条件是否同时满足
- 误判率高：即使代码中有防护措施也会报告
- 没有排除逻辑
- 只有 5 个审计 Skill

```javascript
// 改进前的简单规则
if (
  enabledSkills.has("access-control") &&
  hasObjectAccessIndicator(content) &&  // 简单检测
  !hasAuthGuardIndicator(content) &&    // 简单检测
  /(controller|route)/.test(loweredPath)
) {
  findings.push({ /* 报告问题 */ });
}
```

#### 改进后：精确规则模式

**核心改进**：每条规则包含必须同时满足的多个条件 + 排除逻辑

```javascript
// 改进后的精确规则
{
  id: "ac-obj-1",
  name: "对象级访问控制缺失",
  severity: "high",
  minConfidence: 0.75,
  requireA: /request.params.xxx/,  // 必须满足条件 A
  requireB: /where|find/,       // 必须满足条件 B
  exclude: /authorize|can|permission|guard/, // 有防护时不报告
  pathFilter: /(controller|route|service)/i, // 路径过滤
  evidence: "具体证据描述"
}
```

**新增 50+ 条精确规则**：

| Skill ID | 规则数量 | 关键规则 |
|----------|---------|----------|
| access-control | 5 | 对象级访问、公共角色、管理路由、API无认证 |
| bootstrap-config | 3 | 首次管理员创建、开发模式、默认密码 |
| upload-storage | 3 | 路径遍历、类型校验、危险扩展名 |
| query-safety | 3 | SQL注入、动态排序、NoSQL注入 |
| secret-exposure | 4 | 前端敏感变量、硬编码密钥、JWT密钥、AWS密钥 |
| ssrf | 1 | 用户可控URL |
| command-injection | 2 | 命令执行、child_process参数注入 |
| path-traversal | 1 | 文件路径穿越 |
| xss | 2 | 反射型XSS、Vue v-html |
| deserialization | 2 | eval不安全、JSON.parse不安全 |

**关键改进点**：

1. **多重条件匹配**：requireA + requireB 必须同时满足
2. **排除逻辑（exclude）**：检测到防护措施时不报告
3. **路径过滤**：只在相关目录/文件中检测
4. **跨文件验证**：检查其他文件是否有校验逻辑
5. **严重性分级**：critical / high / medium / low

---

### 7. LLM 提示词改进

#### 改进前的问题

- 提示词过于宽泛，模型容易产生误报
- 未明确告知哪些不是漏洞
- 置信度阈值过低（0.55）

```
// 改进前的系统提示词
"你是一个防御性代码审计助手。
只输出风险说明、证据、影响、修复建议和安全验证建议。
如果证据不足，就降低置信度或不要报出该问题。"
```

#### 改进后

**1. 系统提示词增加「不报告的示例」**：

```javascript
function buildSystemPrompt(selectedSkills) {
  return [
    "你是一个防御性代码审计助手，专注于识别真实的安全风险。",
    "",
    "## 核心原则",
    "1. 只报告真实存在、可被利用的安全问题，不是误报",
    "2. 如果代码中有防护措施（验证、过滤、转义、白名单），不要报告风险",
    "3. 需要实际证据（漏洞代码模式）才能报告，不能猜测",
    "",
    "## 不报告的示例（误报）",
    "- 有输入验证但报告 XSS：有 escapeHtml/sanitize 的代码",
    "- 有参数化查询但报告 SQL 注入：使用了 prepared statement",
    "- 有权限校验但报告越权：有 authorize/can/checkPermission",
    "",
    "## 需要报告的示例（真阳性）",
    "- 用户输入直接拼接到 SQL 查询中",
    "- eval() ��使用用户输入",
    "- 文件路径直接拼接用户输入",
    "- JWT 密钥硬编码",
  ].join("\n");
}
```

**2. 用户提示词强调证据和防护检查**：

```
## 任务
请仔细审阅以下源码片段，只报告确实存在安全问题的真实漏洞。
对于每个发现：
1. 给出精确的问题位置（文件:行号）
2. 说明漏洞的具体代码模式
3. 确认没有防护措施才报告
（检查代码中是否有 validate/sanitize/escape/authorize 等）
```

**3. 置信度阈值提高**：

- 改进前：`>= 0.55`
- 改进后：`>= 0.7`

---

### 8. 审计 Skill 扩展

#### 改进前（5 个）

| ID | 名称 |
|----|------|
| access-control | 访问控制 |
| bootstrap-config | 初始化与配置 |
| upload-storage | 上传与存储 |
| query-safety | 查询与注入 |
| secret-exposure | 敏感信息 |

#### 改进后（10 个）

| ID | 名称 | 说明 |
|----|------|------|
| access-control | 访问控制 | 对象级授权、公共角色、插件路由 |
| bootstrap-config | 初始化与配置 | 管理员初始化、开发开关、默认凭据 |
| upload-storage | 上传与存储 | 路径遍历、类型校验、危险扩展名 |
| query-safety | 查询与注入 | SQL注入、NoSQL注入、动态排序 |
| secret-exposure | 敏感信息 | 前端变量、硬编码密钥、JWT、AWS |
| **ssrf** | SSRF | 用户可控URL网络请求 |
| **command-injection** | 命令注入 | 用户输入用于命令执行 |
| **path-traversal** | 路径穿越 | 文件操作路径穿越 |
| **xss** | XSS | 跨站脚本注入 |
| **deserialization** | 反序列化 | 不安全的反序列化 |

---

## 功能对比表

| 功能 | 改进前 | 改进后 | 变化 |
|------|-------|-------|------|
| **任务存储** | 内存 Map | SQLite | 数据持久化 |
| **任务恢复** | 不支持 | 自动恢复 | 服务重启不丢失 |
| **进度推送** | 轮询 1.8s | SSE 实时 | 延迟降低 |
| **任务取消** | 不支持 | 支持 | 用户可中断 |
| **FOFA** | 仅存档 | 可查询 | 实际调用 |
| **Docker** | 无 | docker-compose.yml | 一键部署 |
| **依赖安装** | 无 | better-sqlite3 | 新增 |
| **规则层** | 简单匹配 | 精确规则+排除 | 50+规则 |
| **LLM提示词** | 宽泛 | 聚焦误报 | 减少误判 |
| **审计Skill** | 5个 | 10个 | 新增SSRF/XSS等 |
| **置信度阈值** | 0.55 | 0.7 | 提高 |

---

## API 变更汇总

### 新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks/{id}/stream` | SSE 进度流 |
| POST | `/api/tasks/cancel` | 取消任务 |
| GET | `/api/fofa/quick` | FOFA 快速查询 |

### 需要重新加载的模块

| 模块 | 变更 |
|------|------|
| `taskStore.js` | 重写，新增 SQLite |
| `llmReviewService.js` | 改进提示词，提高阈值 |
| `app.js` | 新增 SSE + 取消 |
| `server.js` | 新增 API 路由 |
| `auditAnalystAgent.js` | 重写规则层，50+ 精确规则 |
| `auditSkills.js` | 新增 5 个审计 Skill |
| `fofaScoutAgent.js` | 新增 FOFA Agent |

---

## 升级步骤

### 1. 安装新依赖

```bash
cd Bai-codeagent
npm install
npm install better-sqlite3
```

### 2. 启动服务

```bash
node server.js
# 或使用 Docker
docker-compose up -d
```

### 3. 验证功能

1. 访问 http://127.0.0.1:3000
2. 进入「设置中心」测试连接
3. 发起一个审计任务，观察实时进度
4. 尝试取消任务
5. 重启服务，验证任务恢复

---

## 常见问题

### Q: SQLite 数据库在哪里？

A: `workspace/tasks.db`，已添加到 `.gitignore`。

### Q: 如何禁用 SSE？

A: SSE 是可选的，旧版轮询仍然兼容。

### Q: FOFA API 需要付费吗？

A: FOFA API 需要付费账号，详见 https://fofa.com。

### Q: Docker 环境变量如何配置？

A: 复制 `.env.example` 到 `.env` 并填写。

---

## 后续改进计划

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 更多 LLM 提供商 | 中 | 添加 Ollama、Moonshot 支持 |
| CI/CD | 中 | 添加 GitHub Actions |
| 审计历史 | 低 | 查看历史审计报告 |
| 批量导出 | 低 | ZIP 导出多个报告 |

---

## Changelog

### v1.2.0 (2026-05-06) - 规则层与提示词改进

- ✅ 重写规则层，新增 50+ 精确规则
- ✅ 新增排除逻辑（检测到防护措施时不报告）
- ✅ 新增 5 个审计 Skill（ssrf/command-injection/path-traversal/xss/deserialization）
- ✅ 改进 LLM 系统提示词，明确「不报告的示例」
- ✅ 改进 LLM 用户提示词，强调证据和防护检查
- ✅ 提高置信度阈值从 0.55 到 0.7

### v1.1.0 (2026-05-06)

- ✅ 添加 SQLite 任务持久化
- ✅ 添加 SSE 实时进度推送
- ✅ 添加任务取消功能
- ✅ 添加 FOFA API 集成
- ✅ 添加 Docker 部署支持

### v1.0.0 (初始版本)

- GitHub 候选发现
- 本地镜像审计
- 规则层 + LLM 复核
- HTML 报告导出