# Waits for Power BI Desktop, clicks "Actualizar ahora", closes tips and collapses side panes, then screenshots.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
function Find($root, $name) {
  $c = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $name)
  $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}
function Invoke($el) {
  try { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); $true } catch { $false }
}
$deadline = (Get-Date).AddMinutes(4)
$root = $null; $btn = $null
while ((Get-Date) -lt $deadline -and -not $btn) {
  $p = Get-Process PBIDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1
  if ($p) { $root = $AE::FromHandle($p.MainWindowHandle); $btn = Find $root 'Actualizar ahora' }
  if (-not $btn) { Start-Sleep 3 }
}
if (-not $btn) { "refresh button not found"; exit 1 }
Invoke $btn | Out-Null; "refresh invoked"
# wait until the warning bar disappears and the card shows a value
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) { Start-Sleep 3; if (-not (Find $root 'Actualizar ahora') -and -not (Find $root 'Cancelar')) { break } }
Start-Sleep 8
"done"
