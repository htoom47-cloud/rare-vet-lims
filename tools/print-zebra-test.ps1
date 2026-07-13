# Standalone Zebra test for RECEPTION PC only (printer must be USB-connected here).
# Double-click or:
#   powershell -ExecutionPolicy Bypass -File .\print-zebra-test.ps1 -Mode arabic
#
# Mode control = English Camel (barcode check)
# Mode arabic  = Arabic "إبل · راجح" (type + name, as stored, no translation)

param(
  [string]$PrinterName = 'ZDesigner ZD421-203dpi ZPL',
  [ValidateSet('control', 'arabic')]
  [string]$Mode = 'arabic',
  [string]$AnimalTypeAr = 'إبل',
  [string]$AnimalName = 'راجح'
)

$ErrorActionPreference = 'Stop'

function Send-RawZpl {
  param([string]$Printer, [byte[]]$Bytes)
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper2 {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void Send(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
      throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      var di = new DOCINFOA { pDocName = "ZPL-TEST", pDataType = "RAW" };
      if (!StartDocPrinter(hPrinter, 1, di)) throw new Exception("StartDocPrinter failed");
      try {
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter failed");
        IntPtr unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
        int written;
        if (!WritePrinter(hPrinter, unmanaged, bytes.Length, out written))
          throw new Exception("WritePrinter failed");
        Marshal.FreeCoTaskMem(unmanaged);
        EndPagePrinter(hPrinter);
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
"@ -ErrorAction SilentlyContinue
  [RawPrinterHelper2]::Send($Printer, $Bytes)
}

function Get-Utf8HexZplField([string]$text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $hex = ($bytes | ForEach-Object { '_' + $_.ToString('X2') }) -join ''
  return "^FH^FD$hex^FS"
}

$controlZpl = @"
^XA
^CI0
^MTD
^MD35
^MNW
^PR3
^PW400
^LL200
^LH0,0
^LT0
^LS0
^FWN
^PON
^FO48,24^BY3,3,40^BCN,40,N,N,N^FD>;>8260712686909^FS
^FO0,68^FB400,1,0,C,0^A0N,30,28^FD260712686909^FS
^FO0,102^FB400,1,0,C,0^A0N,24,22^FDSample 26000035^FS
^FO0,138^FB400,1,0,C,0^A0N,24,24^FDParasitology^FS
^FO0,174^FB400,1,0,C,0^A0N,24,22^FDCamel^FS
^XZ
"@

$animalLine = "$AnimalTypeAr · $AnimalName"
$arabicHex = Get-Utf8HexZplField $animalLine
$arabicZpl = @"
^XA
^CI0
^MTD
^MD35
^MNW
^PR3
^PW400
^LL200
^LH0,0
^LT0
^LS0
^FWN
^PON
^FO48,24^BY3,3,40^BCN,40,N,N,N^FD>;>8260712686909^FS
^FO0,68^FB400,1,0,C,0^A0N,30,28^FD260712686909^FS
^FO0,102^FB400,1,0,C,0^A0N,24,22^FDSample 26000035^FS
^FO0,138^FB400,1,0,C,0^A0N,24,24^FDParasitology^FS
^CI28
^FO0,174^FB400,1,0,C,0^A0N,24,22$arabicHex
^CI0
^XZ
"@

$zpl = if ($Mode -eq 'arabic') { $arabicZpl } else { $controlZpl }
$bytes = [System.Text.Encoding]::ASCII.GetBytes($zpl)

Write-Host "=== Reception Zebra test ==="
Write-Host "Computer: $env:COMPUTERNAME"
Write-Host "Printer : $PrinterName"
Write-Host "Mode    : $Mode"
if ($Mode -eq 'arabic') { Write-Host "Line    : $animalLine" }

$p = Get-CimInstance Win32_Printer -Filter "Name='$PrinterName'" -ErrorAction SilentlyContinue
if (-not $p) {
  Write-Host "ERROR: Printer not found on THIS PC. Available:" -ForegroundColor Red
  Get-Printer | Select-Object -ExpandProperty Name
  exit 1
}
Write-Host ("WorkOffline=" + $p.WorkOffline + " Status=" + $p.PrinterStatus)
if ($p.WorkOffline) {
  Write-Host "Printer is Offline on this PC. Connect USB / uncheck Use Printer Offline." -ForegroundColor Red
  exit 1
}

# Clear stuck jobs
Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue | ForEach-Object {
  Remove-PrintJob -PrinterName $PrinterName -ID $_.Id -Confirm:$false -ErrorAction SilentlyContinue
}

Send-RawZpl -Printer $PrinterName -Bytes $bytes
Start-Sleep -Seconds 2
$jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)
if ($jobs.Count -gt 0) {
  Write-Host "Queue after send:" -ForegroundColor Yellow
  $jobs | Format-Table Id, JobStatus, Size, PagesPrinted -AutoSize
  Write-Host "If JobStatus=Error, Windows still cannot reach the printer USB." -ForegroundColor Yellow
} else {
  Write-Host "Sent $($bytes.Length) bytes. Queue empty (likely printed or consumed)." -ForegroundColor Green
}

Write-Host ""
Write-Host "Check label:"
Write-Host "  1) Barcode bars visible?"
Write-Host "  2) Bottom line shows: $animalLine  (Arabic readable)?"
