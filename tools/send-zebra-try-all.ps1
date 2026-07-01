# Try multiple Windows spool data types until ZPL prints on Zebra.
param(
  [Parameter(Mandatory = $true)]
  [string]$ZplFile,
  [string]$PrinterName = 'ZDesigner ZD421-203dpi ZPL'
)

Add-Type -TypeDefinition @"
using System;
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

  public static int Send(string printerName, byte[] bytes, string dataType) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return Marshal.GetLastWin32Error();
    try {
      var di = new DOCINFOA { pDocName = "ZPL", pDataType = dataType };
      if (!StartDocPrinter(hPrinter, 1, di)) return Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(hPrinter)) return Marshal.GetLastWin32Error();
        IntPtr unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
        int written;
        bool ok = WritePrinter(hPrinter, unmanaged, bytes.Length, out written);
        Marshal.FreeCoTaskMem(unmanaged);
        if (!ok) return Marshal.GetLastWin32Error();
        EndPagePrinter(hPrinter);
        return 0;
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($ZplFile)
$types = @('RAW', 'ZPL', 'TEXT', 'PLAINTEXT', 'application/vnd.zebra-raw+f')
foreach ($t in $types) {
  $code = [RawPrinter]::Send($PrinterName, $bytes, $t)
  Write-Host "Sent with type '$t' -> exit $code"
  Start-Sleep -Seconds 2
}

# Fallback: USB port copy
cmd /c "copy /b `"$ZplFile`" USB008"
Write-Host "Also sent via USB008 copy"
