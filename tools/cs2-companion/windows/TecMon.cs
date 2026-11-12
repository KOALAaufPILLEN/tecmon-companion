using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Drawing;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

static class TecMon {
  public static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  public static string Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
  public static Color Gold = Color.FromArgb(232,197,115), Background = Color.FromArgb(13,14,24), Violet = Color.FromArgb(167,139,250);
  public static string Q(string value) {
    var result=new StringBuilder("\""); int slashes=0;
    foreach(char c in value) { if(c=='\\') { slashes++; continue; } result.Append('\\', c=='"' ? slashes*2+1 : slashes); result.Append(c); slashes=0; }
    return result.Append('\\',slashes*2).Append('"').ToString();
  }
  public static string DetectGame() {
    var steam=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"Steam");
    var libraries=new List<string> { steam };
    var libraryFile=Path.Combine(steam,"steamapps","libraryfolders.vdf");
    if(File.Exists(libraryFile)) foreach(System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(File.ReadAllText(libraryFile),"\"path\"\\s+\"([^\"]+)\"")) libraries.Add(match.Groups[1].Value.Replace("\\\\","\\"));
    return libraries.Select(p=>Path.Combine(p,@"steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe")).FirstOrDefault(File.Exists) ?? "";
  }
  public static ProcessStartInfo Info(string exe, params string[] args) {
    return new ProcessStartInfo(exe, String.Join(" ", args.Select(Q))) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Root };
  }
  public static void Private(string directory) {
    var security = new DirectorySecurity(); security.SetAccessRuleProtection(true, false);
    var user = WindowsIdentity.GetCurrent().User;
    security.SetOwner(user);
    foreach(var sid in new [] { user, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null) })
      security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
    Directory.SetAccessControl(directory, security);
  }
  public static void Extract(string target) {
    target = Path.GetFullPath(target).TrimEnd('\\');
    if(target == Path.GetPathRoot(target).TrimEnd('\\')) throw new Exception("Bitte einen eigenen TecMon-Programmordner wählen.");
    if(Directory.Exists(target) && Directory.EnumerateFileSystemEntries(target).Any() && !File.Exists(Path.Combine(target,"tecmon-app.marker"))) throw new Exception("Der Zielordner ist nicht leer. Bitte einen eigenen TecMon-Ordner wählen.");
    Directory.CreateDirectory(target);
    using(var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonPayload")) {
      if(stream == null) throw new Exception("Installationspaket fehlt.");
      using(var zip = new ZipArchive(stream, ZipArchiveMode.Read)) {
        foreach(var entry in zip.Entries) {
          var full = Path.GetFullPath(Path.Combine(target, entry.FullName.Replace('/', '\\')));
          if(!full.StartsWith(target + "\\", StringComparison.OrdinalIgnoreCase)) throw new Exception("Ungültiger Paketpfad.");
          if(entry.FullName.EndsWith("/")) { Directory.CreateDirectory(full); continue; }
          Directory.CreateDirectory(Path.GetDirectoryName(full));
          // Preserve installation location/configuration on an update.
          if(Path.GetFileName(full) == "installation.json" && File.Exists(full)) continue;
          using(var from = entry.Open()) using(var to = File.Create(full)) from.CopyTo(to);
        }
      }
    }
    File.WriteAllText(Path.Combine(target, "tecmon-app.marker"), "TecMon Companion 0.3\r\n");
  }
  public static void PrepareUpdate(string target) {
    target=Path.GetFullPath(target).TrimEnd('\\');
    if(!File.Exists(Path.Combine(target,"tecmon-app.marker"))) return;
    var file=Path.Combine(target,"installation.json");
    if(!File.Exists(file)) file=Path.Combine(target,"installation.pending.json");
    if(!File.Exists(file)) return;
    var config=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));
    if(Convert.ToString(config["format"])!="tecmon-installation-v1") throw new Exception("Unbekannte TecMon-Installation.");
    var data=Path.GetFullPath(Convert.ToString(config["dataDir"]));
    var cluster=Path.GetFullPath(Convert.ToString(config["clusterDir"]));
    var bin=Path.GetFullPath(Convert.ToString(config["postgresBin"]));
    if(!bin.Equals(Path.Combine(target,@"tools\postgresql\bin"),StringComparison.OrdinalIgnoreCase) ||
       !cluster.Equals(Path.Combine(data,@"TecMon-Private\postgres\data"),StringComparison.OrdinalIgnoreCase) ||
       !File.Exists(Path.Combine(data,@"TecMon-Private\tecmon-data.marker")))
      throw new Exception("Datenbankpfade entsprechen keiner verwalteten TecMon-Installation.");
    if(!File.Exists(Path.Combine(cluster,"PG_VERSION"))) return;
    if(Probe(config.ContainsKey("installationId") ? Convert.ToString(config["installationId"]) : ""))
      throw new Exception("Bitte den laufenden Companion zuerst über 'Companion beenden' schließen. Danach Setup erneut starten.");
    var status=Info(Path.Combine(bin,"pg_ctl.exe"),"status","-D",cluster); status.WorkingDirectory=target;
    using(var check=Process.Start(status)) {
      if(!check.WaitForExit(10000)) throw new Exception("Datenbankstatus konnte nicht geprüft werden.");
      if(check.ExitCode==3) return;
      if(check.ExitCode!=0) throw new Exception("Datenbankstatus konnte nicht geprüft werden. CS Demo Manager schließen und erneut versuchen.");
    }
    var stop=Info(Path.Combine(bin,"pg_ctl.exe"),"stop","-D",cluster,"-m","fast","-w","-t","30"); stop.WorkingDirectory=target;
    using(var child=Process.Start(stop)) {
      if(!child.WaitForExit(40000) || child.ExitCode!=0) throw new Exception("Private TecMon-Datenbank konnte nicht sauber beendet werden. Bitte CS Demo Manager schließen und erneut versuchen.");
    }
  }
  public static void ApplyUpdate(string target, string parent, bool launch=true) {
    target=Path.GetFullPath(target).TrimEnd('\\');
    if(!File.Exists(Path.Combine(target,"tecmon-app.marker")) || !File.Exists(Path.Combine(target,"installation.json")))
      throw new Exception("Bitte den eingerichteten TecMon-Programmordner auswählen. Das Update installiert keine neue Datenbank.");
    if(!String.IsNullOrEmpty(parent)) {
      var config=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(target,"installation.json")));
      string expected=Convert.ToString(config["installationId"]);
      DateTime deadline=DateTime.UtcNow.AddSeconds(60);
      // The update handoff depends on the service releasing its port, not an OS PID namespace.
      while(Probe(expected)) {
        if(DateTime.UtcNow>=deadline) throw new Exception("Companion-Dienst wurde für das Update nicht beendet.");
        Thread.Sleep(300);
      }
    }
    PrepareUpdate(target);
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonUpdate")) {
      if(stream==null) throw new Exception("Update-Paket fehlt.");
      using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)) {
        if(zip.Entries.Count>200 || zip.Entries.Sum(e=>e.Length)>20*1024*1024) throw new Exception("Update-Paket zu groß.");
        foreach(var entry in zip.Entries) {
          string relative=entry.FullName.Replace('\\','/');
          bool allowed=relative.StartsWith("public/",StringComparison.Ordinal) || (!relative.Contains("/") &&
            (relative.EndsWith(".mjs",StringComparison.Ordinal) || new [] {"TecMon Companion.exe","README.md","dependency-manifest.json","csdm-defaults.json","THIRD-PARTY-NOTICES.txt","unpack-tools.ps1","Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll","WebView2-LICENSE.txt","WebView2-NOTICE.txt"}.Contains(relative)));
          string full=Path.GetFullPath(Path.Combine(target,relative.Replace('/','\\')));
          if(!allowed || !full.StartsWith(target+"\\",StringComparison.OrdinalIgnoreCase) || relative.Contains("..")) throw new Exception("Unzulässiger Update-Pfad.");
          var directory=Path.GetDirectoryName(full);
          for(var check=directory; check.Length>target.Length; check=Path.GetDirectoryName(check))
            if(Directory.Exists(check) && (File.GetAttributes(check)&FileAttributes.ReparsePoint)!=0) throw new Exception("Update-Ziel enthält eine Verknüpfung.");
          if(File.Exists(full) && (File.GetAttributes(full)&FileAttributes.ReparsePoint)!=0) throw new Exception("Update-Ziel enthält eine Verknüpfung.");
          if(relative.EndsWith("/")) {Directory.CreateDirectory(full);continue;}
          using(var contents=new MemoryStream()) {
            using(var input=entry.Open()) input.CopyTo(contents);
            var bytes=contents.ToArray();
            if(File.Exists(full)) using(var sha=System.Security.Cryptography.SHA256.Create())
              if(sha.ComputeHash(File.ReadAllBytes(full)).SequenceEqual(sha.ComputeHash(bytes))) continue;
            Directory.CreateDirectory(directory);
            // Die Figur (TecMon Companion.exe) beendet sich erst, wenn sie den Dienst mehrmals nicht erreicht.
            var deadline=DateTime.UtcNow.AddSeconds(60);
            while(true) {try{File.WriteAllBytes(full,bytes);break;}catch(IOException){if(DateTime.UtcNow>=deadline)throw;Thread.Sleep(250);}}
          }
        }
      }
    }
    UpdateRegistration(target);
    WriteUpdateResult(target,"installed","");
    if(launch) {Root=target; Application.Run(new SplashWindow());}
  }
  public static void WriteUpdateResult(string target,string status,string message) {
    try {File.WriteAllText(Path.Combine(target,"update-result.json"),Json.Serialize(new { status=status,message=message,version="0.18.2",time=DateTime.UtcNow.ToString("o") }),new UTF8Encoding(false));} catch {}
  }
  public static void UpdateRegistration(string target) {
    using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TecMonCompanion",true)) {
      if(key==null || !String.Equals(Convert.ToString(key.GetValue("InstallLocation","")),target,StringComparison.OrdinalIgnoreCase))return;
      key.SetValue("DisplayVersion","0.18.2");key.SetValue("DisplayIcon",Path.Combine(target,"TecMon Companion.exe"));
    }
    foreach(var file in new[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"TecMon Companion.lnk"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"TecMon","TecMon Companion.lnk")})
      if(File.Exists(file))Shortcut(file,Path.Combine(target,"TecMon Companion.exe"));
  }
  public static void Shortcut(string file, string target) {
    Type type = Type.GetTypeFromProgID("WScript.Shell"); dynamic shell = Activator.CreateInstance(type);
    dynamic link = shell.CreateShortcut(file); link.TargetPath = target; link.WorkingDirectory = Path.GetDirectoryName(target); link.IconLocation = target + ",0"; link.Save();
  }
  public static void Register(string target) {
    var app = Path.Combine(target, "TecMon Companion.exe");
    Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "TecMon Companion.lnk"), app);
    var programs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "TecMon"); Directory.CreateDirectory(programs);
    Shortcut(Path.Combine(programs, "TecMon Companion.lnk"), app);
    using(var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TecMonCompanion")) {
      key.SetValue("DisplayName", "TecMon Companion"); key.SetValue("DisplayVersion", "0.18.2"); key.SetValue("Publisher", "TecMon");
      key.SetValue("InstallLocation", target); key.SetValue("DisplayIcon", app); key.SetValue("UninstallString", Q(app) + " --uninstall"); key.SetValue("NoModify", 1); key.SetValue("NoRepair", 1);
    }
  }
  public static bool Probe(string expectedId) {
    // Windows may take longer than one second to report connection refusal. Check
    // the socket first, and never send local health checks through a system proxy.
    using(var socket=new System.Net.Sockets.TcpClient()) {
      var pending=socket.BeginConnect("127.0.0.1",31977,null,null);
      try { if(!pending.AsyncWaitHandle.WaitOne(500)) return false; socket.EndConnect(pending); }
      catch(System.Net.Sockets.SocketException) { return false; }
      finally { pending.AsyncWaitHandle.Close(); }
    }
    var request=(System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://127.0.0.1:31977/api/health"); request.Timeout=3000; request.Proxy=null;
    try { using(var response=request.GetResponse()) using(var stream=response.GetResponseStream()) using(var reader=new StreamReader(stream)) {
      var health=Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
      if(Convert.ToString(health["app"])!="tecmon-companion" || Convert.ToString(health["instanceId"])!=expectedId) throw new Exception("Eine andere TecMon-Version läuft bereits. Bitte diese zuerst über 'Companion beenden' schließen."); return true;
    } } catch(System.Net.WebException error) { if(error.Status==System.Net.WebExceptionStatus.ConnectFailure) return false; throw new Exception("Eine andere Anwendung oder ältere TecMon-Version verwendet Port 31977. Bitte die bisherige Companion-Version zuerst beenden."); }
  }
  public static void EnsureRuntime(string target) {
    if(File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"vcruntime140_1.dll"))) return;
    var installer=Path.Combine(target,"tools","vc_redist.x64.exe");
    var info=new ProcessStartInfo(installer,"/install /norestart") { UseShellExecute=true,Verb="runas" };
    using(var child=Process.Start(info)) { child.WaitForExit(); if(child.ExitCode!=0 && child.ExitCode!=3010 && child.ExitCode!=1638) throw new Exception("Microsoft Visual C++ Runtime wurde nicht eingerichtet. Setup nach der Korrektur erneut starten."); }
  }
  public static void Launch(Action<string> progress = null) {
    if(progress!=null)progress("Lokale Verbindung prüfen …");
    var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TecMon", "Logs"); Directory.CreateDirectory(logDir);
    var configFile=Path.Combine(Root,"installation.json");
    if(!File.Exists(configFile)) throw new Exception("Bitte zuerst die Einrichtung im TecMon-Setup abschließen.");
    var config=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(configFile));
    var expectedId=Convert.ToString(config["installationId"]);
    if(!Probe(expectedId)) {
      if(progress!=null)progress("Companion-Dienst starten …");
      var info = Info(Path.Combine(Root,"runtime","node.exe"), Path.Combine(Root,"server.mjs"));
      info.RedirectStandardOutput = true; info.RedirectStandardError = true;
      var child = Process.Start(info);
      var log = Path.Combine(logDir,"companion.log");
      child.OutputDataReceived += (s,e) => { if(e.Data != null) try { File.AppendAllText(log,e.Data + Environment.NewLine); } catch {} };
      child.ErrorDataReceived += (s,e) => { if(e.Data != null) try { File.AppendAllText(log,e.Data + Environment.NewLine); } catch {} };
      child.BeginOutputReadLine(); child.BeginErrorReadLine();
      bool ready = false;
      for(int i=0;i<180;i++) {
        if(child.HasExited) throw new Exception("Companion konnte nicht starten. Protokoll: " + log);
        if(Probe(expectedId)) { ready=true; break; }
        Thread.Sleep(250);
      }
      if(!ready) throw new Exception("Start dauert zu lange. Protokoll: " + log);
    }
    if(progress!=null)progress("Studio öffnen · Tools starten erst bei Bedarf");

  }
  public static void Uninstall() {
    if(!File.Exists(Path.Combine(Root,"tecmon-app.marker"))) throw new Exception("Kein gültiger TecMon-Programmordner.");
    if(MessageBox.Show("TecMon Companion und die mitgelieferten Programmdateien entfernen?\n\nDeine Datenbank, Demos und Videos bleiben im gewählten Datenordner erhalten. Vorher Companion und CS Demo Manager beenden.","TecMon entfernen",MessageBoxButtons.YesNo,MessageBoxIcon.Question) != DialogResult.Yes) return;
    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TecMonCompanion",false);
    foreach(var file in new [] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"TecMon Companion.lnk"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"TecMon","TecMon Companion.lnk") }) if(File.Exists(file)) File.Delete(file);
    // A helper removes only this marked installation directory after the executable has exited.
    string literal = Root.Replace("'","''");
    string script = "Start-Sleep -Seconds 2; $target='"+literal+"'; $resolved=(Resolve-Path -LiteralPath $target -ErrorAction Stop).Path; if ($resolved -eq $target -and (Test-Path -LiteralPath (Join-Path $target 'tecmon-app.marker'))) { Remove-Item -LiteralPath $target -Recurse -Force }";
    Process.Start(Info("powershell.exe","-NoProfile","-EncodedCommand",Convert.ToBase64String(Encoding.Unicode.GetBytes(script))));
  }
  public sealed class LockedFile { public string path { get; set; } public string sha256 { get; set; } }
  public sealed class RenderRequest { public string exe { get; set; } public string cwd { get; set; } public string[] args { get; set; } public LockedFile[] files { get; set; } public int timeout { get; set; } }
  public static int RenderLocked() {
    string input; using(var reader=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false),true)) input=reader.ReadToEnd();
    if(input.Length>1048576) throw new Exception("Render request too large");
    var request=Json.Deserialize<RenderRequest>(input);
    if(request==null || request.files==null || request.files.Length>160 || request.args==null || request.args.Length>160 || !Path.IsPathRooted(request.exe) || Path.GetFileName(request.exe).ToLowerInvariant()!="ffmpeg.exe" || !Directory.Exists(request.cwd)) throw new Exception("Invalid render request");
    var locks=new List<FileStream>();
    try {
      foreach(var file in request.files) {
        if(!Path.IsPathRooted(file.path) || file.sha256==null || file.sha256.Length!=64) throw new Exception("Invalid render file");
        // Deny writes and replacement throughout FFmpeg's use, including through another hard link.
        var stream=new FileStream(file.path,FileMode.Open,FileAccess.Read,FileShare.Read); locks.Add(stream);
        using(var hash=System.Security.Cryptography.SHA256.Create()) {
          var actual=BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
          if(actual!=file.sha256) throw new Exception("Render file checksum mismatch: "+Path.GetFileName(file.path));
        }
        stream.Position=0;
      }
      var info=new ProcessStartInfo(request.exe,String.Join(" ",request.args.Select(Q))) { UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=request.cwd,RedirectStandardOutput=true,RedirectStandardError=true };
      using(var child=Process.Start(info)) {
        var stdout=child.StandardOutput.ReadToEndAsync(); var stderr=child.StandardError.ReadToEndAsync();
        int timeout=Math.Max(1000,Math.Min(request.timeout,1800000));
        if(!child.WaitForExit(timeout)) { child.Kill(); child.WaitForExit(); throw new Exception("Local render timed out"); }
        Task.WaitAll(stdout,stderr);
        Console.Out.Write(stdout.Result); Console.Error.Write(stderr.Result);
        return child.ExitCode;
      }
    } finally {foreach(var stream in locks) stream.Dispose();}
  }
  [STAThread] public static int Main(string[] args) {
    if(args.Length > 0 && args[0] == "--render-locked") {
      try { return RenderLocked(); } catch(Exception error) {Console.Error.WriteLine(error.Message); return 1;}
    }
    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
    try {
      if(args.Length > 0 && args[0] == "--private") { Private(args[1]); return 0; }
      if(args.Length > 0 && args[0] == "--extract-test") { Extract(args[1]); return 0; }
      if(args.Length > 0 && args[0] == "--prepare-update-test") { PrepareUpdate(args[1]); return 0; }
      if(args.Length > 0 && args[0] == "--apply-update") {
        try {ApplyUpdate(args[1],args.Length>2 ? args[2] : "");return 0;}
        catch(Exception error) {WriteUpdateResult(args[1],"error",error.Message);throw;}
      }
      if(args.Length > 0 && args[0] == "--apply-update-cli") {
        try {ApplyUpdate(args[1],"",false);return 0;} catch(Exception error) {WriteUpdateResult(args[1],"error",error.Message);Console.Error.WriteLine(error.Message);return 1;}
      }
      if(args.Length>1 && args[0]=="--desktop-preview-3d") {using(var pet=new DesktopPet(true)){if(!pet.HasModel)throw new Exception("3D-Figur fehlt");int n=0;foreach(var spec in new[]{"0,-1","30,-1","90,-1","150,-1","180,-1","0,36","0,37","0,38","0,39","0,41"}){var parts=spec.Split(',');using(var frame=pet.Preview(double.Parse(parts[0]),int.Parse(parts[1])))frame.Save(Path.Combine(args[1],"pet-"+(n++)+".png"),System.Drawing.Imaging.ImageFormat.Png);}}using(var bubble=new TipBubble())using(var image=bubble.Preview("Kauf-Check","Volle Ausrüstung möglich: Rifle, Kevlar + Helm und zwei Granaten."))image.Save(Path.Combine(args[1],"bubble.png"),System.Drawing.Imaging.ImageFormat.Png);using(var pet=new DesktopPet(true)){var menu=pet.ContextMenuStrip;menu.Show(new Point(0,0));if(menu.Items.Count>2)((ToolStripMenuItem)menu.Items[2]).Select();using(var shot=new Bitmap(menu.Width,menu.Height)){menu.DrawToBitmap(shot,new Rectangle(0,0,menu.Width,menu.Height));shot.Save(Path.Combine(args[1],"menu.png"),System.Drawing.Imaging.ImageFormat.Png);}menu.Close();}return 0;}
      if(args.Length>1 && args[0]=="--desktop-preview") {using(var pet=new DesktopPet(true))using(var frame=pet.Frame())frame.Save(args[1],System.Drawing.Imaging.ImageFormat.Png);return 0;}
      if(args.Length>0 && args[0]=="--desktop-self-test") {var result=DesktopPet.Fit(new Point(5000,-5000),new Rectangle(-1920,0,1920,1080),new Size(144,164));if(result.X!=-144||result.Y!=0)throw new Exception("Desktop bounds failed");return 0;}
      if(args.Length > 1 && args[0] == "--splash-preview") {using(var form=new SplashWindow(true)) using(var bitmap=new Bitmap(form.ClientSize.Width,form.ClientSize.Height)) {using(var graphics=Graphics.FromImage(bitmap))graphics.Clear(form.BackColor);foreach(Control control in form.Controls)control.DrawToBitmap(bitmap,control.Bounds);bitmap.Save(args[1],System.Drawing.Imaging.ImageFormat.Png);}return 0;}
      if(args.Length > 0 && args[0] == "--apply-update-test") { ApplyUpdate(args[1],"",false); return 0; }
      if(args.Length > 0 && args[0] == "--self-test") {
        if(Q("a b") != "\"a b\"") throw new Exception("Argument quoting failed");
        Console.WriteLine("TecMon native launcher OK"); return 0;
      }
      if(args.Length > 0 && args[0].StartsWith("--pick-")) {
        string selected = null;
        if(args[0] == "--pick-folder") { using(var dialog = new FolderBrowserDialog { Description = "TecMon · Ordner auf beliebigem Laufwerk wählen", ShowNewFolderButton = true }) if(dialog.ShowDialog() == DialogResult.OK) selected=dialog.SelectedPath; }
        else using(var dialog = new OpenFileDialog { Title="TecMon · Datei auf beliebigem Laufwerk wählen", Filter=args[0] == "--pick-demo" ? "CS2-Demos (*.dem)|*.dem" : "Programme (*.exe)|*.exe", CheckFileExists=true, RestoreDirectory=true }) if(dialog.ShowDialog() == DialogResult.OK) selected=dialog.FileName;
        Console.WriteLine(Json.Serialize(new { path=selected })); return 0;
      }
      if(args.Length > 0 && args[0] == "--uninstall") { Uninstall(); return 0; }
      if(Assembly.GetExecutingAssembly().GetManifestResourceNames().Contains("TecMonUpdate")) {
        string target=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),@"Programs\TecMon Companion");
        using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TecMonCompanion")) if(key!=null) target=Convert.ToString(key.GetValue("InstallLocation",target));
        if(!File.Exists(Path.Combine(target,"installation.json"))) using(var dialog=new FolderBrowserDialog { Description="Bestehenden TecMon-Programmordner wählen",SelectedPath=target }) {if(dialog.ShowDialog()!=DialogResult.OK)return 0;target=dialog.SelectedPath;}
        if(MessageBox.Show("TecMon Companion auf 0.18.2 aktualisieren?\n\nVorher Companion und CS Demo Manager schließen. Nur Programmdateien werden ersetzt. PostgreSQL, Tools, Demos, Videos und Passwörter bleiben erhalten.","TecMon Update",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes) ApplyUpdate(target,"");
        return 0;
      }
      if(Assembly.GetExecutingAssembly().GetManifestResourceNames().Contains("TecMonPayload")) { Application.Run(new SetupWindow()); return 0; }
      Application.Run(new SplashWindow()); return 0;
    } catch(Exception error) { MessageBox.Show(error.Message,"TecMon",MessageBoxButtons.OK,MessageBoxIcon.Error); return 1; }
  }
}

class SplashBar : Control {
  readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();int offset=180;
  public SplashBar() {DoubleBuffered=true;BackColor=Color.FromArgb(31,24,48);AccessibleName="Companion wird geladen";AccessibleRole=AccessibleRole.ProgressBar;timer.Interval=30;timer.Tick+=(s,e)=>{offset=(offset+5)%Math.Max(1,Width+120);Invalidate();};timer.Start();}
  protected override void OnPaint(PaintEventArgs e) {base.OnPaint(e);using(var brush=new SolidBrush(TecMon.Gold))e.Graphics.FillRectangle(brush,offset-120,0,120,Height);}
  protected override void Dispose(bool disposing) {if(disposing)timer.Dispose();base.Dispose(disposing);}
}
class SplashWindow : Form {
  readonly Label status=new Label();readonly bool preview;
  public SplashWindow(bool previewOnly=false) {
    preview=previewOnly;Text="TecMon Companion · Start";ClientSize=new Size(620,430);FormBorderStyle=FormBorderStyle.FixedDialog;ControlBox=false;ShowInTaskbar=true;StartPosition=FormStartPosition.CenterScreen;BackColor=TecMon.Background;ForeColor=Color.White;AutoScaleMode=AutoScaleMode.Dpi;
    Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    var picture=new PictureBox {Left=180,Top=24,Width=260,Height=260,SizeMode=PictureBoxSizeMode.Zoom,BackColor=Color.Transparent};
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonLogo")) if(stream!=null)using(var image=Image.FromStream(stream))picture.Image=new Bitmap(image);
    Controls.Add(picture);
    Controls.Add(new Label {Text="TECMON COMPANION",Left=30,Top=290,Width=560,Height=38,TextAlign=ContentAlignment.MiddleCenter,ForeColor=TecMon.Gold,Font=new Font("Segoe UI",20,FontStyle.Bold)});
    status.SetBounds(30,337,560,26);status.Text="Lokales Studio wird gestartet …";status.TextAlign=ContentAlignment.MiddleCenter;status.ForeColor=TecMon.Violet;status.Font=new Font("Segoe UI",10);Controls.Add(status);
    Controls.Add(new SplashBar {Left=70,Top=383,Width=480,Height=6});
    Shown+=async(s,e)=>{
      if(preview)return;
      try {await Task.Run(()=>TecMon.Launch(message=>{if(!IsDisposed)BeginInvoke(new Action(()=>status.Text=message));}));Hide();using(var pet=new DesktopPet())pet.ShowDialog();}
      catch(Exception error) {TecMon.WriteUpdateResult(TecMon.Root,"start-error",error.Message);MessageBox.Show(this,error.Message,"TecMon Start",MessageBoxButtons.OK,MessageBoxIcon.Error);}
      finally {Close();}
    };
    FormClosed+=(s,e)=>{if(picture.Image!=null)picture.Image.Dispose();};
  }
}

class SetupWindow : Form {
  TextBox app = new TextBox(), data = new TextBox(), demo = new TextBox(), game = new TextBox(), password = new TextBox(), confirm = new TextBox(), log = new TextBox();
  CheckBox accept = new CheckBox(); Button install = new Button(); ProgressBar progress = new ProgressBar(); bool busy=false, complete=false;
  public SetupWindow() {
    Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    Text="TecMon Companion · Installation"; Size=new Size(850,780); MinimumSize=new Size(850,780); StartPosition=FormStartPosition.CenterScreen; BackColor=TecMon.Background; ForeColor=Color.White; Font=new Font("Segoe UI",10); AutoScaleMode=AutoScaleMode.Dpi;
    var title=new Label { Text="TECMON  /  COMPANION SETUP", Left=32, Top=24, Width=740, Height=42, ForeColor=TecMon.Gold, Font=new Font("Segoe UI",23,FontStyle.Bold) }; Controls.Add(title);
    Controls.Add(new Label { Text="Ein Installer. Dein lokales CS2-Aufnahme-Studio.", Left=34,Top=75,Width=740,Height=25,ForeColor=TecMon.Violet });
    Controls.Add(new Label { Text="Companion, PostgreSQL 18, CS Demo Manager. HLAE / FFmpeg ggf. per geprüftem Download.\nSteam und CS2 müssen auf deinem PC installiert sein. Die Einrichtung benötigt ca. 2 GB freien Speicher.", Left=34,Top=111,Width=750,Height=48 });
    app.Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","TecMon Companion");
    data.Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"TecMon","Data");
    game.Text=TecMon.DetectGame();
    Row("Programmordner",app,178,false); Row("Datenbank und Videos",data,222,false); Row("Demo-Ordner (optional)",demo,266,false); Row("CS2 · cs2.exe",game,310,true);
    AddLabel("Dein PostgreSQL-Administratorpasswort",32,363,740);
    password.SetBounds(34,394,350,29); confirm.SetBounds(408,394,350,29); password.UseSystemPasswordChar=true; confirm.UseSystemPasswordChar=true;
    foreach(var box in new [] {password,confirm}) { box.BackColor=Color.FromArgb(23,24,37); box.ForeColor=Color.White; box.BorderStyle=BorderStyle.FixedSingle; }
    password.AccessibleName="PostgreSQL-Administratorpasswort"; confirm.AccessibleName="Passwort wiederholen";
    Controls.Add(password); Controls.Add(confirm); AddLabel("Passwort (mind. 8 Zeichen)",34,427,350); AddLabel("Passwort wiederholen",408,427,350);
    Controls.Add(new Label { Text="Frei wählbar, auch mit Sonderzeichen. Bei einem Update bleibt das bisherige Datenbankpasswort erhalten.\nTecMon richtet ein eigenes Anwendungskonto und alle Pfade automatisch ein. Bestehende fremde Datenbanken bleiben erhalten.", Left=34,Top=455,Width=750,Height=48,ForeColor=Color.LightGray, Font=new Font("Segoe UI",9) });
    accept.SetBounds(34,515,740,30); accept.Text="Lizenzhinweise der enthaltenen Tools gelesen und akzeptiert"; Controls.Add(accept);
    var licenses=new LinkLabel { Text="Lizenzen und Paketversionen ansehen",Left=34,Top=547,Width=400,Height=24,LinkColor=TecMon.Gold }; licenses.LinkClicked+=(s,e)=>ShowLicenses(); Controls.Add(licenses);
    log.SetBounds(34,581,740,66); log.Multiline=true; log.ReadOnly=true; log.ScrollBars=ScrollBars.Vertical; log.BackColor=Color.FromArgb(21,22,35); log.ForeColor=Color.White; log.Text="Bereit zur Einrichtung. Wähle die Ordner und dein Passwort."; Controls.Add(log);
    progress.SetBounds(34,660,740,12); Controls.Add(progress); install.SetBounds(500,686,274,36); install.Text="Installieren & einrichten"; install.BackColor=TecMon.Gold; install.ForeColor=Color.Black; install.FlatStyle=FlatStyle.Flat; install.Click+=async(s,e)=>await Install(); Controls.Add(install);
    FormClosing+=(s,e)=> { if(busy) e.Cancel=true; };
  }
  void AddLabel(string text,int x,int y,int width) { Controls.Add(new Label { Text=text,Left=x,Top=y,Width=width,Height=24 }); }
  void Row(string label, TextBox box, int y, bool exe) {
    AddLabel(label,34,y+4,190); box.SetBounds(231,y,453,29); box.BackColor=Color.FromArgb(23,24,37); box.ForeColor=Color.White; Controls.Add(box);
    var browse=new Button { Text="Wählen …",Left=696,Top=y-1,Width=78,Height=31 }; browse.Click+=(s,e)=> {
      if(exe) using(var d=new OpenFileDialog { Filter="CS2 (cs2.exe)|cs2.exe",Title="CS2 auf beliebigem Laufwerk wählen" }) { if(d.ShowDialog()==DialogResult.OK) box.Text=d.FileName; }
      else using(var d=new FolderBrowserDialog { Description=label+" · beliebiges Laufwerk",ShowNewFolderButton=true }) { if(d.ShowDialog()==DialogResult.OK) box.Text=d.SelectedPath; }
    }; Controls.Add(browse);
  }
  void ShowLicenses() {
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonNotices")) using(var reader=new StreamReader(stream)) {
      var window=new Form { Text="TecMon · Lizenzhinweise",Size=new Size(760,620),StartPosition=FormStartPosition.CenterParent };
      window.Controls.Add(new TextBox { Text=reader.ReadToEnd(),Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill }); window.ShowDialog(this);
    }
  }
  async Task Install() {
    if(complete) { TecMon.Root=app.Text; Hide();using(var splash=new SplashWindow())splash.ShowDialog();Close();return; }
    if(!accept.Checked) { MessageBox.Show("Bitte zuerst die Lizenzhinweise lesen und bestätigen."); return; }
    if(password.Text.Length<8 || password.Text!=confirm.Text || password.Text.IndexOfAny(new [] {'\r','\n','\0'})>=0) { MessageBox.Show("Bitte ein Passwort mit mindestens 8 Zeichen eingeben und identisch wiederholen."); return; }
    string target, dataDir;
    try { target=Path.GetFullPath(app.Text).TrimEnd('\\'); dataDir=Path.GetFullPath(data.Text).TrimEnd('\\');
      if(dataDir.Equals(target,StringComparison.OrdinalIgnoreCase) || dataDir.StartsWith(target+"\\",StringComparison.OrdinalIgnoreCase)) throw new Exception("Der Datenordner muss außerhalb des Programmordners liegen.");
    } catch(Exception e) { MessageBox.Show(e.Message); return; }
    var options=TecMon.Json.Serialize(new { password=password.Text,dataDir=dataDir,demoDir=demo.Text,cs2Exe=game.Text,acceptLicenses=true });
    busy=true; foreach(Control c in Controls) { if(c is TextBox) ((TextBox)c).ReadOnly=true; else if(c is Button || c is CheckBox) c.Enabled=false; } progress.Style=ProgressBarStyle.Marquee;
    bool success=false;
    try {
      await Task.Run(()=> {
        Action<string> report=message=>BeginInvoke((Action)(()=>log.AppendText(Environment.NewLine+message)));
        report("Vorhandene TecMon-Installation prüfen und private Datenbank sauber beenden …"); TecMon.PrepareUpdate(target);
        report("Programmdateien und alle Tools entpacken …"); TecMon.Extract(target);
        report("Windows-Laufzeit prüfen …"); TecMon.EnsureRuntime(target);
        var info=TecMon.Info(Path.Combine(target,"runtime","node.exe"),Path.Combine(target,"install-backend.mjs")); info.WorkingDirectory=target;
        info.RedirectStandardInput=true; info.RedirectStandardOutput=true; info.RedirectStandardError=true; info.StandardOutputEncoding=Encoding.UTF8;
        using(var child=Process.Start(info)) {
          child.ErrorDataReceived+=(s,e)=> { /* Passwords and raw tool errors never go to the wizard log. */ }; child.BeginErrorReadLine();
          using(var writer=new StreamWriter(child.StandardInput.BaseStream,new UTF8Encoding(false))) writer.Write(options);
          string line; while((line=child.StandardOutput.ReadLine())!=null) {
            var value=TecMon.Json.Deserialize<Dictionary<string,object>>(line);
            if(value.ContainsKey("message")) report(Convert.ToString(value["message"]));
            if(value.ContainsKey("error")) throw new Exception(Convert.ToString(value["error"]));
          }
          child.WaitForExit(); if(child.ExitCode!=0) throw new Exception("Einrichtung fehlgeschlagen. Hinweise im Protokoll prüfen und Setup erneut starten.");
        }
        TecMon.Register(target);
      });
      success=true; log.AppendText(Environment.NewLine+"Fertig. Desktop- und Startmenü-Verknüpfungen wurden angelegt."); complete=true; password.Clear(); confirm.Clear();
    } catch(Exception error) { MessageBox.Show(error.Message,"TecMon Einrichtung",MessageBoxButtons.OK,MessageBoxIcon.Error); log.AppendText(Environment.NewLine+"Einrichtung noch nicht abgeschlossen. Nach der Korrektur erneut starten."); }
    finally { busy=false; foreach(Control c in Controls) { c.Enabled=true; if(c is TextBox && c!=log) ((TextBox)c).ReadOnly=false; } progress.Style=ProgressBarStyle.Blocks; progress.Value=success?100:0; install.Text=complete?"TecMon Companion starten":"Erneut einrichten"; }
  }
}

// Native Windows desktop host. Only the authenticated loopback UI is embedded.
class DesktopPanel : Form {
  Control web;Label fallback=new Label();bool initialized;
  readonly Panel surface=new Panel(),chrome=new Panel();bool tailLeft;Point headerDrag,windowDrag;bool moving;
  public bool TailLeft {get{return tailLeft;}set{tailLeft=value;Shape();}}
  static readonly Color Cyan=Color.FromArgb(103,232,249);
  public static System.Drawing.Drawing2D.GraphicsPath Bubble(Size size,bool left) {
    float x=left?19:1,y=1,w=size.Width-21,h=size.Height-2,r=22;
    var path=new System.Drawing.Drawing2D.GraphicsPath();
    path.AddArc(x,y,r*2,r*2,180,90);path.AddArc(x+w-r*2,y,r*2,r*2,270,90);
    if(!left){path.AddLine(x+w,y+r,x+w,y+h-94);path.AddLine(x+w,y+h-94,size.Width-1,y+h-60);path.AddLine(size.Width-1,y+h-60,x+w,y+h-68);}
    path.AddArc(x+w-r*2,y+h-r*2,r*2,r*2,0,90);path.AddArc(x,y+h-r*2,r*2,r*2,90,90);
    if(left){path.AddLine(x,y+h-r,x,y+h-68);path.AddLine(x,y+h-68,1,y+h-60);path.AddLine(1,y+h-60,x,y+h-94);}
    path.CloseFigure();return path;
  }
  void Shape(){if(ClientSize.Width<100)return;using(var path=Bubble(ClientSize,tailLeft)){var previous=Region;Region=new Region(path);if(previous!=null)previous.Dispose();}int x=tailLeft?32:14;chrome.SetBounds(x,12,ClientSize.Width-48,42);surface.SetBounds(x,61,ClientSize.Width-48,ClientSize.Height-83);Invalidate();}
  Button ChromeButton(string label,string accessible,Color color,Action action){var b=new Button{Text=label,AccessibleName=accessible,FlatStyle=FlatStyle.Flat,ForeColor=color,BackColor=Color.FromArgb(9,35,48),Font=new Font("Segoe UI",13),Size=new Size(34,30),Cursor=Cursors.Hand,TabStop=true};b.FlatAppearance.BorderColor=color;b.FlatAppearance.MouseOverBackColor=Color.FromArgb(24,65,78);b.Click+=(s,e)=>action();return b;}
  protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;using(var path=Bubble(ClientSize,tailLeft))using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(ClientRectangle,Color.FromArgb(8,47,65),Color.FromArgb(4,20,32),45))using(var pen=new Pen(Cyan,1.5f)){e.Graphics.FillPath(fill,path);e.Graphics.DrawPath(pen,path);}using(var line=new Pen(Color.FromArgb(16,165,243,252)))for(int y=5;y<Height;y+=4)e.Graphics.DrawLine(line,24,y,Width-24,y);}

  public DesktopPanel() {
    Text="TecMon · Verbindung & Einstellungen";ClientSize=new Size(520,640);MinimumSize=new Size(440,450);StartPosition=FormStartPosition.Manual;BackColor=TecMon.Background;ForeColor=Color.White;ShowInTaskbar=true;FormBorderStyle=FormBorderStyle.None;DoubleBuffered=true;KeyPreview=true;Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    surface.BackColor=Color.FromArgb(4,20,32);Controls.Add(surface);chrome.BackColor=Color.FromArgb(7,29,42);Controls.Add(chrome);
    var title=new Label{Text="TECMON // HOLOLINK",AutoSize=false,ForeColor=Cyan,Font=new Font("Segoe UI",10,FontStyle.Bold),TextAlign=ContentAlignment.MiddleLeft,Dock=DockStyle.Fill,Cursor=Cursors.SizeAll};chrome.Controls.Add(title);
    var close=ChromeButton("×","Sprechblase schließen",Color.FromArgb(251,113,133),()=>Hide());var collapse=ChromeButton("−","Sprechblase einklappen",Cyan,()=>Hide());chrome.Controls.Add(close);chrome.Controls.Add(collapse);
    chrome.Resize+=(sender,args)=>{close.Location=new Point(chrome.Width-36,5);collapse.Location=new Point(chrome.Width-76,5);title.Width=Math.Max(100,chrome.Width-90);close.BringToFront();collapse.BringToFront();};
    title.MouseDown+=(sender,args)=>{if(args.Button!=MouseButtons.Left)return;moving=true;headerDrag=Cursor.Position;windowDrag=Location;title.Capture=true;};title.MouseMove+=(sender,args)=>{if(!moving)return;var point=new Point(windowDrag.X+Cursor.Position.X-headerDrag.X,windowDrag.Y+Cursor.Position.Y-headerDrag.Y);Location=DesktopPet.Fit(point,Screen.FromPoint(Cursor.Position).WorkingArea,Size);};title.MouseUp+=(sender,args)=>{moving=false;title.Capture=false;};
    KeyDown+=(sender,args)=>{if(args.KeyCode==Keys.Escape)Hide();};Resize+=(sender,args)=>Shape();Shape();
    fallback.Dock=DockStyle.Fill;fallback.Padding=new Padding(24);fallback.ForeColor=TecMon.Gold;fallback.Font=new Font("Segoe UI",11);fallback.Text="Dein Companion-Fenster wird geöffnet …";surface.Controls.Add(fallback);
    FormClosing+=(s,e)=>{if(e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();}};
    Shown+=async(s,e)=>{if(initialized)return;initialized=true;try{
      Assembly.LoadFrom(Path.Combine(TecMon.Root,"Microsoft.Web.WebView2.Core.dll"));
      var assembly=Assembly.LoadFrom(Path.Combine(TecMon.Root,"Microsoft.Web.WebView2.WinForms.dll"));
      dynamic view=Activator.CreateInstance(assembly.GetType("Microsoft.Web.WebView2.WinForms.WebView2",true));web=(Control)view;web.Dock=DockStyle.Fill;surface.Controls.Add(web);web.BringToFront();
      dynamic properties=Activator.CreateInstance(assembly.GetType("Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties",true));
      properties.UserDataFolder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"TecMon","Desktop-WebView2");view.CreationProperties=properties;
      await (Task)view.EnsureCoreWebView2Async(null);
      object core=view.CoreWebView2;
      Attach(core,"NavigationStarting","Navigation");Attach(core,"NewWindowRequested","NewWindow");Attach(core,"PermissionRequested","Permission");
      dynamic settings=view.CoreWebView2.Settings;settings.AreDevToolsEnabled=false;settings.AreDefaultContextMenusEnabled=false;settings.IsStatusBarEnabled=false;
      view.Source=new Uri("http://127.0.0.1:31977/?desktop=1");
    }catch(Exception){if(web!=null){web.Dispose();web=null;}fallback.BringToFront();fallback.Text="Das eingebettete Fenster benötigt Microsoft Edge WebView2 Runtime.\n\nDie Figur bleibt verfügbar. Über das Rechtsklick-Menü kannst du das Studio im Browser öffnen oder zur offiziellen WebView2-Downloadseite wechseln.";}};
  }
  void Attach(object core,string eventName,string method) {var info=core.GetType().GetEvent(eventName);info.AddEventHandler(core,Delegate.CreateDelegate(info.EventHandlerType,this,GetType().GetMethod(method,BindingFlags.Instance|BindingFlags.Public)));}
  public void Navigation(object sender,object args) {dynamic e=args;Uri uri;if(!Uri.TryCreate((string)e.Uri,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port!=31977){e.Cancel=true;OpenExternal((string)e.Uri);}}
  public void NewWindow(object sender,object args) {dynamic e=args;e.Handled=true;OpenExternal((string)e.Uri);}
  public void Permission(object sender,object args) {var property=args.GetType().GetProperty("State");property.SetValue(args,Enum.Parse(property.PropertyType,"Deny"),null);}
  public static bool WebViewInstalled() {
    const string client=@"\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    foreach(var path in new[]{@"SOFTWARE\WOW6432Node"+client,@"SOFTWARE"+client}) {
      foreach(var hive in new[]{Registry.LocalMachine,Registry.CurrentUser}) {
        try{using(var key=hive.OpenSubKey(path)){var version=key==null?null:Convert.ToString(key.GetValue("pv"));if(!string.IsNullOrEmpty(version)&&version!="0.0.0.0")return true;}}catch{}
      }
    }
    return false;
  }
  public static void OpenExternal(string address) {Uri uri;if(!Uri.TryCreate(address,UriKind.Absolute,out uri))return;if(uri.Scheme!="https")return;if(!new[]{"tecmon.online","app.tecmon.app","github.com","developer.microsoft.com","cs-demo-manager.com","www.postgresql.org"}.Contains(uri.Host))return;Process.Start(new ProcessStartInfo(uri.AbsoluteUri){UseShellExecute=true});}
  protected override void Dispose(bool disposing) {if(disposing&&web!=null)web.Dispose();base.Dispose(disposing);}
}

// Kurzer CS2-Rundentipp neben der Figur. Wird nie aktiviert, damit CS2 den Fokus behält.
/* Rechtsklick-Menü im Stil der Rundentipp-Sprechblase: dunkle Fläche, goldener Rahmen, lila Auswahl. */
class TecMonMenu : ToolStripProfessionalRenderer {
  static readonly Color Top=Color.FromArgb(27,22,38),Bottom=Color.FromArgb(11,10,17),Violet=Color.FromArgb(167,139,250),Text=Color.FromArgb(232,230,240),Muted=Color.FromArgb(150,146,168);
  public TecMonMenu():base(new Colors()){RoundedEdges=false;}
  class Colors : ProfessionalColorTable {
    public override Color ToolStripDropDownBackground {get{return Bottom;}}
    public override Color ImageMarginGradientBegin {get{return Top;}}
    public override Color ImageMarginGradientMiddle {get{return Top;}}
    public override Color ImageMarginGradientEnd {get{return Top;}}
    public override Color MenuBorder {get{return TecMon.Gold;}}
    public override Color MenuItemBorder {get{return Color.FromArgb(120,Violet);}}
    public override Color MenuItemSelected {get{return Color.FromArgb(60,Violet);}}
    public override Color SeparatorDark {get{return Color.FromArgb(90,TecMon.Gold);}}
    public override Color SeparatorLight {get{return Color.Transparent;}}
  }
  public static void Apply(ToolStripDropDown menu){menu.Renderer=new TecMonMenu();menu.Font=new Font("Segoe UI",10f);menu.Padding=new Padding(4,8,4,8);menu.ForeColor=Text;}
  protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e){using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(e.AffectedBounds,Top,Bottom,90f))e.Graphics.FillRectangle(fill,e.AffectedBounds);}
  protected override void OnRenderImageMargin(ToolStripRenderEventArgs e){}
  protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e){
    var r=new Rectangle(0,0,e.ToolStrip.Width-1,e.ToolStrip.Height-1);
    using(var glow=new Pen(Color.FromArgb(70,Violet),3))e.Graphics.DrawRectangle(glow,new Rectangle(2,2,r.Width-4,r.Height-4));
    using(var gold=new Pen(TecMon.Gold,1.4f))e.Graphics.DrawRectangle(gold,r);
  }
  protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e){
    if(!e.Item.Selected||!e.Item.Enabled)return;var r=new Rectangle(3,1,e.Item.Width-6,e.Item.Height-2);
    using(var fill=new SolidBrush(Color.FromArgb(55,Violet)))e.Graphics.FillRectangle(fill,r);
    using(var bar=new SolidBrush(Violet))e.Graphics.FillRectangle(bar,r.Left,r.Top+3,3,r.Height-6);
  }
  protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e){e.TextColor=!e.Item.Enabled?Muted:e.Item.Selected?Color.White:Text;base.OnRenderItemText(e);}
  protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e){e.ArrowColor=TecMon.Gold;base.OnRenderArrow(e);}
  protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e){int y=e.Item.Height/2;using(var line=new Pen(Color.FromArgb(70,TecMon.Gold)))e.Graphics.DrawLine(line,12,y,e.Item.Width-12,y);}
  protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e){
    var r=e.ImageRectangle;e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
    using(var glow=new SolidBrush(Color.FromArgb(70,Violet)))e.Graphics.FillEllipse(glow,r.Left+r.Width/2-7,r.Top+r.Height/2-7,14,14);
    using(var dot=new SolidBrush(Violet))e.Graphics.FillEllipse(dot,r.Left+r.Width/2-4,r.Top+r.Height/2-4,8,8);
  }
}

/* Fenster mit echter Transparenz je Pixel (freigestellt wie ein PNG): kein dunkler Rand, keine harten Ecken. */
static class Layered {
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window,IntPtr dc);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr window,IntPtr dc,ref Point position,ref Size size,IntPtr source,ref Point origin,int key,ref Blend blend,int flags);
  [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential,Pack=1)] struct Blend {public byte operation,flags,alpha,format;}
  public static void Push(Form form,Bitmap bitmap,Point position){
    if(!form.IsHandleCreated)return;
    IntPtr screen=GetDC(IntPtr.Zero),memory=CreateCompatibleDC(screen),image=bitmap.GetHbitmap(Color.FromArgb(0)),previous=SelectObject(memory,image);
    try{Point origin=Point.Empty;Size size=bitmap.Size;var blend=new Blend{alpha=255,format=1};UpdateLayeredWindow(form.Handle,screen,ref position,ref size,memory,ref origin,0,ref blend,2);}
    finally{SelectObject(memory,previous);DeleteObject(image);DeleteDC(memory);ReleaseDC(IntPtr.Zero,screen);}
  }
}

class TipBubble : Form {
  readonly System.Windows.Forms.Timer hide=new System.Windows.Forms.Timer(),runner=new System.Windows.Forms.Timer();
  readonly Font titleFont=new Font("Segoe UI",9,FontStyle.Bold),bodyFont=new Font("Segoe UI",12),olderFont=new Font("Segoe UI",10.5f),smallFont=new Font("Segoe UI",8,FontStyle.Bold),brandFont=new Font("Segoe UI",17,FontStyle.Bold),statusFont=new Font("Segoe UI",10.5f),closeFont=new Font("Segoe UI",15);
  /* Mehrere Tipps derselben Runde stapeln sich in einer größeren Sprechblase, der neueste oben. */
  readonly List<string[]> entries=new List<string[]>();readonly List<int> heights=new List<int>();long group=long.MinValue;Dictionary<string,object> visual;Bitmap radar;string radarFile="";
  const int Visual=364,Edge=10,Tail=16,Pad=24,Cut=16,Header=92;
  bool tailLeft;int tailY=60;float phase;
  static readonly Color Cyan=Color.FromArgb(103,232,249),Orange=Color.FromArgb(251,146,60),Green=Color.FromArgb(74,222,128),Violet=Color.FromArgb(167,139,250),VioletLight=Color.FromArgb(216,203,255);
  protected override bool ShowWithoutActivation {get{return true;}}
  /* WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_LAYERED: freigestellt, nimmt CS2 nie den Fokus. */
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80|0x8|0x80000;return p;}}
  public TipBubble(){
    Text="TecMon Rundentipp";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;BackColor=Color.FromArgb(9,8,14);DoubleBuffered=true;Cursor=Cursors.Hand;AccessibleName="TecMon Rundentipp";
    hide.Tick+=(s,e)=>{hide.Stop();Hide();};Click+=(s,e)=>{hide.Stop();Hide();};
    /* Lila Licht, das einmal in etwa drei Sekunden um den Rahmen läuft. */
    runner.Interval=33;runner.Tick+=(s,e)=>{phase=(phase+0.011f)%1f;Push();};
    VisibleChanged+=(s,e)=>{if(Visible){runner.Start();Push();}else runner.Stop();};
  }
  static string Kind(Dictionary<string,object> data){object value;return data!=null&&data.TryGetValue("type",out value)?Convert.ToString(value):"";}
  /* Radarbild aus dem lokalen CS-Demo-Manager-Ordner; ohne Datei bleibt es beim Text. */
  bool LoadRadar(string file){
    if(file==radarFile&&radar!=null)return true;
    if(radar!=null){radar.Dispose();radar=null;}radarFile="";
    try{if(string.IsNullOrEmpty(file)||!file.EndsWith(".png",StringComparison.OrdinalIgnoreCase)||!File.Exists(file))return false;using(var stream=new MemoryStream(File.ReadAllBytes(file)))using(var image=Image.FromStream(stream))radar=new Bitmap(image);radarFile=file;return true;}catch{return false;}
  }
  /* Runde läuft und du lebst: sofort ausblenden, damit nichts beim Spielen stört. */
  public void Quiet(){if(Visible){hide.Stop();Hide();}}
  Rectangle Frame(){return new Rectangle(Edge+(tailLeft?Tail:0),Edge,ClientSize.Width-2*Edge-Tail,ClientSize.Height-2*Edge);}
  int ContentLeft(){return Frame().Left+Pad;}
  int ContentWidth(){return Frame().Width-2*Pad;}
  static Color Dot(string title){switch(title){case "Stark":case "Zusammenfassung":case "Aufwärmen":return Color.FromArgb(74,222,128);case "Nach dem Tod":case "Kopf frei":return Color.FromArgb(251,113,133);case "Deine Matches":case "Map":case "Team":return Color.FromArgb(167,139,250);default:return TecMon.Gold;}}
  public void Present(string heading,string text,Rectangle anchor,Dictionary<string,object> picture,long round,bool stack){
    bool append=stack&&Visible&&round==group&&entries.Count>0;
    if(!append){entries.Clear();visual=null;}
    group=round;entries.Add(new string[]{heading,(text??"").Replace(" %"," %").Replace(" $"," $")});while(entries.Count>4)entries.RemoveAt(0);
    string kind=Kind(picture);
    if(kind=="map"&&!LoadRadar(Convert.ToString(picture["image"])))kind="";
    if(kind=="map"||kind=="spray")visual=picture;
    kind=Kind(visual);
    int inner=visual!=null?Visual:entries.Count>1?430:360;
    int width=inner+2*Pad+2*Edge+Tail;
    heights.Clear();int body=0,letters=0;
    using(var g=CreateGraphics())for(int i=entries.Count-1;i>=0;i--){bool newest=i==entries.Count-1;var size=g.MeasureString(entries[i][1],newest?bodyFont:olderFont,inner);int h=(int)Math.Ceiling(size.Height);heights.Add(h);body+=newest?h+16:h+42;letters+=entries[i][1].Length;}
    int extra=kind=="map"?Visual+16:kind=="spray"?250:0;
    ClientSize=new Size(width,2*Edge+Header+body+extra+24);
    var area=Screen.FromRectangle(anchor).WorkingArea;var point=new Point(anchor.Left-Width+2,anchor.Top+anchor.Height/2-Height/2);tailLeft=false;
    if(point.X<area.Left){point.X=anchor.Right-2;tailLeft=true;}
    Location=DesktopPet.Fit(point,area,Size);
    var frame=Frame();tailY=Math.Max(frame.Top+Cut+18,Math.Min(frame.Bottom-Cut-18,anchor.Top+anchor.Height/2-Top));
    /* Keine Fensterform mehr: außerhalb des Rahmens ist das Bild durchsichtig, der lila Schein läuft weich aus. */
    if(!Visible)Show();Push();
    hide.Stop();hide.Interval=Math.Max(7000,Math.Min(visual!=null||entries.Count>1?25000:16000,4000+letters*55+(visual!=null?6000:0)));hide.Start();
  }
  /* Rahmen mit abgeschrägten Ecken und Spitze zur Figur, wie die TecMon-Karten. */
  System.Drawing.Drawing2D.GraphicsPath Outline(){return Outline(0);}
  System.Drawing.Drawing2D.GraphicsPath Outline(int grow){
    var f=Frame();float l=f.Left-grow,t=f.Top-grow,r=f.Right-1+grow,b=f.Bottom-1+grow,c=Cut+grow*0.42f,tip=Tail-2+grow,half=12+grow;var p=new List<PointF>();
    p.Add(new PointF(l+c,t));p.Add(new PointF(r-c,t));p.Add(new PointF(r,t+c));
    if(!tailLeft){p.Add(new PointF(r,tailY-half));p.Add(new PointF(r+tip,tailY));p.Add(new PointF(r,tailY+half));}
    p.Add(new PointF(r,b-c));p.Add(new PointF(r-c,b));p.Add(new PointF(l+c,b));p.Add(new PointF(l,b-c));
    if(tailLeft){p.Add(new PointF(l,tailY+half));p.Add(new PointF(l-tip,tailY));p.Add(new PointF(l,tailY-half));}
    p.Add(new PointF(l,t+c));
    var path=new System.Drawing.Drawing2D.GraphicsPath();path.AddPolygon(p.ToArray());return path;
  }
  static PointF Along(PointF[] pts,float[] at,float d){
    for(int i=1;i<pts.Length;i++)if(at[i]>=d){float seg=at[i]-at[i-1];float k=seg>0?(d-at[i-1])/seg:0;return new PointF(pts[i-1].X+(pts[i].X-pts[i-1].X)*k,pts[i-1].Y+(pts[i].Y-pts[i-1].Y)*k);}
    return pts[pts.Length-1];
  }
  /* Ein lila Lichtstreifen mit Schweif läuft am goldenen Rahmen entlang. */
  void DrawRunner(Graphics g,System.Drawing.Drawing2D.GraphicsPath outline){
    var raw=outline.PathPoints;if(raw.Length<2)return;var pts=new PointF[raw.Length+1];Array.Copy(raw,pts,raw.Length);pts[raw.Length]=raw[0];
    var at=new float[pts.Length];for(int i=1;i<pts.Length;i++){float dx=pts[i].X-pts[i-1].X,dy=pts[i].Y-pts[i-1].Y;at[i]=at[i-1]+(float)Math.Sqrt(dx*dx+dy*dy);}
    float total=at[at.Length-1];if(total<=0)return;float head=phase*total,length=Math.Min(260f,total*0.3f);const int steps=60;
    for(int k=steps;k>=1;k--){
      float d1=head-length*(k-1)/steps,d0=head-length*k/steps;var a=Along(pts,at,(d0%total+total)%total);var bpt=Along(pts,at,(d1%total+total)%total);
      if(Math.Abs(((d1%total+total)%total)-((d0%total+total)%total))>length)continue;
      float fade=1f-(float)(k-1)/steps;
      using(var wide=new Pen(Color.FromArgb((int)(55*fade),Violet),9f){StartCap=System.Drawing.Drawing2D.LineCap.Round,EndCap=System.Drawing.Drawing2D.LineCap.Round})g.DrawLine(wide,a,bpt);
      using(var core=new Pen(Color.FromArgb((int)(255*fade),k<4?VioletLight:Violet),3f){StartCap=System.Drawing.Drawing2D.LineCap.Round,EndCap=System.Drawing.Drawing2D.LineCap.Round})g.DrawLine(core,a,bpt);
    }
  }
  static float Num(object value){return Convert.ToSingle(value,System.Globalization.CultureInfo.InvariantCulture);}
  static System.Collections.IList Items(Dictionary<string,object> data,string key){object value;return data!=null&&data.TryGetValue(key,out value)?value as System.Collections.IList:null;}
  void Label(Graphics g,string text,float x,float y,Color color){var size=g.MeasureString(text,smallFont);var box=new RectangleF(x-size.Width/2,y-size.Height/2,size.Width,size.Height);using(var back=new SolidBrush(Color.FromArgb(200,4,20,32)))g.FillRectangle(back,box);using(var brush=new SolidBrush(color))g.DrawString(text,smallFont,brush,box.X,box.Y);}
  /* Einschlagmuster: Schuss 1 unten, danach nach oben; die Maus muss entgegengesetzt ziehen. */
  void DrawSpray(Graphics g,Rectangle box){
    var points=Items(visual,"points");if(points==null||points.Count<2)return;
    float minX=0,maxX=0,minY=0;var list=new List<PointF>();
    foreach(var raw in points){var pair=raw as System.Collections.IList;if(pair==null||pair.Count<2)continue;var p=new PointF(Num(pair[0]),Num(pair[1]));list.Add(p);minX=Math.Min(minX,p.X);maxX=Math.Max(maxX,p.X);minY=Math.Min(minY,p.Y);}
    float scale=Math.Min((box.Height-40)/Math.Max(1f,-minY),(box.Width-40)/Math.Max(1f,maxX-minX));
    float originX=box.Left+box.Width/2f-(minX+maxX)/2f*scale,originY=box.Bottom-22;
    using(var grid=new Pen(Color.FromArgb(40,103,232,249))){g.DrawLine(grid,box.Left+box.Width/2f,box.Top,box.Left+box.Width/2f,box.Bottom);}
    var screen=list.Select(p=>new PointF(originX+p.X*scale,originY+p.Y*scale)).ToArray();
    using(var line=new Pen(Color.FromArgb(90,103,232,249),1.2f))g.DrawLines(line,screen);
    for(int i=0;i<screen.Length;i++){float t=screen.Length>1?(float)i/(screen.Length-1):0;var color=Color.FromArgb(255,(int)(232+(248-232)*t),(int)(197-(197-113)*t),(int)(115-(115-113)*t));using(var dot=new SolidBrush(color))g.FillEllipse(dot,screen[i].X-3.5f,screen[i].Y-3.5f,7,7);if(i==0||(i+1)%10==0)Label(g,Convert.ToString(i+1),screen[i].X+14,screen[i].Y,Color.White);}
    using(var brush=new SolidBrush(Cyan))g.DrawString("Einschläge ohne Ausgleich · Maus entgegengesetzt ziehen",smallFont,brush,box.Left,box.Bottom-12);
  }
  void DrawMap(Graphics g,Rectangle box){
    if(radar==null)return;g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(radar,box);
    using(var pen=new Pen(Color.FromArgb(120,103,232,249)))g.DrawRectangle(pen,box);
    /* Eigene Tode aus den TecMon-Matches als rote Punkte. */
    var marks=Items(visual,"marks");
    if(marks!=null)using(var red=new SolidBrush(Color.FromArgb(150,248,113,113)))foreach(var raw in marks){var mark=raw as Dictionary<string,object>;if(mark==null)continue;g.FillEllipse(red,box.Left+Num(mark["x"])*box.Width-3,box.Top+Num(mark["y"])*box.Height-3,6,6);}
    var spots=Items(visual,"spots");if(spots==null)return;
    foreach(var raw in spots){var spot=raw as Dictionary<string,object>;if(spot==null)continue;
      float x=box.Left+Num(spot["x"])*box.Width,y=box.Top+Num(spot["y"])*box.Height;string kind=Convert.ToString(spot["kind"]),label=Convert.ToString(spot["label"]);bool hot=spot.ContainsKey("hot")&&Convert.ToBoolean(spot["hot"]);
      if(kind=="site"){using(var fill=new SolidBrush(Color.FromArgb(220,Orange)))g.FillEllipse(fill,x-11,y-11,22,22);var size=g.MeasureString(label,titleFont);g.DrawString(label,titleFont,Brushes.Black,x-size.Width/2,y-size.Height/2);continue;}
      if(kind=="spawn"){Label(g,label+"-Spawn",x,y,Green);continue;}
      using(var dot=new SolidBrush(hot?TecMon.Gold:Cyan))g.FillEllipse(dot,x-4,y-4,8,8);Label(g,label,x,y-12,hot?TecMon.Gold:Color.FromArgb(207,250,254));
    }
  }
  /* Ganze Sprechblase in ein 32-Bit-Bild mit Alphakanal zeichnen und so ans Fenster geben. */
  void Push(){if(!IsHandleCreated||!Visible||ClientSize.Width<10)return;using(var bitmap=new Bitmap(ClientSize.Width,ClientSize.Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb)){using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.Transparent);Draw(g);}Layered.Push(this,bitmap,Location);}}
  public Bitmap Preview(string heading,string text){entries.Clear();heights.Clear();entries.Add(new string[]{heading,text});ClientSize=new Size(360+2*Pad+2*Edge+Tail,2*Edge+Header+120);heights.Add(80);var bitmap=new Bitmap(ClientSize.Width,ClientSize.Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.Transparent);Draw(g);}return bitmap;}
  void Draw(Graphics g){
    g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
    var frame=Frame();
    using(var path=Outline()){
      /* Weicher lila Schein außen, dunkle Fläche innen, goldener Rahmen. */
      using(var glow=new Pen(Color.FromArgb(28,Violet),Edge*2-2))g.DrawPath(glow,path);
      using(var glow=new Pen(Color.FromArgb(45,Violet),10))g.DrawPath(glow,path);
      using(var glow=new Pen(Color.FromArgb(80,Violet),4))g.DrawPath(glow,path);
      using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(frame,Color.FromArgb(27,22,38),Color.FromArgb(11,10,17),70))g.FillPath(fill,path);
      using(var pen=new Pen(TecMon.Gold,1.8f))g.DrawPath(pen,path);
      DrawRunner(g,path);
    }
    int x=ContentLeft(),w=ContentWidth(),y=frame.Top+14;
    using(var gold=new SolidBrush(TecMon.Gold)){g.DrawString("TecMon",brandFont,gold,x-3,y);g.DrawString("×",closeFont,gold,frame.Right-Pad-14,y-2);}
    var newestTitle=entries.Count>0?entries[entries.Count-1][0]:"Rundentipp";
    using(var dot=new SolidBrush(Dot(newestTitle)))g.FillEllipse(dot,x,y+40,11,11);
    using(var gray=new SolidBrush(Color.FromArgb(214,212,226)))g.DrawString(newestTitle,statusFont,gray,x+16,y+35);
    using(var line=new Pen(Color.FromArgb(90,232,197,115)))g.DrawLine(line,x,frame.Top+Header-14,x+w,frame.Top+Header-14);
    y=frame.Top+Header;
    using(var center=new StringFormat{Alignment=StringAlignment.Center})
    for(int n=0;n<heights.Count;n++){var entry=entries[entries.Count-1-n];
      if(n==0){g.DrawString(entry[1],bodyFont,Brushes.White,new RectangleF(x,y,w,heights[n]+4),heights[n]<30?center:StringFormat.GenericDefault);y+=heights[n]+16;continue;}
      using(var line=new Pen(Color.FromArgb(45,232,197,115)))g.DrawLine(line,x+w/4,y,x+w*3/4,y);
      using(var dot=new SolidBrush(Color.FromArgb(170,Dot(entry[0]))))g.FillEllipse(dot,x,y+13,8,8);
      using(var label=new SolidBrush(Color.FromArgb(190,232,197,115)))g.DrawString(entry[0].ToUpperInvariant(),smallFont,label,x+13,y+9);
      using(var text=new SolidBrush(Color.FromArgb(190,214,212,226)))g.DrawString(entry[1],olderFont,text,new RectangleF(x,y+28,w,heights[n]+4));
      y+=heights[n]+42;}
    var kind=Kind(visual);var box=new Rectangle(x,y,w,frame.Bottom-y-20);
    if(kind=="spray")DrawSpray(g,box);else if(kind=="map")DrawMap(g,new Rectangle(x,y,Visual,Visual));
  }
  protected override void Dispose(bool disposing){if(disposing){hide.Dispose();runner.Dispose();titleFont.Dispose();bodyFont.Dispose();olderFont.Dispose();smallFont.Dispose();brandFont.Dispose();statusFont.Dispose();closeFont.Dispose();if(radar!=null)radar.Dispose();}base.Dispose(disposing);}
}

class DesktopPet : Form {
  [System.Runtime.InteropServices.DllImport("user32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string title);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,int message,IntPtr w,IntPtr l);
  readonly System.Windows.Forms.Timer animation=new System.Windows.Forms.Timer(),poll=new System.Windows.Forms.Timer();
  Bitmap sheet;DesktopPanel panel;NotifyIcon tray;Mutex singleton;EventWaitHandle openSignal;bool owns,dragging,moved,hover,wandering=true,animate=true,foreground=true,polling,busy;Point dragStart,start;double phase,x,y,vx=-0.45,vy=-0.22;int failures;string token="";bool preview,openOnStart;
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x80000|0x80;return p;}}
  public DesktopPet(bool previewOnly=false) {
    preview=previewOnly;Text="TecMon Companion · Desktop";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;ClientSize=new Size(144,164);StartPosition=FormStartPosition.Manual;AccessibleName="TecMon Desktop Companion";Cursor=Cursors.Hand;
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonBot"))if(stream!=null)using(var image=Image.FromStream(stream))sheet=new Bitmap(image);
    /* 3D-Figur: vorab aus der GLB gerenderte Bilder (36 Drehwinkel + LED-Gesichter). Fehlt die Ressource, bleibt die alte Figur. */
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonBot3D"))if(stream!=null)using(var image=Image.FromStream(stream))model=new Bitmap(image);
    if(model!=null)ClientSize=new Size(214,160);
    var area=Screen.PrimaryScreen.WorkingArea;Location=new Point(area.Right-Width-35,area.Bottom-Height-40);x=Left;y=Top;
    if(!preview){
      var config=TecMon.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(TecMon.Root,"installation.json")));
      openOnStart=config.ContainsKey("desktopOpenOnStart") && Convert.ToBoolean(config["desktopOpenOnStart"]);
      singleton=new Mutex(true,"Local\\TecMonDesktop-"+Convert.ToString(config["installationId"]),out owns);openSignal=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\TecMonDesktopOpen-"+Convert.ToString(config["installationId"]));
    }
    var menu=new ContextMenuStrip();
    statusItem=new ToolStripMenuItem("Status wird geprüft …"){Enabled=false};menu.Items.Add(statusItem);menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add("Einstellungen öffnen",null,(s,e)=>{Show();if(panel==null||panel.IsDisposed||!panel.Visible)Toggle();});
    menu.Items.Add("TecMon öffnen",null,(s,e)=>DesktopPanel.OpenExternal("https://tecmon.online"));
    menu.Items.Add("Videos-Ordner öffnen",null,async(s,e)=>{try{await Request("/api/videos/folder",true);}catch(Exception error){MessageBox.Show(error.Message,"TecMon");}});
    updateItem=new ToolStripMenuItem("Nach Updates suchen",null,async(s,e)=>await CheckUpdate(false));menu.Items.Add(updateItem);
    tipsItem=new ToolStripMenuItem("CS2-Rundentipps");tipsOn=new ToolStripMenuItem("Eingeschaltet",null,async(s,e)=>await ToggleTips());tipsItem.DropDownItems.Add(tipsOn);tipsItem.DropDownItems.Add(new ToolStripSeparator());menu.Items.Add(tipsItem);
    var figure=new ToolStripMenuItem("Figur");
    var fly=new ToolStripMenuItem("Umherfliegen"){Checked=true,CheckOnClick=true};fly.CheckedChanged+=(s,e)=>wandering=fly.Checked;figure.DropDownItems.Add(fly);
    var motion=new ToolStripMenuItem("Animation"){Checked=true,CheckOnClick=true};motion.CheckedChanged+=(s,e)=>{animate=motion.Checked;Render();};figure.DropDownItems.Add(motion);
    var top=new ToolStripMenuItem("Im Vordergrund"){Checked=true,CheckOnClick=true};top.CheckedChanged+=(s,e)=>{foreground=top.Checked;TopMost=foreground&&!busy;};figure.DropDownItems.Add(top);
    figure.DropDownItems.Add(new ToolStripSeparator());figure.DropDownItems.Add("Figur ausblenden",null,(s,e)=>Hide());menu.Items.Add(figure);
    var more=new ToolStripMenuItem("Mehr");more.DropDownItems.Add("Studio im Browser öffnen",null,(s,e)=>Process.Start(new ProcessStartInfo("http://127.0.0.1:31977"){UseShellExecute=true}));
    var webview=new ToolStripMenuItem("WebView2 von Microsoft installieren",null,(s,e)=>DesktopPanel.OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/"));more.DropDownItems.Add(webview);menu.Items.Add(more);
    menu.Opening+=(s,e)=>webview.Visible=!DesktopPanel.WebViewInstalled();
    menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Companion beenden",null,async(s,e)=>await Quit());ContextMenuStrip=menu;
    /* Gleicher Look für alle Untermenüs. */
    TecMonMenu.Apply(menu);foreach(ToolStripItem item in menu.Items){var sub=item as ToolStripMenuItem;if(sub!=null&&sub.HasDropDownItems){TecMonMenu.Apply(sub.DropDown);}}tipsItem.DropDownOpening+=(s,e)=>TecMonMenu.Apply(tipsItem.DropDown);
    if(!preview){tray=new NotifyIcon{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath),Text="TecMon Companion · Klick für Einstellungen",Visible=true,ContextMenuStrip=menu};tray.MouseClick+=(s,e)=>{if(e.Button==MouseButtons.Left){Show();Toggle();}};}
    MouseEnter+=(s,e)=>hover=true;MouseLeave+=(s,e)=>hover=false;
    MouseDown+=(s,e)=>{if(e.Button!=MouseButtons.Left)return;dragging=true;moved=false;dragStart=Cursor.Position;start=Location;Capture=true;};
    MouseMove+=(s,e)=>{if(!dragging)return;var delta=new Size(Cursor.Position.X-dragStart.X,Cursor.Position.Y-dragStart.Y);if(Math.Abs(delta.Width)+Math.Abs(delta.Height)>5)moved=true;if(moved){var bounds=Screen.FromPoint(Cursor.Position).WorkingArea;Location=Fit(new Point(start.X+delta.Width,start.Y+delta.Height),bounds,Size);x=Left;y=Top;if(panel!=null&&panel.Visible)AnchorPanel();}};
    MouseUp+=(s,e)=>{if(e.Button!=MouseButtons.Left||!dragging)return;dragging=false;Capture=false;if(!moved)Toggle();};
    KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape&&panel!=null)panel.Hide();else if(e.KeyCode==Keys.Enter||e.KeyCode==Keys.Space)Toggle();};
    /* Etwa 60 Bilder pro Sekunde; Bewegung nach vergangener Zeit statt pro Takt, damit sie gleichmäßig bleibt. */
    animation.Interval=15;animation.Tick+=(s,e)=>Tick();
    poll.Interval=1500;poll.Tick+=async(s,e)=>{if(openSignal!=null&&openSignal.WaitOne(0)){Show();Toggle();}if(polling)return;polling=true;try{var state=await State();failures=0;busy=Convert.ToBoolean(state["active"]);TopMost=foreground&&!busy;if(busy!=wasBusy){/* Waehrend Aufnahme/Download sichtbar bleiben, aber hinter CS2 und ohne Bewegung. */if(busy&&panel!=null)panel.Hide();if(tray!=null)tray.Text=busy?"TecMon Companion · Aufnahme läuft …":"TecMon Companion · Klick für Einstellungen";Render();}wasBusy=busy;ShowStatus(state);ShowTip(state);if(!updateChecked&&!busy){updateChecked=true;var ignored=CheckUpdate(true);}}catch(Exception error){if(statusItem!=null)statusItem.Text="○ Lokaler Dienst antwortet nicht";/* Nur beenden, wenn der lokale Dienst wirklich weg ist; ein langsamer Dienst waehrend der CS2-Aufnahme zaehlt nicht. */var web=error as System.Net.WebException;bool gone=web!=null&&web.Status==System.Net.WebExceptionStatus.ConnectFailure;if(gone?++failures>=3:++failures>=200)Close();}finally{polling=false;}};
    Shown+=(s,e)=>{if(!preview&&!owns){openSignal.Set();BeginInvoke(new Action(Close));return;}Render();animation.Start();if(!preview)poll.Start();if(openOnStart)Toggle();};
    FormClosed+=(s,e)=>{animation.Stop();poll.Stop();if(panel!=null)panel.Dispose();if(tip!=null)tip.Dispose();if(tray!=null)tray.Dispose();if(sheet!=null)sheet.Dispose();if(model!=null)model.Dispose();if(owns)singleton.ReleaseMutex();if(singleton!=null)singleton.Dispose();if(openSignal!=null)openSignal.Dispose();animation.Dispose();poll.Dispose();};
  }
  Bitmap model;double yaw,yawVel,clockLast,talkUntil,happyUntil,blinkAt=3,blinkUntil,pendingSince;bool watching;Action pendingTip;
  readonly Stopwatch clock=Stopwatch.StartNew();readonly Random random=new Random();const int CellW=200,CellH=130,Cols=7,Turns=36,Blink=36,Happy=37,TalkA=38,TalkB=39,Busy=41;
  void Tick(){
    double now=clock.Elapsed.TotalSeconds,dt=Math.Min(0.1,Math.Max(0,now-clockLast));clockLast=now;
    if(!Visible||busy)return;
    if(animate)phase+=dt*1.875;
    /* Erst zum Nutzer umdrehen, dann sprechen. */
    if(pendingTip!=null&&(model==null||!animate||Math.Abs(Turn(0))<8||now-pendingSince>2.5)){var show=pendingTip;pendingTip=null;show();}
    if(wandering&&animate&&!dragging&&!hover&&(panel==null||!panel.Visible)&&!ContextMenuStrip.Visible&&!Talking(now)&&pendingTip==null){var bounds=Screen.FromRectangle(Bounds).WorkingArea;x+=vx*dt*25;y+=vy*dt*25;if(x<bounds.Left||x+Width>bounds.Right)vx=-vx;if(y<bounds.Top||y+Height>bounds.Bottom)vy=-vy;var next=Fit(new Point((int)Math.Round(x),(int)Math.Round(y)),bounds,Size);if(next!=Location)Location=next;x=Math.Max(bounds.Left,Math.Min(bounds.Right-Width,x));y=Math.Max(bounds.Top,Math.Min(bounds.Bottom-Height,y));}
    if(model!=null&&animate){
      /* Gedämpfte Feder: weiches Anlaufen und Abbremsen beim Drehen. */
      double diff=Turn(Target(now));yawVel+=(diff*30-yawVel*11)*dt;yaw=((yaw+yawVel*dt)%360+360)%360;
      if(now>blinkAt){blinkUntil=now+0.14;blinkAt=now+2.5+random.NextDouble()*4;}
    }else if(model!=null){yaw=0;yawVel=0;}
    Render();
  }
  double Turn(double target){double d=((target-yaw)%360+540)%360-180;return d<=-179.9?180:d;}
  bool Talking(double now){return now<talkUntil;}
  /* Wohin die Figur schaut: Runde läuft → zum Spiel (Rücken zu dir), Tipp → zu dir, sonst in Flugrichtung und ab und zu zu dir. */
  double Target(double now){
    if(pendingTip!=null||Talking(now)||now<happyUntil)return 0;
    if(watching)return 180;
    if(dragging||hover||(panel!=null&&panel.Visible)||ContextMenuStrip.Visible||!wandering)return 0;
    return Math.Sin(now*0.31)>0.45?0:(vx>0?32:-32);
  }
  Bitmap Frame3D(){
    var bitmap=new Bitmap(Width,Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb);
    using(var g=Graphics.FromImage(bitmap)){
      g.Clear(Color.Transparent);g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;g.CompositingQuality=System.Drawing.Drawing2D.CompositingQuality.HighQuality;
      double now=clock.Elapsed.TotalSeconds;bool live=animate&&!busy;
      int index=((int)Math.Round(yaw/10)%Turns+Turns)%Turns;bool front=Math.Abs(Turn(0))<7;
      if(busy)index=Busy;
      else if(front){if(Talking(now)){int m=(int)(now*9)%4;index=m==1?TalkB:m==3?0:TalkA;}else if(now<happyUntil)index=Happy;else if(now<blinkUntil)index=Blink;}
      /* Schweben, leichtes Wiegen und Neigen in die Drehung; Teilpixel, damit nichts ruckelt. */
      float bob=live?(float)(Math.Sin(now*2.1)*5):0,roll=live?(float)(Math.Sin(now*1.4)*2.5+Math.Max(-7,Math.Min(7,yawVel*0.02))+Math.Max(-3,Math.Min(3,vx*4))):0;
      if(live&&Talking(now))bob-=(float)Math.Abs(Math.Sin(now*9))*1.6f;
      g.TranslateTransform(Width/2f,Height/2f+bob);g.RotateTransform(roll);
      g.DrawImage(model,new RectangleF(-CellW/2f,-CellH/2f,CellW,CellH),new RectangleF((index%Cols)*CellW,(index/Cols)*CellH,CellW,CellH),GraphicsUnit.Pixel);
    }
    return bitmap;
  }
  /* Vorschau ohne Fenster: Drehwinkel in Grad, Ausdruck als Bildnummer (-1 = automatisch). */
  public Bitmap Preview(double degrees,int face){yaw=degrees;var bitmap=Frame3D();if(face<0)return bitmap;bitmap.Dispose();double keep=yaw;yaw=0;if(face==Busy)busy=true;else if(face==Blink)blinkUntil=double.MaxValue;else if(face==Happy)happyUntil=double.MaxValue;else talkUntil=double.MaxValue;var result=Frame3D();yaw=keep;busy=false;blinkUntil=happyUntil=talkUntil=0;return result;}
  public bool HasModel{get{return model!=null;}}
  bool wasBusy,updateChecked,tipsEnabled;ToolStripMenuItem statusItem,updateItem,tipsItem,tipsOn;string featureSignature="";string offeredUpdate="";TipBubble tip;long lastTip=-1;
  static string TipTitle(string category){switch(category){case "economy":return "Wirtschaft";case "buy":return "Kauf-Check";case "death":return "Nach dem Tod";case "habit":return "Gewohnheit";case "mindset":return "Kopf frei";case "summary":return "Zusammenfassung";case "weapon":return "Waffe";case "map":return "Map";case "warmup":return "Aufwärmen";case "praise":return "Stark";case "history":return "Deine Matches";case "team":return "Team";default:return "Rundentipp";}}
  /* Neue Tipps aus der CS2 Game State Integration neben der Figur zeigen, nie während einer Demo-Aufnahme. */
  void ShowTip(Dictionary<string,object> state){
    object raw;var gsi=state.TryGetValue("gsi",out raw)?raw as Dictionary<string,object>:null;if(gsi==null)return;
    tipsEnabled=gsi.ContainsKey("enabled")&&Convert.ToBoolean(gsi["enabled"]);if(tipsOn!=null)tipsOn.Checked=tipsEnabled;
    SyncFeatures(gsi);
    watching=tipsEnabled&&gsi.ContainsKey("quiet")&&Convert.ToBoolean(gsi["quiet"]);
    if(watching){pendingTip=null;if(tip!=null&&!tip.IsDisposed)tip.Quiet();}
    object tipRaw;var current=gsi.TryGetValue("tip",out tipRaw)?tipRaw as Dictionary<string,object>:null;if(current==null)return;
    long id=Convert.ToInt64(current["id"]);if(id==lastTip)return;lastTip=id;
    if(busy||!tipsEnabled||Convert.ToInt64(current["age"])>20000)return;
    object picture;current.TryGetValue("visual",out picture);
    long round=current.ContainsKey("round")?Convert.ToInt64(current["round"]):-1;
    string title=TipTitle(current.ContainsKey("category")?Convert.ToString(current["category"]):""),text=Convert.ToString(current["text"])??"";var visualData=picture as Dictionary<string,object>;bool stack=FeatureOn(gsi,"stack");
    Action show=()=>{
      if(tip==null||tip.IsDisposed)tip=new TipBubble();var area=Screen.PrimaryScreen.WorkingArea;
      tip.Present(title,text,Visible?Bounds:new Rectangle(area.Right-180,area.Bottom-205,144,164),visualData,round,stack);
      /* Mund bewegt sich ungefähr so lange, wie man zum Lesen braucht (höchstens 6 s), danach kurz ein Lächeln. */
      double now=clock.Elapsed.TotalSeconds;talkUntil=now+Math.Min(6,1.2+text.Length*0.045);happyUntil=talkUntil+0.8;
    };
    if(model==null||!animate||!Visible){show();return;}
    pendingTip=show;pendingSince=clock.Elapsed.TotalSeconds;
  }
  /* Nicht gelieferte Funktionen gelten als an, wie im Companion. */
  static bool FeatureOn(Dictionary<string,object> gsi,string id){object raw;var list=gsi.TryGetValue("features",out raw)?raw as System.Collections.IList:null;if(list==null)return true;foreach(var entry in list){var feature=entry as Dictionary<string,object>;if(feature!=null&&Convert.ToString(feature["id"])==id)return Convert.ToBoolean(feature["enabled"]);}return true;}
  /* Optionen: jede Tipp-Art einzeln im Rechtsklick-Menü der Figur. */
  void SyncFeatures(Dictionary<string,object> gsi){
    object raw;var list=gsi.TryGetValue("features",out raw)?raw as System.Collections.IList:null;if(list==null||tipsItem==null)return;
    var signature=TecMon.Json.Serialize(list);if(signature==featureSignature)return;featureSignature=signature;
    while(tipsItem.DropDownItems.Count>2)tipsItem.DropDownItems.RemoveAt(2);
    foreach(var entry in list){var feature=entry as Dictionary<string,object>;if(feature==null)continue;string id=Convert.ToString(feature["id"]);bool on=Convert.ToBoolean(feature["enabled"]);
      var item=new ToolStripMenuItem(Convert.ToString(feature["label"])){Checked=on};
      item.Click+=async(s,e)=>{try{await Request("/api/gsi/features",true,"{\"features\":{\""+id+"\":"+(on?"false":"true")+"}}");}catch(Exception error){MessageBox.Show(error.Message,"TecMon");}};
      tipsItem.DropDownItems.Add(item);}
  }
  async Task ToggleTips(){
    try{
      var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request(tipsEnabled?"/api/gsi/disable":"/api/gsi/enable",true,tipsEnabled?"{}":"{\"confirm\":true}"));
      tipsEnabled=!tipsEnabled;tipsOn.Checked=tipsEnabled;
      if(tray!=null)tray.ShowBalloonTip(5000,"TecMon Companion",Convert.ToString(result["message"]),ToolTipIcon.Info);
    }catch(Exception error){MessageBox.Show("Rundentipps konnten nicht umgeschaltet werden. Wird CS2 auf diesem PC gefunden?\n\n"+error.Message,"TecMon");}
  }
  protected override void WndProc(ref Message message){if(message.Msg==0x8001){Show();Toggle();return;}base.WndProc(ref message);}
  public static Point Fit(Point point,Rectangle area,Size size){return new Point(Math.Max(area.Left,Math.Min(area.Right-size.Width,point.X)),Math.Max(area.Top,Math.Min(area.Bottom-size.Height,point.Y)));}
  void AnchorPanel(){var area=Screen.FromRectangle(Bounds).WorkingArea;var preferred=new Point(Left-panel.Width-12,Top-panel.Height+Height);bool onRight=preferred.X<area.Left;if(onRight)preferred.X=Right+12;panel.TailLeft=onRight;panel.Location=Fit(preferred,area,panel.Size);}
  public void Toggle(){if(panel==null||panel.IsDisposed)panel=new DesktopPanel();if(panel.Visible){panel.Hide();return;}AnchorPanel();panel.TopMost=foreground&&!busy;panel.Show(this);panel.Activate();}
  public Bitmap Frame(){if(model!=null)return Frame3D();var bitmap=new Bitmap(Width,Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.Transparent);g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;int emotion=busy?3:new[]{0,1,2,0,6,9}[(int)(phase/12)%6];int row=emotion/3;var heights=new[]{390,340,324,411};var tops=new[]{0,390,730,1040};var target=new Rectangle(5,8+(animate?(int)(Math.Sin(phase)*5):0),134,145);if(sheet!=null)g.DrawImage(sheet,target,new Rectangle((emotion%3)*361,tops[row],361,heights[row]),GraphicsUnit.Pixel);}return bitmap;}
  void Render(){if(!IsHandleCreated||!Visible)return;using(var bitmap=Frame())Layered.Push(this,bitmap,Location);}
  async Task<Dictionary<string,object>> State(){if(token==""){string html=await Request("/",false);token=System.Text.RegularExpressions.Regex.Match(html,"name=\"tecmon-token\" content=\"([^\"]+)\"").Groups[1].Value;if(token=="")throw new Exception("Lokale Sitzung fehlt.");}return TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/state",false));}
  async Task<string> Request(string route,bool post,string body="{}"){var request=(System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://127.0.0.1:31977"+route);request.Proxy=null;int timeout=route=="/api/update/install"?240000:route=="/api/update/check"?45000:8000;request.Timeout=timeout;request.ReadWriteTimeout=timeout;if(token!="")request.Headers["x-tecmon-token"]=token;if(post){request.Method="POST";request.ContentType="application/json";byte[] bytes=Encoding.UTF8.GetBytes(body);using(var stream=await request.GetRequestStreamAsync())await stream.WriteAsync(bytes,0,bytes.Length);}var pending=request.GetResponseAsync();if(await Task.WhenAny(pending,Task.Delay(timeout))!=pending){request.Abort();throw new TimeoutException("Lokaler Dienst antwortet nicht.");}using(var response=await pending)using(var reader=new StreamReader(response.GetResponseStream()))return await reader.ReadToEndAsync();}
  static int Count(Dictionary<string,object> parent,string key){object value;return parent!=null&&parent.TryGetValue(key,out value)&&value is System.Collections.ICollection?((System.Collections.ICollection)value).Count:0;}
  void ShowStatus(Dictionary<string,object> state){if(statusItem==null)return;object raw;var bridge=state.TryGetValue("bridge",out raw)?raw as Dictionary<string,object>:null;statusItem.Text=busy?"● Aufnahme läuft …":Count(bridge,"pending")>0?"● Verbindung bestätigen":Count(bridge,"devices")>0?"● Mit TecMon verbunden":"○ Noch nicht mit TecMon verbunden";}
  async Task CheckUpdate(bool silent){
    try{
      if(offeredUpdate!=""){
        if(MessageBox.Show("TecMon Companion auf "+offeredUpdate+" aktualisieren?\n\nVorher CS Demo Manager schließen. Nur Programmdateien werden ersetzt. Demos, Videos und Einstellungen bleiben erhalten.","TecMon Update",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        await Request("/api/update/install",true,"{\"confirm\":true}");return;
      }
      var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/update/check",true));
      if(Convert.ToBoolean(result["available"])){offeredUpdate=Convert.ToString(result["latest"]);updateItem.Text="Update "+offeredUpdate+" installieren";if(tray!=null&&silent)tray.ShowBalloonTip(6000,"TecMon Companion","Update "+offeredUpdate+" verfügbar. Rechtsklick auf die Figur → Update installieren.",ToolTipIcon.Info);if(!silent)await CheckUpdate(false);}
      else if(!silent)MessageBox.Show("Der Companion ist aktuell ("+Convert.ToString(result["current"])+").","TecMon");
    }catch(Exception error){if(!silent)MessageBox.Show(error.Message,"TecMon");}
  }
  async Task Quit(){try{var state=await State();if(Convert.ToBoolean(state["active"])){MessageBox.Show("Ein lokaler Auftrag läuft noch. Warte bis Download oder Aufnahme abgeschlossen ist.","TecMon");return;}await Request("/api/shutdown",true);Close();}catch(Exception error){MessageBox.Show(error.Message,"TecMon");}}
}
