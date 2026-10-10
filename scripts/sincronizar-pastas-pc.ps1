# Sincroniza pastas a partir de um JSON exportado pela app (fallback sem Chrome).
# Uso: powershell -ExecutionPolicy Bypass -File .\sincronizar-pastas-pc.ps1 -Json ".\alunos-pastas.json" -Destino "$env:USERPROFILE\Documents\Ecole Consulaire"
param(
  [Parameter(Mandatory = $true)][string]$Json,
  [Parameter(Mandatory = $true)][string]$Destino
)
$ErrorActionPreference = "Stop"
$data = Get-Content -Raw -Encoding UTF8 $Json | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path (Join-Path $Destino "campus cidade") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Destino "campus Nova Vida") | Out-Null
foreach ($a in @($data.alunos)) {
  $campus = if ($a.transferidoCampusCidade) { "campus cidade" } else { "campus Nova Vida" }
  $nome = ("{0} ({1})" -f $a.nome, $a.id) -replace '[<>:"/\\|?*]', ' '
  $base = Join-Path (Join-Path $Destino $campus) $nome.Trim()
  foreach ($sub in @("ficha de matrícula", "recibos", "faturas")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $base $sub) | Out-Null
  }
  @(
    "ID: $($a.id)",
    "Nome: $($a.nome)",
    "Turma: $($a.turma)",
    "Campus: $campus",
    "Encarregado: $($a.encarregado)",
    "Recibo: $($a.recibo)"
  ) | Set-Content -Encoding UTF8 (Join-Path $base "ficha de matrícula\ficha-de-matricula.txt")
}
Write-Host "Pastas actualizadas em $Destino"
