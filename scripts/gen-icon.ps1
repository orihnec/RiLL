Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# ---- background rounded square with indigo->sky gradient ----
$bgPath = New-RoundedPath 0 0 $size $size 224
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(96, 0)),
  (New-Object System.Drawing.Point(928, 1024)),
  [System.Drawing.Color]::FromArgb(255, 99, 102, 241),
  [System.Drawing.Color]::FromArgb(255, 56, 189, 248))
$g.FillPath($grad, $bgPath)

# subtle inner top highlight
$hlPath = New-RoundedPath 0 0 $size $size 224
$hl = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 255, 255, 255))
$g.FillPath($hl, $hlPath)

# ---- white calendar glyph ----
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$whitePen = New-Object System.Drawing.Pen($white, 40)
$whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$whitePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$bx = 240.0; $by = 268.0; $bw = 544.0; $bh = 456.0; $br = 64.0

# calendar body outline
$body = New-RoundedPath $bx $by $bw $bh $br
$g.DrawPath($whitePen, $body)

# header band (filled, rounded top)
$head = New-RoundedPath ($bx + 40) ($by + 36) ($bw - 80) 150 44
$g.FillPath((New-Object System.Drawing.SolidBrush($white)), $head)

# two binder pegs above the body
$peg = New-Object System.Drawing.SolidBrush($white)
$g.FillRectangle($peg, ($bx + 150), ($by - 74), 54, 96)
$g.FillRectangle($peg, ($bx + $bw - 204), ($by - 74), 54, 96)

# date cells: 3 short rounded lines
$dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
$dotPath = New-RoundedPath ($bx + 84) ($by + 240) 190 46 23
$g.FillPath($dotBrush, $dotPath)
$dotPath2 = New-RoundedPath ($bx + 84) ($by + 322) 190 46 23
$g.FillPath($dotBrush, $dotPath2)
$dotPath3 = New-RoundedPath ($bx + 320) ($by + 240) 190 46 23
$g.FillPath($dotBrush, $dotPath3)

# ---- 4-point sparkle (AI) ----
function Draw-Sparkle($g, [float]$cx, [float]$cy, [float]$R) {
  $d = $R * 0.42   # inner notch (half-diagonal) - makes star points wide/clear
  $pts = New-Object 'System.Drawing.PointF[]' 8
  $pts[0] = New-Object System.Drawing.PointF($cx, ($cy - $R))
  $pts[1] = New-Object System.Drawing.PointF(($cx + $d), ($cy - $d))
  $pts[2] = New-Object System.Drawing.PointF(($cx + $R), $cy)
  $pts[3] = New-Object System.Drawing.PointF(($cx + $d), ($cy + $d))
  $pts[4] = New-Object System.Drawing.PointF($cx, ($cy + $R))
  $pts[5] = New-Object System.Drawing.PointF(($cx - $d), ($cy + $d))
  $pts[6] = New-Object System.Drawing.PointF(($cx - $R), $cy)
  $pts[7] = New-Object System.Drawing.PointF(($cx - $d), ($cy - $d))
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddPolygon($pts)
  $g.FillPath((New-Object System.Drawing.SolidBrush($white)), $path)
}

Draw-Sparkle $g 834.0 208.0 96.0
Draw-Sparkle $g 928.0 384.0 50.0

$g.Dispose()
$out = "D:\32069\Desktop\riliagent\icon-src.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "saved: $out"
