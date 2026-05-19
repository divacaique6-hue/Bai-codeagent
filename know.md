# Bai-codeagent 完整知识库 (know.md)

> 本文档包含：工具使用说明、SRC 漏洞挖掘方法论、Google Dorking 技巧、业务逻辑漏洞测试指南
> 适用于 Claude Code 自动化挖掘 + 人工半自动测试

---

## 目录

1. [项目架构与使用](#一项目架构与使用)
2. [Google Dorking — 搜索引擎技巧](#二google-dorking--搜索引擎技巧)
3. [业务逻辑漏洞 — 测试方法论](#三业务逻辑漏洞--测试方法论)
4. [竞态条件专项测试](#四竞态条件专项测试)
5. [防御绕过技巧](#五防御绕过技巧)
6. [实战 Checklist](#六实战-checklist)
7. [工具链速查](#七工具链速查)
8. [数据参考](#八数据参考)

---

## 一、项目架构与使用

### 组件总览

| 组件 | 路径 | 用途 |
|------|------|------|
| Web 面板 | `server.js` | 框架审计 + SRC 辅助面板 (port 3000) |
| Claude Code Skills | `claude-hunt/` | Claude Code 命令式自动化 |
| Auto-Hunt Agent | `claude-hunt/auto_agent/` | 独立 Python 全自动/半自动流程 |
| Brain (LLM 层) | `claude-hunt/brain.py` | 多 Provider LLM 推理层 |
| MCP 集成 | `claude-hunt/mcp/` | Burp/Fiddler/HackerOne 桥接 |

### Auto-Hunt Agent 使用

```bash
# 安装依赖
cd claude-hunt/auto_agent
pip install -r requirements.txt

# 配置
cp config.yaml.example config.yaml
# 编辑 config.yaml 填入 DeepSeek API Key
# 或直接设置环境变量：
export DEEPSEEK_API_KEY="sk-xxx"

# 运行
python auto_hunt.py --target example.com --mode semi   # 半自动
python auto_hunt.py --target example.com --mode auto   # 全自动
```

### Claude Code 命令

```bash
claude                          # 启动 Claude Code
/recon target.com              # 信息搜集
/hunt target.com               # 漏洞挖掘
/autopilot target.com --normal # 全自动
/validate                      # 验证漏洞
/report                        # 生成报告
/scope target.com              # 查看/设置 scope
/intel target.com              # 历史情报查询
```

### Docker 方式

```bash
cd claude-hunt/auto_agent
docker compose -f docker-compose.hunter.yml up
# 环境变量: DEEPSEEK_API_KEY=xxx
```

---

## 二、Google Dorking — 搜索引擎技巧

> 来源：InfoSec Writeups, HackerOne 实战, SRC 社区

### 2.1 找目标 / 找资产

#### 基础信息收集

```bash
# 找安全通告页面（通常有赏金计划链接）
inurl:/.well-known/security.txt

# 找暴露的配置文件
site:target.com filetype:env
site:target.com filetype:yml OR filetype:yaml

# 找备份文件
site:target.com ext:bak OR ext:old OR ext:backup OR ext:sql
site:target.com inurl:backup filetype:sql

# 找开放目录
intitle:"index of" site:target.com
intitle:"index of" "parent directory"

# 找后台/管理面板
site:target.com inurl:login OR inurl:admin OR inurl:dashboard
site:target.com intitle:"admin panel"
```

#### 找 API 端点

```bash
site:target.com inurl:api
site:target.com inurl:swagger
site:target.com inurl:graphql
site:target.com inurl:openapi.json
site:target.com inurl:"api/v1"
```

#### 找 JS 文件（可能泄露接口和参数）

```bash
site:target.com ext:js
site:target.com inurl:"app.js" OR inurl:"main.js" OR inurl:"config.js"
```

#### 找 IDOR 易感参数

```bash
site:target.com inurl:"user_id="
site:target.com inurl:"id="
site:target.com inurl:"orderId="
site:target.com inurl:"uid="
site:target.com inurl:"customerId="
```

### 2.2 找漏洞目标特征

#### 电商/支付类（逻辑漏洞高发区）

```bash
# 找电商平台
inurl:checkout OR inurl:cart OR inurl:payment
intitle:"下单" OR intitle:"提交订单"
inurl:order intitle:"订单详情"

# 找优惠券/促销页面
inurl:coupon OR inurl:promo OR inurl:discount
inurl:redeem OR inurl:invite

# 找充值/提现功能
inurl:recharge OR inurl:withdraw OR inurl:topup
intitle:"余额" OR intitle:"充值"
```

#### 账号/认证类

```bash
# 找密码重置
inurl:reset-password OR inurl:forgot-password OR inurl:forget-password

# 找注册页面
inurl:register OR inurl:signup OR inurl:sign-up

# 找验证码相关
inurl:verify OR inurl:verification OR inurl:otp
```

#### 文件上传/下载

```bash
inurl:upload OR inurl:file-upload
inurl:download OR inurl:attachment
inurl:"download.php?file=" OR inurl:"download.aspx?file="
```

### 2.3 找敏感信息泄露

#### 数据库凭证

```bash
site:target.com intext:"mysql_connect"
site:target.com intext:"DB_PASSWORD" OR intext:"DB_USER"
site:target.com intext:"jdbc:" OR intext:"connectionstring"
```

#### AWS/云凭证

```bash
site:target.com intext:"AKIA" OR intext:"ASIA"  # AWS access key
site:target.com intext:"sk_live_"                # Stripe live key
site:target.com intext:"ghp_"                     # GitHub personal token
```

#### 错误信息

```bash
site:target.com intext:"sql syntax near"
site:target.com intext:"stack trace"
site:target.com intext:"exception" intext:"line"
site:target.com intext:"fatal error"
```

### 2.4 FOFA / Shodan 辅助搜索

#### FOFA 语法（中文环境更友好）

```bash
# 找特定指纹的所有站点（批量越权挖掘）
body="技术支持：XX公司" && country="CN"
header="X-Powered-By: XXX" && type="subdomain"

# 找 Swagger UI
body="swagger-ui" && country="CN"

# 找后台管理
body="后台管理" && country="CN"
title="管理系统" && body="登录"

# 找特定路径
body="order" && title="订单"
body="userid" && type="subdomain"

# 批量找同类系统（SRC 挖洞神器）
icon_hash="xxxxxxxx"   # 计算 favicon hash，找同指纹系统
```

#### Shodan 语法

```bash
# 找暴露的 API
http.title:"swagger" country:"CN"
http.title:"API" ssl:"target.com"

# 找管理后台
http.title:"admin" country:"CN"
http.title:"login" http.component:"jquery"
```

### 2.5 Google Hacking Database (GHDB) 精选

| 类别 | Dork |
|------|------|
| 文件上传接口 | `inurl:"uploadfile" OR inurl:"fileupload"` |
| API 文档泄露 | `inurl:"swagger-ui.html" OR inurl:"api-docs"` |
| 代码仓库泄露 | `site:github.com "target.com" password OR secret OR key` |
| 内部文档 | `site:target.com filetype:pdf "internal" OR "confidential"` |
| 日志文件 | `site:target.com ext:log "error" OR "exception"` |
| 配置文件 | `site:target.com inurl:"config.php" OR inurl:"web.config"` |

### 2.6 Wayback Machine 利用

```bash
# 查看历史页面（可能暴露旧版 API、隐藏端点）
https://web.archive.org/web/*/target.com/*

# 使用 waybackurls 工具自动提取
echo "target.com" | waybackurls | grep -E "\.js$|\.json$|api|config"

# 提取所有参数
echo "target.com" | waybackurls | unfurl keys | sort -u

# 结合 gau (Get All URLs)
gau target.com | grep -E "user_id|id=|orderId|uid"
```

### 2.7 实用工具组合

```bash
# 标准工作流
subfinder -d target.com | httpx -silent | waybackurls | \
  grep -E "\.js$" | sort -u > js_files.txt

# 从 JS 中提取端点
cat js_files.txt | while read url; do
  curl -s "$url" | grep -oP '(api/[^"'"'"'\s]+|v[0-9]/[^"'"'"'\s]+)'
done | sort -u

# 找 IDOR 易感的参数
gau target.com | grep -E "\?(.*&)?(id|user_id|uid|order_id|customer_id)=" | sort -u

# 批量测试 IDOR
for id in $(seq 1 100); do
  curl -s "https://target.com/api/user/$id" -H "Cookie: session=xxx" -w "%{http_code}: $id\n"
done
```

### 2.8 Google Dork 使用注意事项

1. **合法合规**：仅对授权的 SRC 平台使用
2. **频率控制**：Google 会限制频繁搜索，需加延迟
3. **组合使用**：Google + FOFA + Shodan + Wayback Machine 多源结合
4. **先去重**：同类系统先确认一个存在漏洞，再批量利用
5. **保存证据**：发现的信息泄露页面及时截图/存档

---

## 三、业务逻辑漏洞 — 测试方法论

> 融合 OWASP WSTG、PortSwigger 研究、HackerOne 实战、国内 SRC 经验

### 3.1 逻辑漏洞分类体系（7 大类）

```
业务逻辑漏洞
├── 1. 支付/交易漏洞
│   ├── 价格篡改（前端传价、负数、小数溢出）
│   ├── 数量篡改（负数、零值、整数溢出 2147483647+1）
│   ├── 优惠券/折扣滥用（并发复用、取消退回后仍用）
│   ├── 四舍五入（分/厘单位转换时取整方向错误）
│   ├── 签约绕过（解约后再次签约套利）
│   └── 混合支付（取消订单退余额后仍完成支付）
│
├── 2. 越权漏洞 (IDOR)
│   ├── 水平越权（修改 userId/orderId 查看他人数据）
│   ├── 垂直越权（普通用户执行管理操作）
│   ├── 参数 ID 编码绕过（Base64/哈希后遍历）
│   └── GraphQL/REST API 缺少后端鉴权
│
├── 3. 竞态条件 (Race Conditions)
│   ├── 并发提现（余额 1 元，10 次并发提现）
│   ├── 并发领券（限量券同时获取多张）
│   ├── Single-Packet Attack（PortSwigger 技术）
│   └── TOCTOU（检查时 vs 使用时状态不同）
│
├── 4. 认证/会话漏洞
│   ├── 验证码爆破（4 位=10000 种，6 位=100 万种）
│   ├── 验证码与手机号不绑定
│   ├── 空 Token/验证码绕过
│   ├── 响应包篡改（false→true, -1→0）
│   ├── 第三方登录 UID 篡改
│   └── 图形验证码绕过（AI/打码平台/复用）
│
├── 5. 工作流绕过
│   ├── 跳过支付步骤直接确认订单
│   ├── 跳过验证步骤（邮箱/手机验证）
│   ├── 取消订单后仍可支付发货
│   ├── 退款后优惠券未作废
│   └── 多步骤流程步序反转
│
├── 6. 营销/活动滥用
│   ├── 新人优惠无限循环（注册→买→注销→重新注册）
│   ├── 邀请奖励刷量
│   ├── 抽奖/盲盒次数超限
│   ├── 签到/打卡并发刷积分
│   └── 限量商品超购
│
└── 7. 恶意逻辑循环 (OWASP BLA4:2025)
    ├── 无限循环（CWE-835）
    ├── 递归失控（CWE-674）
    ├── 时序炸弹（CWE-511）
    └── 未检查的循环条件（CWE-606）
```

### 3.2 测试四阶段

#### Phase 1: 侦察与映射

```
目标：完整理解业务流程
```

1. **正常走完所有业务流程**，全程抓包（Fiddler / Burp）
2. **建立接口清单**：
   - 注册/登录/注销
   - 密码重置/手机绑定/邮箱验证
   - 商品浏览/搜索/加入购物车
   - 下单/支付/退款
   - 优惠券领取/使用
   - 个人资料查看/修改
   - 订单管理/地址管理
   - 评论/反馈/客服
3. **识别参数**：每个接口中与业务逻辑相关的参数
4. **理解业务规则**：
   - "每个用户只能领一次新人券"
   - "单笔订单金额不能为负"
   - "优惠券使用后作废"
   - "订单取消后 5 分钟内可恢复"

#### Phase 2: 对抗性思维（"反过来想想"）

**时间维度**：
- 能不能把操作拖到某个有利时机再完成？
- 大促价格变动时取消再恢复支付？
- 优惠券快过期时利用时间窗口？

**顺序维度**：
- 跳过步骤 2 直接做步骤 4 会怎样？
- 先做步骤 3 再回到步骤 1？
- 同时执行两个互斥操作？

**数量维度**：
- 负数行不行？（-1 个商品）
- 零行不行？（0 元支付）
- 小数行不行？（0.001 元）
- 超大数行不行？（整数溢出）
- 超过限制次数行不行？

**身份维度**：
- 用 A 的 ID 看 B 的数据？
- 普通用户调管理员接口？
- 修改请求中的角色字段？
- 注销后重新注册拿新人优惠？

**金额维度**：
- 前端传的价格改了后端认不认？
- 多币种切换时汇率取整方向？
- 退款金额大于支付金额？
- 运费/税费单独篡改？

#### Phase 3: 参数篡改与测试

**测试矩阵**：

| 参数类型 | 测试值列表 |
|----------|-----------|
| price / amount / total | `0`, `-1`, `0.01`, `99999999`, `""`, `null`, `NaN` |
| quantity / qty | `-1`, `0`, `2147483647`, `2147483648`, `-999` |
| userId / orderId / *Id | 遍历 ±1, ±100, 随机值 |
| role / type / status | `admin`, `superadmin`, `1`, `true`, 空值 |
| couponCode / promoCode | 空值、已用过的码、他人码 |
| token / verifyCode | 空值、固定值、过期值 |

#### Phase 4: 利用与报告

1. **验证影响**：不能仅停留在"参数可改"，要展示实际危害
2. **链式组合**：中低危组合成高危（如信息泄露 + 认证绕过 = 任意账号接管）
3. **录屏证据**：最直观的漏洞证明
4. **量化损失**：能泄露多少用户？能造成多少经济损失？

---

## 四、竞态条件专项测试

### 工具选择

| 工具 | 用途 | 推荐场景 |
|------|------|----------|
| **Turbo Intruder** (Burp 插件) | Single-Packet Attack | 精确控制并发的时间窗口 |
| **GNU parallel** | Shell 级并发 | 快速验证 |
| **Fiddler AutoResponder** | 批量拦截+放行 | Windows 环境 |
| **自定义 Python 脚本** | 灵活控制 | 复杂逻辑 |

### 测试步骤

```
1. 确认目标操作有"次数/金额限制"
2. 抓取该操作的完整请求
3. 准备并发环境（确保所有请求几乎同时到达）
4. 发送 10-50 个并发请求
5. 观察结果：有几个成功了？资源只扣了一次还是多次？
```

### 经典测试目标

- 提现 / 转账
- 优惠券 / 礼品卡兑换
- 限量抢购
- 每日签到 / 打卡
- 抽奖 / 盲盒
- 点赞 / 投票

### Single-Packet Attack（PortSwigger 技术）

```
原理：将多个 HTTP 请求打包到单个 TCP 包中发送，
      绕过服务器端的逐请求处理延迟。

工具：Turbo Intruder (Burp Suite)
关键参数：engine=Engine.BURP2（使用 Burp 的 HTTP/2 引擎）
```

### 竞态条件测试命令

```bash
# 方式一：GNU parallel
seq 20 | parallel -j 20 "curl -s -X POST https://target.com/api/redeem \
  -H 'Content-Type: application/json' \
  -H 'Cookie: session=xxx' \
  -d '{\"coupon_code\":\"CODE123\"}'"

# 方式二：Python 并发脚本
python3 -c "
import concurrent.futures, requests
def send():
    return requests.post('https://target.com/api/redeem',
        json={'coupon_code':'CODE123'},
        headers={'Cookie':'session=xxx'}).status_code
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
    results = list(ex.map(lambda _: send(), range(20)))
print(f'Success: {results.count(200)}/20')
"
```

---

## 五、防御绕过技巧

### 5.1 前端校验绕过

一切前端校验都可以通过抓包修改绕过。关键问题：**后端有没有重新校验？**

### 5.2 ID 编码绕过

- Base64 编码的 ID → 解码修改后重新 Base64 编码
- 哈希后的 ID → 尝试彩虹表或已知值
- UUID → 尝试在响应中搜索 UUID 规律

### 5.3 403/401 绕过

- 修改 HTTP 方法（POST → GET → PUT）
- 添加/删除请求头（X-Forwarded-For, X-Original-URL）
- 路径穿越：`/admin/users` → `/users;/admin/users`
- 参数污染：`?userId=自己&userId=他人`

### 5.4 WAF 绕过（业务逻辑场景）

- 请求体格式切换（JSON → XML → form-data）
- 字符编码（Unicode 等价字符、大小写混用）
- 分块传输

---

## 六、实战 Checklist

> 来源：OWASP WSTG + PortSwigger Labs + SRC 实战

```
□ 价格/金额字段篡改测试
□ 数量字段边界值测试（负数/零/超限）
□ 订单 ID 遍历（水平越权）
□ 用户 ID 遍历（水平越权）
□ 修改角色/权限参数
□ 并发领券/并发提现（竞态条件）
□ 跳过支付步骤直接确认
□ 取消订单后再次支付
□ 退款后优惠券是否作废
□ 混合支付取消后余额退回
□ 验证码与手机号绑定测试
□ 验证码爆破（无频率限制）
□ 空验证码/Token 绕过
□ 响应包篡改（false→true）
□ 第三方登录 UID 篡改
□ 注销后重新注册拿新人优惠
□ 邀请链接参数篡改
□ API 接口缺少后端鉴权（GraphQL/REST）
□ 批量操作无频率限制
□ 文件上传接口 SSRF 触发点
```

---

## 七、工具链速查

| 工具 | 用途 | 下载/安装 |
|------|------|-----------|
| Burp Suite Pro | 拦截代理+自动化扫描 | https://portswigger.net/burp |
| Turbo Intruder | 竞态条件并发测试 | Burp BApp Store |
| OWASP ZAP | 免费拦截代理 | https://www.zaproxy.org |
| Fiddler Classic | Windows 抓包（免费） | https://www.telerik.com/fiddler |
| ffuf | 模糊测试 | `go install github.com/ffuf/ffuf/v2@latest` |
| GNU parallel | Shell 并发 | `apt install parallel` / `brew install parallel` |
| subfinder | 子域名枚举 | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` |
| httpx | HTTP 存活探测 | `go install github.com/projectdiscovery/httpx/cmd/httpx@latest` |
| nuclei | 漏洞扫描 | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` |
| dalfox | XSS 检测 | `go install github.com/hahwul/dalfox/v2@latest` |
| gau | URL 收集 | `go install github.com/lc/gau/v2/cmd/gau@latest` |
| waybackurls | Wayback URL | `go install github.com/tomnomnom/waybackurls@latest` |
| trufflehog | 密钥泄露扫描 | `go install github.com/trufflesecurity/trufflehog/v3@latest` |
| arjun | 参数发现 | `pip install arjun` |
| paramspider | 被动参数发现 | `pip install paramspider` |

### IDOR 批量测试

```bash
# 遍历用户 ID
for i in $(seq 1 1000); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://target.com/api/user/$i" \
    -H "Cookie: session=xxx")
  [ "$code" = "200" ] && echo "Found: user $i"
done
```

---

## 八、数据参考

### HackerOne 2024-2025 报告关键数据

| 指标 | 数据 |
|------|------|
| 业务逻辑错误年增长率 | +67% |
| 在所有漏洞中占比 | ~2%（Top 10） |
| 加密/区块链项目占比 | ~10% |
| 加密项目赏金占总支出 | 45% |
| 最高单笔赏金 | 加密项目 95 分位达 $1M |
| AI 漏掉业务逻辑漏洞 | 58% 研究员认同 |

### 国内 SRC 赏金参考

| 级别 | 赏金范围（人民币） |
|------|-------------------|
| 严重 | 5,000 ~ 20,000 元 |
| 高危 | 1,000 ~ 5,000 元 |
| 中危 | 200 ~ 1,000 元 |
| 低危 | 50 ~ 200 元 |

---

## 九、红线规则（绝对不碰）

1. **不破坏数据** — 不删除、不修改生产数据
2. **不泄露数据** — 发现敏感数据立即停止，不扩大影响
3. **不越权操作** — 只验证存在性，不实际利用
4. **不攻击非授权目标** — 严格在 scope 内
5. **不使用 sqlmap 等自动化注入** — 国内 SRC 实名制，流量异常会追溯
6. **不碰 `.gov.cn` / `.edu.cn`** — 除非明确有 SRC 授权
7. **不碰支付相关的删除/修改操作** — 只读验证
8. **发现高危立即暂停** — 等人工确认后再继续

---

*最后更新：2025-06*
