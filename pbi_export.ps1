# Saves the open Power BI project and exports it to PDF (File > Export > Export to PDF). Prints the PDF path.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$p = Get-Process PBIDesktop | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1
$root = $AE::FromHandle($p.MainWindowHandle)
$TS = [System.Windows.Automation.TreeScope]::Descendants
function Prop($k, $v) { New-Object System.Windows.Automation.PropertyCondition($k, $v) }
function Press($el) { try { $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() } }
Press ($root.FindFirst($TS, (Prop $AE::AutomationIdProperty 'save'))); Start-Sleep 6
Press ($root.FindFirst($TS, (Prop $AE::AutomationIdProperty 'Ribbon-file'))); Start-Sleep 4
$tab = New-Object System.Windows.Automation.AndCondition((Prop $AE::NameProperty 'Exportar'), (Prop $AE::ControlTypeProperty ([System.Windows.Automation.ControlType]::TabItem)))
Press ($root.FindFirst($TS, $tab)); Start-Sleep 3
$t0 = Get-Date
Press ($root.FindFirst($TS, (Prop $AE::NameProperty 'Exportar a PDF')))
$deadline = (Get-Date).AddSeconds(90); $pdf = $null
while ((Get-Date) -lt $deadline -and -not $pdf) { Start-Sleep 3; $pdf = Get-ChildItem "$env:TEMP\Power BI Desktop" -Filter *.pdf -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $t0 } | Select-Object -First 1 }
if ($pdf) { Start-Sleep 2; $out = Join-Path $PSScriptRoot 'pbi_export.pdf'; Copy-Item $pdf.FullName $out -Force; "pdf -> $out" } else { "no pdf" }
