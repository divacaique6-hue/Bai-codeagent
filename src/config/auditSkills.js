const AUDIT_SKILLS = [
  {
    id: "access-control",
    name: "访问控制",
    description: "关注对象级授权、公共角色、插件路由和后台访问边界。",
    reviewPrompt: "重点检查对象级访问控制、公共角色权限、管理接口与插件路由是否存在过宽暴露。只报告确实缺少权限校验的代码。"
  },
  {
    id: "bootstrap-config",
    name: "初始化与配置",
    description: "关注初始化管理员、开发开关、默认凭据和危险默认值。",
    reviewPrompt: "重点检查初始化管理员、开发开关、默认凭据、演示密钥和 fail-open 配置。只报告确实风险。"
  },
  {
    id: "upload-storage",
    name: "上传与存储",
    description: "关注上传链路、路径约束、公开目录和文件托管边界。",
    reviewPrompt: "重点检查上传处理中是否存在路径遍历、类型校验缺失、危险扩展名。只报告确实存在风险的代码。"
  },
  {
    id: "query-safety",
    name: "查询与注入",
    description: "关注原始查询、模板拼接、动态筛选和持久层输入约束。",
    reviewPrompt: "重点检查原始查询是否直接拼接用户输入、动态字段是否缺少白名单。只报告有注入风险的代码。"
  },
  {
    id: "secret-exposure",
    name: "敏感信息",
    description: "关注公开前端变量、配置文件中的密钥和占位凭据。",
    reviewPrompt: "重点检查前端变量是否暴露敏感信息、是否存在硬编码密钥。只报告确实暴露的场景。"
  },
  {
    id: "ssrf",
    name: "SSRF",
    description: "关注用户可控 URL 的网络请求。",
    reviewPrompt: "检查是否存在用户输入控制 URL 的网络请求场景。只报告缺少 URL 校验的代码。"
  },
  {
    id: "command-injection",
    name: "命令注入",
    description: "关注用户输入用于命令执行的场景。",
    reviewPrompt: "检查 exec/spawn 等是否直接使用用户输入。只报告确实未过滤的命令执行代码。"
  },
  {
    id: "path-traversal",
    name: "路径穿越",
    description: "关注文件操作中的路径穿越风险。",
    reviewPrompt: "检查文件路径是否直接拼接用户输入。只报告缺少路径校验的代码。"
  },
  {
    id: "xss",
    name: "XSS",
    description: "关注跨站脚本注入风险。",
    reviewPrompt: "检查用户输入是否未经过滤输出到页面。只报告确实缺少转义的代码。"
  },
  {
    id: "deserialization",
    name: "反序列化",
    description: "关注不安全的反序列化风险。",
    reviewPrompt: "检查 eval/parse 等是否直接处理用户输入。只报告确实不安全的代码。"
  }
];

export function getAuditSkillCatalog() {
  return AUDIT_SKILLS.map((skill) => ({ ...skill }));
}

export function resolveAuditSkills(selectedIds = []) {
  if (!Array.isArray(selectedIds) || !selectedIds.length) {
    return getAuditSkillCatalog();
  }

  const selected = new Set(selectedIds);
  const resolved = AUDIT_SKILLS.filter((skill) => selected.has(skill.id));
  return resolved.length ? resolved.map((skill) => ({ ...skill })) : getAuditSkillCatalog();
}
