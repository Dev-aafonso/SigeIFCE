#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$bitmap = [System.Drawing.Bitmap]::new(1200, 630)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
function Brush($hex) { [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex)) }
function Font($size, $bold = $false) { [System.Drawing.Font]::new('Segoe UI', $size, $(if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }), [System.Drawing.GraphicsUnit]::Pixel) }
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#F5FAF7'))
$graphics.FillRectangle((Brush '#176B40'), 0, 0, 1200, 12)
$graphics.FillRectangle((Brush '#DCEFE3'), 0, 490, 1200, 140)
$graphics.DrawString('SIGE IFCE', (Font 84 $true), (Brush '#143B2A'), 66, 60)
$graphics.DrawString('Sistema de Gerenciamento', (Font 44 $true), (Brush '#183F2E'), 69, 177)
$graphics.DrawString('de Eventos Científicos', (Font 44 $true), (Brush '#183F2E'), 69, 233)
$graphics.DrawString('Eventos  •  Inscrições  •  Certificados digitais', (Font 30), (Brush '#37594A'), 70, 340)
$graphics.DrawString('sigeifce.onrender.com', (Font 22 $true), (Brush '#176B40'), 70, 408)
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'assets/ifce-logo-horizontal.png'))
$graphics.DrawImage($logo, 69, 520, 440, 85)
# Institutional geometric mark, separate from the official signature.
$green = Brush '#2F914D'; $red = Brush '#C62828'
foreach ($cell in @(@(0,1),@(0,2),@(1,0),@(1,1),@(2,0),@(2,1),@(2,2),@(3,0),@(3,1))) {
  $graphics.FillRectangle($green, (928 + 56*$cell[1]), (105 + 56*$cell[0]), 45, 45)
}
$graphics.FillEllipse($red, 928, 105, 45, 45)
$bitmap.Save((Join-Path $root 'assets/sige-social-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$logo.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
