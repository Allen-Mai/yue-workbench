' Yue Workbench - launch the local server with a hidden window
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
loopCmd = scriptDir & "\serve-loop.cmd"
If Not fso.FileExists(loopCmd) Then
  MsgBox "Not found: " & loopCmd, 16, "Yue Workbench"
  WScript.Quit 1
End If
sh.Run "cmd /c """ & loopCmd & """", 0, False