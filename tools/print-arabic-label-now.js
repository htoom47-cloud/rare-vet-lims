/**
 * Print Arabic barcode label as graphic (Windows GDI fonts) via LIMS bridge.
 * All temp files use ASCII paths under %TEMP% to avoid Arabic username path issues.
 *
 * Usage: node tools/print-arabic-label-now.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const label = {
  barcode: '260712686909',
  sampleId: '26000099',
  sampleLine: 'عينة 26000099',
  testAr: 'طفيليات',
  animalTypeAr: 'جمل',
  animalNameAr: 'تجربة',
};
label.animalLine = `${label.animalTypeAr} · ${label.animalNameAr}`;

// ASCII-only work dir — Arabic Windows usernames break some PowerShell -File paths.
const workDir = 'C:\\Temp\\lims-arabic-label';
fs.mkdirSync(workDir, { recursive: true });

const b64Path = path.join(workDir, 'label.json.b64');
const pngPath = path.join(workDir, 'label.png');
const zplPath = path.join(workDir, 'label.zpl');
const psHelper = path.join(workDir, 'render.ps1');
const mirrorDir = path.join(__dirname, 'zpl-log');
fs.mkdirSync(mirrorDir, { recursive: true });

fs.writeFileSync(b64Path, Buffer.from(JSON.stringify({
  ...label,
  pngPath,
  zplPath,
}), 'utf8').toString('base64'), 'ascii');

const psScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$workDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$b64 = Get-Content -LiteralPath (Join-Path $workDir 'label.json.b64') -Raw
$json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64.Trim()))
$L = $json | ConvertFrom-Json
$LabelW = 400
$LabelH = 200

function Get-Code128CEncode([string]$raw) {
  $digits = ($raw -replace '\D', '')
  if (($digits.Length % 2) -eq 1) { $digits = "0$digits" }
  return $digits
}

function Get-Code128Patterns {
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
  [void]$codes.Add(105)
  $checksum = 105
  $weight = 1
  for ($i = 0; $i -lt $digits.Length; $i += 2) {
    $val = [int]$digits.Substring($i, 2)
    [void]$codes.Add($val)
    $checksum += $val * $weight
    $weight++
  }
  [void]$codes.Add($checksum % 103)
  [void]$codes.Add(106)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
  $cursor = $x
  foreach ($code in $codes) {
    $pat = $patterns[$code]
    $drawBar = $true
    foreach ($ch in $pat.ToCharArray()) {
      $w = [int][string]$ch * $module
      if ($drawBar) { $g.FillRectangle($brush, $cursor, $y, $w, $height) }
      $cursor += $w
      $drawBar = -not $drawBar
    }
  }
  $brush.Dispose()
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
        if ($c.A -gt 128 -and $lum -lt 180) { $byte = $byte -bor (0x80 -shr $bit) }
      }
      $bytes[$idx++] = [byte]$byte
    }
  }
  $hex = -join ($bytes | ForEach-Object { $_.ToString('X2') })
  return "^GFA,$total,$total,$bytesPerRow,$hex"
}

$bmp = New-Object System.Drawing.Bitmap $LabelW, $LabelH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$encode = Get-Code128CEncode $L.barcode
$module = 3
$barH = 40
$approxW = (11 + (($encode.Length / 2) * 11) + 11 + 13) * $module
$barX = [Math]::Max(10, [int](($LabelW - $approxW) / 2))
Draw-Code128C $g $encode $barX 20 $module $barH

$fontDigits = New-Object System.Drawing.Font 'Consolas', 17, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Point)
$fontAr = New-Object System.Drawing.Font 'Tahoma', 13, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Point)
$brush = [System.Drawing.Brushes]::Black
$sfCenter = New-Object System.Drawing.StringFormat
$sfCenter.Alignment = [System.Drawing.StringAlignment]::Center
$sfCenter.LineAlignment = [System.Drawing.StringAlignment]::Center
$sfRtl = New-Object System.Drawing.StringFormat
$sfRtl.Alignment = [System.Drawing.StringAlignment]::Center
$sfRtl.LineAlignment = [System.Drawing.StringAlignment]::Center
$sfRtl.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft

$digits = ($L.barcode -replace '\D', '')
$g.DrawString($digits, $fontDigits, $brush, (New-Object System.Drawing.RectangleF 0, 64, $LabelW, 28), $sfCenter)
$g.DrawString([string]$L.sampleLine, $fontAr, $brush, (New-Object System.Drawing.RectangleF 4, 98, ($LabelW - 8), 28), $sfRtl)
$g.DrawString([string]$L.testAr, $fontAr, $brush, (New-Object System.Drawing.RectangleF 4, 130, ($LabelW - 8), 28), $sfRtl)
$g.DrawString([string]$L.animalLine, $fontAr, $brush, (New-Object System.Drawing.RectangleF 4, 162, ($LabelW - 8), 28), $sfRtl)

$gfa = ConvertTo-ZplGfa $bmp
$zpl = @"
^XA
^FX LIMS Arabic graphic
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

[System.IO.File]::WriteAllText([string]$L.zplPath, $zpl, [System.Text.Encoding]::ASCII)
$bmp.Save([string]$L.pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output 'OK'
$fontDigits.Dispose(); $fontAr.Dispose(); $sfCenter.Dispose(); $sfRtl.Dispose(); $g.Dispose(); $bmp.Dispose()
`;

fs.writeFileSync(psHelper, psScript, 'utf8');

function httpJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({
      host: '127.0.0.1',
      port: 9100,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(payload ? { 'Content-Length': payload.length } : {}),
      },
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = text;
        try { data = JSON.parse(text); } catch { /* raw */ }
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${text}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const rendered = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psHelper],
    { encoding: 'utf8' }
  );
  if (rendered.status !== 0) {
    console.error(rendered.stdout || '');
    console.error(rendered.stderr || '');
    throw new Error('Render failed');
  }
  if (!fs.existsSync(zplPath) || !fs.existsSync(pngPath)) {
    throw new Error('Render did not produce ZPL/PNG');
  }

  fs.copyFileSync(pngPath, path.join(mirrorDir, 'trial-arabic-graphic.png'));
  fs.copyFileSync(zplPath, path.join(mirrorDir, 'trial-arabic-graphic.zpl'));

  try {
    await httpJson('GET', '/default');
  } catch {
    const vbs = path.join(__dirname, 'start-lims-print-bridge-hidden.vbs');
    spawnSync('wscript.exe', [vbs], { windowsHide: true });
    await new Promise((r) => setTimeout(r, 3500));
  }

  const zpl = fs.readFileSync(zplPath, 'ascii');
  console.log('Label content:');
  console.log('  barcode:', label.barcode);
  console.log('  sample :', label.sampleLine);
  console.log('  test   :', label.testAr);
  console.log('  animal :', label.animalLine);

  const result = await httpJson('POST', '/write', {
    device: { name: 'LIMS Zebra Bridge' },
    data: zpl,
    meta: {
      trial: true,
      mode: 'arabic-graphic-utf8',
      sample: label.sampleId,
      test: label.testAr,
      animal: label.animalLine,
    },
  });
  console.log('Print OK:', result);
  console.log('Preview:', path.join(mirrorDir, 'trial-arabic-graphic.png'));
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
