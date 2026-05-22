# Backs up the cultivate SQLite database with a timestamp, keeps the last 7.
param(
  [string]$DbPath = $env:DB_PATH,
  [string]$BackupDir = $env:BACKUP_DIR,
  [int]$Keep = 7
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

if (-not $DbPath)    { $DbPath    = Join-Path $projectRoot "data\cultivate.db" }
if (-not $BackupDir) { $BackupDir = Join-Path $projectRoot "data\backups" }

if (-not (Test-Path $DbPath)) {
  Write-Error "[backup] ERROR: database not found at $DbPath"
  exit 1
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd-HH-mm"
$dest = Join-Path $BackupDir "cultivate-backup-$timestamp.db"

Copy-Item -Path $DbPath -Destination $dest -Force
$size = (Get-Item $dest).Length
Write-Host "[backup] Wrote $dest ($([math]::Round($size/1KB, 1)) KB)"

# Remove all but the $Keep most recent backups
$backups = Get-ChildItem -Path $BackupDir -Filter "cultivate-backup-*.db" |
           Sort-Object Name
if ($backups.Count -gt $Keep) {
  $toRemove = $backups | Select-Object -First ($backups.Count - $Keep)
  foreach ($f in $toRemove) {
    Remove-Item $f.FullName -Force
    Write-Host "[backup] Removed old backup: $($f.Name)"
  }
  Write-Host "[backup] Pruned to $Keep most recent backups"
}
