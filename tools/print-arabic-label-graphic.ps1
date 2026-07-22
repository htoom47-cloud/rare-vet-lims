# Print Arabic 50x25 mm Zebra label as graphic (Windows fonts) via LIMS bridge.
# Layout: barcode + sample digits + عينة + نوع الفحص + نوع·اسم الحيوان
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$LabelW = 400
$LabelH = 200
$BridgeUrl = 'http://127.0.0.1:9100/write'

$Barcode = '260712686909'
$SampleId = '26000099'
$TestAr = 'طفيليات'
$AnimalTypeAr = 'جمل'
$AnimalNameAr = 'تجربة'
$SampleLine = "عينة $SampleId"
$AnimalLine = "$AnimalTypeAr · $AnimalNameAr"

function Get-Code128CEncode([string]$raw) {
  $digits = ($raw -replace '\D', '')
  if (($digits.Length % 2) -eq 1) { $digits = "0$digits" }
  return $digits
}

function Get-Code128Patterns {
  # Code128 patterns (bar/space widths), index 0..106 — subset used for Code C
  return @(
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  )
}

function Draw-Code128C([System.Drawing.Graphics]$g, [string]$digits, [int]$x, [int]$y, [int]$module, [int]$height) {
  $patterns = Get-Code128Patterns
  $codes = New-Object System.Collections.Generic.List[int]
  [void]$codes.Add(105) # Start C
  $checksum = 105
  $weight = 1
  for ($i = 0; $i -lt $digits.Length; $i += 2) {
    $val = [int]$digits.Substring($i, 2)
    [void]$codes.Add($val)
    $checksum += $val * $weight
    $weight++
  }
  [void]$codes.Add($checksum % 103)
  [void]$codes.Add(106) # Stop

  $penBlack = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
  $cursor = $x
  foreach ($code in $codes) {
    $pat = $patterns[$code]
    $drawBar = $true
    foreach ($ch in $pat.ToCharArray()) {
      $w = [int][string]$ch * $module
      if ($drawBar) {
        $g.FillRectangle($penBlack, $cursor, $y, $w, $height)
      }
      $cursor += $w
      $drawBar = -not $drawBar
    }
  }
  $penBlack.Dispose()
  return ($cursor - $x)
}

function ConvertTo-ZplGfa([System.Drawing.Bitmap]$bmp) {
  $bytesPerRow = [Math]::Ceiling($bmp.Width / 8.0)
  $total = [int]($bytesPerRow * $bmp.Height)
  $bytes = New-Object byte[] $total
  $idx = 0
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($bx = 0; $bx -lt $bytesPerRow; $bx++) {
      $byte = 0
      for ($bit = 0; $bit -lt 8; $bit++) {
        $x = $bx * 8 + $bit
        if ($x -ge $bmp.Width) { continue }
        $c = $bmp.GetPixel($x, $y)
        $lum = (0.299 * $c.R) + (0.587 * $c.G) + (0.114 * $c.B)
        if ($c.A -gt 128 -and $lum -lt 180) {
          $byte = $byte -bor (0x80 -shr $bit)
        }
      }
      $bytes[$idx++] = [byte]$byte
    }
  }
  $hex = -join ($bytes | ForEach-Object { $_.ToString('X2') })
  return "^GFA,$total,$total,$bytesPerRow,$hex"
}

# Ensure bridge
try {
  $null = Invoke-RestMethod -Uri 'http://127.0.0.1:9100/default' -TimeoutSec 3
} catch {
  $vbs = Join-Path $PSScriptRoot 'start-lims-print-bridge-hidden.vbs'
  if (Test-Path $vbs) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$vbs`"" -WindowStyle Hidden
    Start-Sleep -Seconds 4
  }
  $null = Invoke-RestMethod -Uri 'http://127.0.0.1:9100/default' -TimeoutSec 5
}

$bmp = New-Object System.Drawing.Bitmap $LabelW, $LabelH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

$encode = Get-Code128CEncode $Barcode
$module = 3
$barH = 40
# approximate width for centering
$approxW = (11 + (($encode.Length / 2) * 11) + 11 + 13) * $module
$barX = [Math]::Max(10, [int](($LabelW - $approxW) / 2))
Draw-Code128C $g $encode $barX 12 $module $barH | Out-Null

$fontDigits = New-Object System.Drawing.Font 'Consolas', 14, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Point)
$fontAr = New-Object System.Drawing.Font 'Tahoma', 11, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Point)
$brush = [System.Drawing.Brushes]::Black
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$sf.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft

$rectDigits = New-Object System.Drawing.RectangleF 0, 58, $LabelW, 28
$g.DrawString(($Barcode -replace '\D', ''), $fontDigits, $brush, $rectDigits, (New-Object System.Drawing.StringFormat -Property @{ Alignment = 'Center'; LineAlignment = 'Center' }))

$rectSample = New-Object System.Drawing.RectangleF 4, 92, ($LabelW - 8), 28
$rectTest = New-Object System.Drawing.RectangleF 4, 124, ($LabelW - 8), 28
$rectAnimal = New-Object System.Drawing.RectangleF 4, 156, ($LabelW - 8), 28
$g.DrawString($SampleLine, $fontAr, $brush, $rectSample, $sf)
$g.DrawString($TestAr, $fontAr, $brush, $rectTest, $sf)
$g.DrawString($AnimalLine, $fontAr, $brush, $rectAnimal, $sf)

$gfa = ConvertTo-ZplGfa $bmp
$zpl = @"
^XA
^FX LIMS Arabic graphic trial
^CI0
^MTD
^MD30
^MNW
^PR3
^PW$LabelW
^LL$LabelH
^LH0,0
^FO0,0$gfa
^XZ
"@

$outDir = Join-Path $PSScriptRoot 'zpl-log'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$zplPath = Join-Path $outDir 'trial-arabic-graphic.zpl'
[System.IO.File]::WriteAllText($zplPath, $zpl, [System.Text.Encoding]::ASCII)

# preview PNG
$pngPath = Join-Path $outDir 'trial-arabic-graphic.png'
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$payload = @{
  device = @{ name = 'LIMS Zebra Bridge' }
  data = $zpl
  meta = @{
    trial = $true
    mode = 'arabic-graphic'
    sample = $SampleId
    test = $TestAr
    animal = $AnimalLine
  }
} | ConvertTo-Json -Compress -Depth 5

$result = Invoke-RestMethod -Uri $BridgeUrl -Method Post -Body $payload -ContentType 'application/json; charset=utf-8' -TimeoutSec 30
Write-Host "Print OK: $($result | ConvertTo-Json -Compress)"
Write-Host "Preview: $pngPath"
Write-Host "Expected on label:"
Write-Host "  barcode $Barcode"
Write-Host "  $SampleLine"
Write-Host "  $TestAr"
Write-Host "  $AnimalLine"

$fontDigits.Dispose(); $fontAr.Dispose(); $sf.Dispose(); $g.Dispose(); $bmp.Dispose()
