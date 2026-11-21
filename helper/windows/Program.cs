// 짤 복사 도우미 (JjalCopy) — jjal storage 원클릭 원본 복사 (Windows)
//
// jjal 사이트가 http://127.0.0.1:47321/ping 으로 이 프로그램을 감지하면, 썸네일 클릭 시 /copy 로 원본 URL 을 보낸다.
// 원본을 「끝까지」 받은 뒤 탐색기에서 Ctrl+C 한 것과 같은 형태(파일 드롭 목록)로 클립보드에 올린다 → 카톡에서 Ctrl+V.
// (브라우저는 보안상 클립보드에 「파일」을 넣을 수 없고, 드래그 앤 드롭은 브라우저가 파일을 다 쓰기 전에 넘겨 빈 파일이 될 수 있다)
//
// 설치: JjalCopySetup.exe(Inno Setup, installer/JjalCopy.iss)가 %LOCALAPPDATA%\Programs\JjalCopy 에 설치하고
//       자동 실행(HKCU Run)·「앱 및 기능」 제거를 담당한다. 이 exe 는 자기 복사·숨은 cmd 같은 걸 하지 않는다
//       (v1.2 까지의 자가 설치 방식은 안랩 V3 가 악성 행위로 차단 → v1.3 에서 정식 설치 프로그램으로 전환).
// 종료·자동 실행 끄기: 작업 표시줄 트레이 아이콘 우클릭. 제거: 「앱 및 기능」 또는 트레이 메뉴(설치 프로그램의 제거기 실행).
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
            { "jjal-kabkee.d271z96h7lorpb.amplifyapp.com", "kabkee-main.tailfe017f.ts.net", "100.64.25.50", "localhost", "127.0.0.1" };

        public static string Version => Assembly.GetExecutingAssembly().GetName().Version.ToString(3);
        public static readonly string AppDir = Path.GetDirectoryName(Application.ExecutablePath);
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
                var b = new Bridge((getPath, preview) => getPath().ContinueWith(t => Path.GetFileName(t.Result)));
                b.Start();
                Thread.Sleep(secs * 1000);
                return 0;
            }

            // 이미 다른 인스턴스(같은 버전이든, 업데이트 전 옛 버전이든)가 떠 있으면 종료 신호를 보내고 자리를 넘겨받는다.
            // → 설치 프로그램이 새 버전을 실행하면 옛 버전이 알아서 내려간다 (taskkill 같은 강제 종료 없이)
            using (var mutex = new Mutex(false, MutexName))
            {
                bool owned = false;
                try { owned = mutex.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
                if (!owned)
                {
                    try { using (var quit = EventWaitHandle.OpenExisting(QuitEventName)) quit.Set(); }
                    catch (WaitHandleCannotBeOpenedException) { }
                    try { owned = mutex.WaitOne(5000); } catch (AbandonedMutexException) { owned = true; }
                    if (!owned)
                    {
                        MessageBox.Show("이미 실행 중이에요.\n작업 표시줄 오른쪽(트레이)의 아이콘을 우클릭하면 종료할 수 있어요.",
                            DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return 0;
                    }
                }
                Application.Run(new TrayContext(justInstalled: args.Contains("--installed")));
                mutex.ReleaseMutex();
            }
            return 0;
        }

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

    /// 자동 실행(HKCU Run) — 설치 프로그램이 처음 등록하고, 트레이 메뉴로 켜고 끈다
    static class Autorun
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

        public static bool IsOn
        {
            get { using (var k = Registry.CurrentUser.OpenSubKey(RunKey)) return k?.GetValue(Program.AppName) != null; }
        }

        public static void Set(bool on)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(Program.AppName, "\"" + Application.ExecutablePath + "\"");
                else if (k.GetValue(Program.AppName) != null) k.DeleteValue(Program.AppName);
            }
        }

        /// 설치 프로그램(Inno Setup)이 만든 제거기. 없으면 null (개발용으로 exe 만 실행한 경우)
        public static string Uninstaller
        {
            get
            {
                var u = Path.Combine(Program.AppDir, "unins000.exe");
                return File.Exists(u) ? u : null;
            }
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
                Autorun.Set(!Autorun.IsOn);
                autorunItem.Checked = Autorun.IsOn;
            }) { Checked = Autorun.IsOn };
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
            if (Autorun.Uninstaller != null)
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

        /// 원본 다운로드 또는 사이트가 보낸 파일(GIF 모드) 저장(백그라운드) → 클립보드(UI 스레드)
        /// preview: 사이트가 보낸 미리보기 그림(JPEG/PNG). 윈도우에 webp 코덱이 없으면 원본(webp)으로는 미리보기를 못 그려서 쓴다
        async Task<string> CopyToClipboard(Func<Task<string>> getPath, byte[] preview)
        {
            var path = await getPath();
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
                    try { DragPopup.ShowFor(path, preview); }
                    catch (Exception e) { Notify("미리보기 창을 띄우지 못했어요: " + e.Message, ToolTipIcon.Warning); }
                }
            }));
            return Path.GetFileName(path);
        }

        /// 설치 프로그램의 제거기를 실행한다(「앱 및 기능」에서 제거하는 것과 같음). 제거기가 이 프로그램을 종료시킨다.
        void UninstallAsk()
        {
            var u = Autorun.Uninstaller;
            if (u == null) return;
            Process.Start(new ProcessStartInfo(u) { UseShellExecute = true });
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

        public static void ShowFor(string path, byte[] preview = null)
        {
            current?.Close();
            current = new DragPopup(path, preview);
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

        DragPopup(string path, byte[] preview)
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

            // webp 는 GDI+ 가 못 읽어서 WIC 로 첫 프레임을 연다. WIC webp 코덱이 없는 PC 면 사이트가 보낸 미리보기(JPEG)를 쓴다
            var img = LoadPreview(path) ?? LoadPreviewBytes(preview);
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
        static Image LoadPreviewBytes(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0) return null;
            try { return Image.FromStream(new MemoryStream(bytes)); }
            catch { return null; }
        }

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

        /// 사이트가 직접 보낸 파일(GIF 모드에서 브라우저가 webp → GIF 로 바꾼 것)을 임시 폴더에 저장
        public static string Save(byte[] bytes, string name)
        {
            if (bytes == null || bytes.Length == 0) throw new Exception("빈 파일을 받았어요");
            if (bytes.Length > MaxBytes) throw new Exception("파일이 너무 커요 (100MB 초과)");
            var dir = Path.Combine(Program.TempRoot, Guid.NewGuid().ToString("N").Substring(0, 12));
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, name);
            File.WriteAllBytes(path, bytes);
            return path;
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
    ///   GET  /ping               → {"app":"JjalCopy","version":"1.5.0","os":"windows","features":["copy-data"],"popup":true}
    ///        popup = 「복사 후 끌어다 놓기 창」 설정. 꺼져 있으면 사이트가 움짤 복사 대신 Save As 를 안내한다 (윈도우 카톡은 파일 붙여넣기를 안 받음)
    ///   POST /copy {"url","name","preview"?} → {"ok":true,"name":"이름.gif"}
    ///        preview = "data:image/jpeg;base64,…" 끌어다 놓기 창 미리보기 (WIC webp 코덱이 없는 PC 대비, v1.5+)
    ///   POST /copy-data?name=<이름.gif>  (본문 = 이미지 바이트, Content-Type: image/*) → 같은 응답
    ///        사이트의 「GIF 모드」가 브라우저에서 webp 움짤을 GIF 로 바꿔 보낸다 (텔레그램은 webp 를 파일로만 보여줌)
    sealed class Bridge
    {
        const int MaxJsonBody = 2 * 1024 * 1024;   // /copy 에 미리보기 JPEG(base64)가 실려 온다
        const int MaxDataBody = 100 * 1024 * 1024;
        static readonly string[] Features = { "copy-data" };
        // 인자: 클립보드에 올릴 파일의 경로를 만들어 주는 함수 (다운로드 또는 받은 바이트 저장), 미리보기 그림(없으면 null)
        readonly Func<Func<Task<string>>, byte[], Task<string>> onCopy;
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        TcpListener listener;

        public Bridge(Func<Func<Task<string>>, byte[], Task<string>> onCopy) { this.onCopy = onCopy; }

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
                    bool isData = first[1].StartsWith("/copy-data", StringComparison.Ordinal);
                    if (len < 0 || len > (isData ? MaxDataBody : MaxJsonBody)) return;
                    // 본문은 정확한 크기의 배열에 바로 받는다 (GIF 는 수십 MB 일 수 있어 List<byte> 로 쌓으면 느림)
                    var body = new byte[len];
                    int got = Math.Min(len, buf.Count - headerEnd - 4);
                    buf.CopyTo(headerEnd + 4, body, 0, got);
                    if (isData) stream.ReadTimeout = 30000;
                    while (got < len)
                    {
                        int n = await stream.ReadAsync(body, got, len - got);
                        if (n <= 0) break;
                        got += n;
                    }
                    if (got < len) return;

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

        async Task<(int, object, string)> Route(string method, string target, Dictionary<string, string> h, byte[] rawBody)
        {
            int q = target.IndexOf('?');
            var path = q < 0 ? target : target.Substring(0, q);
            var query = q < 0 ? "" : target.Substring(q + 1);
            var origin = AllowedOrigin(h);
            if (origin == null) return (403, new { error = "origin not allowed" }, null);
            if (method == "OPTIONS") return (204, null, origin);
            if (method == "GET" && path == "/ping")
                return (200, new { app = Program.AppName, version = Program.Version, os = "windows", features = Features, popup = Prefs.ShowDragPopup }, origin);
            if (method == "POST" && path == "/copy-data")
            {
                var type = h.TryGetValue("Content-Type", out var ct) ? ct.Split(';')[0].Trim() : "";
                if (!type.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                    return (415, new { ok = false, error = $"이미지가 아니에요 ({type})" }, origin);
                string rawName = null;
                foreach (var kv in query.Split('&'))
                    if (kv.StartsWith("name=", StringComparison.Ordinal))
                        rawName = Uri.UnescapeDataString(kv.Substring(5).Replace('+', ' '));
                var ext = type.Substring(6).ToLowerInvariant();
                var name = Copier.SafeName(rawName, new Uri("http://local/file." + (ext == "jpeg" ? "jpg" : ext)));
                try
                {
                    var saved = await onCopy(() => Task.Run(() => Copier.Save(rawBody, name)), null);
                    return (200, new { ok = true, name = saved, hint = Prefs.ShowDragPopup ? "drag" : "paste" }, origin);
                }
                catch (Exception e) { return (502, new { ok = false, error = (e.InnerException ?? e).Message }, origin); }
            }
            if (method == "POST" && path == "/copy")
            {
                var body = Encoding.UTF8.GetString(rawBody);
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
                    var saved = await onCopy(() => Copier.Download(src, name), DecodePreview(req));
                    return (200, new { ok = true, name = saved, hint = Prefs.ShowDragPopup ? "drag" : "paste" }, origin);
                }
                catch (Exception e) { return (502, new { ok = false, error = (e.InnerException ?? e).Message }, origin); }
            }
            return (404, new { error = "not found" }, origin);
        }

        /// /copy 의 "preview": "data:image/jpeg;base64,..." → 바이트 (1MB 이하, 이상하면 null)
        static byte[] DecodePreview(Dictionary<string, object> req)
        {
            if (!(req.TryGetValue("preview", out var p) && p is string s)) return null;
            int comma = s.IndexOf(',');
            if (!s.StartsWith("data:image/", StringComparison.Ordinal) || comma < 0) return null;
            try
            {
                var bytes = Convert.FromBase64String(s.Substring(comma + 1));
                return bytes.Length <= 1024 * 1024 ? bytes : null;
            }
            catch { return null; }
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
