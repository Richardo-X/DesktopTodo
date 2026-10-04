# owner 豁免决定性实验 v3（临时诊断）
# 先翻到普通态（探针窗确认）→ 创建 C1=普通/C2=owner任务栏/C3=owner自有隐藏窗/C4=置顶
# → WinD 进 Show Desktop 态判定 C2/C3 幸存 → 翻回普通态做覆盖测试（挂件态兼容判定）
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$cs = @'
using System;
using System.Runtime.InteropServices;
public static class W9 {
  public delegate IntPtr WndProc(IntPtr h, uint m, IntPtr wp, IntPtr lp);
  static WndProc proc = DefProcHandler;
  static IntPtr DefProcHandler(IntPtr h, uint m, IntPtr wp, IntPtr lp) { return DefWindowProcW(h, m, wp, lp); }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct WNDCLASS {
    public uint style;
    public WndProc lpfnWndProc;
    public int cbClsExtra;
    public int cbWndExtra;
    public IntPtr hInstance;
    public IntPtr hIcon;
    public IntPtr hCursor;
    public IntPtr hbrBackground;
    [MarshalAs(UnmanagedType.LPWStr)] public string lpszMenuName;
    [MarshalAs(UnmanagedType.LPWStr)] public string lpszClassName;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct MSG { public IntPtr hwnd; public uint message; public IntPtr wp; public IntPtr lp; public uint time; public int ptX; public int ptY; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern ushort RegisterClassW(ref WNDCLASS wc);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr DefWindowProcW(IntPtr h, uint m, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll")] static extern bool PeekMessageW(out MSG m, IntPtr h, uint mn, uint mx, uint rm);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG m);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessageW(ref MSG m);
  [DllImport("user32.dll")] public static extern bool DestroyWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
  [DllImport("gdi32.dll")] static extern IntPtr CreateSolidBrush(uint c);
  static IntPtr hInst;
  public static void Init() {
    hInst = Marshal.GetHINSTANCE(typeof(W9).Module);
    var mag = new WNDCLASS();
    mag.lpfnWndProc = proc; mag.hInstance = hInst; mag.hbrBackground = CreateSolidBrush(0xFF00FFu); mag.lpszClassName = "wd9mag";
    RegisterClassW(ref mag);
    var cyan = new WNDCLASS();
    cyan.lpfnWndProc = proc; cyan.hInstance = hInst; cyan.hbrBackground = CreateSolidBrush(0xFFFF00u); cyan.lpszClassName = "wd9cyan";
    RegisterClassW(ref cyan);
  }
  public static string MakeProbe() {
    IntPtr h = CreateWindowExW(0u, "wd9mag", "PROBE", 0x90000000u, 1450, 150, 120, 120, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
    return h.ToInt64().ToString();
  }
  public static IntPtr FindTray() { return FindWindowW("Shell_TrayWnd", null); }
  public static string MakeMain(IntPtr tray, out IntPtr[] hs) {
    IntPtr owner = CreateWindowExW(0u, "wd9mag", "O-hidden", 0x90000000u, -600, -600, 60, 60, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
    hs = new IntPtr[5];
    hs[4] = owner;
    hs[0] = CreateWindowExW(0u, "wd9mag", "C1-plain", 0x90000000u, 1700, 150, 140, 140, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
    hs[1] = CreateWindowExW(0u, "wd9mag", "C2-trayowner", 0x90000000u, 1700, 330, 140, 140, tray, IntPtr.Zero, hInst, IntPtr.Zero);
    hs[2] = CreateWindowExW(0u, "wd9mag", "C3-ownowner", 0x90000000u, 1700, 510, 140, 140, owner, IntPtr.Zero, hInst, IntPtr.Zero);
    hs[3] = CreateWindowExW(8u, "wd9mag", "C4-topmost", 0x90000000u, 1700, 690, 140, 140, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
    return "h1=" + hs[0].ToInt64() + " h2=" + hs[1].ToInt64() + " h3=" + hs[2].ToInt64() + " h4=" + hs[3].ToInt64();
  }
  public static IntPtr MakeCover(int x, int y) {
    return CreateWindowExW(0u, "wd9cyan", "cover", 0x90000000u, x, y, 140, 140, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
  }
  public static void WinD() {
    keybd_event(0x5b, 0, 0, IntPtr.Zero);
    keybd_event(0x44, 0, 0, IntPtr.Zero);
    keybd_event(0x44, 0, 2, IntPtr.Zero);
    keybd_event(0x5b, 0, 2, IntPtr.Zero);
  }
  public static void Pump(int ms) {
    var sw = System.Diagnostics.Stopwatch.StartNew();
    while (sw.ElapsedMilliseconds < ms) {
      MSG m;
      while (PeekMessageW(out m, IntPtr.Zero, 0, 0, 1)) { TranslateMessage(ref m); DispatchMessageW(ref m); }
      System.Threading.Thread.Sleep(4);
    }
  }
  public static void DestroyAll(IntPtr[] hs) { foreach (IntPtr h in hs) if (h != IntPtr.Zero) DestroyWindow(h); }
}
'@
Add-Type -TypeDefinition $cs -Language CSharp

[W9]::Init()
$bmp = New-Object System.Drawing.Bitmap(2048, 1152)
function Capture($path) {
  $g = [System.Drawing.Graphics]::FromImage($script:bmp)
  $g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
  $g.Dispose()
  if ($path) { $bmp.Save($path) }
}
function Px($x, $y) {
  $p = $bmp.GetPixel($x, $y)
  if ($p.R -gt 180 -and $p.B -gt 180 -and $p.G -lt 120) { return 'MAGENTA' }
  if ($p.R -lt 120 -and $p.G -gt 180 -and $p.B -gt 180) { return 'CYAN' }
  return 'bg'
}

# 阶段0：翻到普通态（探针窗可见=普通态）
$probe = [W9]::MakeProbe()
[W9]::Pump(700)
Capture $null
$st = Px 1510 210
$tries = 0
while ($st -ne 'MAGENTA' -and $tries -lt 3) {
  [W9]::WinD(); [W9]::Pump(2000)
  $st = Px 1510 210
  $tries++
}
Write-Host "state-acquired: probe=$st tries=$tries (MAGENTA=普通态)"

# 阶段1：普通态下创建判定窗
$hs = $null
Write-Host ([W9]::MakeMain([W9]::FindTray(), [ref]$hs))
[W9]::Pump(900)
Capture 'C:\tmp\wd9-a.png'
Write-Host ("A(普通态基线): C1={0} C2={1} C3={2} C4={3}" -f (Px 1770 220), (Px 1770 400), (Px 1770 580), (Px 1770 760))

# 阶段2：进 Show Desktop 态 → 判定幸存
[W9]::WinD(); [W9]::Pump(2200)
Capture 'C:\tmp\wd9-b.png'
$c1 = Px 1770 220; $c2 = Px 1770 400; $c3 = Px 1770 580; $c4 = Px 1770 760
Write-Host ("B(ShowDesktop): C1={0} C2={1} C3={2} C4={3}" -f $c1, $c2, $c3, $c4)
Write-Host ("判定1(owner豁免): C2={0} C3={1}  (MAGENTA=幸存/bg=被隐藏)" -f $c2, $c3)

# 阶段3：翻回普通态 → 覆盖测试（挂件态兼容判定）
[W9]::WinD(); [W9]::Pump(1800)
$cov2 = [W9]::MakeCover(1700, 330)
$cov3 = [W9]::MakeCover(1700, 510)
[W9]::Pump(800)
Capture 'C:\tmp\wd9-c.png'
$c2c = Px 1770 400; $c3c = Px 1770 580
Write-Host ("判定2(挂件态兼容): C2上={0} C3上={1}  (CYAN=被普通窗覆盖=兼容 / MAGENTA=浮在普通窗上=不兼容)" -f $c2c, $c3c)

[W9]::DestroyAll(@($cov2, $cov3) + $hs)
Capture $null
if ((Px 1770 220) -eq 'bg' -and (Px 1770 760) -eq 'MAGENTA') { [W9]::WinD(); [W9]::Pump(1200); Write-Host 'final WinD restore' }
Write-Host 'done'
