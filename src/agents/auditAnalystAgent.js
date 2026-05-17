import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveAuditSkills } from "../config/auditSkills.js";

// 精确规则模式：每个规则包含多个必须同时满足的条件 + 排除逻辑
const PRECISE_RULES = {
  // 访问控制规则
  "access-control": [
    {
      id: "ac-obj-1",
      name: "对象级访问控制缺失",
      severity: "high",
      minConfidence: 0.75,
      requireA: /\brequest\s*\.\s*(params|query|body)\s*\.\s*[a-zA-Z_][a-zA-Z0-9_]*/,
      requireB: /\b(where|find|findOne|findById|getOne|filter)\s*\(/,
      exclude: /\b(authorize|can|permission|policy|guard|checkOwnership|verifyOwner|tenant|isOwner)\s*\(/i,
      pathFilter: /(controller|route|handler|service|api|resolver)/i,
      evidence: "客户端可控对象标识直接用于数据库查询，未发现权限校验逻辑"
    },
    {
      id: "ac-obj-2",
      name: "用户ID直接用于数据查询",
      severity: "high",
      minConfidence: 0.8,
      requireA: /\b(userId|user_id|uid|authorId|author_id)\s*[=.]/,
      requireB: /\b(where|find|findOne|select|query)\s*\(/,
      exclude: /\b(authorize|can|permission|policy)\s*\(/i,
      pathFilter: /(model|schema|controller|service)/i,
      evidence: "userId 直接作为查询条件，缺少权限校验"
    },
    {
      id: "ac-role-1",
      name: "公共角色权限过宽",
      severity: "critical",
      minConfidence: 0.85,
      requireA: /\b(public|anonymous|guest|visitor)\s*[:=]/i,
      requireB: /\b(create|update|delete|write|admin|manage|upload|execute)\b/i,
      exclude: /\bread\s*[-=]|\breadonly\b/i,
      pathFilter: /(permission|role|acl|rbac|access)/i,
      evidence: "公共/匿名角色被授予写入或管理权限"
    },
    {
      id: "ac-route-1",
      name: "管理路由显式关闭认证",
      severity: "critical",
      minConfidence: 0.9,
      requireA: /auth\s*[:\s]*false|skipAuth|bypassAuth|isPublic\s*[:\s]*true/i,
      requireB: /(admin|manage|setting|plugin|system|user|role)/i,
      pathFilter: /(route|router|app\.use|controller)/i,
      evidence: "管理相关路由显式关闭认证"
    },
    {
      id: "ac-api-1",
      name: "API 无认证保护",
      severity: "high",
      minConfidence: 0.8,
      requireA: /\b@Public\b|@AllowAnonymous\b|@NoAuth\b/i,
      requireB: /@Query|@Param|@Body/i,
      pathFilter: /(controller|resolver|api)/i,
      evidence: "API endpoint 允许匿名访问且接受用户输入"
    }
  ],

  // 初始化配置规则
  "bootstrap-config": [
    {
      id: "bc-init-1",
      name: "首次管理员创建可重复触发",
      severity: "critical",
      minConfidence: 0.85,
      requireA: /\b(bootstrap|seed|init|createFirst|registerInitial)\b.*(Admin|User)/i,
      requireB: /if\s*\([^)]*(!|count|exists|length)/,
      exclude: /process\.env\.NODE_ENV\s*===\s*['"]production['"]|RUN_ONCE/,
      pathFilter: /(seed|migration|init|setup|bootstrap)/i,
      evidence: "管理员初始化逻辑缺少生产环境强制校验或一次性执行保护"
    },
    {
      id: "bc-dev-1",
      name: "开发模式硬编码启用",
      severity: "high",
      minConfidence: 0.85,
      requireA: /\b(DEBUG|DEBUG_MODE|DEV_MODE|DEVELOPMENT)\s*[:=]\s*true/i,
      requireB: /./,
      exclude: /process\.env/i,
      pathFilter: /(config|env|setting)/i,
      evidence: "开发调试模式在代码中硬编码为 true"
    },
    {
      id: "bc-pass-1",
      name: "默认弱密码",
      severity: "critical",
      minConfidence: 0.95,
      requireA: /\b(password|passwd)\s*[:=]\s*['"](?!.*\$\{)[a-zA-Z0-9!@#$%^&*]{0,12}['"]/i,
      requireB: /^(?!.*\$\{).*(admin|root|test|demo|default|123456|password|changeme)/i,
      exclude: /process\.env|generatePassword|hashPassword/,
      pathFilter: /(config|seed|init)/i,
      evidence: "配置中存在默认弱密码"
    }
  ],

  // 上传存储规则
  "upload-storage": [
    {
      id: "us-path-1",
      name: "文件路径存在遍历风险",
      severity: "critical",
      minConfidence: 0.85,
      requireA: /\b(upload|move|rename|copy)\s*\(.*[\+\.]\s*req\.|params\.|body\./i,
      requireB: /path|fileName|name/,
      exclude: /\b(path\.join|path\.resolve|normalize|sanitize)\b/,
      pathFilter: /(upload|middleware|controller|service)/i,
      evidence: "文件操作中直接使用用户输入的路径"
    },
    {
      id: "us-type-1",
      name: "文件类型校验缺失",
      severity: "high",
      minConfidence: 0.8,
      requireA: /\b(upload|multer|formidable|busboy)\b/i,
      requireB: /file|mime|type|ext\s*\(/i,
      exclude: /\b(mimeType|fileType|checkType|validateType|allowedTypes|whitelist)\b/i,
      pathFilter: /(upload|middleware|config)/i,
      evidence: "上传处理未发现严格的文件类型校验"
    },
    {
      id: "us-ext-1",
      name: "允许危险文件扩展名",
      severity: "high",
      minConfidence: 0.9,
      requireA: /\.(exe|sh|bat|cmd|ps1|vbs|jar|asp|jsp|php|cgi)\b/i,
      requireB: /\b(upload|move|write|save)\s*\(/i,
      exclude: /\b(allowedExt|permitted|whiteList)\b/i,
      pathFilter: /(upload|middleware)/i,
      evidence: "文件上传允许危险扩展名"
    }
  ],

  // 查询安全规则
  "query-safety": [
    {
      id: "qs-sql-1",
      name: "SQL 原始查询存在注入风险",
      severity: "critical",
      minConfidence: 0.85,
      requireA: /\b(raw|query|execute|run)\s*\(\s*[`'"]/i,
      requireB: /(\$\{|req\.|params\.|body\.|query\.)/,
      exclude: /\b(stmt|prepared|parameterized|bind|escape|sanitize|placeholder)\b/i,
      pathFilter: /(model|repository|dao|service)/i,
      evidence: "原始 SQL 查询直接拼接用户输入"
    },
    {
      id: "qs-sql-2",
      name: "动态排序字段未白名单校验",
      severity: "high",
      minConfidence: 0.8,
      requireA: /\b(orderBy|order|sort)\s*\(\s*req\.|params\.|body\./i,
      requireB: /./,
      exclude: /\b(allowed|whitelist|permit|map|switch)\b/i,
      pathFilter: /(controller|service)/i,
      evidence: "排序字段直接来自用户输入"
    },
    {
      id: "qs-nosql-1",
      name: "NoSQL 注入风险",
      severity: "high",
      minConfidence: 0.8,
      requireA: /\bfind\([^}]*\$where|\$\s*ne\s*|\$gt\s*|\$lt\s*|\$nin\b/i,
      requireB: /req\.|params\.|body\./,
      exclude: /\b(sanitize|validate|escape)\b/i,
      pathFilter: /(model|controller|service)/i,
      evidence: "NoSQL 查询中使用用户输入的操作符"
    }
  ],

  // 敏感信息规则
  "secret-exposure": [
    {
      id: "se-env-1",
      name: "前端暴露敏感环境变量",
      severity: "critical",
      minConfidence: 0.95,
      requireA: /\b(NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_)[A-Z0-9_]*\b/i,
      requireB: /\b(secret|key|token|password|auth|PRIVATE|API_KEY)\b/i,
      exclude: /\b(URL|ENDPOINT|PUBLIC)\b/,
      pathFilter: /\.env\.|\.env\./i,
      evidence: "前端环境变量中包含敏感信息"
    },
    {
      id: "se-hard-1",
      name: "硬编码密钥",
      severity: "critical",
      minConfidence: 0.9,
      requireA: /(apiKey|apiSecret|clientSecret|privateKey|accessToken)\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/i,
      requireB: /./,
      exclude: /process\.env|generate|create.*Key/,
      pathFilter: /(config|constant|setting)/i,
      evidence: "代码中硬编码了 API 密钥"
    },
    {
      id: "se-jwt-1",
      name: "JWT 密钥弱或硬编码",
      severity: "critical",
      minConfidence: 0.95,
      requireA: /\bjwt\s*\(\s*\{[^}]*secret\s*[:=]\s*['"][^'"]+['"]/i,
      requireB: /./,
      exclude: /process\.env|generateSecret/,
      pathFilter: /(config|auth|middleware)/i,
      evidence: "JWT 密钥为硬编码"
    },
    {
      id: "se-aws-1",
      name: "AWS 密钥硬编码",
      severity: "critical",
      minConfidence: 0.95,
      requireA: /\b(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=\s*['"][A-Z0-9]{20,}['"]/i,
      requireB: /./,
      exclude: /process\.env/,
      pathFilter: /(config|env)/i,
      evidence: "AWS 密钥硬编码在代码中"
    }
  ],

  // SSRF 规则
  "ssrf": [
    {
      id: "sr-fetch-1",
      name: "用户可控 URL 存在 SSRF 风险",
      severity: "critical",
      minConfidence: 0.85,
      requireA: /\b(fetch|axios|request|http\.get|http\.post|got)\s*\(.*req\.|params\.|body\./i,
      requireB: /\burl|link|href|src/,
      exclude: /\b(validate|whitelist|allowed|isLocal|isPrivateHost|isInternal)\b/i,
      pathFilter: /(controller|service|proxy)/i,
      evidence: "允许用户控制 URL 进行网络请求"
    }
  ],

  // 命令注入规则
  "command-injection": [
    {
      id: "ci-exec-1",
      name: "命令注入风险",
      severity: "critical",
      minConfidence: 0.9,
      requireA: /\b(exec|spawn|execSync|system|popen|execFile)\s*\([^)]*(req\.|params\.|body\.|argv)/i,
      requireB: /./,
      exclude: /\b(escape|sanitize|arg|command)\b/i,
      pathFilter: /(controller|service)/i,
      evidence: "用户输入直接用于命令执行"
    },
    {
      id: "ci-spawn-1",
      name: "child_process 参数注入",
      severity: "critical",
      minConfidence: 0.9,
      requireA: /\bspawn\([^)]*shell\s*:\s*true/i,
      requireB: /req\.|params\.|body\./,
      pathFilter: /(service)/i,
      evidence: "使用 shell 执行且参数来自用户输入"
    }
  ],

  // 路径穿越规则
  "path-traversal": [
    {
      id: "pt-path-1",
      name: "路径穿越风险",
      severity: "critical",
      minConfidence: 0.85,
      requireA: /\b(readFile|readFileSync|createReadStream|open)\s*\([^)]*\+.*req\.|params\.|body\./i,
      requireB: /path|file/,
      exclude: /\b(path\.join|path\.resolve|normalize|baseDir|rootPath)\b/i,
      pathFilter: /(controller|service|middleware)/i,
      evidence: "文件读取路径中可能存在路径穿越"
    }
  ],

  // XSS 规则
  "xss": [
    {
      id: "xs-ref-1",
      name: "反射型 XSS 风险",
      severity: "high",
      minConfidence: 0.8,
      requireA: /\bres\.send\(|res\.render\(|innerHTML\s*=|outerHTML\s*=/i,
      requireB: /req\.|params\.|body\.|query\./,
      exclude: /\b(escape|encode|sanitize|xss|escapeHtml|textContent)\b/i,
      pathFilter: /(controller|route|view)/i,
      evidence: "用户输入未经过滤直接输出到页面"
    },
    {
      id: "xs-vue-1",
      name: "Vue v-html 可能存在 XSS",
      severity: "high",
      minConfidence: 0.85,
      requireA: /v-html\s*=/i,
      requireB: /req\.|params\.|body\./,
      exclude: /\b(sanitize|DOMPurify|escape)\b/,
      pathFilter: /\.vue|\.jsx|\.tsx/i,
      evidence: "使用 v-html 绑定用户输入"
    }
  ],

  // 不安全的反序列化
  "deserialization": [
    {
      id: "ds-eval-1",
      name: "Eval 不安全使用",
      severity: "critical",
      minConfidence: 0.95,
      requireA: /\beval\s*\(\s*req\.|params\.|body\./i,
      requireB: /./,
      pathFilter: /(controller|route|service)/i,
      evidence: "eval() 中直接使用用户输入"
    },
    {
      id: "ds-parse-1",
      name: "不安全的反序列化",
      severity: "critical",
      minConfidence: 0.9,
      requireA: /\bJSON\.parse\(|yaml\.load\(|pickle\.load\(/i,
      requireB: /req\.|params\.|body\./,
      exclude: /\b(safe|loadSilent)\b/i,
      pathFilter: /(controller|service|middleware)/i,
      evidence: "反序列化用户输入的数据"
    }
  ]
};

// 规则匹配函数
function matchPreciseRule(content, rule) {
  // 检查路径过滤
  if (rule.pathFilter && !rule.pathFilter.test(content)) {
    return false;
  }

  // 检查 A 条件
  if (!rule.requireA.test(content)) {
    return false;
  }

  // 检查 B 条件
  if (!rule.requireB.test(content)) {
    return false;
  }

  // 排除条件
  if (rule.exclude && rule.exclude.test(content)) {
    return false;
  }

  return true;
}

function createFinding(finding) {
  return {
    source: "rule",
    ...finding
  };
}

function prioritizeFindings(findings) {
  const deduped = [];
  const seen = new Set();
  for (const finding of findings) {
    const key = `${finding.title}::${finding.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  // 严重性优先级：critical > high > medium > low
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  return deduped
    .filter((finding) => finding.confidence >= 0.6)
    .sort((a, b) => {
      const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (sevDiff !== 0) return sevDiff;
      return b.confidence - a.confidence;
    });
}

export class AuditAnalystAgent {
  constructor({ llmReviewer }) {
    this.llmReviewer = llmReviewer;
  }

  async run({ projects, selectedSkillIds, llmConfig, onProgress }) {
    const reviewProfile = resolveAuditSkills(selectedSkillIds);
    const results = [];

    for (const [index, project] of projects.entries()) {
      onProgress?.({
        stage: "heuristic",
        projectId: project.id,
        projectName: project.name,
        projectIndex: index + 1,
        totalProjects: projects.length,
        label: `正在分析规则层：${project.name}`
      });

      const heuristicFindings = await buildHeuristicFindings(project, reviewProfile);
      const llmReview = this.llmReviewer
        ? await this.llmReviewer.reviewProject({
            project,
            selectedSkills: reviewProfile,
            heuristicFindings,
            llmConfig,
            onProgress: (detail) =>
              onProgress?.({
                stage: "llm-review",
                projectId: project.id,
                projectName: project.name,
                projectIndex: index + 1,
                totalProjects: projects.length,
                ...detail
              })
          })
        : {
            status: "skipped",
            called: false,
            skipReason: "reviewer-unavailable",
            summary: "未配置 LLM 复核器。",
            findings: [],
            warnings: []
          };

      const mergedFindings = prioritizeFindings([
        ...heuristicFindings,
        ...(Array.isArray(llmReview.findings) ? llmReview.findings : [])
      ]);

      results.push({
        projectId: project.id,
        projectName: project.name,
        repoUrl: project.repoUrl,
        localPath: project.localPath || "",
        reviewProfile,
        heuristicFindings,
        llmReview,
        findings: mergedFindings
      });

      onProgress?.({
        stage: "project-complete",
        projectId: project.id,
        projectName: project.name,
        projectIndex: index + 1,
        totalProjects: projects.length,
        heuristicCount: heuristicFindings.length,
        llmCount: llmReview?.findings?.length || 0,
        label: `已完成：${project.name}`
      });
    }

    return {
      reviewedAt: new Date().toISOString(),
      policy: "defensive-only",
      skillsUsed: reviewProfile.map((skill) => ({ id: skill.id, name: skill.name })),
      findingsCount: results.reduce((sum, item) => sum + item.findings.length, 0),
      heuristicFindingsCount: results.reduce((sum, item) => sum + item.heuristicFindings.length, 0),
      llmFindingsCount: results.reduce((sum, item) => sum + (item.llmReview?.findings?.length || 0), 0),
      llmCallCount: results.reduce((sum, item) => sum + (item.llmReview?.called ? 1 : 0), 0),
      llmSkippedCount: results.reduce((sum, item) => sum + (item.llmReview?.called ? 0 : 1), 0),
      projects: results
    };
  }
}

async function buildHeuristicFindings(project, reviewProfile) {
  const sourceRoot = path.join(process.cwd(), "workspace", "downloads", project.id);
  const files = await collectFiles(sourceRoot);
  const findings = [];
  const enabledSkills = new Set(reviewProfile.map((skill) => skill.id));

  // 收集所有文件内容用于跨文件分析
  const fileContents = new Map();
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
    fileContents.set(relative, content);
  }

  // 应用精确规则
  for (const [relative, content] of fileContents) {
    const loweredPath = relative.toLowerCase();

    // 跳过测试文件和文档
    if (loweredPath.includes("/test/") || loweredPath.includes("/spec/") || loweredPath.includes(".md") || loweredPath.includes("readme")) {
      continue;
    }

    for (const [skillId, rules] of Object.entries(PRECISE_RULES)) {
      if (!enabledSkills.has(skillId)) continue;

      for (const rule of rules) {
        if (matchPreciseRule(content, rule)) {
          findings.push(createFinding({
            skillId,
            title: rule.name,
            severity: rule.severity,
            confidence: rule.minConfidence,
            location: relative,
            evidence: rule.evidence,
            impact: `该代码存在 ${rule.name} 风险，需要重点人工复核。`,
            remediation: `建议添加 ${rule.name} 的安全防护措施。`,
            safeValidation: "建议在本地代码审查中验证此问题是否真实存在。"
          }));
        }
      }
    }
  }

  // 按置信度排序并限制结果数
  return prioritizeFindings(findings).slice(0, 15);
}

async function collectFiles(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const output = [];
    for (const entry of entries) {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) output.push(...(await collectFiles(target)));
      else output.push(target);
    }
    return output;
  } catch {
    return [];
  }
}