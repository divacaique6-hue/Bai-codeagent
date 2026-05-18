#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Bai-codeagent 渗透工具一键安装脚本 (Windows)
.DESCRIPTION
    自动安装 Go、nmap，并通过 go install 批量拉取所有渗透工具。
    运行方式: 右键 PowerShell → 以管理员身份运行 → .\install_tools.ps1
.NOTES
    Author: Bai
    Date:   2025-06-14
#>

$ErrorActionPreference = "Stop"

# ============================================================
# 颜色输出辅助
# ============================================================
function Write-Step  { param($msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[-] $msg" -ForegroundColor Red }

# ============================================================
# 1. 检查 / 安装 Go
# ============================================================
Write-Step "检查 Go 运行时..."

$goVersion = "1.24.4"
$goInstaller = "go${goVersion}.windows-amd64.msi"
$goUrl = "https://go.dev/dl/$goInstaller"

if (Get-Command go -ErrorAction SilentlyContinue) {
    $currentGo = (go version) -replace 'go version go', '' -replace ' windows/amd64', ''
    Write-Ok "Go 已安装: $currentGo"
} else {
    Write-Warn "Go 未安装，正在下载 $goInstaller ..."
    $dlPath = "$env:TEMP\$goInstaller"
    Invoke-WebRequest -Uri $goUrl -OutFile $dlPath -UseBasicParsing
    Write-Step "正在安装 Go (静默模式)..."
    Start-Process msiexec.exe -ArgumentList "/i `"$dlPath`" /quiet /norestart" -Wait
    # 刷新 PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Get-Command go -ErrorAction SilentlyContinue) {
        Write-Ok "Go 安装成功: $(go version)"
    } else {
        Write-Err "Go 安装可能失败，请手动检查 https://go.dev/dl/"
        exit 1
    }
}

# 确保 GOPATH/bin 在 PATH 中
$goBin = "$env:USERPROFILE\go\bin"
if (-not (Test-Path $goBin)) { New-Item -ItemType Directory -Path $goBin -Force | Out-Null }
if ($env:Path -notlike "*$goBin*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$env:Path;$goBin", "User")
    $env:Path += ";$goBin"
    Write-Ok "已将 $goBin 加入用户 PATH"
}

# ============================================================
# 2. 检查 / 安装 Nmap
# ============================================================
Write-Step "检查 nmap..."

$nmapVersion = "7.95"
$nmapInstaller = "nmap-${nmapVersion}-setup.exe"
$nmapUrl = "https://nmap.org/dist/$nmapInstaller"

if (Get-Command nmap -ErrorAction SilentlyContinue) {
    Write-Ok "nmap 已安装: $((nmap --version | Select-Object -First 1))"
} else {
    Write-Warn "nmap 未安装，正在下载 $nmapInstaller ..."
    $dlPath = "$env:TEMP\$nmapInstaller"
    Invoke-WebRequest -Uri $nmapUrl -OutFile $dlPath -UseBasicParsing
    Write-Step "正在安装 nmap (静默模式)..."
    Start-Process $dlPath -ArgumentList "/S" -Wait
    # 刷新 PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Get-Command nmap -ErrorAction SilentlyContinue) {
        Write-Ok "nmap 安装成功"
    } else {
        # nmap 默认路径
        $nmapDir = "C:\Program Files (x86)\Nmap"
        if (Test-Path $nmapDir) {
            [System.Environment]::SetEnvironmentVariable("Path", "$env:Path;$nmapDir", "Machine")
            $env:Path += ";$nmapDir"
            Write-Ok "nmap 已安装，已手动加入 PATH"
        } else {
            Write-Warn "nmap 可能需要手动安装: https://nmap.org/download.html"
        }
    }
}

# ============================================================
# 3. 批量 go install 渗透工具
# ============================================================
Write-Step "批量安装 Go 渗透工具..."

$tools = @(
    # ── 核心工具 (10) ──
    @{ Name = "subfinder";    Pkg = "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest";    Desc = "被动子域名枚举" }
    @{ Name = "amass";        Pkg = "github.com/owasp-amass/amass/v4/...@master";                      Desc = "深度资产发现" }
    @{ Name = "httpx";        Pkg = "github.com/projectdiscovery/httpx/cmd/httpx@latest";              Desc = "HTTP 探活+指纹" }
    @{ Name = "ffuf";         Pkg = "github.com/ffuf/ffuf/v2@latest";                                  Desc = "目录/参数 Fuzz" }
    @{ Name = "nuclei";       Pkg = "github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest";         Desc = "模板化漏洞检测" }
    @{ Name = "gau";          Pkg = "github.com/lc/gau/v2/cmd/gau@latest";                             Desc = "Wayback/URLscan 历史URL" }
    @{ Name = "dalfox";       Pkg = "github.com/hahwul/dalfox/v2@latest";                              Desc = "XSS 自动化验证" }
    @{ Name = "subjack";      Pkg = "github.com/haccer/subjack@latest";                                 Desc = "子域名接管检测" }

    # ── 强烈推荐 (6) ──
    @{ Name = "katana";       Pkg = "github.com/projectdiscovery/katana/cmd/katana@latest";            Desc = "爬虫引擎" }
    @{ Name = "waybackurls";  Pkg = "github.com/tomnomnom/waybackurls@latest";                          Desc = "Wayback Machine 补充" }
    @{ Name = "anew";         Pkg = "github.com/tomnomnom/anew@latest";                                 Desc = "管道去重追加" }
    @{ Name = "gospider";     Pkg = "github.com/jaeles-project/gospider@latest";                        Desc = "另一爬虫引擎" }
    @{ Name = "naabu";        Pkg = "github.com/projectdiscovery/naabu/v2/cmd/naabu@latest";           Desc = "快速端口扫描" }
    @{ Name = "uro";          Pkg = "github.com/s0md3v/uro@latest";                                    Desc = "URL 去重" }
)

$installed = 0
$failed = @()

foreach ($tool in $tools) {
    $name = $tool.Name
    $pkg  = $tool.Pkg
    $desc = $tool.Desc

    Write-Host "  ├─ 安装 $name ($desc) ... " -NoNewline

    try {
        $output = & go install $pkg 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK" -ForegroundColor Green
            $installed++
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            $failed += "$name : $output"
        }
    } catch {
        Write-Host "ERROR" -ForegroundColor Red
        $failed += "$name : $_"
    }
}

# ============================================================
# 4. 安装 Python 工具 (pip)
# ============================================================
Write-Step "安装 Python 渗透工具 (pip)..."

$pipTools = @(
    @{ Name = "sqlmap";   Pkg = "sqlmap";   Desc = "SQL 注入自动化" }
    @{ Name = "wafw00f";  Pkg = "wafw00f";  Desc = "WAF 识别" }
    @{ Name = "uro";      Pkg = "uro";      Desc = "URL 去重 (Python版备用)" }
)

foreach ($tool in $pipTools) {
    $name = $tool.Name
    Write-Host "  ├─ pip install $name ($($tool.Desc)) ... " -NoNewline
    try {
        $output = & pip install $tool.Pkg --quiet 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK" -ForegroundColor Green
        } else {
            Write-Host "SKIP" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "SKIP" -ForegroundColor Yellow
    }
}

# ============================================================
# 5. 更新 nuclei 模板
# ============================================================
Write-Step "更新 nuclei 模板库..."
if (Get-Command nuclei -ErrorAction SilentlyContinue) {
    & nuclei -update-templates 2>&1 | Out-Null
    Write-Ok "nuclei 模板已更新"
} else {
    Write-Warn "nuclei 未安装成功，跳过模板更新"
}

# ============================================================
# 6. 验证安装结果
# ============================================================
Write-Step "验证安装结果..."
Write-Host ""
Write-Host "  工具名          状态" -ForegroundColor White
Write-Host "  ─────────────── ────" -ForegroundColor DarkGray

$allTools = @("go", "nmap", "subfinder", "amass", "httpx", "ffuf", "nuclei", "gau", "dalfox", "subjack", "katana", "waybackurls", "anew", "gospider", "naabu", "sqlmap", "wafw00f")

$okCount = 0
foreach ($t in $allTools) {
    $exists = Get-Command $t -ErrorAction SilentlyContinue
    if ($exists) {
        Write-Host "  $($t.PadRight(17))" -NoNewline
        Write-Host "OK" -ForegroundColor Green
        $okCount++
    } else {
        Write-Host "  $($t.PadRight(17))" -NoNewline
        Write-Host "MISSING" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Ok "安装完成! $okCount / $($allTools.Count) 工具就绪"

if ($failed.Count -gt 0) {
    Write-Warn "以下工具安装失败:"
    foreach ($f in $failed) { Write-Host "    $f" -ForegroundColor Red }
}

Write-Host ""
Write-Host "提示: 如果刚安装了 Go，请重启终端让 PATH 生效后再使用工具。" -ForegroundColor Yellow
Write-Host ""
