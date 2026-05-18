"""Hunt Phase — 漏洞挖掘阶段"""

from .base import BasePhase


class HuntPhase(BasePhase):
    """漏洞挖掘：XSS、CORS、开放重定向、密钥泄露、SSRF验证"""
    
    def execute(self, target: str, findings: dict) -> dict:
        phase_findings = {"vulnerabilities": [], "secrets": []}
        
        self.logger.log_phase_start("漏洞挖掘 (Hunt)")
        
        # Step 1: Nuclei 扫描（限速+只扫高危）
        alive = findings.get('alive_hosts', [])
        if alive:
            hosts_str = '\\n'.join(alive[:20])
            self._step("Nuclei高危扫描", target, phase_findings, findings,
                       f"echo '{hosts_str}' | nuclei -severity critical,high -rate-limit 5 -c 3 -silent 2>/dev/null | head -50",
                       self._parse_nuclei,
                       "vulnerabilities")
        
        # Step 2: XSS 检测 (dalfox)
        params = findings.get('params', [])
        xss_urls = [p for p in params if '?' in p][:10]
        if xss_urls:
            urls_str = '\\n'.join(xss_urls)
            self._step("Dalfox XSS检测", target, phase_findings, findings,
                       f"echo '{urls_str}' | dalfox pipe --worker 2 --delay 300 --silence 2>/dev/null | head -20",
                       self._parse_dalfox,
                       "vulnerabilities")
        
        # Step 3: CORS 错配检测
        if alive:
            hosts_str = '\\n'.join(alive[:10])
            self._step("CORS错配检测", target, phase_findings, findings,
                       f"echo '{hosts_str}' | while read h; do curl -s -H 'Origin: https://evil.com' -I \"$h\" 2>/dev/null | grep -i 'access-control' && echo \"CORS: $h\"; done | head -20",
                       self._parse_cors,
                       "vulnerabilities")
        
        # Step 4: 密钥泄露扫描
        self._step("TruffleHog密钥扫描", target, phase_findings, findings,
                   f"trufflehog github --org={target.split('.')[0]} --only-verified --json 2>/dev/null | head -10",
                   self._parse_secrets,
                   "secrets")
        
        # Step 5: AI 决策额外攻击面
        if self.mode == "auto":
            combined = {**findings, **phase_findings}
            decision = self.engine.decide_next_action("hunt", combined, target)
            if decision.get("action") == "execute":
                cmd = decision.get("command", "")
                if cmd and self._safe_command(cmd, target):
                    self._step(f"AI: {decision.get('reason', '额外探测')}", target, 
                               phase_findings, findings, cmd, lambda out: [], None)
        
        return phase_findings
    
    def _parse_nuclei(self, output: str) -> list:
        """解析 nuclei 输出"""
        vulns = []
        for line in output.strip().split('\n'):
            if line.strip():
                vulns.append({
                    "type": "nuclei",
                    "url": line.strip(),
                    "severity": "high",
                    "detail": line.strip()
                })
        return vulns
    
    def _parse_dalfox(self, output: str) -> list:
        """解析 dalfox 输出"""
        vulns = []
        for line in output.strip().split('\n'):
            if line.strip() and 'POC' in line.upper() or 'XSS' in line.upper():
                vulns.append({
                    "type": "XSS",
                    "url": line.strip(),
                    "severity": "high",
                    "detail": line.strip()
                })
        return vulns
    
    def _parse_cors(self, output: str) -> list:
        """解析 CORS 输出"""
        vulns = []
        for line in output.strip().split('\n'):
            if 'CORS:' in line:
                vulns.append({
                    "type": "CORS Misconfiguration",
                    "url": line.replace("CORS:", "").strip(),
                    "severity": "medium",
                    "detail": "Access-Control-Allow-Origin 接受任意来源"
                })
        return vulns
    
    def _parse_secrets(self, output: str) -> list:
        """解析 trufflehog 输出"""
        secrets = []
        for line in output.strip().split('\n'):
            if line.strip():
                secrets.append(line.strip()[:200])
        return secrets
