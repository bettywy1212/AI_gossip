param(
    [string]$ConfigPath = "C:\Users\Betty Shi\.claude\skills\ai-gossip\assets\issues\2026-07-09\overlay-config.json"
)

Add-Type -AssemblyName System.Drawing
$config = Get-Content -Path $ConfigPath -Encoding UTF8 | ConvertFrom-Json
$Dir = $config.dir

function Get-Font($size, [bool]$bold = $true) {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    foreach ($name in @("Microsoft YaHei UI", "Microsoft YaHei", "SimHei", "Arial")) {
        try { return New-Object System.Drawing.Font($name, [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel) } catch {}
    }
    return New-Object System.Drawing.Font("Arial", [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Label($graphics, [string]$text, [float]$x, [float]$y, [float]$maxW, [int]$fontSize, [bool]$bold = $true, $color = $null) {
    if (-not $text) { return }
    $font = Get-Font $fontSize $bold
    $brush = if ($color) { New-Object System.Drawing.SolidBrush($color) } else { [System.Drawing.Brushes]::White }
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $rectH = [float]($fontSize * 2.4)
    $rect = [System.Drawing.RectangleF]::new($x, $y, $maxW, $rectH)
    $shadow = [System.Drawing.RectangleF]::new($x + 2, $y + 2, $maxW, $rectH)
    $graphics.DrawString($text, $font, [System.Drawing.Brushes]::Black, $shadow, $format)
    $graphics.DrawString($text, $font, $brush, $rect, $format)
    $font.Dispose()
    if ($color) { $brush.Dispose() }
    $format.Dispose()
}

foreach ($item in $config.items) {
    $path = Join-Path $Dir $item.file
    $tmp = $path + ".tmp.png"
    if (-not (Test-Path $path)) { Write-Warning "Missing: $path"; continue }

    $src = [System.Drawing.Bitmap]::FromFile($path)
    $bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
    $src.Dispose()

    $w = [float]$bmp.Width
    $h = [float]$bmp.Height
    $isPoster = [bool]$item.poster

    $barH = [float]($w * 0.11)
    $barAlpha = if ($isPoster) { 210 } else { 180 }
    $barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($barAlpha, 0, 0, 0))
    $g.FillRectangle($barBrush, 0, 0, $w, $barH)
    $barBrush.Dispose()

    $titleColor = if ($isPoster) { [System.Drawing.Color]::FromArgb(255, 57, 255, 20) } else { [System.Drawing.Color]::White }
    Draw-Label $g $item.title ([float]($w * 0.05)) ([float]($barH * 0.18)) ([float]($w * 0.9)) ([int]($barH * 0.55)) $true $titleColor

    if ($item.subtitle) {
        $subColor = [System.Drawing.Color]::FromArgb(230, 220, 220, 220)
        Draw-Label $g $item.subtitle ([float]($w * 0.1)) ([float]($h * 0.12)) ([float]($w * 0.8)) ([int]($w * 0.028)) $false $subColor
    }

    $panels = @($item.panels)
    if ($panels.Count -gt 0) {
        $panelW = $w / $panels.Count
        $labelY = [float]($h * 0.82)
        $labelSize = [int]($w * 0.032)
        for ($i = 0; $i -lt $panels.Count; $i++) {
            $panelColor = if ($isPoster) { [System.Drawing.Color]::FromArgb(255, 255, 230, 0) } else { [System.Drawing.Color]::FromArgb(255, 255, 255, 255) }
            $pillW = [float]($panelW * 0.85)
            $pillH = [float]($labelSize * 2)
            $pillX = [float]($panelW * $i + ($panelW - $pillW) / 2)
            $pillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 0, 0, 0))
            $g.FillRectangle($pillBrush, $pillX, $labelY, $pillW, $pillH)
            $pillBrush.Dispose()
            Draw-Label $g $panels[$i] ([float]($panelW * $i + $panelW * 0.05)) $labelY ([float]($panelW * 0.9)) $labelSize $true $panelColor
        }
    }

    $g.Dispose()
    $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Move-Item -Force $tmp $path
    Write-Host ("Labeled: " + $item.file)
}

Write-Host "Done."
