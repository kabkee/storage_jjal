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
                var files = new StringCollection { path };
                var data = new DataObject();
                data.SetFileDropList(files);
                data.SetData("Preferred DropEffect", new MemoryStream(BitConverter.GetBytes(1))); // DROPEFFECT_COPY
                Clipboard.SetDataObject(data, true, 10, 100);
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
                try { return (200, new { ok = true, name = await onCopy(src, name) }, origin); }
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
