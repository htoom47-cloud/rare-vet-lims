' Silent launcher for LIMS Print Bridge (Zebra barcodes + Epson invoices)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
tools = fso.GetParentFolderName(WScript.ScriptFullName)
node = "C:\Program Files\nodejs\node.exe"
If Not fso.FileExists(node) Then
  node = "node"
End If
cmd = """" & node & """ """ & tools & "\zebra-local-bridge.js"""
sh.CurrentDirectory = tools
sh.Environment("PROCESS")("PATH") = "C:\Program Files\nodejs;" & sh.Environment("PROCESS")("PATH")
sh.Run cmd, 0, False
