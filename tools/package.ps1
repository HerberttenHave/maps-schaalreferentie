# Maakt dist/maps-schaalreferentie-<versie>.zip voor de Chrome Web Store (inhoud van extension/, zonder map eromheen).
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root "extension\manifest.json") -Raw | ConvertFrom-Json
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist ("maps-schaalreferentie-" + $manifest.version + ".zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $root "extension\*") -DestinationPath $zip
Write-Output ("Geschreven: " + $zip + " (" + [math]::Round((Get-Item $zip).Length / 1KB) + " kB)")
