// 짤 복사 도우미 (JjalCopy) — jjal storage 원클릭 원본 복사 (Windows)
//
// jjal 사이트가 http://127.0.0.1:47321/ping 으로 이 프로그램을 감지하면, 썸네일 클릭 시 /copy 로 원본 URL 을 보낸다.
// 원본을 「끝까지」 받은 뒤 탐색기에서 Ctrl+C 한 것과 같은 형태(파일 드롭 목록)로 클립보드에 올린다 → 카톡에서 Ctrl+V.
// (브라우저는 보안상 클립보드에 「파일」을 넣을 수 없고, 드래그 앤 드롭은 브라우저가 파일을 다 쓰기 전에 넘겨 빈 파일이 될 수 있다)
//
// 설치: exe 를 실행하면 %LOCALAPPDATA%\JjalCopy 로 자신을 복사하고 Windows 시작 시 자동 실행에 등록(관리자 권한 불필요).
// 종료·자동 실행 끄기·제거: 작업 표시줄 트레이 아이콘 우클릭.
using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Runtime.InteropServices;
using IComDataObject = System.Runtime.InteropServices.ComTypes.IDataObject;

namespace JjalCopy
{
    static class Program
    {
        public const string AppName = "JjalCopy";
        public const string DisplayName = "짤 복사 도우미";
        public const int Port = 47321;
        public const string SiteUrl = "https://jjal-kabkee.d271z96h7lorpb.amplifyapp.com/";
        public static readonly string[] AllowedHosts =
            { "jjal-kabkee.d271z96h7lorpb.amplifyapp.com", "100.64.25.50", "localhost", "127.0.0.1" };

        public static string Version => Assembly.GetExecutingAssembly().GetName().Version.ToString(3);
        public static readonly string InstallDir =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);
        public static string InstalledExe => Path.Combine(InstallDir, AppName + ".exe");
        public static readonly string TempRoot = Path.Combine(Path.GetTempPath(), AppName);

        const string MutexName = @"Local\JjalCopy.SingleInstance";
        public const string QuitEventName = @"Local\JjalCopy.Quit";

        [STAThread]
        static int Main(string[] args)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12 | (SecurityProtocolType)12288; // TLS1.3
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // 헤드리스 점검용: 트레이·클립보드 없이 브리지만 N초 띄운다 (SSH 테스트)
            if (args.Length >= 1 && args[0] == "--selftest")
            {
                int secs = args.Length > 1 && int.TryParse(args[1], out var s) ? s : 20;
                var b = new Bridge((src, name) => Copier.Download(src, name).ContinueWith(t => Path.GetFileName(t.Result)));
                b.Start();
                Thread.Sleep(secs * 1000);
                return 0;
            }

            // 설치 위치가 아닌 곳(다운로드 폴더 등)에서 실행 → 설치 후 설치본을 실행하고 끝
            if (!args.Contains("--portable") && !SamePath(Application.ExecutablePath, InstalledExe))
            {
                try
                {
                    Installer.Install(Application.ExecutablePath);
                    Process.Start(InstalledExe, "--installed");
                }
                catch (Exception e)
                {
                    MessageBox.Show("설치하지 못했어요.\n\n" + e.Message, DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }
                return 0;
            }

            using (var mutex = new Mutex(true, MutexName, out bool created))
            {
                if (!created)
                {
                    MessageBox.Show("이미 실행 중이에요.\n작업 표시줄 오른쪽(트레이)의 아이콘을 우클릭하면 종료할 수 있어요.",
                        DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                Application.Run(new TrayContext(justInstalled: args.Contains("--installed")));
            }
            return 0;
        }

        static bool SamePath(string a, string b) =>
            string.Equals(Path.GetFullPath(a).TrimEnd('\\'), Path.GetFullPath(b).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);

        public static Icon LoadIcon()
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.ico"))
                return s != null ? new Icon(s) : SystemIcons.Application;
        }
    }

    /// 탐색기가 파일을 복사·드래그할 때 쓰는 「셸 데이터 객체」를 만든다.
    /// WinForms DataObject(FileDrop)와 달리 Shell IDList Array·FileContents·FileGroupDescriptorW 까지 들어가
    /// 탐색기에서 직접 끄는 것과 같은 형식이 된다. 실패하면 null (호출한 쪽이 WinForms 방식으로 폴백).
    static class ShellData
    {
        [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItem
        {
            void BindToHandler(IntPtr pbc, [In] ref Guid bhid, [In] ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [In] ref Guid riid, out IShellItem item);
        [DllImport("ole32.dll")] static extern int OleSetClipboard(IComDataObject pDataObj);
        [DllImport("ole32.dll")] static extern int OleFlushClipboard();

        static Guid IID_IShellItem = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
        static Guid BHID_DataObject = new Guid("B8C0BD9F-ED24-455c-83E6-D5390C4FE8C4");
        static Guid IID_IDataObject = new Guid("0000010e-0000-0000-C000-000000000046");

        public static IComDataObject For(string path)
        {
            try
            {
                SHCreateItemFromParsingName(path, IntPtr.Zero, ref IID_IShellItem, out var item);
                item.BindToHandler(IntPtr.Zero, ref BHID_DataObject, ref IID_IDataObject, out var obj);
                return obj as IComDataObject;
            }
            catch { return null; }
        }

        /// 클립보드에 셸 데이터 객체를 올리고 고정(flush)한다. 성공하면 true
        public static bool SetClipboard(string path)
        {
            var d = For(path);
            if (d == null) return false;
            for (int i = 0; i < 10; i++)
            {
                if (OleSetClipboard(d) == 0) { OleFlushClipboard(); return true; }
                Thread.Sleep(100);   // 다른 프로그램이 클립보드를 잡고 있으면 잠깐 기다렸다 재시도
            }
            return false;
        }
    }

    /// 사용자 설정 (HKCU\Software\JjalCopy)
    static class Prefs
    {
        const string Key = @"Software\JjalCopy";
        /// 복사 후 「카톡으로 끌어다 놓기」 미리보기 창을 띄울지 (윈도우 카톡은 클립보드 파일 붙여넣기를 받지 않음)
        public static bool ShowDragPopup
        {
            get { using (var k = Registry.CurrentUser.OpenSubKey(Key)) return !(k?.GetValue("ShowDragPopup") is int v) || v != 0; }
            set { using (var k = Registry.CurrentUser.CreateSubKey(Key)) k.SetValue("ShowDragPopup", value ? 1 : 0, RegistryValueKind.DWord); }
        }
    }

    /// 설치·자동 실행·제거
    static class Installer
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

        public static void Install(string src)
        {
            Directory.CreateDirectory(Program.InstallDir);
            // 이미 실행 중인 이전 버전이 있으면 종료시키고(파일 잠금 해제) 덮어쓴다 → 새 버전 설치 = 업데이트
            try
            {
                using (var quit = EventWaitHandle.OpenExisting(Program.QuitEventName)) quit.Set();
            }
            catch (WaitHandleCannotBeOpenedException) { }
            Exception last = null;
            for (int i = 0; i < 20; i++)
            {
                try { File.Copy(src, Program.InstalledExe, true); last = null; break; }
                catch (IOException e) { last = e; Thread.Sleep(250); }
            }
            if (last != null) throw last;
            SetAutorun(true);
        }

        public static bool IsAutorun
        {
            get { using (var k = Registry.CurrentUser.OpenSubKey(RunKey)) return k?.GetValue(Program.AppName) != null; }
        }

        public static void SetAutorun(bool on)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(Program.AppName, "\"" + Program.InstalledExe + "\"");
                else if (k.GetValue(Program.AppName) != null) k.DeleteValue(Program.AppName);
            }
        }

        /// 자동 실행 해제 + 종료 2초 뒤 설치 폴더·임시 폴더 삭제
        public static void Uninstall()
        {
            SetAutorun(false);
            var cmd = $"/c timeout /t 2 /nobreak >nul & rmdir /s /q \"{Program.InstallDir}\" & rmdir /s /q \"{Program.TempRoot}\"";
            Process.Start(new ProcessStartInfo("cmd.exe", cmd) { CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, UseShellExecute = false });
        }
    }

    /// 트레이 아이콘 + 메뉴
    sealed class TrayContext : ApplicationContext
    {
        readonly NotifyIcon tray;
        readonly Control ui = new Control();   // 클립보드는 STA(UI) 스레드에서만 쓸 수 있어서 Invoke 용
        readonly Bridge bridge;
        readonly ToolStripMenuItem autorunItem;
        readonly EventWaitHandle quitEvent;

        public TrayContext(bool justInstalled)
        {
            ui.CreateControl();
            Copier.CleanOld();

            var menu = new ContextMenuStrip();
            var title = new ToolStripMenuItem($"{Program.DisplayName} v{Program.Version} — 켜짐") { Enabled = false };
            menu.Items.Add(title);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("jjal 사이트 열기", null, (s, e) => Process.Start(Program.SiteUrl));
            autorunItem = new ToolStripMenuItem("Windows 시작 시 자동 실행", null, (s, e) =>
            {
                Installer.SetAutorun(!Installer.IsAutorun);
                autorunItem.Checked = Installer.IsAutorun;
            }) { Checked = Installer.IsAutorun };
            menu.Items.Add(autorunItem);
            ToolStripMenuItem popupItem = null;
            popupItem = new ToolStripMenuItem("복사 후 「끌어다 놓기」 창 띄우기", null, (s, e) =>
            {
                Prefs.ShowDragPopup = !Prefs.ShowDragPopup;
                popupItem.Checked = Prefs.ShowDragPopup;
            }) { Checked = Prefs.ShowDragPopup };
            menu.Items.Add(popupItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("종료", null, (s, e) => Quit());
            menu.Items.Add("제거 (프로그램 삭제)", null, (s, e) => UninstallAsk());

            tray = new NotifyIcon
            {
                Icon = Program.LoadIcon(),
                Text = $"{Program.DisplayName} — jjal 사이트에서 짤 클릭 → Ctrl+V",
                ContextMenuStrip = menu,
                Visible = true,
            };
            tray.DoubleClick += (s, e) => Process.Start(Program.SiteUrl);

            // 새 버전 설치기가 「종료해 달라」고 신호를 보내면 종료
            quitEvent = new EventWaitHandle(false, EventResetMode.AutoReset, Program.QuitEventName);
            ThreadPool.RegisterWaitForSingleObject(quitEvent, (st, to) => ui.BeginInvoke((Action)Quit), null, -1, true);

            bridge = new Bridge(CopyToClipboard);
            try { bridge.Start(); }
            catch (SocketException)
            {
                Notify($"포트 {Program.Port} 를 다른 프로그램이 쓰고 있어서 시작하지 못했어요.", ToolTipIcon.Error);
            }

            if (justInstalled)
                Notify("설치 완료! 이제 jjal 사이트에서 짤을 클릭하면 원본이 복사돼요 → 카톡에서 Ctrl+V\n" +
                       "종료·제거는 이 아이콘을 우클릭하세요.", ToolTipIcon.Info);
        }

        void Notify(string text, ToolTipIcon icon) => tray.ShowBalloonTip(5000, Program.DisplayName, text, icon);

        /// 원본 다운로드(백그라운드) → 클립보드(UI 스레드)
        async Task<string> CopyToClipboard(Uri src, string name)
        {
            var path = await Copier.Download(src, name);
            ui.Invoke((Action)(() =>
            {
                // 탐색기 Ctrl+C 와 같은 셸 데이터 객체 → 실패 시 WinForms 파일 드롭 목록
                if (!ShellData.SetClipboard(path))
                {
                    var data = new DataObject();
                    data.SetFileDropList(new StringCollection { path });
                    data.SetData("Preferred DropEffect", new MemoryStream(BitConverter.GetBytes(1))); // DROPEFFECT_COPY
                    Clipboard.SetDataObject(data, true, 10, 100);
                }
                if (Prefs.ShowDragPopup)
                {
                    try { DragPopup.ShowFor(path); }
                    catch (Exception e) { Notify("미리보기 창을 띄우지 못했어요: " + e.Message, ToolTipIcon.Warning); }
                }
            }));
            return Path.GetFileName(path);
        }

        void UninstallAsk()
        {
            var r = MessageBox.Show("짤 복사 도우미를 제거할까요?\n(자동 실행 해제 + 프로그램 파일 삭제)", Program.DisplayName,
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (r != DialogResult.Yes) return;
            Installer.Uninstall();
            Quit();
        }

        void Quit()
        {
            bridge?.Stop();
            tray.Visible = false;
            tray.Dispose();
            ExitThread();
        }
    }

    /// 복사 직후 마우스 옆에 뜨는 작은 미리보기 창. 이 창을 카톡으로 끌어다 놓으면 실제 파일이 전송된다.
    /// (윈도우 카톡은 클립보드의 파일 붙여넣기는 무시하지만, 탐색기식 파일 드래그 앤 드롭은 받는다)
    /// 포커스를 뺏지 않고(NOACTIVATE), 놓거나 ✕ 누르거나 20초 지나면 닫힌다.
    sealed class DragPopup : Form
    {
        static DragPopup current;
        readonly string path;
        readonly PictureBox pic;
        readonly System.Windows.Forms.Timer life = new System.Windows.Forms.Timer { Interval = 20000 };
        Point downAt;
        bool pressed;

        public static void ShowFor(string path)
        {
            current?.Close();
            current = new DragPopup(path);
            current.Show();
        }

        protected override bool ShowWithoutActivation => true;
        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= 0x08000000 /* WS_EX_NOACTIVATE */ | 0x00000080 /* WS_EX_TOOLWINDOW */;
                return cp;
            }
        }

        DragPopup(string path)
        {
            this.path = path;
            FormBorderStyle = FormBorderStyle.None;
            TopMost = true;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(32, 32, 36);
            float k;
            using (var g = CreateGraphics()) k = g.DpiX / 96f;
            int S(int v) => (int)Math.Round(v * k);

            var img = LoadPreview(path);   // webp 는 GDI+ 가 못 읽어서 WIC 로 첫 프레임을 연다. 못 열면 null(그림 없이 표시)
            int box = S(150);
            pic = new PictureBox
            {
                Image = img, SizeMode = PictureBoxSizeMode.Zoom, Cursor = Cursors.SizeAll,
                Location = new Point(S(10), S(10)), Size = new Size(box, box), BackColor = Color.Black,
            };
            if (img == null)
            {
                pic.Paint += (s, e) => TextRenderer.DrawText(e.Graphics, "🖼\n(미리보기 없음)", new Font("Malgun Gothic", 10f),
                    pic.ClientRectangle, Color.Gainsboro, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.WordBreak);
            }
            var label = new Label
            {
                Text = "카톡으로 끌어다 놓기", ForeColor = Color.White, AutoSize = false, TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Malgun Gothic", 9f, FontStyle.Bold), Location = new Point(S(10), S(10) + box + S(4)),
                Size = new Size(box, S(20)), Cursor = Cursors.SizeAll,
            };
            var sub = new Label
            {
                Text = Path.GetFileName(path), ForeColor = Color.FromArgb(170, 170, 170), AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter, AutoEllipsis = true, Font = new Font("Malgun Gothic", 8f),
                Location = new Point(S(10), label.Bottom), Size = new Size(box, S(18)),
            };
            var close = new Label
            {
                Text = "✕", ForeColor = Color.White, BackColor = Color.FromArgb(160, 0, 0, 0), AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter, Size = new Size(S(22), S(22)),
                Location = new Point(S(10) + box - S(22), S(10)), Cursor = Cursors.Hand,
            };
            close.Click += (s, e) => Close();
            Controls.Add(close);
            Controls.Add(pic);
            Controls.Add(label);
            Controls.Add(sub);
            close.BringToFront();
            ClientSize = new Size(box + S(20), sub.Bottom + S(8));

            foreach (Control c in new Control[] { this, pic, label, sub })
            {
                c.MouseDown += (s, e) => { if (e.Button == MouseButtons.Left) { pressed = true; downAt = Cursor.Position; } };
                c.MouseUp += (s, e) => pressed = false;
                c.MouseMove += (s, e) => StartDragIfMoved();
            }

            // 마우스 오른쪽 아래, 화면 밖으로 나가지 않게
            var cur = Cursor.Position;
            var wa = Screen.FromPoint(cur).WorkingArea;
            int x = Math.Min(cur.X + S(18), wa.Right - Width - S(8));
            int y = Math.Min(cur.Y + S(18), wa.Bottom - Height - S(8));
            Location = new Point(Math.Max(wa.Left, x), Math.Max(wa.Top, y));

            life.Tick += (s, e) => { if (!Bounds.Contains(Cursor.Position)) Close(); };
            life.Start();
        }

        /// 미리보기 이미지 열기: ① GDI+(GIF·PNG·JPG, GIF 는 움직임) ② WIC(윈도우 webp 코덱, 첫 프레임) ③ 실패 시 null
        static Image LoadPreview(string path)
        {
            var bytes = File.ReadAllBytes(path);
            try { return Image.FromStream(new MemoryStream(bytes)); }   // 스트림은 GIF 애니메이션 동안 살아 있어야 해서 닫지 않음
            catch { }
            try
            {
                var dec = System.Windows.Media.Imaging.BitmapDecoder.Create(new MemoryStream(bytes),
                    System.Windows.Media.Imaging.BitmapCreateOptions.None, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
                var enc = new System.Windows.Media.Imaging.PngBitmapEncoder();
                enc.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(dec.Frames[0]));
                var ms = new MemoryStream();
                enc.Save(ms);
                ms.Position = 0;
                return Image.FromStream(ms);
            }
            catch { return null; }
        }

        void StartDragIfMoved()
        {
            if (!pressed) return;
            var d = SystemInformation.DragSize;
            var p = Cursor.Position;
            if (Math.Abs(p.X - downAt.X) < d.Width && Math.Abs(p.Y - downAt.Y) < d.Height) return;
            pressed = false;
            life.Stop();
            // 탐색기에서 파일을 끄는 것과 같은 셸 데이터 객체로 드래그 (카톡 등이 탐색기 드롭만 받는 경우 대비)
            object data = ShellData.For(path);
            if (data == null)
            {
                var fallback = new DataObject();
                fallback.SetFileDropList(new StringCollection { path });
                fallback.SetData("Preferred DropEffect", new MemoryStream(BitConverter.GetBytes(1)));
                data = fallback;
            }
            var result = DoDragDrop(data, DragDropEffects.Copy | DragDropEffects.Link);
            if (result != DragDropEffects.None) Close();
            else life.Start();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using (var pen = new Pen(Color.FromArgb(139, 61, 237), 2)) e.Graphics.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            life.Dispose();
            pic.Image?.Dispose();
            if (current == this) current = null;
            base.OnFormClosed(e);
        }
    }

    /// 원본 다운로드 → 임시 폴더에 「파일명 그대로」 저장
    static class Copier
    {
        const long MaxBytes = 100L * 1024 * 1024;
        static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };

        public static async Task<string> Download(Uri src, string name)
        {
            using (var resp = await Http.GetAsync(src, HttpCompletionOption.ResponseHeadersRead))
            {
                if (resp.StatusCode != HttpStatusCode.OK) throw new Exception($"다운로드 실패 (HTTP {(int)resp.StatusCode})");
                var type = resp.Content.Headers.ContentType?.MediaType ?? "";
                if (!type.StartsWith("image/", StringComparison.OrdinalIgnoreCase)) throw new Exception($"이미지가 아니에요 ({type})");
                if (resp.Content.Headers.ContentLength > MaxBytes) throw new Exception("파일이 너무 커요 (100MB 초과)");

                // 복사마다 하위 폴더를 따로 만들어 같은 이름이어도 「이름.gif」 그대로 유지
                var dir = Path.Combine(Program.TempRoot, Guid.NewGuid().ToString("N").Substring(0, 12));
                Directory.CreateDirectory(dir);
                var path = Path.Combine(dir, name);
                using (var fs = File.Create(path))
                    await resp.Content.CopyToAsync(fs);
                var size = new FileInfo(path).Length;
                if (size == 0) throw new Exception("빈 파일을 받았어요");
                if (size > MaxBytes) { File.Delete(path); throw new Exception("파일이 너무 커요 (100MB 초과)"); }
                return path;
            }
        }

        /// 하루 지난 임시 파일 정리
        public static void CleanOld()
        {
            try
            {
                if (!Directory.Exists(Program.TempRoot)) return;
                foreach (var d in Directory.GetDirectories(Program.TempRoot))
                    if (Directory.GetLastWriteTimeUtc(d) < DateTime.UtcNow.AddDays(-1))
                        try { Directory.Delete(d, true); } catch { }
            }
            catch { }
        }

        /// 파일명 정리: 윈도우 금지 문자 치환, 확장자 보장
        public static string SafeName(string name, Uri src)
        {
            var ext = Path.GetExtension(src.AbsolutePath).TrimStart('.').ToLowerInvariant();
            if (string.IsNullOrEmpty(ext)) ext = "gif";
            name = string.IsNullOrWhiteSpace(name) ? Path.GetFileName(src.AbsolutePath) : name;
            name = Regex.Replace(name, @"[<>:""/\\|?*\x00-\x1F]", "_").Trim().TrimEnd('.', ' ');
            if (name.Length == 0) name = "jjal";
            if (Path.GetExtension(name).Length == 0) name += "." + ext;
            if (name.Length > 100) name = name.Substring(0, 100 - ext.Length - 1) + "." + ext;
            return name;
        }
    }

    /// 127.0.0.1 전용 최소 HTTP 서버. 허용 Origin 에만 CORS 로 응답한다.
    ///   GET  /ping               → {"app":"JjalCopy","version":"1.0.0","os":"windows"}
    ///   POST /copy {"url","name"} → {"ok":true,"name":"이름.gif"}
    sealed class Bridge
    {
        readonly Func<Uri, string, Task<string>> onCopy;
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        TcpListener listener;

        public Bridge(Func<Uri, string, Task<string>> onCopy) { this.onCopy = onCopy; }

        public void Start()
        {
            listener = new TcpListener(IPAddress.Loopback, Program.Port);
            listener.Start();
            Task.Run(AcceptLoop);
        }

        public void Stop() { try { listener?.Stop(); } catch { } }

        async Task AcceptLoop()
        {
            while (true)
            {
                TcpClient c;
                try { c = await listener.AcceptTcpClientAsync(); }
                catch { return; }
                _ = Task.Run(() => Handle(c));
            }
        }

        async Task Handle(TcpClient c)
        {
            using (c)
            {
                try
                {
                    var stream = c.GetStream();
                    stream.ReadTimeout = 5000;
                    var buf = new List<byte>();
                    var tmp = new byte[8192];
                    int headerEnd = -1;
                    while (headerEnd < 0)
                    {
                        int n = await stream.ReadAsync(tmp, 0, tmp.Length);
                        if (n <= 0) return;
                        buf.AddRange(tmp.Take(n));
                        headerEnd = IndexOf(buf, Encoding.ASCII.GetBytes("\r\n\r\n"));
                        if (buf.Count > 256 * 1024) return;
                    }
                    var head = Encoding.UTF8.GetString(buf.Take(headerEnd).ToArray());
                    var lines = head.Split(new[] { "\r\n" }, StringSplitOptions.None);
                    var first = lines[0].Split(' ');
                    if (first.Length < 2) return;
                    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var l in lines.Skip(1))
                    {
                        int i = l.IndexOf(':');
                        if (i > 0) headers[l.Substring(0, i).Trim()] = l.Substring(i + 1).Trim();
                    }
                    int len = headers.TryGetValue("Content-Length", out var cl) && int.TryParse(cl, out var v) ? v : 0;
                    if (len > 64 * 1024) return;
                    while (buf.Count - headerEnd - 4 < len)
                    {
                        int n = await stream.ReadAsync(tmp, 0, tmp.Length);
                        if (n <= 0) break;
                        buf.AddRange(tmp.Take(n));
                    }
                    var body = Encoding.UTF8.GetString(buf.Skip(headerEnd + 4).Take(len).ToArray());

                    var (status, payload, origin) = await Route(first[0], first[1], headers, body);
                    await Send(stream, status, payload, origin);
                }
                catch { }
            }
        }

        static int IndexOf(List<byte> hay, byte[] needle)
        {
            for (int i = 0; i + needle.Length <= hay.Count; i++)
            {
                bool ok = true;
                for (int j = 0; j < needle.Length; j++) if (hay[i + j] != needle[j]) { ok = false; break; }
                if (ok) return i;
            }
            return -1;
        }

        static string AllowedOrigin(Dictionary<string, string> h)
        {
            if (!h.TryGetValue("Origin", out var o)) return null;
            return Uri.TryCreate(o, UriKind.Absolute, out var u) && Program.AllowedHosts.Contains(u.Host.ToLowerInvariant()) ? o : null;
        }

        async Task<(int, object, string)> Route(string method, string path, Dictionary<string, string> h, string body)
        {
            var origin = AllowedOrigin(h);
            if (origin == null) return (403, new { error = "origin not allowed" }, null);
            if (method == "OPTIONS") return (204, null, origin);
            if (method == "GET" && path == "/ping")
                return (200, new { app = Program.AppName, version = Program.Version, os = "windows" }, origin);
            if (method == "POST" && path == "/copy")
            {
                Dictionary<string, object> req;
                try { req = json.Deserialize<Dictionary<string, object>>(body); } catch { req = null; }
                if (req == null || !(req.TryGetValue("url", out var u) && u is string raw)
                    || !Uri.TryCreate(raw, UriKind.Absolute, out var src)
                    || (src.Scheme != "http" && src.Scheme != "https"))
                    return (400, new { ok = false, error = "url 이 필요해요" }, origin);
                if (!Program.AllowedHosts.Contains(src.Host.ToLowerInvariant()))
                    return (403, new { ok = false, error = "허용되지 않은 사이트: " + src.Host }, origin);
                var name = Copier.SafeName(req.TryGetValue("name", out var n) ? n as string : null, src);
                try
                {
                    var saved = await onCopy(src, name);
                    return (200, new { ok = true, name = saved, hint = Prefs.ShowDragPopup ? "drag" : "paste" }, origin);
                }
                catch (Exception e) { return (502, new { ok = false, error = (e.InnerException ?? e).Message }, origin); }
            }
            return (404, new { error = "not found" }, origin);
        }

        async Task Send(NetworkStream s, int status, object payload, string origin)
        {
            var body = payload == null ? new byte[0] : Encoding.UTF8.GetBytes(json.Serialize(payload));
            var sb = new StringBuilder();
            sb.Append($"HTTP/1.1 {status} {(status < 300 ? "OK" : "ERR")}\r\n");
            sb.Append($"Content-Type: application/json; charset=utf-8\r\nContent-Length: {body.Length}\r\nConnection: close\r\n");
            if (origin != null)
            {
                sb.Append($"Access-Control-Allow-Origin: {origin}\r\nVary: Origin\r\n");
                sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n");
                sb.Append("Access-Control-Allow-Private-Network: true\r\nAccess-Control-Max-Age: 600\r\n");
            }
            sb.Append("\r\n");
            var headBytes = Encoding.ASCII.GetBytes(sb.ToString());
            await s.WriteAsync(headBytes, 0, headBytes.Length);
            await s.WriteAsync(body, 0, body.Length);
        }
    }
}
