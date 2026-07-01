# Send RAW ZPL to Windows printer by name (recommended for ZDesigner driver).
param(
  [Parameter(Mandatory = $true)]
  [string]$ZplFile,
  [string]$PrinterName = 'ZDesigner ZD421-203dpi ZPL'
)

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void Send(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
      throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    }
    try {
      var di = new DOCINFOA { pDocName = "ZPL", pDataType = "RAW" };
      if (!StartDocPrinter(hPrinter, 1, di)) throw new Exception("StartDocPrinter failed");
      try {
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter failed");
        IntPtr unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
        int written;
        if (!WritePrinter(hPrinter, unmanaged, bytes.Length, out written)) {
          throw new Exception("WritePrinter failed");
        }
        Marshal.FreeCoTaskMem(unmanaged);
        EndPagePrinter(hPrinter);
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
"@

if (-not (Test-Path $ZplFile)) { throw "File not found: $ZplFile" }
$bytes = [System.IO.File]::ReadAllBytes($ZplFile)
[RawPrinter]::Send($PrinterName, $bytes)
Write-Host "RAW sent to '$PrinterName' ($($bytes.Length) bytes) from $ZplFile"
