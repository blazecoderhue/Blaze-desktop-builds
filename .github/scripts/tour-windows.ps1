# Drives the real Blaze.exe through the look tour (looktour.js) and screenshots each state it announces.
$ErrorActionPreference = "Continue"
$out = Join-Path $PWD "shots"; New-Item -ItemType Directory -Force $out | Out-Null
$home2 = Join-Path $env:RUNNER_TEMP "blzhome"; New-Item -ItemType Directory -Force $home2 | Out-Null
$env:BLAZE_LOOK_TOUR = $out; $env:BLAZE_LOOK_QUIT = "1"; $env:BLAZE_HOME = (Join-Path $home2 ".blaze")
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[W]::SetProcessDPIAware() | Out-Null
$p = Start-Process -FilePath (Join-Path $PWD "blaze.exe") -WorkingDirectory $home2 -PassThru
$t0 = Get-Date; $n = 0
while ($true) {
  $ready = Join-Path $out "ready"
  if (Test-Path $ready) {
    $name = (Get-Content $ready -Raw).Trim(); Remove-Item $ready -Force
    if ($name -eq "finished") { break }
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $g.Dispose()
    $bmp.Save((Join-Path $out "full-$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $p.Refresh(); $h = $p.MainWindowHandle; $r = New-Object W+RECT
    $crop = $null
    if ($h -ne [IntPtr]::Zero -and [W]::GetWindowRect($h, [ref]$r)) {
      $x = [Math]::Max(0, $r.L); $y = [Math]::Max(0, $r.T); $w = [Math]::Min($b.Width, $r.R) - $x; $hh = [Math]::Min($b.Height, $r.B) - $y
      "$name $($r.L) $($r.T) $($r.R) $($r.B)" | Add-Content (Join-Path $out "rects.txt")
      if ($w -gt 50 -and $hh -gt 50) { $crop = $bmp.Clone((New-Object System.Drawing.Rectangle $x, $y, $w, $hh), $bmp.PixelFormat) }
    }
    if (-not $crop) { $crop = $bmp }
    $tmp = Join-Path $out "$name.tmp"; $crop.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    Move-Item -Force $tmp (Join-Path $out "$name.png"); $n++
    $bmp.Dispose()
  }
  if ($p.HasExited) { "app exited code $($p.ExitCode)"; break }
  if (((Get-Date) - $t0).TotalMinutes -gt 42) { "timeout"; break }
  Start-Sleep -Milliseconds 100
}
Start-Sleep 1; if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
"TOUR_DONE shots=$n"
