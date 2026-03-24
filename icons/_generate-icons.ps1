# 仮アイコン PNG を生成（差し替え用）
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

foreach ($s in @(192, 512)) {
  $bmp = New-Object Drawing.Bitmap $s, $s
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([Drawing.Color]::FromArgb(2, 11, 31))
  $fontSize = [math]::Max(16, [int]($s / 5))
  $font = New-Object Drawing.Font("Segoe UI", $fontSize, [Drawing.FontStyle]::Bold)
  $brush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(0, 230, 255))
  $sf = New-Object Drawing.StringFormat
  $sf.Alignment = [Drawing.StringAlignment]::Center
  $sf.LineAlignment = [Drawing.StringAlignment]::Center
  $rect = New-Object Drawing.RectangleF 0, 0, $s, $s
  $g.DrawString("T", $font, $brush, $rect, $sf)
  $g.Dispose()
  $path = Join-Path $dir "icon-$s.png"
  $bmp.Save($path, [Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Wrote $path"
}
