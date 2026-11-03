# Crée un raccourci « DBML Studio » sur le Bureau (icône incluse).
# Usage : clic droit > Exécuter avec PowerShell, depuis le dossier du projet.
$racine = Split-Path -Parent $PSScriptRoot
$html   = Join-Path $racine 'dist\dbml-studio.html'
if (-not (Test-Path $html)) { $html = (Get-ChildItem $racine -Filter 'dbml-studio*.html' | Select-Object -First 1).FullName }
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'DBML Studio.lnk'))
$lnk.TargetPath   = $html
$lnk.IconLocation = (Join-Path $PSScriptRoot 'icon.ico')
$lnk.Save()
Write-Host 'Raccourci créé sur le Bureau.'
