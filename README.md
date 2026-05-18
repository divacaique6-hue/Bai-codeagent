# Bai-codeagent

个人安全研究辅助工具集。

## 环境要求

- Node.js 18+ (Web面板)
- Python 3.8+ (RedOps + MCP Server)
- Go 1.20+ (安全工具，可选)
- Claude Code (自动化挖掘，需要 Claude Pro/Max 订阅)

## 快速开始

```bash
git clone https://github.com/divacaique6-hue/Bai-codeagent.git
cd Bai-codeagent
npm install
npm start
# 访问 http://localhost:3000
```

---

## 项目包含三套工具

### 1. Web 面板 (server.js)

白盒代码审计 + SRC辅助面板。

```bash
npm start
# http://localhost:3000         主面板
# http://localhost:3000/src-hunt.html   SRC辅助
```

### 2. RedOps Agent (redops/)

基于 LLM 的对话式渗透测试，支持 DeepSeek/OpenAI/Claude/Qwen。

```bash
cd redops
pip install -r requirements.txt
python main.py
# http://localhost:8000
```

### 3. Claude Hunt (claude-hunt/)

Claude Code 驱动的全自动漏洞挖掘。

```bash
# 安装工具（Linux/Kali）
bash claude-hunt/install_tools_linux.sh

# 安装 skills 到 Claude Code
bash claude-hunt/install.sh

# 启动
claude
/recon target.com
/autopilot target.com --normal
```

---

## MCP Server 配置（让 Claude Code 自动调用工具）

编辑 `~/.claude/settings.json`，把下面的 MCP Server 加进去：

```json
{
  "mcpServers": {
    "fiddler": {
      "command": "python3",
      "args": ["C:/你的路径/Bai-codeagent/claude-hunt/mcp/fiddler-mcp/server.py"],
      "env": {
        "FIDDLER_EXPORT_DIR": "C:/Users/你的用户名/Documents/Fiddler2/Captures"
      }
    },
    "redops": {
      "command": "python3",
      "args": ["C:/你的路径/Bai-codeagent/claude-hunt/mcp/redops-mcp/server.py"],
      "env": {
        "REDOPS_URL": "http://localhost:8000"
      }
    },
    "burp": {
      "command": "npx",
      "args": ["-y", "@anthropic/burp-mcp-server"],
      "env": {
        "BURP_API_KEY": "你的BurpAPI密钥",
        "BURP_URL": "http://localhost:1337"
      }
    }
  }
}
```

或者用命令行添加：

```bash
claude mcp add fiddler python3 /path/to/fiddler-mcp/server.py
claude mcp add redops python3 /path/to/redops-mcp/server.py
```

---

## MCP 工具说明（给 AI 看的）

### Fiddler MCP — 抓包分析

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `fiddler_list_captures` | 列出最近的抓包文件 | limit(数量) |
| `fiddler_parse_saz` | 解析SAZ文件提取所有请求/响应 | file(路径), limit |
| `fiddler_search_params` | 搜索包含指定参数的请求 | file, params(参数名数组) |
| `fiddler_find_endpoints` | 提取所有API端点(去重) | file |
| `fiddler_find_sensitive` | 搜索敏感信息泄露 | file |

**典型用法：**
```
分析我最近的Fiddler抓包，找出所有包含price/amount/userId的请求
→ 自动调用 fiddler_search_params

分析这个SAZ文件有没有验证码泄露或Token泄露
→ 自动调用 fiddler_find_sensitive
```

**Fiddler 端配置：**
1. 安装 Fiddler Classic (免费版)
2. Tools → Options → HTTPS → 勾选 Decrypt HTTPS traffic
3. 抓包后 File → Save → All Sessions → 保存为 .saz 到 Captures 目录
4. 或 Rules → Customize Rules 设置自动保存

---

### RedOps MCP — 渗透测试执行

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `redops_chat` | 自然语言对话（让Agent执行任务） | message, session_id |
| `redops_scan` | Nuclei漏洞扫描 | target, scan_type(full/quick/cve) |
| `redops_exec` | 执行系统命令 | command |
| `redops_fofa` | FOFA资产搜索 | query, size |
| `redops_targets` | 目标管理 | action(list/add), target |
| `redops_status` | 查看Agent状态 | 无 |

**前提：** RedOps 需要先启动 `python redops/main.py`

**典型用法：**
```
用RedOps对target.com做快速扫描
→ 自动调用 redops_scan

用FOFA搜索 domain="target.com" && title="后台"
→ 自动调用 redops_fofa

执行 nmap -sV -T4 192.168.1.1
→ 自动调用 redops_exec
```

**RedOps 配置 LLM：**
编辑 `redops/app/core/config.yaml`：
```yaml
llm:
  provider: "deepseek"
  api_key: "你的key"
  base_url: "https://api.deepseek.com/v1"
  model: "deepseek-chat"
```

---

### Burp MCP — 实时流量分析

需要 Burp Suite Professional (付费)。

| 功能 | 说明 |
|------|------|
| 读取proxy history | 实时查看经过Burp的所有请求 |
| 发送到repeater | 修改请求重放 |
| 扫描结果 | 获取Burp Scanner发现的漏洞 |

**配置：**
1. Burp → User Options → API → 启用 API，获取 Key
2. 设置 `BURP_API_KEY` 和 `BURP_URL`

---

## Claude Code 命令参考

安装 skills 后可用的命令：

| 命令 | 说明 |
|------|------|
| `/recon target.com` | 信息搜集（子域名+端口+URL+JS分析） |
| `/hunt target.com` | 漏洞挖掘 |
| `/autopilot target.com --normal` | 全自动（recon→hunt→validate→report） |
| `/validate` | 验证发现的漏洞 |
| `/report` | 生成报告 |
| `/pickup target.com` | 继续上次未完成的目标 |
| `/surface target.com` | 排序攻击面 |
| `/intel target.com` | 查询相关CVE |
| `/chain` | 漏洞链发现 |
| `/scope target.com` | 检查是否在授权范围 |
| `/arsenal` | 查看已安装工具 |
| `/scan-cves host` | Nuclei CVE扫描 |
| `/secrets-hunt --js-bundle dir` | JS泄露扫描 |
| `/bypass-403 url` | 绕过403 |
| `/remember` | 保存到记忆系统 |

---

## 环境联动说明

### Windows + WSL + Kali VM 联动

```
Windows 主机
├── Claude Code (决策中心)
├── Fiddler (抓包) → Fiddler MCP → Claude Code
├── Burp Suite (抓包) → Burp MCP → Claude Code
│
├── WSL (Linux子系统)
│   ├── subfinder / httpx / nuclei (信息搜集)
│   └── Claude Code 通过 wsl -e 调用
│
└── Kali VM (虚拟机)
    ├── nmap / sqlmap / metasploit (重型工具)
    └── Claude Code 通过 ssh kali@ip 调用
```

**WSL 调用示例（Claude Code 会自动这样用）：**
```bash
wsl -e subfinder -d target.com -silent
wsl -e httpx -l subdomains.txt -silent
wsl -e nuclei -u target.com -severity high,critical
```

**Kali VM 调用（需要先配SSH免密登录）：**
```bash
# 一次性配置
ssh-keygen -t rsa
ssh-copy-id kali@192.168.x.x

# 之后 Claude Code 就能自动调用
ssh kali@192.168.x.x "nmap -sV -T4 target.com"
ssh kali@192.168.x.x "sqlmap -u 'http://target.com/page?id=1' --batch"
```

---

## 自动化工作流示例

### 流程一：SRC 挖洞

```
1. 你在浏览器访问SRC授权目标，Fiddler抓包
2. Claude Code: "分析我的Fiddler抓包找注入点"
   → Fiddler MCP 自动分析
3. Claude Code: "对这些端点做越权测试"
   → 通过 WSL 执行 httpx / nuclei
4. Claude Code: "/validate" 验证漏洞
5. Claude Code: "/report" 生成报告
```

### 流程二：全自动扫描

```
1. Claude Code: /autopilot target.com --normal
   → 自动完成 recon → hunt → validate → report
   → 验证后暂停等你确认
2. 你确认后提交报告
```

### 流程三：RedOps 对话式

```
1. 启动 RedOps: python redops/main.py
2. Claude Code: "用RedOps扫描target.com的子域名"
   → RedOps MCP 调用 → RedOps Agent 执行
3. Claude Code: "分析结果，找高价值目标"
   → AI 分析并推荐下一步
```

---

## 国产 Nuclei 模板

`claude-hunt/tools/nuclei-templates-cn/` 包含国产系统检测：

- ThinkPHP 5.0.23 RCE
- 泛微OA BeanShell RCE
- 用友NC 文件上传
- Nacos 未授权 + 默认密码
- 若依 admin/admin123
- Shiro rememberMe 指纹
- Redis 未授权
- Spring Boot Actuator
- Druid Monitor 未授权
- Swagger API 暴露

使用：
```bash
nuclei -l targets.txt -t claude-hunt/tools/nuclei-templates-cn/ -severity critical,high
```

---

## 注意事项

- 只在获得授权的情况下使用
- 遵守法律法规
- SRC测试不要影响线上业务
- 不对未授权目标发起扫描
