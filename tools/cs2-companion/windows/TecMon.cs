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
    /* Seit 0.40 ohne PostgreSQL: nur ältere Installationen haben noch eine private Datenbank zu beenden. */
    if(!config.ContainsKey("clusterDir") || !config.ContainsKey("postgresBin")) return;
    var data=Path.GetFullPath(Convert.ToString(config["dataDir"]));
    var cluster=Path.GetFullPath(Convert.ToString(config["clusterDir"]));
    var bin=Path.GetFullPath(Convert.ToString(config["postgresBin"]));
    /* PostgreSQL oder Datenbank vom Nutzer entfernt: nichts zu beenden, das Update muss trotzdem laufen. */
    if(!File.Exists(Path.Combine(cluster,"PG_VERSION")) || !File.Exists(Path.Combine(bin,"pg_ctl.exe"))) return;
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
      if(check.ExitCode!=0) throw new Exception("Datenbankstatus konnte nicht geprüft werden. Companion schließen und erneut versuchen.");
    }
    var stop=Info(Path.Combine(bin,"pg_ctl.exe"),"stop","-D",cluster,"-m","fast","-w","-t","30"); stop.WorkingDirectory=target;
    using(var child=Process.Start(stop)) {
      if(!child.WaitForExit(40000) || child.ExitCode!=0) throw new Exception("Alte private TecMon-Datenbank konnte nicht sauber beendet werden. Companion schließen und erneut versuchen.");
    }
  }
  static readonly string[] UpdateFiles={"TecMon Companion.exe","tecmon-demo-rewriter.exe","README.md","dependency-manifest.json","THIRD-PARTY-NOTICES.txt","unpack-tools.ps1","Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll","WebView2-LICENSE.txt","WebView2-NOTICE.txt"};
  static string UpdatePath(string target, string name) {
    string relative=name.Replace('\\','/');
    bool allowed=relative.StartsWith("public/",StringComparison.Ordinal) || (!relative.Contains("/") &&
      (relative.EndsWith(".mjs",StringComparison.Ordinal) || UpdateFiles.Contains(relative)));
    string full=Path.GetFullPath(Path.Combine(target,relative.Replace('/','\\')));
    if(!allowed || !full.StartsWith(target+"\\",StringComparison.OrdinalIgnoreCase) || relative.Contains("..")) throw new Exception("Unzulässiger Update-Pfad: "+relative);
    return full;
  }
  public static void ApplyUpdate(string target, string parent, bool launch=true) {
    target=Path.GetFullPath(target).TrimEnd('\\');
    if(!File.Exists(Path.Combine(target,"tecmon-app.marker")) || !File.Exists(Path.Combine(target,"installation.json")))
      throw new Exception("Bitte den eingerichteten TecMon-Programmordner auswählen. Das Update richtet nichts neu ein.");
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
        if(zip.Entries.Count>200 || zip.Entries.Sum(e=>e.Length)>60L*1024*1024) throw new Exception("Update-Paket zu groß.");
        // Erst alle Pfade prüfen, dann schreiben: ein abgelehnter Eintrag darf kein halbes Update hinterlassen.
        foreach(var entry in zip.Entries) UpdatePath(target,entry.FullName);
        foreach(var entry in zip.Entries) {
          string relative=entry.FullName.Replace('\\','/');
          string full=UpdatePath(target,entry.FullName);
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
    /* Die installierte App als eigenen Prozess starten: der Updater selbst enthält keine Figur-Bilder (Größengrenze),
       ein Start im Updater-Prozess zeigte deshalb keine Figur (0.46.2). */
    if(launch) Process.Start(new ProcessStartInfo(Path.Combine(target,"TecMon Companion.exe")){WorkingDirectory=target,UseShellExecute=false});
  }
  public static void WriteUpdateResult(string target,string status,string message) {
    try {File.WriteAllText(Path.Combine(target,"update-result.json"),Json.Serialize(new { status=status,message=message,version="0.50.2",time=DateTime.UtcNow.ToString("o") }),new UTF8Encoding(false));} catch {}
  }
  public static void UpdateRegistration(string target) {
    using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TecMonCompanion",true)) {
      if(key==null || !String.Equals(Convert.ToString(key.GetValue("InstallLocation","")),target,StringComparison.OrdinalIgnoreCase))return;
      key.SetValue("DisplayVersion","0.50.2");key.SetValue("DisplayIcon",Path.Combine(target,"TecMon Companion.exe"));
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
      key.SetValue("DisplayName", "TecMon Companion"); key.SetValue("DisplayVersion", "0.50.2"); key.SetValue("Publisher", "TecMon");
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
  /* „Mit Windows starten“: nur der eigene Eintrag im Benutzer-Autostart (HKCU\…\Run), keine Aufgabenplanung, keine Adminrechte. */
  const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run",RunName="TecMon Companion";
  static string AutostartCommand(){return Q(Path.Combine(Root,"TecMon Companion.exe"));}
  public static bool AutostartOn(){using(var key=Registry.CurrentUser.OpenSubKey(RunKey))return key!=null&&Convert.ToString(key.GetValue(RunName,""))==AutostartCommand();}
  public static void SetAutostart(bool on){
    if(on&&!File.Exists(Path.Combine(Root,"TecMon Companion.exe")))return;
    using(var key=Registry.CurrentUser.CreateSubKey(RunKey)){if(on)key.SetValue(RunName,AutostartCommand());else if(key.GetValue(RunName)!=null)key.DeleteValue(RunName,false);}
  }
  public static void Uninstall() {
    if(!File.Exists(Path.Combine(Root,"tecmon-app.marker"))) throw new Exception("Kein gültiger TecMon-Programmordner.");
    if(MessageBox.Show("TecMon Companion und die mitgelieferten Programmdateien entfernen?\n\nDeine Demos, Videos und Einstellungen bleiben im gewählten Datenordner erhalten. Vorher den Companion beenden.","TecMon entfernen",MessageBoxButtons.YesNo,MessageBoxIcon.Question) != DialogResult.Yes) return;
    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TecMonCompanion",false);
    try{SetAutostart(false);}catch(Exception){}
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
      /* Echtzeit-3D-Figur prüfen: einige Winkel und Gesichter als PNG und die Zeit je Bild. */
      if(args.Length>1 && args[0]=="--desktop-preview-model") {using(var pet=new DesktopPet(true)){if(!pet.LoadFigureNow())throw new Exception("3D-Modell fehlt");int n=0;foreach(var spec in new[]{"0,-1","32.5,-1","90,-1","150,-1","180,-1","0,73","0,74","0,85","20,82"}){var parts=spec.Split(',');using(var frame=pet.Preview(double.Parse(parts[0],System.Globalization.CultureInfo.InvariantCulture),int.Parse(parts[1])))frame.Save(Path.Combine(args[1],"model-"+(n++)+".png"),System.Drawing.Imaging.ImageFormat.Png);}
        var watch=Stopwatch.StartNew();for(int i=0;i<120;i++)using(var frame=pet.Preview(i*3.1,-1)){}string timing="3D-Figur: "+(watch.Elapsed.TotalMilliseconds/120).ToString("0.0",System.Globalization.CultureInfo.InvariantCulture)+" ms je Bild, "+Environment.ProcessorCount+" Kerne";File.WriteAllText(Path.Combine(args[1],"timing.txt"),timing);Console.WriteLine(timing);}return 0;}
      if(args.Length>1 && args[0]=="--desktop-preview-3d") {using(var pet=new DesktopPet(true)){if(!pet.HasModel)throw new Exception("3D-Figur fehlt");int n=0;foreach(var spec in new[]{"0,-1","32.5,-1","90,-1","150,-1","180,-1","0,72","0,73","0,74","0,75","0,77","0,78","0,79","0,85","0,88","0,89"}){var parts=spec.Split(',');using(var frame=pet.Preview(double.Parse(parts[0]),int.Parse(parts[1])))frame.Save(Path.Combine(args[1],"pet-"+(n++)+".png"),System.Drawing.Imaging.ImageFormat.Png);}}using(var bubble=new TipBubble())using(var image=bubble.Preview("Kauf-Check","Volle Ausrüstung möglich: Rifle, Kevlar + Helm und zwei Granaten."))image.Save(Path.Combine(args[1],"bubble.png"),System.Drawing.Imaging.ImageFormat.Png);using(var pet=new DesktopPet(true))using(var menu=pet.BuildQuick(Point.Empty)){menu.Fit();using(var shot=new Bitmap(menu.Width,menu.Height)){menu.DrawToBitmap(shot,new Rectangle(0,0,menu.Width,menu.Height));shot.Save(Path.Combine(args[1],"menu.png"),System.Drawing.Imaging.ImageFormat.Png);}}using(var panel=new DesktopPanel()){panel.ClientSize=new Size(520,640);using(var shot=new Bitmap(panel.Width,panel.Height)){panel.DrawToBitmap(shot,new Rectangle(0,0,panel.Width,panel.Height));shot.Save(Path.Combine(args[1],"panel.png"),System.Drawing.Imaging.ImageFormat.Png);}}return 0;}
      if(args.Length>1 && args[0]=="--quick-preview") {using(var pet=new DesktopPet(true))using(var menu=pet.BuildQuick(Point.Empty)){menu.Status="● Mit TecMon verbunden";menu.Fit();using(var shot=new Bitmap(menu.Width,menu.Height)){menu.DrawToBitmap(shot,new Rectangle(0,0,menu.Width,menu.Height));shot.Save(args[1],System.Drawing.Imaging.ImageFormat.Png);}}return 0;}
      if(args.Length>1 && args[0]=="--desktop-preview") {using(var pet=new DesktopPet(true))using(var frame=pet.Frame())frame.Save(args[1],System.Drawing.Imaging.ImageFormat.Png);return 0;}
      if(args.Length>0 && args[0]=="--desktop-self-test") {var result=DesktopPet.Fit(new Point(5000,-5000),new Rectangle(-1920,0,1920,1080),new Size(144,164));if(result.X!=-144||result.Y!=0)throw new Exception("Desktop bounds failed");return 0;}
      if(args.Length > 1 && args[0] == "--setup-preview") {using(var form=new SetupWindow())form.Preview(args[1]);return 0;}
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
        if(MessageBox.Show("TecMon Companion auf 0.50.2 aktualisieren?\n\nVorher den Companion schließen. Nur Programmdateien werden ersetzt. Tools, Demos, Videos und Einstellungen bleiben erhalten.","TecMon Update",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes) ApplyUpdate(target,"");
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

/* Auswahlkarte im TecMon-Stil für den Setup-Assistenten: abgeschnittene Ecken, lila Rahmen, Gold für die aktive Wahl und den Fokus. */
class ChoiceCard : Control {
  public string Title="",Detail="",Badge="";public bool Radio;bool on,hot;
  public event EventHandler CheckedChanged;
  static readonly Color Muted=Color.FromArgb(178,170,198),Fill=Color.FromArgb(23,18,31);
  readonly Font titleFont=new Font("Segoe UI",11.5f,FontStyle.Bold),detailFont=new Font("Segoe UI",9.5f),badgeFont=new Font("Segoe UI",7.5f,FontStyle.Bold);
  public ChoiceCard(){
    SetStyle(ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.UserPaint|ControlStyles.ResizeRedraw|ControlStyles.Selectable,true);
    TabStop=true;Cursor=Cursors.Hand;BackColor=TecMon.Background;ForeColor=Color.White;AccessibleRole=AccessibleRole.CheckButton;
  }
  public bool Checked{get{return on;}set{if(on==value)return;on=value;AccessibleDescription=(on?"Ausgewählt. ":"")+Detail;Invalidate();if(CheckedChanged!=null)CheckedChanged(this,EventArgs.Empty);}}
  public void Pick(){
    if(Radio){if(on)return;if(Parent!=null)foreach(Control c in Parent.Controls){var other=c as ChoiceCard;if(other!=null&&other!=this&&other.Radio)other.Checked=false;}Checked=true;}
    else Checked=!on;
  }
  protected override void OnClick(EventArgs e){base.OnClick(e);Focus();Pick();}
  protected override void OnKeyDown(KeyEventArgs e){base.OnKeyDown(e);if(e.KeyCode==Keys.Space||e.KeyCode==Keys.Enter){Pick();e.Handled=true;}}
  protected override void OnMouseEnter(EventArgs e){base.OnMouseEnter(e);hot=true;Invalidate();}
  protected override void OnMouseLeave(EventArgs e){base.OnMouseLeave(e);hot=false;Invalidate();}
  protected override void OnGotFocus(EventArgs e){base.OnGotFocus(e);Invalidate();}
  protected override void OnLostFocus(EventArgs e){base.OnLostFocus(e);Invalidate();}
  protected override void OnTextChanged(EventArgs e){base.OnTextChanged(e);Invalidate();}
  internal static System.Drawing.Drawing2D.GraphicsPath Cut(RectangleF r,float c){var p=new System.Drawing.Drawing2D.GraphicsPath();p.AddPolygon(new[]{new PointF(r.Left+c,r.Top),new PointF(r.Right,r.Top),new PointF(r.Right,r.Bottom-c),new PointF(r.Right-c,r.Bottom),new PointF(r.Left,r.Bottom),new PointF(r.Left,r.Top+c)});return p;}
  protected override void OnPaint(PaintEventArgs e){
    var g=e.Graphics;g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;g.Clear(BackColor);
    var box=new RectangleF(1,1,Width-3,Height-3);
    using(var path=Cut(box,12)){
      using(var fill=new SolidBrush(on?Color.FromArgb(44,34,62):hot?Color.FromArgb(32,26,44):Fill))g.FillPath(fill,path);
      using(var pen=new Pen(on||Focused?TecMon.Gold:Color.FromArgb(hot?200:110,TecMon.Violet),on?2f:1.2f))g.DrawPath(pen,path);
    }
    /* Auswahlzeichen: Raute für eine Wahl aus mehreren, Kästchen für Mehrfachauswahl. */
    float mx=18,my=20;
    if(Radio){var diamond=new[]{new PointF(mx+8,my),new PointF(mx+16,my+8),new PointF(mx+8,my+16),new PointF(mx,my+8)};
      using(var pen=new Pen(on?TecMon.Gold:TecMon.Violet,1.6f))g.DrawPolygon(pen,diamond);
      if(on){var inner=new[]{new PointF(mx+8,my+4),new PointF(mx+12,my+8),new PointF(mx+8,my+12),new PointF(mx+4,my+8)};using(var fill=new SolidBrush(TecMon.Gold))g.FillPolygon(fill,inner);}}
    else{using(var pen=new Pen(on?TecMon.Gold:TecMon.Violet,1.6f))g.DrawRectangle(pen,mx,my,16,16);
      if(on)using(var pen=new Pen(TecMon.Gold,2.4f))g.DrawLines(pen,new[]{new PointF(mx+3.5f,my+8.5f),new PointF(mx+7,my+12),new PointF(mx+13,my+4.5f)});}
    int left=48,right=Width-18;
    if(Badge!=""){var size=TextRenderer.MeasureText(Badge,badgeFont);var badge=new Rectangle(right-size.Width-8,14,size.Width+8,20);
      using(var fill=new SolidBrush(Color.FromArgb(40,TecMon.Gold)))g.FillRectangle(fill,badge);
      TextRenderer.DrawText(g,Badge,badgeFont,badge,TecMon.Gold,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPrefix);right=badge.Left-8;}
    TextRenderer.DrawText(g,Title,titleFont,new Rectangle(left,14,right-left,26),on?TecMon.Gold:Color.White,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPrefix|TextFormatFlags.VerticalCenter);
    TextRenderer.DrawText(g,Detail,detailFont,new Rectangle(left,42,Width-left-18,Height-50),Muted,TextFormatFlags.WordBreak|TextFormatFlags.NoPrefix);
  }
  protected override void Dispose(bool disposing){if(disposing){titleFont.Dispose();detailFont.Dispose();badgeFont.Dispose();}base.Dispose(disposing);}
}

/*
 * Setup-Assistent (Nutzerwunsch 25.11.2026): wenige einfache Fragen statt einer Seite voller Pfade.
 * 1. Spiele, 2. mit Video-Aufnahme (Demo-Manager) oder nur Stats und Tipps (nur mit CS2), 3. Ansicht Einfach/Erweitert,
 * 4. Speicherort und Lizenzen (Ordner erst nach „Ordner ändern“), 5. Einrichtung. Die Antworten gehen als
 * `games`, `videoTools` und `ui` an install-backend.mjs (managed-installation.mjs).
 */
class SetupWindow : Form {
  TextBox app = new TextBox(), data = new TextBox(), demo = new TextBox(), game = new TextBox(), log = new TextBox();
  CheckBox accept = new CheckBox(); Button install = new Button(), back = new Button(); ProgressBar progress = new ProgressBar(); bool busy=false, complete=false;
  readonly List<Panel> pages=new List<Panel>();int page;
  readonly Label step=new Label(),heading=new Label(),lead=new Label(),summary=new Label(),cs2Hint=new Label();
  readonly ChoiceCard cs2=new ChoiceCard(),dota=new ChoiceCard(),wardogs=new ChoiceCard(),full=new ChoiceCard(),slim=new ChoiceCard(),simple=new ChoiceCard(),expert=new ChoiceCard();
  readonly Panel folders=new Panel();LinkLabel changeFolders;
  static readonly Color Muted=Color.FromArgb(178,170,198);
  const int PageGames=0,PagePurpose=1,PageView=2,PageFinish=3,PageInstall=4;
  public SetupWindow() {
    Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    Text="TecMon Companion · Installation"; Size=new Size(850,640); MinimumSize=new Size(850,640); StartPosition=FormStartPosition.CenterScreen; BackColor=TecMon.Background; ForeColor=Color.White; Font=new Font("Segoe UI",10); AutoScaleMode=AutoScaleMode.Dpi;
    Controls.Add(new Label { Text="TECMON  /  COMPANION SETUP", Left=32, Top=20, Width=560, Height=38, ForeColor=TecMon.Gold, Font=new Font("Segoe UI",20,FontStyle.Bold) });
    step.SetBounds(600,30,176,24);step.TextAlign=ContentAlignment.MiddleRight;step.ForeColor=TecMon.Violet;step.Font=new Font("Segoe UI",9,FontStyle.Bold);Controls.Add(step);
    heading.SetBounds(34,70,740,34);heading.Font=new Font("Segoe UI",15,FontStyle.Bold);Controls.Add(heading);
    lead.SetBounds(34,106,740,44);lead.ForeColor=Muted;Controls.Add(lead);
    app.Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","TecMon Companion");
    data.Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"TecMon","Data");
    game.Text=TecMon.DetectGame();
    /* Seite 1: Spiele */
    var games=Page();
    Card(games,cs2,"Counter-Strike 2","Highlight-Videos aus deinen Matches, Tipps in der Kaufzeit, Chat-Übersetzer und deine Stats auf TecMon.online.","",false,0,96);cs2.Checked=true;
    Card(games,dota,"Dota 2","Kurze Tipps in Pausen und nach deinem Tod.","",false,106,80);
    Card(games,wardogs,"Wardogs","Scoreboard-Foto per Tastendruck: deine Kills, Tode und dein Geld werden auf deinem PC ausgelesen.","",false,196,80);
    cs2.CheckedChanged+=(s,e)=>UpdateTexts();
    /* Seite 2: Video-Aufnahme ja oder nein */
    var purpose=Page();
    Card(purpose,full,"Videos und Stats (mit Demo-Manager)","TecMon lädt deine Demos, nimmt Highlight-Videos direkt in CS2 auf und wertet deine Matches aus. Dafür kommen zwei kostenlose Programme dazu (HLAE und FFmpeg), direkt vom Hersteller und vor dem Start geprüft.","EMPFOHLEN",true,0,128);full.Checked=true;
    Card(purpose,slim,"Nur Stats und Tipps (reine Auswertung)","Schlanker und schneller installiert: Rundentipps, Stats-Upload und Chat-Übersetzer, aber keine Video-Aufnahme. Die kannst du später in den Einstellungen mit einem Klick nachinstallieren.","",true,138,110);
    /* Seite 3: Ansicht */
    var view=Page();
    Card(view,simple,"Einfach","Nur das Wichtigste, mit kurzen Erklärungen. Beim ersten Start zeigt dir TecMon in einem kurzen Rundgang, wo du was findest.","EMPFOHLEN",true,0,110);simple.Checked=true;
    Card(view,expert,"Erweitert","Alle Optionen einzeln: jede Tipp-Art, Overlays, Configs, Clip-Puffer und mehr. Für alle, die genau wissen, was sie wollen.","",true,120,100);
    /* Seite 4: Zusammenfassung, Speicherort, Lizenzen */
    var finish=Page();
    summary.SetBounds(0,0,740,76);summary.ForeColor=Color.White;finish.Controls.Add(summary);
    cs2Hint.SetBounds(0,80,740,38);cs2Hint.ForeColor=TecMon.Gold;finish.Controls.Add(cs2Hint);
    changeFolders=new LinkLabel { Text="Speicherorte ändern …",Left=0,Top=136,Width=300,Height=24,LinkColor=TecMon.Violet,ActiveLinkColor=TecMon.Gold };
    changeFolders.LinkClicked+=(s,e)=>{folders.Visible=!folders.Visible;changeFolders.Text=folders.Visible?"Speicherorte ausblenden":"Speicherorte ändern …";PlaceConsent();};finish.Controls.Add(changeFolders);
    folders.SetBounds(0,164,746,160);folders.Visible=false;finish.Controls.Add(folders);
    Row(folders,"Programmordner",app,0,false); Row(folders,"Daten und Videos",data,40,false); Row(folders,"Demo-Ordner (optional)",demo,80,false); Row(folders,"CS2 · cs2.exe",game,120,true);
    game.TextChanged+=(s,e)=>UpdateTexts();
    accept.Text="Ich habe die Lizenzhinweise der enthaltenen Programme gelesen und akzeptiere sie";accept.ForeColor=Color.White;finish.Controls.Add(accept);
    var licenses=new LinkLabel { Text="Lizenzen und Paketversionen ansehen",Width=400,Height=24,LinkColor=TecMon.Gold,Name="licenses" }; licenses.LinkClicked+=(s,e)=>ShowLicenses(); finish.Controls.Add(licenses);
    PlaceConsent();
    /* Seite 5: Einrichtung */
    var running=Page();
    log.SetBounds(0,0,740,300); log.Multiline=true; log.ReadOnly=true; log.ScrollBars=ScrollBars.Vertical; log.BackColor=Color.FromArgb(21,22,35); log.ForeColor=Color.White; log.BorderStyle=BorderStyle.FixedSingle; log.Text="Einrichtung startet …"; running.Controls.Add(log);
    progress.SetBounds(0,316,740,10); running.Controls.Add(progress);
    back.SetBounds(34,541,140,40);back.Text="Zurück";back.FlatStyle=FlatStyle.Flat;back.FlatAppearance.BorderColor=TecMon.Violet;back.BackColor=TecMon.Background;back.ForeColor=Color.White;back.Click+=(s,e)=>Go(-1);Controls.Add(back);
    install.SetBounds(560,541,214,40); install.BackColor=TecMon.Gold; install.ForeColor=Color.Black; install.FlatStyle=FlatStyle.Flat; install.FlatAppearance.BorderColor=TecMon.Gold; install.Font=new Font("Segoe UI",10,FontStyle.Bold); install.Click+=async(s,e)=>await Next(); Controls.Add(install);
    AcceptButton=install;
    FormClosing+=(s,e)=> { if(busy) e.Cancel=true; };
    ShowPage(PageGames);
  }
  Panel Page(){var panel=new Panel{Left=34,Top=160,Width=746,Height=370,Visible=false,BackColor=TecMon.Background};pages.Add(panel);Controls.Add(panel);return panel;}
  void Card(Panel page,ChoiceCard card,string title,string detail,string badge,bool radio,int top,int height){card.Title=title;card.Detail=detail;card.Badge=badge;card.Radio=radio;card.AccessibleName=title;card.AccessibleDescription=detail;card.SetBounds(0,top,740,height);page.Controls.Add(card);}
  /* Seite 4 von oben nach unten: Zusammenfassung, CS2-Hinweis (nur wenn nötig), Speicherorte (aufklappbar), Lizenzen. */
  void PlaceConsent(){
    if(changeFolders==null)return;
    int y=summary.Bottom+4;cs2Hint.Visible=cs2Hint.Text!="";if(cs2Hint.Visible){cs2Hint.Top=y;y=cs2Hint.Bottom+4;}
    changeFolders.Top=y;y+=28;folders.Top=y;y=folders.Visible?folders.Bottom+8:y+4;
    accept.SetBounds(0,y,740,28);foreach(Control c in pages[PageFinish].Controls)if(c.Name=="licenses")c.SetBounds(20,y+28,400,24);
  }
  bool Cs2(){return cs2.Checked;}
  void UpdateTexts(){
    var chosen=new List<string>();if(cs2.Checked)chosen.Add("CS2");if(dota.Checked)chosen.Add("Dota 2");if(wardogs.Checked)chosen.Add("Wardogs");
    string video=!Cs2()?"ohne Video-Aufnahme":full.Checked?"mit Video-Aufnahme (Demo-Manager)":"nur Stats und Tipps, Video-Aufnahme später nachinstallierbar";
    summary.Text="Spiele: "+(chosen.Count>0?String.Join(", ",chosen.ToArray()):"keine")+"\nPaket: "+video+"\nAnsicht: "+(simple.Checked?"Einfach, mit kurzem Rundgang beim ersten Start":"Erweitert")+"\nSteam muss installiert sein."+(Cs2()&&full.Checked?" Die Einrichtung braucht ca. 1 GB freien Speicher.":"");
    cs2Hint.Text=Cs2()&&String.IsNullOrWhiteSpace(game.Text)?"CS2 wurde nicht automatisch gefunden. Unter „Speicherorte ändern“ kannst du die cs2.exe selbst wählen oder das später im Companion erledigen.":"";
    PlaceConsent();
  }
  void ShowPage(int index){
    page=index;for(int i=0;i<pages.Count;i++)pages[i].Visible=i==index;UpdateTexts();
    int total=Cs2()?4:3,number=index==PageGames?1:index==PagePurpose?2:index==PageView?(Cs2()?3:2):total;
    step.Text=index==PageInstall?"EINRICHTUNG":"SCHRITT "+number+" VON "+total;
    switch(index){
      case PageGames:heading.Text="Welche Spiele spielst du?";lead.Text="Wähle alles, wofür TecMon dir helfen soll. Du kannst später jederzeit Spiele hinzufügen oder entfernen.";break;
      case PagePurpose:heading.Text="Was soll TecMon für dich machen?";lead.Text="Möchtest du Highlight-Videos aus deinen CS2-Matches oder reichen dir Stats und Tipps?";break;
      case PageView:heading.Text="Wie viel möchtest du sehen?";lead.Text="Du kannst das jederzeit unter Einstellungen umstellen.";break;
      case PageFinish:heading.Text="Fast fertig";lead.Text="So richtet TecMon sich ein. Speicherorte musst du nur ändern, wenn du etwas Bestimmtes möchtest.";break;
      default:heading.Text=complete?"Fertig!":"TecMon wird eingerichtet …";lead.Text=complete?"Alles bereit. Beim ersten Start zeigt dir TecMon kurz, wo du was findest.":"Das dauert je nach Internet ein paar Minuten. Du kannst dieses Fenster offen lassen.";break;
    }
    back.Visible=index!=PageGames&&!(index==PageInstall&&(busy||complete));
    install.Text=index==PageFinish?"Installieren":index==PageInstall?(complete?"TecMon starten":"Erneut versuchen"):"Weiter";
    install.Enabled=!(index==PageInstall&&busy);
    var focus=index==PageGames?(Control)cs2:index==PagePurpose?(Control)(full.Checked?full:slim):index==PageView?(Control)(simple.Checked?simple:expert):install;
    if(focus.CanFocus)focus.Focus();
  }
  void Go(int direction){
    if(busy)return;int next=page==PageInstall&&direction<0?PageFinish:page+direction;
    if(next==PagePurpose&&!Cs2())next+=direction;
    if(next<PageGames)next=PageGames;ShowPage(next);
  }
  async Task Next(){
    if(page==PageGames&&!cs2.Checked&&!dota.Checked&&!wardogs.Checked){MessageBox.Show(this,"Bitte wähle mindestens ein Spiel.","TecMon Setup",MessageBoxButtons.OK,MessageBoxIcon.Information);return;}
    if(page<PageFinish){Go(1);return;}
    await Install();
  }
  void Row(Panel parent,string label, TextBox box, int y, bool exe) {
    parent.Controls.Add(new Label { Text=label,Left=0,Top=y+5,Width=190,Height=24,ForeColor=Muted });
    box.SetBounds(196,y,452,29); box.BackColor=Color.FromArgb(23,24,37); box.ForeColor=Color.White; box.BorderStyle=BorderStyle.FixedSingle; parent.Controls.Add(box);
    var browse=new Button { Text="Wählen …",Left=658,Top=y-1,Width=82,Height=31,FlatStyle=FlatStyle.Flat,BackColor=TecMon.Background,ForeColor=Color.White }; browse.FlatAppearance.BorderColor=TecMon.Violet; browse.Click+=(s,e)=> {
      if(exe) using(var d=new OpenFileDialog { Filter="CS2 (cs2.exe)|cs2.exe",Title="CS2 auf beliebigem Laufwerk wählen" }) { if(d.ShowDialog()==DialogResult.OK) box.Text=d.FileName; }
      else using(var d=new FolderBrowserDialog { Description=label+" · beliebiges Laufwerk",ShowNewFolderButton=true }) { if(d.ShowDialog()==DialogResult.OK) box.Text=d.SelectedPath; }
    }; parent.Controls.Add(browse);
  }
  void ShowLicenses() {
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonNotices")) using(var reader=new StreamReader(stream)) {
      var window=new Form { Text="TecMon · Lizenzhinweise",Size=new Size(760,620),StartPosition=FormStartPosition.CenterParent };
      window.Controls.Add(new TextBox { Text=reader.ReadToEnd(),Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill }); window.ShowDialog(this);
    }
  }
  /* Vorschau der Seiten als Bilder (--setup-preview), ohne zu installieren. */
  public void Preview(string folder){
    Opacity=0;Show();Application.DoEvents();
    for(int i=0;i<pages.Count;i++){
      if(i==PageFinish)folders.Visible=true;
      ShowPage(i);PlaceConsent();
      using(var shot=new Bitmap(ClientSize.Width,ClientSize.Height)){using(var g=Graphics.FromImage(shot))g.Clear(BackColor);Paint(this,shot,Point.Empty);shot.Save(Path.Combine(folder,"setup-"+i+".png"),System.Drawing.Imaging.ImageFormat.Png);}
    }
  }
  static void Paint(Control parent,Bitmap shot,Point offset){
    for(int k=parent.Controls.Count-1;k>=0;k--){var c=parent.Controls[k];if(!c.Visible||c.Width<1||c.Height<1)continue;var at=new Point(offset.X+c.Left,offset.Y+c.Top);
      using(var part=new Bitmap(c.Width,c.Height)){c.DrawToBitmap(part,new Rectangle(0,0,c.Width,c.Height));using(var g=Graphics.FromImage(shot))g.DrawImage(part,at);}
      if(c.Controls.Count>0)Paint(c,shot,at);}
  }
  async Task Install() {
    if(complete) { TecMon.Root=app.Text; Hide();using(var splash=new SplashWindow())splash.ShowDialog();Close();return; }
    if(!accept.Checked) { MessageBox.Show(this,"Bitte zuerst die Lizenzhinweise lesen und bestätigen.","TecMon Setup",MessageBoxButtons.OK,MessageBoxIcon.Information); if(page!=PageFinish)ShowPage(PageFinish); return; }
    string target, dataDir;
    try { target=Path.GetFullPath(app.Text).TrimEnd('\\'); dataDir=Path.GetFullPath(data.Text).TrimEnd('\\');
      if(dataDir.Equals(target,StringComparison.OrdinalIgnoreCase) || dataDir.StartsWith(target+"\\",StringComparison.OrdinalIgnoreCase)) throw new Exception("Der Datenordner muss außerhalb des Programmordners liegen.");
    } catch(Exception e) { MessageBox.Show(this,e.Message,"TecMon Setup"); if(page!=PageFinish)ShowPage(PageFinish); folders.Visible=true; PlaceConsent(); return; }
    var chosen=new List<string>();if(cs2.Checked)chosen.Add("cs2");if(dota.Checked)chosen.Add("dota2");if(wardogs.Checked)chosen.Add("wardogs");
    var options=TecMon.Json.Serialize(new { dataDir=dataDir,demoDir=demo.Text,cs2Exe=cs2.Checked?game.Text:"",acceptLicenses=true,games=chosen.ToArray(),videoTools=cs2.Checked&&full.Checked,ui=simple.Checked?"simple":"advanced" });
    busy=true; log.Text="Einrichtung startet …"; ShowPage(PageInstall); progress.Style=ProgressBarStyle.Marquee;
    bool success=false;
    try {
      await Task.Run(()=> {
        Action<string> report=message=>BeginInvoke((Action)(()=>log.AppendText(Environment.NewLine+message)));
        report("Vorhandene TecMon-Installation prüfen …"); TecMon.PrepareUpdate(target);
        report("Programmdateien entpacken …"); TecMon.Extract(target);
        report("Windows-Laufzeit prüfen …"); TecMon.EnsureRuntime(target);
        var info=TecMon.Info(Path.Combine(target,"runtime","node.exe"),Path.Combine(target,"install-backend.mjs")); info.WorkingDirectory=target;
        info.RedirectStandardInput=true; info.RedirectStandardOutput=true; info.RedirectStandardError=true; info.StandardOutputEncoding=Encoding.UTF8;
        using(var child=Process.Start(info)) {
          child.ErrorDataReceived+=(s,e)=> { /* Raw tool errors never go to the wizard log. */ }; child.BeginErrorReadLine();
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
      success=true; log.AppendText(Environment.NewLine+"Fertig. Desktop- und Startmenü-Verknüpfungen wurden angelegt."); complete=true;
    } catch(Exception error) { MessageBox.Show(this,error.Message,"TecMon Einrichtung",MessageBoxButtons.OK,MessageBoxIcon.Error); log.AppendText(Environment.NewLine+"Einrichtung noch nicht abgeschlossen. Mit „Zurück“ kannst du die Auswahl ändern und es erneut versuchen."); }
    finally { busy=false; progress.Style=ProgressBarStyle.Blocks; progress.Value=success?100:0; ShowPage(PageInstall); }
  }
}

// Native Windows desktop host. Only the authenticated loopback UI is embedded.
class DesktopPanel : Form {
  Control web;Label fallback=new Label();bool initialized;
  readonly Panel surface=new Panel(),chrome=new Panel();bool tailLeft;Point headerDrag,windowDrag;bool moving;
  public bool TailLeft {get{return tailLeft;}set{if(tailLeft==value)return;tailLeft=value;Shape();}}
  /* Höhe der Spitze im Fenster: zeigt immer auf die Figur. */
  int tailY=-1;public int TailY {get{return tailY;}set{int v=Math.Max(Edge+Cut+16,Math.Min(ClientSize.Height-Edge-Cut-16,value));if(v==tailY)return;tailY=v;Shape();}}
  /* Fenster am Kopf verschoben: die Figur zieht mit, damit beide zusammenbleiben. */
  public Action<int,int> Dragged;
  static readonly Color Violet=Color.FromArgb(167,139,250);
  /* Gleiche Form wie die Rundentipp-Sprechblase: abgeschrägte Ecken, Spitze zur Figur. grow > 0 vergrößert nach außen. */
  const int Edge=8,Tail=16,Cut=16;
  System.Drawing.Drawing2D.GraphicsPath Bubble(int grow){return Bubble(ClientSize,tailLeft,grow,tailY<0?ClientSize.Height-77:tailY);}
  public static System.Drawing.Drawing2D.GraphicsPath Bubble(Size size,bool left,int grow,int tailAt){
    float l=Edge+(left?Tail:0)-grow,t=Edge-grow,r=size.Width-1-Edge-(left?0:Tail)+grow,b=size.Height-1-Edge+grow,c=Cut+grow*0.42f,tip=Tail-2+grow,half=12+grow,ty=tailAt;var p=new List<PointF>();
    p.Add(new PointF(l+c,t));p.Add(new PointF(r-c,t));p.Add(new PointF(r,t+c));
    if(!left){p.Add(new PointF(r,ty-half));p.Add(new PointF(r+tip,ty));p.Add(new PointF(r,ty+half));}
    p.Add(new PointF(r,b-c));p.Add(new PointF(r-c,b));p.Add(new PointF(l+c,b));p.Add(new PointF(l,b-c));
    if(left){p.Add(new PointF(l,ty+half));p.Add(new PointF(l-tip,ty));p.Add(new PointF(l,ty-half));}
    p.Add(new PointF(l,t+c));
    var path=new System.Drawing.Drawing2D.GraphicsPath();path.AddPolygon(p.ToArray());return path;
  }
  void Shape(){if(ClientSize.Width<100)return;using(var path=Bubble(Edge-1)){var previous=Region;Region=new Region(path);if(previous!=null)previous.Dispose();}int x=Edge+(tailLeft?Tail:0)+14;int w=ClientSize.Width-2*Edge-Tail-28;chrome.SetBounds(x,Edge+10,w,42);surface.SetBounds(x,Edge+58,w,ClientSize.Height-2*Edge-72);Invalidate();}
  Button ChromeButton(string label,string accessible,Color color,Action action){var b=new Button{Text=label,AccessibleName=accessible,FlatStyle=FlatStyle.Flat,ForeColor=color,BackColor=Color.FromArgb(27,22,38),Font=new Font("Segoe UI",13),Size=new Size(34,30),Cursor=Cursors.Hand,TabStop=true};b.FlatAppearance.BorderSize=0;b.FlatAppearance.MouseOverBackColor=Color.FromArgb(47,36,64);b.Click+=(s,e)=>action();
    /* Abgeschnittene Ecken wie die Knöpfe im Fenster und auf tecmon.online. */
    using(var shape=CutRect(new RectangleF(0,0,b.Width,b.Height),7))b.Region=new Region(shape);
    b.Paint+=(s,e)=>{e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;using(var edge=CutRect(new RectangleF(0.5f,0.5f,b.Width-2f,b.Height-2f),6.5f))using(var pen=new Pen(Color.FromArgb(b.Focused||b.ClientRectangle.Contains(b.PointToClient(Cursor.Position))?255:140,color),1.2f))e.Graphics.DrawPath(pen,edge);};
    return b;}
  static System.Drawing.Drawing2D.GraphicsPath CutRect(RectangleF r,float c){var p=new System.Drawing.Drawing2D.GraphicsPath();p.AddPolygon(new[]{new PointF(r.Left+c,r.Top),new PointF(r.Right-c,r.Top),new PointF(r.Right,r.Top+c),new PointF(r.Right,r.Bottom-c),new PointF(r.Right-c,r.Bottom),new PointF(r.Left+c,r.Bottom),new PointF(r.Left,r.Bottom-c),new PointF(r.Left,r.Top+c)});return p;}
  /* Wie die Sprechblase: lila Schein, dunkle Fläche, goldener Rahmen und ein umlaufender Lichtstreifen. */
  protected override void OnPaintBackground(PaintEventArgs e){
    var g=e.Graphics;g.Clear(Color.FromArgb(11,10,17));g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
    using(var path=Bubble(0)){
      using(var glow=new Pen(Color.FromArgb(45,Violet),12))g.DrawPath(glow,path);
      using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(ClientRectangle,Color.FromArgb(27,22,38),Color.FromArgb(11,10,17),70))g.FillPath(fill,path);
      using(var glow=new Pen(Color.FromArgb(80,Violet),4))g.DrawPath(glow,path);
      using(var pen=new Pen(TecMon.Gold,1.8f))g.DrawPath(pen,path);
      TipBubble.Runner(g,path,runnerPhase);
    }
  }
  float runnerPhase;readonly System.Windows.Forms.Timer runner=new System.Windows.Forms.Timer{Interval=33};

  public DesktopPanel() {
    Text="TecMon · Verbindung & Einstellungen";ClientSize=new Size(520,640);MinimumSize=new Size(440,450);StartPosition=FormStartPosition.Manual;BackColor=TecMon.Background;ForeColor=Color.White;ShowInTaskbar=true;FormBorderStyle=FormBorderStyle.None;DoubleBuffered=true;KeyPreview=true;Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    surface.BackColor=Color.FromArgb(14,11,22);Controls.Add(surface);chrome.BackColor=Color.FromArgb(27,22,38);Controls.Add(chrome);
    var title=new Label{Text="TecMon",AutoSize=false,ForeColor=TecMon.Gold,Font=new Font("Segoe UI",10,FontStyle.Bold),TextAlign=ContentAlignment.MiddleLeft,Dock=DockStyle.Fill,Cursor=Cursors.SizeAll};chrome.Controls.Add(title);
    var close=ChromeButton("×","Sprechblase schließen",Color.FromArgb(251,113,133),()=>Hide());var collapse=ChromeButton("−","Sprechblase einklappen",Violet,()=>Hide());chrome.Controls.Add(close);chrome.Controls.Add(collapse);
    chrome.Resize+=(sender,args)=>{close.Location=new Point(chrome.Width-36,5);collapse.Location=new Point(chrome.Width-76,5);title.Width=Math.Max(100,chrome.Width-90);close.BringToFront();collapse.BringToFront();};
    title.MouseDown+=(sender,args)=>{if(args.Button!=MouseButtons.Left)return;moving=true;headerDrag=Cursor.Position;windowDrag=Location;title.Capture=true;};title.MouseMove+=(sender,args)=>{if(!moving)return;var point=DesktopPet.Fit(new Point(windowDrag.X+Cursor.Position.X-headerDrag.X,windowDrag.Y+Cursor.Position.Y-headerDrag.Y),Screen.FromPoint(Cursor.Position).WorkingArea,Size);int dx=point.X-Left,dy=point.Y-Top;Location=point;if(Dragged!=null&&(dx!=0||dy!=0))Dragged(dx,dy);};title.MouseUp+=(sender,args)=>{moving=false;title.Capture=false;};
    KeyDown+=(sender,args)=>{if(args.KeyCode==Keys.Escape)Hide();};Resize+=(sender,args)=>Shape();Shape();
    /* Lichtstreifen nur zeichnen, solange das Fenster offen ist; die eingebettete Seite bleibt davon unberührt. */
    runner.Tick+=(sender,args)=>{runnerPhase=(runnerPhase+0.006f)%1f;Invalidate(false);};VisibleChanged+=(sender,args)=>{if(Visible)runner.Start();else runner.Stop();};Disposed+=(sender,args)=>runner.Dispose();
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
      view.Source=new Uri("http://127.0.0.1:31977/?desktop=1"+startHash);
    }catch(Exception){if(web!=null){web.Dispose();web=null;}fallback.BringToFront();fallback.Text="Das eingebettete Fenster benötigt Microsoft Edge WebView2 Runtime.\n\nDie Figur bleibt verfügbar. Über das Rechtsklick-Menü kannst du das Studio im Browser öffnen oder zur offiziellen WebView2-Downloadseite wechseln.";}};
  }
  /* Zu einem Bereich der Seite springen (feste IDs), optional ein Spiel starten. */
  string startHash="";
  public void Jump(string id,string game){
    if(!System.Text.RegularExpressions.Regex.IsMatch(id,"^[a-z0-9-]+$")||!System.Text.RegularExpressions.Regex.IsMatch(game??"","^[a-z]*$"))return;
    string script=id=="tutorial"?"window.startTutorial&&window.startTutorial();":"document.getElementById('"+id+"')?.scrollIntoView({behavior:'smooth'});"+(string.IsNullOrEmpty(game)?"":"document.querySelector('[data-game="+game+"]')?.click();");
    if(web==null){startHash="#"+id;return;}
    try{dynamic view=web;if(view.CoreWebView2!=null)view.CoreWebView2.ExecuteScriptAsync(script);}catch(Exception){}
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
  public static void OpenExternal(string address) {Uri uri;if(!Uri.TryCreate(address,UriKind.Absolute,out uri))return;if(uri.Scheme!="https")return;if(!new[]{"tecmon.online","app.tecmon.app","github.com","developer.microsoft.com"}.Contains(uri.Host))return;Process.Start(new ProcessStartInfo(uri.AbsoluteUri){UseShellExecute=true});}
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
  /* Jeder Eintrag sieht aus wie ein Button: eigene Flaeche, Hover-Zustand, beim Druecken gibt er sichtbar nach. Mindesthoehe 32 px. */
  public static void Apply(ToolStripDropDown menu){menu.Renderer=new TecMonMenu();menu.Font=new Font("Segoe UI",10f);menu.Padding=new Padding(6,8,6,8);menu.ForeColor=Text;foreach(ToolStripItem item in menu.Items){if(item is ToolStripMenuItem){item.Padding=new Padding(4,6,4,6);item.Margin=new Padding(0,2,0,2);}}}
  static System.Drawing.Drawing2D.GraphicsPath Cut(RectangleF r,float c){var p=new System.Drawing.Drawing2D.GraphicsPath();p.AddPolygon(new[]{new PointF(r.Left+c,r.Top),new PointF(r.Right,r.Top),new PointF(r.Right,r.Bottom-c),new PointF(r.Right-c,r.Bottom),new PointF(r.Left,r.Bottom),new PointF(r.Left,r.Top+c)});return p;}
  static readonly Color Danger=Color.FromArgb(251,113,133);
  /* Ein-/Aus-Schalter (CheckOnClick oder Tag "toggle") schließen ihr Untermenü nicht. */
  public static void KeepOpenOnCheck(ToolStripMenuItem parent){
    if(parent==null)return;
    parent.DropDown.Closing+=(s,e)=>{
      if(e.CloseReason!=ToolStripDropDownCloseReason.ItemClicked)return;
      var hit=parent.DropDown.GetItemAt(parent.DropDown.PointToClient(Cursor.Position)) as ToolStripMenuItem;
      if(hit!=null&&!hit.HasDropDownItems&&(hit.CheckOnClick||Convert.ToString(hit.Tag)=="toggle"))e.Cancel=true;
    };
  }
  protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e){using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(e.AffectedBounds,Top,Bottom,90f))e.Graphics.FillRectangle(fill,e.AffectedBounds);}
  protected override void OnRenderImageMargin(ToolStripRenderEventArgs e){}
  protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e){
    var r=new Rectangle(0,0,e.ToolStrip.Width-1,e.ToolStrip.Height-1);
    using(var glow=new Pen(Color.FromArgb(70,Violet),3))e.Graphics.DrawRectangle(glow,new Rectangle(2,2,r.Width-4,r.Height-4));
    using(var gold=new Pen(TecMon.Gold,1.4f))e.Graphics.DrawRectangle(gold,r);
  }
  protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e){
    var item=e.Item as ToolStripMenuItem;if(item==null||!item.Enabled||item.Owner is MenuStrip)return;
    var g=e.Graphics;g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
    RectangleF r=new RectangleF(3,1,item.Width-7,item.Height-3);
    bool down=item.Pressed&&!item.HasDropDownItems,hot=item.Selected;
    /* Gedrueckt: 2 % kleiner (entspricht scale 0.96), nie weniger. */
    if(down)r=new RectangleF(r.X+r.Width*0.02f,r.Y+r.Height*0.04f,r.Width*0.96f,r.Height*0.92f);
    using(var path=Cut(r,6)){
      using(var fill=new SolidBrush(down?Color.FromArgb(95,Violet):hot?Color.FromArgb(60,Violet):Color.FromArgb(16,255,255,255)))g.FillPath(fill,path);
      using(var pen=new Pen(hot?Color.FromArgb(200,TecMon.Gold):Color.FromArgb(55,Violet),1f))g.DrawPath(pen,path);
    }
    if(hot)using(var bar=new SolidBrush(TecMon.Gold))g.FillRectangle(bar,r.Left+1,r.Top+5,3,r.Height-10);
  }
  protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e){bool danger=Convert.ToString(e.Item.Tag)=="danger";e.TextColor=!e.Item.Enabled?Muted:danger?Danger:e.Item.Selected?Color.White:Text;base.OnRenderItemText(e);}
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

/*
 * Echtzeit-3D-Figur ("High process"): kleiner Software-Renderer für das aus der GLB erzeugte Modell
 * (scripts/figure-3d/model.py, Ressource TecMonModel). Kein GPU-Zugriff, kein 3D-Framework: nur
 * Dreiecke mit Tiefenpuffer in ein Bild, das wie bisher per Pixel-Alpha (Layered.Push) erscheint.
 * Licht, Kamera und Tonemapping folgen scripts/figure-3d/index.html, damit beide Darstellungen gleich aussehen.
 */
sealed class FigureModel : IDisposable {
  public const int OutW=200,OutH=130;const int SS=2,W=OutW*SS,H=OutH*SS;
  float[] pos,nrm,uv,metal,rough;int[] index;int vertices;
  byte[] diffuse,emissive,texels;int tex;Rectangle box;string face="";
  readonly Dictionary<string,byte[]> patches=new Dictionary<string,byte[]>();readonly Dictionary<string,Bitmap> extras=new Dictionary<string,Bitmap>();
  /* Arbeitsspeicher je Bild, einmal angelegt. */
  readonly float[] depth=new float[W*H];readonly float[] cr=new float[W*H],cg=new float[W*H],cb=new float[W*H];readonly bool[] covered=new bool[W*H];readonly int[] tri=new int[W*H];readonly float[] bw0=new float[W*H],bw1=new float[W*H];
  float[] sx,sy,sz,er,eg,eb,qr,qg,qb,vm;readonly int[] output=new int[OutW*OutH];
  static readonly float[] Linear=new float[256];static readonly byte[] Encode=new byte[4097];
  static FigureModel(){
    for(int i=0;i<256;i++){double c=i/255.0;Linear[i]=(float)(c<=0.04045?c/12.92:Math.Pow((c+0.055)/1.055,2.4));}
    for(int i=0;i<=4096;i++){double c=i/4096.0;c=c<=0.0031308?c*12.92:1.055*Math.Pow(c,1/2.4)-0.055;Encode[i]=(byte)Math.Max(0,Math.Min(255,Math.Round(c*255)));}
  }
  public static FigureModel Load(Stream stream){
    var model=new FigureModel();
    using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)){
      foreach(var entry in zip.Entries){
        string name=entry.FullName;
        using(var raw=entry.Open())using(var memory=new MemoryStream()){raw.CopyTo(memory);memory.Position=0;
          if(name=="mesh.bin")model.ReadMesh(memory.ToArray());
          else if(name=="box.json"){var info=TecMon.Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(memory.ToArray()));var b=(System.Collections.ArrayList)info["box"];model.tex=Convert.ToInt32(info["tex"]);model.box=Rectangle.FromLTRB(Convert.ToInt32(b[0]),Convert.ToInt32(b[1]),Convert.ToInt32(b[2]),Convert.ToInt32(b[3]));}
          else if(name=="diffuse.png")model.diffuse=Rgb(memory);
          else if(name=="emissive.png")model.emissive=Rgb(memory);
          else if(name.StartsWith("face-")&&name.EndsWith(".png"))model.patches[name.Substring(5,name.Length-9)]=Rgb(memory);
          else if(name.StartsWith("extra-")&&name.EndsWith(".png"))using(var image=Image.FromStream(memory))model.extras[name.Substring(6,name.Length-10)]=new Bitmap(image);
        }
      }
    }
    if(model.index==null||model.diffuse==null||model.emissive==null||model.tex<=0||model.diffuse.Length!=model.tex*model.tex*3)throw new InvalidDataException("3D-Modell unvollständig");
    model.texels=new byte[model.tex*model.tex*6];
    for(int i=0;i<model.tex*model.tex;i++){Buffer.BlockCopy(model.diffuse,i*3,model.texels,i*6,3);Buffer.BlockCopy(model.emissive,i*3,model.texels,i*6+3,3);}
    model.diffuse=null;model.emissive=null;model.face="idle";return model;
  }
  void ReadMesh(byte[] data){
    if(data.Length<12||Encoding.ASCII.GetString(data,0,4)!="TMB1")throw new InvalidDataException("3D-Modell: falsches Format");
    vertices=BitConverter.ToInt32(data,4);int count=BitConverter.ToInt32(data,8);
    if(vertices<=0||vertices>200000||count<=0||count>600000||count%3!=0||data.Length!=12+vertices*40+count*4)throw new InvalidDataException("3D-Modell: falsche Größe");
    pos=new float[vertices*3];nrm=new float[vertices*3];uv=new float[vertices*2];metal=new float[vertices];rough=new float[vertices];index=new int[count];
    for(int i=0;i<vertices;i++){int o=12+i*40;
      for(int k=0;k<3;k++){pos[i*3+k]=BitConverter.ToSingle(data,o+k*4);nrm[i*3+k]=BitConverter.ToSingle(data,o+12+k*4);}
      uv[i*2]=BitConverter.ToSingle(data,o+24);uv[i*2+1]=BitConverter.ToSingle(data,o+28);metal[i]=BitConverter.ToSingle(data,o+32);rough[i]=BitConverter.ToSingle(data,o+36);}
    int start=12+vertices*40;
    for(int i=0;i<count;i++){int v=BitConverter.ToInt32(data,start+i*4);if(v<0||v>=vertices)throw new InvalidDataException("3D-Modell: falscher Index");index[i]=v;}
    sx=new float[vertices];sy=new float[vertices];sz=new float[vertices];er=new float[vertices];eg=new float[vertices];eb=new float[vertices];qr=new float[vertices];qg=new float[vertices];qb=new float[vertices];vm=new float[vertices];
  }
  static byte[] Rgb(Stream stream){
    using(var image=Image.FromStream(stream))using(var bitmap=new Bitmap(image.Width,image.Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb)){
      using(var g=Graphics.FromImage(bitmap))g.DrawImage(image,0,0,image.Width,image.Height);
      var data=bitmap.LockBits(new Rectangle(0,0,bitmap.Width,bitmap.Height),System.Drawing.Imaging.ImageLockMode.ReadOnly,System.Drawing.Imaging.PixelFormat.Format32bppArgb);
      var argb=new int[bitmap.Width*bitmap.Height];System.Runtime.InteropServices.Marshal.Copy(data.Scan0,argb,0,argb.Length);bitmap.UnlockBits(data);
      var rgb=new byte[argb.Length*3];for(int i=0;i<argb.Length;i++){int c=argb[i];rgb[i*3]=(byte)(c>>16);rgb[i*3+1]=(byte)(c>>8);rgb[i*3+2]=(byte)c;}
      return rgb;
    }
  }
  public bool HasFace(string name){return patches.ContainsKey(name);}
  /* Gesicht wechseln: nur den Visier-Ausschnitt der Textur ersetzen (links Farbe, rechts Leuchten). */
  public void SetFace(string name){
    byte[] patch;if(name==face||!patches.TryGetValue(name,out patch))return;face=name;
    int w=box.Width,h=box.Height;if(patch.Length!=w*2*h*3)return;
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){int t=((box.Top+y)*tex+box.Left+x)*6,d=(y*w*2+x)*3,e=d+w*3;texels[t]=patch[d];texels[t+1]=patch[d+1];texels[t+2]=patch[d+2];texels[t+3]=patch[e];texels[t+4]=patch[e+1];texels[t+5]=patch[e+2];}
  }
  public Bitmap Extra(string name){Bitmap b;return extras.TryGetValue(name,out b)?b:null;}

  /* Licht wie index.html (Helligkeit 0.3): Himmel/Boden, Haupt-, Rand- und Fülllicht; Farben linear. */
  static float Lin(int c){return Linear[c];}
  static readonly float[] Sky={Lin(0xe6),Lin(0xdc),Lin(0xff)},Ground={Lin(0x3a),Lin(0x30),Lin(0x50)};
  const float HemiI=1.64f,Exposure=1.22f,EmissiveI=1.8f;
  static readonly float[][] Lights={Light(2,3,4,0xff,0xff,0xff,2.9f),Light(-3,2,-3,0xa7,0x8b,0xfa,2.2f),Light(-3,0.5,3,0xff,0xe2,0xa8,1.04f)};
  static float[] Light(double x,double y,double z,int r,int g,int b,float i){double l=Math.Sqrt(x*x+y*y+z*z);return new[]{(float)(x/l),(float)(y/l),(float)(z/l),Lin(r)*i,Lin(g)*i,Lin(b)*i};}
  /* Umgebungslicht (RoomEnvironment, Stärke 0.255) als gleichmäßiger Anteil. */
  public float Ambient=0.40f,EnvSpec=0.85f;

  /* Kamera: Blickwinkel 22°, Position (0, 0.1, 5.6) auf den Ursprung; Ausschnitt wie sheet.py (CROP 6,70,378,312 von 384). */
  const double Fov=22,CamY=0.1,CamZ=5.6,Shot=384,CropX=6,CropY=70,CropW=372,CropH=242,Lift=-0.635;
  /* yaw/pitch in Grad: Drehung wie pivot.rotation.set(pitch, yaw, 0) in index.html. */
  public Bitmap Render(double yawDeg,double pitchDeg){
    double yaw=yawDeg*Math.PI/180,pitch=pitchDeg*Math.PI/180,cy=Math.Cos(yaw),sy_=Math.Sin(yaw),cp=Math.Cos(pitch),sp=Math.Sin(pitch);
    double camLen=Math.Sqrt(CamY*CamY+CamZ*CamZ),zy=CamY/camLen,zz=CamZ/camLen;/* z-Achse der Kamera; x-Achse = (1,0,0); y-Achse = (0, zz, -zy) */
    double focal=1/Math.Tan(Fov*Math.PI/360),scaleX=W/CropW,scaleY=H/CropH;
    for(int i=0;i<vertices;i++){
      double x=pos[i*3],y=pos[i*3+1]+Lift,z=pos[i*3+2];
      /* Erst um y (yaw), dann um x (pitch). */
      double x1=x*cy+z*sy_,z1=-x*sy_+z*cy,y2=y*cp-z1*sp,z2=y*sp+z1*cp;
      double nx=nrm[i*3],ny=nrm[i*3+1],nz=nrm[i*3+2];double nx1=nx*cy+nz*sy_,nz1=-nx*sy_+nz*cy,ny2=ny*cp-nz1*sp,nz2=ny*sp+nz1*cp;
      double dx=x1,dy=y2-CamY,dz=z2-CamZ;double xc=dx,yc=dy*zz-dz*zy,zc=dy*zy+dz*zz;
      double px=(xc/-zc*focal+1)/2*Shot,py=(1-yc/-zc*focal)/2*Shot;
      sx[i]=(float)((px-CropX)*scaleX);sy[i]=(float)((py-CropY)*scaleY);sz[i]=(float)-zc;
      /* Zur Kamera zeigende Seite beleuchten (beidseitiges Material). */
      double vx=-dx,vy=-dy,vz=-dz,vl=Math.Sqrt(vx*vx+vy*vy+vz*vz);vx/=vl;vy/=vl;vz/=vl;
      if(nx1*vx+ny2*vy+nz2*vz<0){nx1=-nx1;ny2=-ny2;nz2=-nz2;}
      double w=0.5*ny2+0.5;float hr=(float)((Ground[0]+(Sky[0]-Ground[0])*w)*HemiI),hg=(float)((Ground[1]+(Sky[1]-Ground[1])*w)*HemiI),hb=(float)((Ground[2]+(Sky[2]-Ground[2])*w)*HemiI);
      double r=Math.Max(0.06,rough[i]),a2=r*r*r*r;float sr=0,sg=0,sb=0;
      foreach(var l in Lights){
        double nl=nx1*l[0]+ny2*l[1]+nz2*l[2];if(nl<=0)continue;
        hr+=(float)(l[3]*nl);hg+=(float)(l[4]*nl);hb+=(float)(l[5]*nl);
        double hx=l[0]+vx,hy=l[1]+vy,hz=l[2]+vz,hl=Math.Sqrt(hx*hx+hy*hy+hz*hz);hx/=hl;hy/=hl;hz/=hl;
        double nh=Math.Max(0,nx1*hx+ny2*hy+nz2*hz),nv=Math.Max(1e-3,nx1*vx+ny2*vy+nz2*vz),d=nh*nh*(a2-1)+1;
        double D=a2/(Math.PI*d*d),k=a2/2,V=0.25/((nl*(1-k)+k)*(nv*(1-k)+k));double s=D*V*nl;
        sr+=(float)(l[3]*s);sg+=(float)(l[4]*s);sb+=(float)(l[5]*s);
      }
      float m=metal[i];vm[i]=m;
      er[i]=(float)(hr/Math.PI)+Ambient;eg[i]=(float)(hg/Math.PI)+Ambient;eb[i]=(float)(hb/Math.PI)+Ambient;
      float env=(float)(EnvSpec*(1-r*0.6));qr[i]=sr+env;qg[i]=sg+env;qb[i]=sb+env;
    }
    /* Bild in waagerechte Streifen teilen; jeder Kern zeichnet seinen Streifen. */
    int bands=Math.Max(1,Math.Min(4,Environment.ProcessorCount-1));
    System.Threading.Tasks.Parallel.For(0,bands,k=>{
      int top=H*k/bands,bottom=H*(k+1)/bands;
      for(int i=top*W;i<bottom*W;i++){depth[i]=float.MaxValue;tri[i]=-1;}
      for(int t=0;t<index.Length;t+=3)Triangle(t,top,bottom-1);
      /* Erst sichtbare Dreiecke bestimmen, dann jedes Pixel nur einmal schattieren. */
      for(int p=top*W;p<bottom*W;p++){int t=tri[p];covered[p]=t>=0;if(t>=0)Shade(p,index[t],index[t+1],index[t+2],bw0[p],bw1[p]);}
    });
    /* 2×2 Abtastungen je Pixel: weiche Kanten, vormultipliertes Alpha. */
    for(int y=0;y<OutH;y++)for(int x=0;x<OutW;x++){
      int n=0;float r=0,g=0,b=0;
      for(int j=0;j<SS;j++)for(int i=0;i<SS;i++){int p=(y*SS+j)*W+x*SS+i;if(!covered[p])continue;n++;r+=cr[p];g+=cg[p];b+=cb[p];}
      int o=y*OutW+x;if(n==0){output[o]=0;continue;}
      /* Tonemapping erst nach dem Mitteln: ein Viertel der Rechenarbeit, an Kanten kaum ein Unterschied. */
      float k=1f/n;r*=k;g*=k;b*=k;Aces(ref r,ref g,ref b);int al=n*255/(SS*SS);
      output[o]=(int)((uint)al<<24)|((Encode[Tone(r)]*al/255)<<16)|((Encode[Tone(g)]*al/255)<<8)|(Encode[Tone(b)]*al/255);
    }
    var bitmap=new Bitmap(OutW,OutH,System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
    var data=bitmap.LockBits(new Rectangle(0,0,OutW,OutH),System.Drawing.Imaging.ImageLockMode.WriteOnly,System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
    System.Runtime.InteropServices.Marshal.Copy(output,0,data.Scan0,output.Length);bitmap.UnlockBits(data);
    return bitmap;
  }
  /* Farbwerte sind schon tonemapped und linear; hier nur in den LUT-Bereich. */
  static int Tone(float v){return v<=0?0:v>=1?4096:(int)(v*4096);}
  /* Rückseiten auslassen: die Hülle ist geschlossen, verdeckte Innenflächen sieht man nie. */
  public bool Cull=true;
  void Triangle(int t,int top,int bottom){
    int a=index[t],b=index[t+1],c=index[t+2];
    float ax=sx[a],ay=sy[a],bx=sx[b],by=sy[b],cx=sx[c],cy=sy[c];
    float area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.Abs(area)<1e-6f||(Cull&&area>0))return;
    int x0=Math.Max(0,(int)Math.Floor(Math.Min(ax,Math.Min(bx,cx)))),x1=Math.Min(W-1,(int)Math.Ceiling(Math.Max(ax,Math.Max(bx,cx))));
    int y0=Math.Max(top,(int)Math.Floor(Math.Min(ay,Math.Min(by,cy)))),y1=Math.Min(bottom,(int)Math.Ceiling(Math.Max(ay,Math.Max(by,cy))));
    if(x0>x1||y0>y1)return;
    float inv=1/area,za=sz[a],zb=sz[b],zc=sz[c];
    /* Kantenfunktionen schrittweise: je Pixel nach rechts nur eine Addition. */
    float s0x=-(cy-by)*inv,s1x=-(ay-cy)*inv;
    for(int y=y0;y<=y1;y++){float py=y+0.5f,px=x0+0.5f;
      float w0=((bx-px)*(cy-py)-(by-py)*(cx-px))*inv,w1=((cx-px)*(ay-py)-(cy-py)*(ax-px))*inv;int p=y*W+x0;
      for(int x=x0;x<=x1;x++,p++,w0+=s0x,w1+=s1x){
        float w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;
        float z=w0*za+w1*zb+w2*zc;if(z>=depth[p])continue;depth[p]=z;tri[p]=t;bw0[p]=w0;bw1[p]=w1;
      }
    }
  }
  void Shade(int p,int a,int b,int c,float w0,float w1){
        float w2=1-w0-w1;
        float u=w0*uv[a*2]+w1*uv[b*2]+w2*uv[c*2],v=w0*uv[a*2+1]+w1*uv[b*2+1]+w2*uv[c*2+1];
        /* Bilinear, Ursprung oben links (flipY=false wie in index.html); Farbe und Leuchten liegen nebeneinander. */
        float fx=u*tex-0.5f,fy=v*tex-0.5f;int ix=(int)fx,iy=(int)fy;if(fx<0)ix--;if(fy<0)iy--;float ax=fx-ix,ay=fy-iy;
        int x0=ix<0?0:ix>=tex?tex-1:ix,x1=ix+1<0?0:ix+1>=tex?tex-1:ix+1,y0=iy<0?0:iy>=tex?tex-1:iy,y1=iy+1<0?0:iy+1>=tex?tex-1:iy+1;
        int p00=(y0*tex+x0)*6,p10=(y0*tex+x1)*6,p01=(y1*tex+x0)*6,p11=(y1*tex+x1)*6;
        float w00=(1-ax)*(1-ay),w10=ax*(1-ay),w01=(1-ax)*ay,w11=ax*ay;var t=texels;var L=Linear;
        float dr=L[t[p00]]*w00+L[t[p10]]*w10+L[t[p01]]*w01+L[t[p11]]*w11,dg=L[t[p00+1]]*w00+L[t[p10+1]]*w10+L[t[p01+1]]*w01+L[t[p11+1]]*w11,db=L[t[p00+2]]*w00+L[t[p10+2]]*w10+L[t[p01+2]]*w01+L[t[p11+2]]*w11;
        float mr=L[t[p00+3]]*w00+L[t[p10+3]]*w10+L[t[p01+3]]*w01+L[t[p11+3]]*w11,mg=L[t[p00+4]]*w00+L[t[p10+4]]*w10+L[t[p01+4]]*w01+L[t[p11+4]]*w11,mb=L[t[p00+5]]*w00+L[t[p10+5]]*w10+L[t[p01+5]]*w01+L[t[p11+5]]*w11;
        float m=w0*vm[a]+w1*vm[b]+w2*vm[c],dm=1-m;
        float Er=w0*er[a]+w1*er[b]+w2*er[c],Eg=w0*eg[a]+w1*eg[b]+w2*eg[c],Eb=w0*eb[a]+w1*eb[b]+w2*eb[c];
        float Qr=w0*qr[a]+w1*qr[b]+w2*qr[c],Qg=w0*qg[a]+w1*qg[b]+w2*qg[c],Qb=w0*qb[a]+w1*qb[b]+w2*qb[c];
        float r=dr*dm*Er+(0.04f*dm+dr*m)*Qr+mr*EmissiveI,g=dg*dm*Eg+(0.04f*dm+dg*m)*Qg+mg*EmissiveI,bl=db*dm*Eb+(0.04f*dm+db*m)*Qb+mb*EmissiveI;
        cr[p]=r;cg[p]=g;cb[p]=bl;
  }
  /* ACES Filmic wie three.js (ACESFilmicToneMapping). */
  static void Aces(ref float r,ref float g,ref float b){
    float k=Exposure/0.6f;r*=k;g*=k;b*=k;
    float ir=0.59719f*r+0.35458f*g+0.04823f*b,ig=0.07600f*r+0.90834f*g+0.01566f*b,ib=0.02840f*r+0.13383f*g+0.83777f*b;
    ir=Fit(ir);ig=Fit(ig);ib=Fit(ib);
    r=1.60475f*ir-0.53108f*ig-0.07367f*ib;g=-0.10208f*ir+1.10813f*ig-0.00605f*ib;b=-0.00327f*ir-0.07276f*ig+1.07602f*ib;
  }
  static float Fit(float v){float a=v*(v+0.0245786f)-0.000090537f,d=v*(0.983729f*v+0.4329510f)+0.238081f;return a/d;}
  public void Dispose(){foreach(var b in extras.Values)b.Dispose();extras.Clear();}
}

/*
 * Fadenkreuz-Overlay: eigenes, durchklickbares Fenster (WS_EX_TRANSPARENT) außerhalb
 * von CS2, nie aktiviert, nimmt keinen Fokus. Kein Hook, keine Injektion, keine Eingaben.
 * Unabhaengig von Spiel-Paketen: aktives Client-Fenster oder Bildschirm, optional App-Filter.
 * Gezeichnet per Pixel-Alpha (Layered.Push), keine exklusive Vollbild-Unterstuetzung.
 */
/*
 * Chat-Overlay: uebersetzte CS2-Chatzeilen als eigenes, durchklickbares Fenster ueber der Stelle des
 * CS2-Chats (links unten). Wie das Fadenkreuz-Overlay nur im Vollbild-Fenstermodus mit CS2 vorn,
 * nie aktiviert, kein Eingriff ins Spiel. Die Zeilen kommen aus /api/state (chat.lines).
 */
class ChatOverlay : Form {
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int SetWindowLong(IntPtr window,int index,int value);
  readonly System.Windows.Forms.Timer check=new System.Windows.Forms.Timer{Interval=250};
  System.Collections.IList lines;string drawn="",header="";bool wanted,warn,moving,dragging;Point grab;Size shown;
  /* Linke untere Ecke des Overlays in Bildschirmkoordinaten (auch auf einem zweiten Bildschirm); null = Standard unten mittig. */
  public Point? Anchor;
  /* Meldet die neue Position nach dem Verschieben, damit die Figur sie in desktop.json speichert. */
  public Action<Point?> Moved;
  /* Chat-Fenster (Nutzerwunsch 22.11.2026): fängt in seiner Fläche die Maus (nie den Fokus), lässt sich jederzeit ziehen,
     steht auf jedem Bildschirm, aber nur solange CS2 läuft. Sonst das durchklickbare Overlay über dem Spiel. */
  public bool Free;bool cs2Running;DateTime cs2Checked=DateTime.MinValue;
  bool Cs2Running(){if((DateTime.Now-cs2Checked).TotalSeconds>=2){cs2Checked=DateTime.Now;try{var found=System.Diagnostics.Process.GetProcessesByName("cs2");cs2Running=found.Length>0;foreach(var p in found)p.Dispose();}catch{cs2Running=false;}}return cs2Running;}
  protected override bool ShowWithoutActivation {get{return true;}}
  /* WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT (durchklickbar, außer beim Verschieben) */
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80|0x8|0x80000|0x20;return p;}}
  public ChatOverlay(){Text="TecMon Chat";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;TopMost=true;Size=new Size(10,10);check.Tick+=(s,e)=>Update2();}
  public bool Moving {get{return moving;}}
  public void Apply(bool on,System.Collections.IList next,string head,bool warning){Apply(on,next,head,warning,false);}
  /* Aussehen aus den Einstellungen (Nutzerwunsch 22.11.2026): Breite in %, Schrift in px bei 1080p, Farbe als feste Hex-Farbe, Hintergrund in %. */
  int lookWidth=30,lookFont=15,lookBackground=30;Color lookColor=Color.FromArgb(255,243,241,247);
  public void SetLook(Dictionary<string,object> look){
    if(look==null)return;
    int w=Num(look,"width",30,15,70),f=Num(look,"font",15,10,32),b=Num(look,"background",30,0,100);Color c=lookColor;
    string hex=Str(look,"color");if(hex.Length==6){try{c=Color.FromArgb(255,Convert.ToInt32(hex.Substring(0,2),16),Convert.ToInt32(hex.Substring(2,2),16),Convert.ToInt32(hex.Substring(4,2),16));}catch{}}
    if(w!=lookWidth||f!=lookFont||b!=lookBackground||c!=lookColor){lookWidth=w;lookFont=f;lookBackground=b;lookColor=c;drawn="";}
  }
  static int Num(Dictionary<string,object> d,string k,int fallback,int min,int max){object v;if(d==null||!d.TryGetValue(k,out v)||v==null)return fallback;try{return Math.Min(max,Math.Max(min,Convert.ToInt32(v)));}catch{return fallback;}}
  public void Apply(bool on,System.Collections.IList next,string head,bool warning,bool free){if(free!=Free){Free=free;drawn="";if(!moving)ClickThrough(!free);}wanted=on;lines=next;header=head??"";warn=warning;if(wanted||moving)check.Start();else{check.Stop();if(Visible)Hide();}Update2();}
  /* Verschieben: Fenster fängt kurz die Maus (nie den Fokus), zeigt Beispielzeilen und steht auch ohne CS2 vorn. Rechtsklick oder Doppelklick beendet. */
  public void StartMove(){if(moving)return;moving=true;ClickThrough(false);check.Start();drawn="";Update2();}
  public void StopMove(bool save){if(!moving)return;moving=false;dragging=false;ClickThrough(!Free);drawn="";if(save&&Moved!=null)Moved(Anchor);if(!wanted){check.Stop();if(Visible)Hide();}else Update2();}
  public void ResetPosition(){SetAnchor(null);}
  public void SetAnchor(Point? p){Anchor=p;drawn="";Update2();}
  void ClickThrough(bool on){if(!IsHandleCreated)return;int style=GetWindowLong(Handle,-20);SetWindowLong(Handle,-20,on?style|0x20:style&~0x20);}
  static string Str(Dictionary<string,object> d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null?Convert.ToString(v):"";}
  /* Eine gespeicherte Position gilt nur, solange sie auf einem angeschlossenen Bildschirm liegt. */
  static bool OnScreen(Point p){foreach(var screen in Screen.AllScreens)if(screen.Bounds.Contains(new Point(p.X+4,p.Y-4)))return true;return false;}
  void Update2(){
    Rectangle bounds;
    if(moving){
      /* Beim Verschieben die Größe vom Bildschirm mit der Position nehmen, sonst vom Hauptbildschirm. */
      bounds=Anchor.HasValue&&OnScreen(Anchor.Value)?Screen.FromPoint(Anchor.Value).Bounds:Screen.PrimaryScreen.Bounds;
      Rectangle game;if(CrosshairOverlay.Cs2Borderless(out game))bounds=game;
    } else {
      /* Die Kopfzeile steht immer, solange das Overlay an ist: so sieht man, dass TecMon mitliest, auch ohne Nachrichten. */
      if(!wanted||(header.Length==0&&(lines==null||lines.Count==0))){if(Visible)Hide();return;}
      if(Free){if(!Cs2Running()){if(Visible)Hide();return;}bounds=Anchor.HasValue&&OnScreen(Anchor.Value)?Screen.FromPoint(Anchor.Value).Bounds:Screen.PrimaryScreen.Bounds;}
      else if(!CrosshairOverlay.Cs2Borderless(out bounds)){if(Visible)Hide();return;}
    }
    string key=TecMon.Json.Serialize(lines)+header+warn+bounds+moving+Anchor;
    if(key==drawn&&Visible)return;
    drawn=key;Push(bounds);
    if(!Visible)Show();
    if(moving||Free)ClickThrough(false);
  }
  protected override void OnMouseDown(MouseEventArgs e){base.OnMouseDown(e);if(!moving&&!Free)return;if(!moving&&e.Button!=MouseButtons.Left)return;if(e.Button==MouseButtons.Right){StopMove(true);return;}if(e.Button==MouseButtons.Left){dragging=true;grab=new Point(Cursor.Position.X-Left,Cursor.Position.Y-Top);}}
  protected override void OnMouseMove(MouseEventArgs e){base.OnMouseMove(e);if((!moving&&!Free)||!dragging)return;var at=new Point(Cursor.Position.X-grab.X,Cursor.Position.Y-grab.Y);Anchor=new Point(at.X,at.Y+shown.Height);Update2();}
  protected override void OnMouseUp(MouseEventArgs e){base.OnMouseUp(e);bool was=dragging;dragging=false;if(was&&Free&&!moving&&Moved!=null)Moved(Anchor);}
  protected override void OnMouseDoubleClick(MouseEventArgs e){base.OnMouseDoubleClick(e);if(moving)StopMove(true);}
  void Push(Rectangle bounds){
    if(!IsHandleCreated)return;
    float scale=Math.Max(0.6f,bounds.Height/1080f);
    int width=(int)(bounds.Width*lookWidth/100f),pad=(int)(8*scale),cut=(int)(8*scale);
    var source=lines;string title=header;bool gold=warn;
    if(moving){
      source=new List<object>{new Dictionary<string,object>{{"channel","all"},{"name","Beispiel"},{"lang","en"},{"translated","True"},{"text","So sieht eine übersetzte Nachricht aus."}}};
      title="VERSCHIEBEN: mit der Maus ziehen · Rechtsklick oder Doppelklick = fertig";gold=true;
    } else if(Free&&title.Length>0)title+=" · ziehen zum Verschieben";
    using(var nameFont=new Font("Segoe UI Semibold",12f*scale,FontStyle.Regular,GraphicsUnit.Pixel))
    using(var textFont=new Font("Segoe UI Semibold",lookFont*scale,FontStyle.Regular,GraphicsUnit.Pixel))
    using(var measure=new Bitmap(1,1))using(var mg=Graphics.FromImage(measure)){
      var rows=new List<string[]>();var heights=new List<int>();int total=0;
      if(source!=null)foreach(object raw in source){
        var d=raw as Dictionary<string,object>;if(d==null)continue;
        string channel=Str(d,"channel"),team=Str(d,"team");
        string tag=channel=="team"?(team=="ct"?"CT":team=="t"?"T":"TEAM"):channel=="spec"?"ZUSCHAUER":"ALLE";
        /* Eine Zeile je Nachricht (Nutzerwunsch 22.11.2026): „Name [CT]: Nachricht“, Name und Team in Gold. */
        string head=Str(d,"name")+" ["+tag+"]"+(Str(d,"dead")=="True"?" †":"")+":";
        string text=head+" "+Str(d,"text");
        var size=mg.MeasureString(text,textFont,width-2*pad);
        int h=(int)(pad*0.7f)+(int)Math.Ceiling(size.Height)+(int)(pad*0.7f);
        rows.Add(new[]{head,text,channel});heights.Add(h);total+=h+(int)(4*scale);
      }
      int headH=title.Length>0?(int)(nameFont.GetHeight()+2*pad*0.6f):0;
      if(rows.Count==0&&headH==0){if(Visible)Hide();return;}
      int height=Math.Max(1,total+headH);
      using(var bitmap=new Bitmap(width,height,System.Drawing.Imaging.PixelFormat.Format32bppArgb)){
        using(var g=Graphics.FromImage(bitmap)){
          g.Clear(Color.Transparent);g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
          int y=0;
          for(int i=0;i<rows.Count;i++){
            int h=heights[i];
            var shape=new[]{new Point(cut,y),new Point(width-cut-1,y),new Point(width-1,y+cut),new Point(width-1,y+h-cut-1),new Point(width-cut-1,y+h-1),new Point(cut,y+h-1),new Point(0,y+h-cut-1),new Point(0,y+cut)};
            /* Durchsichtig: nur ein Hauch Hintergrund, die Schrift trägt einen dunklen Schatten und bleibt so lesbar. */
            using(var fill=new SolidBrush(Color.FromArgb(Math.Min(235,lookBackground*235/100),15,12,22)))g.FillPolygon(fill,shape);
            bool teamChat=rows[i][2]=="team";
            using(var edge=new Pen(teamChat?Color.FromArgb(150,232,197,115):Color.FromArgb(120,167,139,250),Math.Max(1f,scale)))g.DrawPolygon(edge,shape);
            var line=new RectangleF(pad,y+pad*0.7f,width-2*pad,h);
            Shadowed(g,rows[i][1],textFont,lookColor,line,scale);
            /* Gleiche Schrift und Position: der Name samt Team wird golden darübergezeichnet. */
            /* Ist die Schrift selbst gold, steht der Name in Weiß, damit er sich abhebt. */
            bool goldText=lookColor.R==232&&lookColor.G==197&&lookColor.B==115;
            using(var ink=new SolidBrush(goldText?Color.FromArgb(255,243,241,247):Color.FromArgb(255,232,197,115)))g.DrawString(rows[i][0],textFont,ink,line);
            y+=h+(int)(4*scale);
          }
          if(headH>0){
            var bar=new[]{new Point(0,y),new Point(width-cut-1,y),new Point(width-1,y+cut),new Point(width-1,y+headH-1),new Point(cut,y+headH-1),new Point(0,y+headH-cut-1)};
            using(var fill=new SolidBrush(Color.FromArgb(moving?170:Free?170:60,15,12,22)))g.FillPolygon(fill,bar);
            using(var edge=new Pen(gold?Color.FromArgb(220,232,197,115):Color.FromArgb(120,167,139,250),Math.Max(1f,scale)))g.DrawPolygon(edge,bar);
            Shadowed(g,title,nameFont,gold?Color.FromArgb(255,232,197,115):Color.FromArgb(235,200,190,250),new RectangleF(pad,y+pad*0.6f,width-2*pad,headH),scale);
          }
        }
        /* Standard: ganz unten mittig am CS2-Bildschirm, zwischen Lebens- und Munitionsanzeige. Sonst die gespeicherte Position. */
        Point at;
        if(Anchor.HasValue&&OnScreen(Anchor.Value))at=new Point(Anchor.Value.X,Anchor.Value.Y-height);
        else at=new Point(bounds.Left+(bounds.Width-width)/2,bounds.Bottom-height-(int)(2*scale));
        shown=bitmap.Size;Location=at;Size=bitmap.Size;Layered.Push(this,bitmap,at);
      }
    }
  }
  static void Shadowed(Graphics g,string text,Font font,Color color,RectangleF area,float scale){
    float o=Math.Max(1f,1.2f*scale);
    using(var shadow=new SolidBrush(Color.FromArgb(230,0,0,0))){g.DrawString(text,font,shadow,new RectangleF(area.X+o,area.Y+o,area.Width,area.Height));g.DrawString(text,font,shadow,new RectangleF(area.X-o*0.6f,area.Y-o*0.6f,area.Width,area.Height));}
    using(var ink=new SolidBrush(color))g.DrawString(text,font,ink,area);
  }
}

class CrosshairOverlay : Form {
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr window,out int process);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
  [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
  const int Box=512;
  Dictionary<string,object> settings,options;string drawn="",registeredKey="";bool paused,hotkeyRegistered;
  public Action<bool,bool> Runtime;
  const int ToggleHotkey=0x7C3;
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr window,int id,uint modifiers,uint key);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr window,int id);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect rect);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window,ref Point point);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  readonly System.Windows.Forms.Timer check=new System.Windows.Forms.Timer{Interval=250};
  public bool Wanted;
  protected override bool ShowWithoutActivation {get{return true;}}
  /* WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT */
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80|0x8|0x80000|0x20;return p;}}
  public CrosshairOverlay(){
    Text="TecMon Fadenkreuz";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;TopMost=true;Size=new Size(Box,Box);
    check.Tick+=(s,e)=>Update2();
  }
  public void Apply(bool wanted,Dictionary<string,object> crosshair,Dictionary<string,object> overlayOptions){
    if(Wanted!=wanted)paused=false;
    Wanted=wanted;if(crosshair!=null)settings=crosshair;if(overlayOptions!=null)options=overlayOptions;
    string key=Wanted?TextOption("hotkey","F9"):"none";
    if(key!=registeredKey){
      if(hotkeyRegistered)UnregisterHotKey(Handle,ToggleHotkey);
      hotkeyRegistered=false;registeredKey=key;
      Keys code=key=="F9"?Keys.F9:key=="F10"?Keys.F10:key=="F11"?Keys.F11:Keys.None;
      if(code!=Keys.None)hotkeyRegistered=RegisterHotKey(Handle,ToggleHotkey,0x0001|0x0002|0x4000,(uint)code);
    }
    if(Runtime!=null)Runtime(paused,hotkeyRegistered);
    if(Wanted)check.Start();else{check.Stop();if(Visible)Hide();}Update2();
  }
  string TextOption(string key,string fallback){object value;return options!=null&&options.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):fallback;}
  protected override void WndProc(ref Message message){
    if(message.Msg==0x0312&&message.WParam.ToInt32()==ToggleHotkey){paused=!paused;if(Runtime!=null)Runtime(paused,hotkeyRegistered);Update2();return;}
    base.WndProc(ref message);
  }
  bool TargetBounds(out Rectangle bounds){
    bounds=Rectangle.Empty;
    try{
      var window=GetForegroundWindow();
      string app=TextOption("app","");
      if(app.Length>0){int id;GetWindowThreadProcessId(window,out id);using(var process=Process.GetProcessById(id))if(!process.ProcessName.Equals(app,StringComparison.OrdinalIgnoreCase))return false;}
      string target=TextOption("target","foreground");
      if(target=="primary"){bounds=Screen.PrimaryScreen.Bounds;return true;}
      if(target=="monitor"){int index=(int)Num(options,"monitor",1)-1;if(index<0||index>=Screen.AllScreens.Length)return false;bounds=Screen.AllScreens[index].Bounds;return true;}
      if(window==IntPtr.Zero||IsIconic(window)||window==GetShellWindow()||window==GetDesktopWindow()||window==Handle)return false;
      Rect r;if(!GetClientRect(window,out r)||r.Right-r.Left<100||r.Bottom-r.Top<100)return false;
      var origin=new Point(0,0);if(!ClientToScreen(window,ref origin))return false;
      bounds=new Rectangle(origin.X,origin.Y,r.Right-r.Left,r.Bottom-r.Top);return true;
    }catch(Exception){return false;}
  }
  /* CS2 vorn, ohne Fensterrahmen und so groß wie sein Bildschirm: Vollbild-Fenstermodus. */
  internal static bool Cs2Borderless(out Rectangle bounds){
    bounds=Rectangle.Empty;
    try{
      IntPtr window=GetForegroundWindow();int id;GetWindowThreadProcessId(window,out id);if(id==0)return false;
      using(var process=Process.GetProcessById(id))if(!process.ProcessName.Equals("cs2",StringComparison.OrdinalIgnoreCase))return false;
      if((GetWindowLong(window,-16)&0x00C00000)!=0)return false;
      Rect r;if(!GetWindowRect(window,out r))return false;
      var rect=Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom);var screen=Screen.FromRectangle(rect).Bounds;
      if(rect!=screen)return false;bounds=screen;return true;
    }catch(Exception){return false;}
  }
  void Update2(){
    if(!Wanted||paused||settings==null){if(Visible)Hide();return;}
    Rectangle bounds;if(!TargetBounds(out bounds)){if(Visible)Hide();return;}
    var at=new Point(bounds.Left+bounds.Width/2-Box/2,bounds.Top+bounds.Height/2-Box/2);
    at.Offset((int)Num(options,"offsetX",0),(int)Num(options,"offsetY",0));
    string key=TecMon.Json.Serialize(settings)+TecMon.Json.Serialize(options)+bounds;
    if(!Visible){Location=at;Show();drawn="";}
    if(key==drawn&&Location==at)return;
    Location=at;drawn=key;Push(Screen.FromRectangle(bounds).Bounds.Height/1080f);
  }
  static double Num(Dictionary<string,object> d,string k,double fallback){object v;if(d!=null&&d.TryGetValue(k,out v)&&v!=null){try{return Convert.ToDouble(v,System.Globalization.CultureInfo.InvariantCulture);}catch(Exception){}}return fallback;}
  static bool Flag(Dictionary<string,object> d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v is bool&&(bool)v;}
  void Push(float scale){
    if(!IsHandleCreated)return;
    using(var bitmap=new Bitmap(Box,Box,System.Drawing.Imaging.PixelFormat.Format32bppArgb)){
      using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.Transparent);Draw(g,scale);}
      Layered.Push(this,bitmap,Location);
    }
  }
  /* Gleiche Maße wie die Vorschau auf der Companion-Seite, bezogen auf 1080p. */
  public void Draw(Graphics g,float scale){
    var c=settings;int[] color={167,139,250};object raw;
    if(c!=null&&c.TryGetValue("color",out raw)){var list=raw as System.Collections.IList;if(list!=null&&list.Count==3)for(int i=0;i<3;i++)color[i]=Math.Max(0,Math.Min(255,Convert.ToInt32(list[i])));}
    int alpha=(int)Math.Max(0,Math.Min(255,Num(c,"alpha",255)));
    float s=Math.Max(0.5f,Math.Min(8f,scale*(float)Num(options,"scale",1)));
    int t=(int)Math.Max(1,Math.Round(Math.Max(1,Math.Round(Math.Max(0.5,Num(c,"thickness",1))*2))*s));
    int len=(int)Math.Round(Math.Round(Num(c,"size",2)*2)*s),gap=(int)Math.Round(Math.Max(0,Math.Round(Num(c,"gap",-2)+4))*s),half=t/2;
    int o=Flag(c,"outline")&&Num(c,"outlineThickness",1)>0?(int)Math.Max(1,Math.Round(Num(c,"outlineThickness",1)*s/2)):0;
    var rects=new List<Rectangle>();int m=Box/2;
    g.TranslateTransform(m,m);g.RotateTransform((float)Num(options,"rotation",0));g.TranslateTransform(-m,-m);
    if(TextOption("shape","cross")=="circle"){
      g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
      float radius=(float)Num(options,"radius",8)*s;
      if(o>0)using(var border=new Pen(Color.FromArgb(alpha,0,0,0),t+2*o))g.DrawEllipse(border,m-radius,m-radius,2*radius,2*radius);
      using(var ring=new Pen(Color.FromArgb(alpha,color[0],color[1],color[2]),t))g.DrawEllipse(ring,m-radius,m-radius,2*radius,2*radius);
    }else if(len>0){rects.Add(new Rectangle(m+gap,m-half,len,t));rects.Add(new Rectangle(m-gap-len,m-half,len,t));rects.Add(new Rectangle(m-half,m+gap,t,len));if(!Flag(c,"tStyle"))rects.Add(new Rectangle(m-half,m-gap-len,t,len));}
    if(Flag(c,"dot")){int dot=(int)Math.Max(1,Math.Round(Num(options,"dotSize",2)*s));rects.Add(new Rectangle(m-dot/2,m-dot/2,dot,dot));}
    if(o>0)using(var black=new SolidBrush(Color.FromArgb(alpha,0,0,0)))foreach(var r in rects)g.FillRectangle(black,r.X-o,r.Y-o,r.Width+2*o,r.Height+2*o);
    using(var fill=new SolidBrush(Color.FromArgb(alpha,color[0],color[1],color[2])))foreach(var r in rects)g.FillRectangle(fill,r);
  }
  protected override void Dispose(bool disposing){if(disposing){if(hotkeyRegistered)UnregisterHotKey(Handle,ToggleHotkey);check.Dispose();}base.Dispose(disposing);}
}

/*
 * Frage nach dem Match ("Neues Highlight-Video erstellen?") im TecMon-Stil.
 * Wird nie aktiviert (WS_EX_NOACTIVATE), nimmt also auch einem offenen CS2 keinen
 * Fokus. Buttons nach den UI-Regeln: Hover nur mit Maus, beim Druecken geben sie
 * sichtbar nach (96 %), Trefferflaeche mindestens 40 px hoch.
 */
class AutoPrompt : Form {
  public Action<bool> Answered;
  readonly string kicker,heading,text,yesLabel;readonly Font eyebrow=new Font("Segoe UI",8.5f,FontStyle.Bold),title=new Font("Segoe UI",14f,FontStyle.Bold),body=new Font("Segoe UI",10f),button=new Font("Segoe UI",10.5f,FontStyle.Bold);
  Rectangle yes,no;int hot=-1,pressed=-1;bool done;
  static readonly Color Top=Color.FromArgb(27,22,38),Bottom=Color.FromArgb(11,10,17),Text2=Color.FromArgb(232,230,240),Muted=Color.FromArgb(170,166,190),Violet=Color.FromArgb(167,139,250);
  protected override bool ShowWithoutActivation {get{return true;}}
  /* WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST */
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80|0x8;return p;}}
  public AutoPrompt(string mapName):this(mapName,"TECMON · HIGHLIGHTS","Neues Highlight-Video erstellen?","Dein Match auf "+mapName.Replace("de_","")+" ist vorbei. TecMon lädt die Demo, sobald CS2 zu ist, nimmt deine besten Szenen auf und lädt das Video hoch.","Ja, Video erstellen"){}
  /* Gleiches Fenster für andere Fragen nach dem Spiel (etwa „Stats hochladen?“). */
  public AutoPrompt(string mapName,string kickerText,string headingText,string bodyText,string yesText){
    kicker=kickerText;heading=headingText;text=bodyText;yesLabel=yesText;Text="TecMon";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;TopMost=true;DoubleBuffered=true;BackColor=Bottom;ClientSize=new Size(440,186);AccessibleName=heading;
    yes=new Rectangle(22,128,232,42);no=new Rectangle(266,128,152,42);
    var area=Screen.PrimaryScreen.WorkingArea;Location=new Point(area.Right-Width-24,area.Bottom-Height-24);
    MouseMove+=(s,e)=>{int h=yes.Contains(e.Location)?0:no.Contains(e.Location)?1:-1;Cursor=h<0?Cursors.Default:Cursors.Hand;if(h!=hot){hot=h;Invalidate();}};
    MouseLeave+=(s,e)=>{hot=-1;pressed=-1;Invalidate();};
    MouseDown+=(s,e)=>{if(e.Button!=MouseButtons.Left)return;pressed=yes.Contains(e.Location)?0:no.Contains(e.Location)?1:-1;Invalidate();};
    MouseUp+=(s,e)=>{int was=pressed;pressed=-1;Invalidate();if(was==0&&yes.Contains(e.Location))Finish(true);else if(was==1&&no.Contains(e.Location))Finish(false);};
  }
  void Finish(bool answer){if(done)return;done=true;if(Answered!=null)Answered(answer);Close();}
  static System.Drawing.Drawing2D.GraphicsPath Cut(RectangleF r,float c){var p=new System.Drawing.Drawing2D.GraphicsPath();p.AddPolygon(new[]{new PointF(r.Left+c,r.Top),new PointF(r.Right,r.Top),new PointF(r.Right,r.Bottom-c),new PointF(r.Right-c,r.Bottom),new PointF(r.Left,r.Bottom),new PointF(r.Left,r.Top+c)});return p;}
  void Button(Graphics g,Rectangle r,string label,bool primary,int index){
    RectangleF box=r;if(pressed==index){float dx=r.Width*0.02f,dy=r.Height*0.02f;box=new RectangleF(r.X+dx,r.Y+dy,r.Width-2*dx,r.Height-2*dy);}
    bool over=hot==index;
    using(var path=Cut(box,10)){
      if(primary){using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(box,over?Color.FromArgb(248,220,150):TecMon.Gold,over?Color.FromArgb(222,176,82):Color.FromArgb(201,160,74),90f))g.FillPath(fill,path);}
      else{using(var fill=new SolidBrush(over?Color.FromArgb(70,Violet):Color.FromArgb(28,Violet)))g.FillPath(fill,path);using(var pen=new Pen(over?Violet:Color.FromArgb(150,Violet),1.5f))g.DrawPath(pen,path);}
    }
    TextRenderer.DrawText(g,label,button,Rectangle.Round(box),primary?Color.FromArgb(20,16,28):Text2,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
  }
  protected override void OnPaint(PaintEventArgs e){
    var g=e.Graphics;g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
    var bounds=new RectangleF(1,1,ClientSize.Width-3,ClientSize.Height-3);
    using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(ClientRectangle,Top,Bottom,90f))g.FillRectangle(fill,ClientRectangle);
    using(var path=Cut(bounds,16))using(var pen=new Pen(TecMon.Gold,1.5f))g.DrawPath(pen,path);
    using(var pen=new Pen(Violet,3f))g.DrawLine(pen,22,20,64,20);
    TextRenderer.DrawText(g,kicker,eyebrow,new Point(70,13),TecMon.Gold);
    TextRenderer.DrawText(g,heading,title,new Point(20,36),Text2);
    TextRenderer.DrawText(g,text,body,new Rectangle(22,68,396,52),Muted,TextFormatFlags.WordBreak);
    Button(g,yes,yesLabel,true,0);Button(g,no,"Nein",false,1);
  }
}

/*
 * Rechtsklick auf die Figur: eigenes Schnellmenü im TecMon-Stil statt verschachtelter
 * Windows-Menüs. Kacheln für häufige Aktionen, Schalter, Persönlichkeit; alles Weitere
 * unter „Alle Optionen“. Hover nur mit Maus, gedrückte Buttons geben 4 % nach, Esc schließt.
 */
class QuickMenu : Form {
  class Item {public string Kind,Label,Sub;public Rectangle Box;public Action Run;public Func<bool> On;public string Value;public bool Danger;}
  readonly List<Item> items=new List<Item>();int hot=-1,pressed=-1;int y;
  public string Status="";
  static readonly Color Top=Color.FromArgb(27,22,38),Bottom=Color.FromArgb(11,10,17),Violet=Color.FromArgb(167,139,250),Text2=Color.FromArgb(236,233,244),Muted=Color.FromArgb(160,154,182),Red=Color.FromArgb(251,113,133);
  readonly Font eyebrow=new Font("Segoe UI",7.5f,FontStyle.Bold),label=new Font("Segoe UI",9.5f,FontStyle.Bold),small=new Font("Segoe UI",8f),body=new Font("Segoe UI",9.5f);
  const int W=320,Pad=14,Gap=6;
  readonly List<KeyValuePair<int,string>> headings=new List<KeyValuePair<int,string>>();
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x80|0x8;p.ClassStyle|=0x20000;return p;}}
  public QuickMenu(){
    FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;TopMost=true;DoubleBuffered=true;KeyPreview=true;BackColor=Bottom;Text="TecMon Menü";y=58;
    Deactivate+=(s,e)=>Close();KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape)Close();};
    MouseMove+=(s,e)=>{int h=Hit(e.Location);Cursor=h<0?Cursors.Default:Cursors.Hand;if(h!=hot){hot=h;Invalidate();}};
    MouseLeave+=(s,e)=>{hot=-1;pressed=-1;Invalidate();};
    MouseDown+=(s,e)=>{if(e.Button!=MouseButtons.Left)return;pressed=Hit(e.Location);Invalidate();};
    MouseUp+=(s,e)=>{int was=pressed;pressed=-1;Invalidate();if(was<0||Hit(e.Location)!=was)return;var item=items[was];if(item.Kind=="toggle"){if(item.Run!=null)item.Run();Invalidate();return;}if(item.Kind=="chip"){if(item.Run!=null)item.Run();Invalidate();return;}Close();if(item.Run!=null)item.Run();};
  }
  int Hit(Point p){for(int i=0;i<items.Count;i++)if(items[i].Box.Contains(p))return i;return -1;}
  public void Heading(string text){y+=4;headings.Add(new KeyValuePair<int,string>(y,text));y+=18;}
  /* Kacheln immer paarweise: zwei Spalten. */
  int column;
  public void Tile(string text,string sub,Action run){int w=(W-2*Pad-Gap)/2;var box=new Rectangle(Pad+column*(w+Gap),y,w,46);items.Add(new Item{Kind="tile",Label=text,Sub=sub,Run=run,Box=box});if(column==1){column=0;y+=46+Gap;}else column=1;}
  public void EndTiles(){if(column==1){column=0;y+=46+Gap;}}
  public void Toggle(string text,Func<bool> on,Action run){items.Add(new Item{Kind="toggle",Label=text,On=on,Run=run,Box=new Rectangle(Pad,y,W-2*Pad,34)});y+=36;}
  public void Chips(string[] labels,string[] values,Func<string> current,Action<string> pick){int w=(W-2*Pad-Gap*(labels.Length-1))/labels.Length;for(int i=0;i<labels.Length;i++){string v=values[i];items.Add(new Item{Kind="chip",Label=labels[i],Value=v,On=()=>current()==v,Run=()=>pick(v),Box=new Rectangle(Pad+i*(w+Gap),y,w,32)});}y+=32+Gap;}
  public void Footer(string text,Action run,bool danger){items.Add(new Item{Kind="link",Label=text,Run=run,Danger=danger,Box=new Rectangle(Pad,y,W-2*Pad,34)});y+=36;}
  public void Fit(){ClientSize=new Size(W,y+Pad-4);}
  public void Open(Point at){
    Fit();var area=Screen.FromPoint(at).WorkingArea;
    int x=Math.Min(Math.Max(area.Left+8,at.X-W/2),area.Right-Width-8),top=Math.Min(Math.Max(area.Top+8,at.Y-Height-8),area.Bottom-Height-8);
    Location=new Point(x,top);Show();Activate();
  }
  static System.Drawing.Drawing2D.GraphicsPath Cut(RectangleF r,float c){var p=new System.Drawing.Drawing2D.GraphicsPath();p.AddPolygon(new[]{new PointF(r.Left+c,r.Top),new PointF(r.Right,r.Top),new PointF(r.Right,r.Bottom-c),new PointF(r.Right-c,r.Bottom),new PointF(r.Left,r.Bottom),new PointF(r.Left,r.Top+c)});return p;}
  RectangleF Press(Rectangle r,int i){if(pressed!=i)return r;return new RectangleF(r.X+r.Width*0.02f,r.Y+r.Height*0.02f,r.Width*0.96f,r.Height*0.96f);}
  protected override void OnPaint(PaintEventArgs e){
    var g=e.Graphics;g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
    using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(ClientRectangle,Top,Bottom,90f))g.FillRectangle(fill,ClientRectangle);
    using(var frame=Cut(new RectangleF(1,1,ClientSize.Width-3,ClientSize.Height-3),14))using(var pen=new Pen(TecMon.Gold,1.4f))g.DrawPath(pen,frame);
    using(var bar=new Pen(Violet,3f))g.DrawLine(bar,Pad,18,Pad+30,18);
    TextRenderer.DrawText(g,"TECMON",eyebrow,new Point(Pad+36,11),TecMon.Gold);
    bool good=Status.StartsWith("●");string status=Status.TrimStart('●','○',' ');
    using(var orb=new SolidBrush(good?Color.FromArgb(132,214,172):Violet))g.FillEllipse(orb,Pad,32,9,9);
    TextRenderer.DrawText(g,status,body,new Rectangle(Pad+16,27,W-2*Pad-16,22),Text2,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding|TextFormatFlags.NoPrefix);
    foreach(var h in headings)TextRenderer.DrawText(g,h.Value,eyebrow,new Point(Pad,h.Key),Violet);
    for(int i=0;i<items.Count;i++){
      var item=items[i];bool over=hot==i;var box=Press(item.Box,i);
      if(item.Kind=="tile"){
        using(var path=Cut(box,8)){using(var fill=new SolidBrush(over?Color.FromArgb(62,Violet):Color.FromArgb(26,255,255,255)))g.FillPath(fill,path);using(var pen=new Pen(over?TecMon.Gold:Color.FromArgb(70,Violet),1f))g.DrawPath(pen,path);}
        TextRenderer.DrawText(g,item.Label,label,new Rectangle((int)box.X+10,(int)box.Y+6,(int)box.Width-14,18),Text2,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding|TextFormatFlags.NoPrefix);
        TextRenderer.DrawText(g,item.Sub??"",small,new Rectangle((int)box.X+10,(int)box.Y+25,(int)box.Width-14,16),Muted,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding|TextFormatFlags.NoPrefix);
      } else if(item.Kind=="toggle"){
        bool on=item.On!=null&&item.On();
        if(over)using(var fill=new SolidBrush(Color.FromArgb(34,Violet)))using(var path=Cut(box,6))g.FillPath(fill,path);
        TextRenderer.DrawText(g,item.Label,body,new Rectangle((int)box.X+8,(int)box.Y,(int)box.Width-60,(int)box.Height),Text2,TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPadding|TextFormatFlags.NoPrefix);
        var track=new RectangleF(box.Right-46,box.Y+box.Height/2-9,36,18);
        using(var path=new System.Drawing.Drawing2D.GraphicsPath()){path.AddArc(track.X,track.Y,18,18,90,180);path.AddArc(track.Right-18,track.Y,18,18,270,180);path.CloseFigure();
          using(var fill=new SolidBrush(on?TecMon.Gold:Color.FromArgb(58,52,74)))g.FillPath(fill,path);}
        using(var knob=new SolidBrush(on?Color.FromArgb(20,16,28):Color.FromArgb(200,196,214)))g.FillEllipse(knob,on?track.Right-16:track.X+2,track.Y+2,14,14);
      } else if(item.Kind=="chip"){
        bool on=item.On!=null&&item.On();
        using(var path=Cut(box,6)){
          if(on)using(var fill=new System.Drawing.Drawing2D.LinearGradientBrush(box,TecMon.Gold,Color.FromArgb(201,160,74),90f))g.FillPath(fill,path);
          else{using(var fill=new SolidBrush(over?Color.FromArgb(60,Violet):Color.FromArgb(22,255,255,255)))g.FillPath(fill,path);using(var pen=new Pen(Color.FromArgb(80,Violet)))g.DrawPath(pen,path);}
        }
        TextRenderer.DrawText(g,item.Label,small,Rectangle.Round(box),on?Color.FromArgb(20,16,28):Text2,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis|TextFormatFlags.NoPrefix);
      } else {
        if(over)using(var fill=new SolidBrush(Color.FromArgb(item.Danger?40:34,item.Danger?Red:Violet)))using(var path=Cut(box,6))g.FillPath(fill,path);
        TextRenderer.DrawText(g,item.Label,body,new Rectangle((int)box.X+8,(int)box.Y,(int)box.Width-16,(int)box.Height),item.Danger?Red:Text2,TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding|TextFormatFlags.NoPrefix);
      }
    }
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
  /* Radarbild aus dem eigenen lokalen Radar-Ordner; ohne Datei bleibt es beim Text. */
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
  /* Live-Anzeigen: schmalere Blase, Farbe nach Lage (Bombe rot, Magazin orange, Rundenwerte grün). */
  public bool Compact;
  static Color Dot(string title){if(title.StartsWith("Bombe")||title.StartsWith("Entschärfen"))return Color.FromArgb(251,113,133);if(title.StartsWith("Magazin"))return Orange;if(title=="Diese Runde"||title=="Rundenbilanz")return Green;switch(title){case "Stark":case "Zusammenfassung":case "Aufwärmen":return Color.FromArgb(74,222,128);case "Nach dem Tod":case "Kopf frei":return Color.FromArgb(251,113,133);case "Deine Matches":case "Map":case "Team":return Color.FromArgb(167,139,250);default:return TecMon.Gold;}}
  public void Present(string heading,string text,Rectangle anchor,Dictionary<string,object> picture,long round,bool stack){Present(heading,text,anchor,picture,round,stack,false);}
  /* sticky: bleibt stehen, bis die nächste Meldung kommt oder jemand klickt (Fortschritt beim Video). */
  public void Present(string heading,string text,Rectangle anchor,Dictionary<string,object> picture,long round,bool stack,bool sticky){
    bool append=stack&&Visible&&round==group&&entries.Count>0;
    if(!append){entries.Clear();visual=null;}
    group=round;entries.Add(new string[]{heading,(text??"").Replace(" %"," %").Replace(" $"," $")});while(entries.Count>4)entries.RemoveAt(0);
    string kind=Kind(picture);
    if(kind=="map"&&!LoadRadar(Convert.ToString(picture["image"])))kind="";
    if(kind=="map"||kind=="spray")visual=picture;
    kind=Kind(visual);
    int inner=visual!=null?Visual:entries.Count>1?430:Compact?300:360;
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
    hide.Stop();if(sticky)return;hide.Interval=Math.Max(7000,Math.Min(visual!=null||entries.Count>1?25000:16000,4000+letters*55+(visual!=null?6000:0)));hide.Start();
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
  void DrawRunner(Graphics g,System.Drawing.Drawing2D.GraphicsPath outline){Runner(g,outline,phase);}
  public static void Runner(Graphics g,System.Drawing.Drawing2D.GraphicsPath outline,float phase){
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
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr window,out int process);
  /* Liegt gerade CS2 vorn? Dann bleibt die Figur dahinter; auf dem Desktop oder in anderen Programmen bleibt sie sichtbar. */
  static bool GameInFront(){try{int id;GetWindowThreadProcessId(GetForegroundWindow(),out id);if(id==0)return false;using(var process=Process.GetProcessById(id))return process.ProcessName.Equals("cs2",StringComparison.OrdinalIgnoreCase);}catch(Exception){return false;}}
  bool OnTop(){return foreground&&!(busy&&GameInFront());}
  /* Rundentipps neben der Figur, aber immer auf dem Bildschirm, auf dem CS2 vorn liegt: Steht die Figur auf einem
     anderen Bildschirm (oder ist ausgeblendet), erscheint die Blase unten rechts auf dem CS2-Bildschirm (Fix 0.48.5). */
  Rectangle TipAnchor(){
    Screen screen=Screen.PrimaryScreen;
    if(GameInFront()){try{screen=Screen.FromHandle(GetForegroundWindow());}catch(Exception){}}
    else if(Visible)return Bounds;
    if(Visible&&Screen.FromRectangle(Bounds).DeviceName==screen.DeviceName)return Bounds;
    var area=screen.WorkingArea;return new Rectangle(area.Right-180,area.Bottom-205,144,164);
  }
  readonly System.Windows.Forms.Timer animation=new System.Windows.Forms.Timer(),poll=new System.Windows.Forms.Timer();
  Bitmap sheet;DesktopPanel panel;NotifyIcon tray;Mutex singleton;EventWaitHandle openSignal;bool owns,dragging,moved,hover,wandering=true,animate=true,foreground=true,polling,busy;Point dragStart,start;double phase,x,y,vx=-0.45,vy=-0.22;int failures;string token="";bool preview,openOnStart;
  protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x80000|0x80;return p;}}
  public DesktopPet(bool previewOnly=false) {
    preview=previewOnly;Text="TecMon Companion · Desktop";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;ClientSize=new Size(144,164);StartPosition=FormStartPosition.Manual;AccessibleName="TecMon Desktop Companion";Cursor=Cursors.Hand;
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonBot"))if(stream!=null)using(var image=Image.FromStream(stream))sheet=new Bitmap(image);
    /* 3D-Figur: vorab aus der GLB gerenderte Bilder (36 Drehwinkel + LED-Gesichter). Fehlt die Ressource, bleibt die alte Figur. */
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonBot3D"))if(stream!=null)using(var image=Image.FromStream(stream))model=new Bitmap(image);
    /* Einzelbilder einmal vorab ausschneiden (vormultipliertes Alpha): pro Bild nur noch kleine Kopien statt Ausschnitten aus dem großen Bogen. */
    if(model!=null&&model.Width>=Cols*CellW&&model.Height>=((Faces+Cols-1)/Cols)*CellH){cells=new Bitmap[Faces];for(int i=0;i<Faces;i++){var cell=new Bitmap(CellW,CellH,System.Drawing.Imaging.PixelFormat.Format32bppPArgb);using(var g=Graphics.FromImage(cell)){g.CompositingMode=System.Drawing.Drawing2D.CompositingMode.SourceCopy;g.DrawImage(model,new Rectangle(0,0,CellW,CellH),new Rectangle((i%Cols)*CellW,(i/Cols)*CellH,CellW,CellH),GraphicsUnit.Pixel);}cells[i]=cell;}}else if(model!=null){model.Dispose();model=null;}
    if(model!=null)ClientSize=new Size(214,160);
    var area=Screen.PrimaryScreen.WorkingArea;Location=new Point(area.Right-Width-35,area.Bottom-Height-40);x=Left;y=Top;
    if(!preview){
      var config=TecMon.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(TecMon.Root,"installation.json")));
      openOnStart=config.ContainsKey("desktopOpenOnStart") && Convert.ToBoolean(config["desktopOpenOnStart"]);
      /* Gespeicherte Figur-Einstellungen sofort beim Start, nicht erst nach der ersten Abfrage: sonst fliegt die Figur kurz los. */
      try{if(config.ContainsKey("profileDir")){var saved=Path.Combine(Convert.ToString(config["profileDir"]),"desktop.json");if(File.Exists(saved))startSettings=TecMon.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(saved));}}catch(Exception){}
      singleton=new Mutex(true,"Local\\TecMonDesktop-"+Convert.ToString(config["installationId"]),out owns);openSignal=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\TecMonDesktopOpen-"+Convert.ToString(config["installationId"]));
    }
    var menu=new ContextMenuStrip();
    statusItem=new ToolStripMenuItem("Status wird geprüft …"){Enabled=false};menu.Items.Add(statusItem);menu.Items.Add(new ToolStripSeparator());
    /* TecMon selbst: Interaktionen, Persönlichkeit und Spiele. */
    var buddy=new ToolStripMenuItem("TecMon");
    foreach(var pair in new[]{new[]{"Anstupsen","poke"},new[]{"Witz erzählen","joke"},new[]{"Kompliment","compliment"},new[]{"Trick zeigen","trick"}}){string action=pair[1];buddy.DropDownItems.Add(pair[0],null,async(s,e)=>await PetAction(action));}
    var sleepItem=new ToolStripMenuItem("Schlafen schicken",null,async(s,e)=>await PetAction(petAsleep?"wake":"sleep"));buddy.DropDownItems.Add(sleepItem);
    buddy.DropDownItems.Add(new ToolStripSeparator());buddy.DropDownItems.Add("Werte anzeigen",null,(s,e)=>OpenPanel("tecmon",""));
    buddy.DropDownOpening+=(s,e)=>sleepItem.Text=petAsleep?"Aufwecken":"Schlafen schicken";menu.Items.Add(buddy);
    var games=new ToolStripMenuItem("Spiele mit TecMon");
    foreach(var pair in new[]{new[]{"Reaktionstest","reaction"},new[]{"Ziele treffen","aim"},new[]{"Muster merken","memory"},new[]{"Schere, Stein, Papier","rps"},new[]{"Zahl raten","guess"}}){string game=pair[1];games.DropDownItems.Add(pair[0],null,(s,e)=>OpenPanel("spiele",game));}
    menu.Items.Add(games);
    personality=new ToolStripMenuItem("Persönlichkeit");
    foreach(var pair in new[]{new[]{"Super nett","nett"},new[]{"Normal","normal"},new[]{"Nerdy","nerdy"},new[]{"HUAN-Modus (18+)","huan"}}){string mode=pair[1];var item=new ToolStripMenuItem(pair[0]){Tag=mode,Checked=mode=="normal"};item.Click+=async(s,e)=>{if(mode=="huan"&&!ConfirmHuan())return;await PetRequest("/api/pet/mode","{\"mode\":\""+mode+"\"}");};personality.DropDownItems.Add(item);}
    menu.Items.Add(personality);menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add("Fadenkreuz-Overlay (alle Spiele)",null,(s,e)=>OpenPanel("fadenkreuz",""));
    menu.Items.Add("Einstellungen öffnen",null,(s,e)=>OpenPanel("figur",""));
    menu.Items.Add("Rundgang starten",null,(s,e)=>OpenPanel("tutorial",""));
    menu.Items.Add("TecMon öffnen",null,(s,e)=>DesktopPanel.OpenExternal("https://tecmon.online"));
    updateItem=new ToolStripMenuItem("Nach Updates suchen",null,async(s,e)=>await CheckUpdate(false));menu.Items.Add(updateItem);
    /* Games: spielbezogene Integrationen, zuerst CS2. Weitere Spiele sind geplant. */
    var gamesRoot=new ToolStripMenuItem("Games");var cs2=new ToolStripMenuItem("CS2");
    tipsItem=new ToolStripMenuItem("Rundentipps");tipsOn=new ToolStripMenuItem("Eingeschaltet",null,async(s,e)=>await ToggleTips());tipsItem.DropDownItems.Add(tipsOn);tipsItem.DropDownItems.Add(new ToolStripSeparator());cs2.DropDownItems.Add(tipsItem);
    cs2.DropDownItems.Add("Highlights aufnehmen",null,(s,e)=>OpenPanel("games",""));
    autoOn=new ToolStripMenuItem("Nach dem Match Highlight-Video anbieten",null,async(s,e)=>await ToggleAuto());cs2.DropDownItems.Add(autoOn);
    backlogOn=new ToolStripMenuItem("Beim Schließen von CS2 nach Stats fragen",null,async(s,e)=>await ToggleBacklog());backlogOn.Checked=backlogAsk;cs2.DropDownItems.Add(backlogOn);cs2.DropDownItems.Add(new ToolStripMenuItem("Offene Matches jetzt auswerten",null,async(s,e)=>await OpenBacklog()));
    cs2.DropDownItems.Add("Fadenkreuz einstellen",null,(s,e)=>OpenPanel("fadenkreuz",""));
    cs2.DropDownItems.Add("Chat übersetzen",null,(s,e)=>OpenPanel("chat",""));
    chatBubbleItem=new ToolStripMenuItem("Chat in der Sprechblase");chatBubbleItem.Click+=async(s,e)=>{bool want=!chatBubbleItem.Checked;try{await Request("/api/chat/settings",true,"{\"bubble\":"+(want?"true":"false")+"}");chatBubbleItem.Checked=want;}catch{}};cs2.DropDownItems.Add(chatBubbleItem);
    cs2.DropDownItems.Add("Chat-Overlay verschieben",null,(s,e)=>MoveChatOverlay());
    cs2.DropDownItems.Add("Chat-Overlay nach unten mittig zurücksetzen",null,(s,e)=>ResetChatOverlay());
    cs2.DropDownItems.Add("Callout-Quiz",null,(s,e)=>OpenPanel("quiz","quiz"));
    cs2.DropDownItems.Add("Waffenpreis-Quiz",null,(s,e)=>OpenPanel("quiz","price"));
    cs2.DropDownItems.Add("Letzte Videos",null,(s,e)=>OpenPanel("videos",""));
    cs2.DropDownItems.Add("Videos-Ordner öffnen",null,async(s,e)=>{try{await Request("/api/videos/folder",true);}catch(Exception error){MessageBox.Show(error.Message,"TecMon");}});
    cs2.DropDownItems.Add(new ToolStripSeparator());cs2.DropDownItems.Add("CS2-Paket entfernen …",null,(s,e)=>OpenPanel("games",""));
    cs2Item=cs2;cs2Install=new ToolStripMenuItem("CS2 installieren",null,async(s,e)=>await PetRequest("/api/games/install","{\"id\":\"cs2\"}")){Visible=false};
    gamesRoot.DropDownItems.Add(cs2);gamesRoot.DropDownItems.Add(cs2Install);gamesRoot.DropDownItems.Add(new ToolStripSeparator());
    foreach(var planned in new[]{"Valorant","Dota 2","Deadlock"})gamesRoot.DropDownItems.Add(new ToolStripMenuItem(planned+" · geplant"){Enabled=false});
    var wardogs=new ToolStripMenuItem("Wardogs");
    wardogs.DropDownItems.Add("Scoreboard-Foto jetzt (Strg+Alt+S)",null,async(s,e)=>await CaptureScoreboard());
    wardogs.DropDownItems.Add("Wardogs-Stats und Einstellungen",null,(s,e)=>OpenPanel("wardogs",""));
    gamesRoot.DropDownItems.Add(wardogs);
    gamesRoot.DropDownItems.Add(new ToolStripSeparator());gamesRoot.DropDownItems.Add("Spiel-Pakete verwalten",null,(s,e)=>OpenPanel("games",""));
    gamesRoot.DropDownOpening+=(s,e)=>{cs2Item.Visible=cs2Installed;cs2Install.Visible=!cs2Installed;};menu.Items.Add(gamesRoot);
    /* Clip-Puffer: Bildschirmaufnahme der letzten Sekunden, fuer alle Spiele. Standardmaessig aus. */
    var clipsRoot=new ToolStripMenuItem("Clips");
    clipsOn=new ToolStripMenuItem("Clip-Puffer eingeschaltet",null,async(s,e)=>await ToggleClips());clipsRoot.DropDownItems.Add(clipsOn);
    clipsRoot.DropDownItems.Add("Clip jetzt speichern (Strg+Alt+T)",null,async(s,e)=>await SaveClip());
    clipsRoot.DropDownItems.Add(new ToolStripSeparator());
    clipsRoot.DropDownItems.Add("Clips verwalten",null,(s,e)=>OpenPanel("clips",""));
    clipsRoot.DropDownItems.Add("Clips-Ordner öffnen",null,async(s,e)=>{try{await Request("/api/clips/folder",true);}catch(Exception error){MessageBox.Show(error.Message,"TecMon");}});
    menu.Items.Add(clipsRoot);
    var figure=new ToolStripMenuItem("Figur");
    /* Alle Schalter hier werden gespeichert (desktop.json) und gelten nach einem Neustart weiter. */
    var fly=new ToolStripMenuItem("Umherfliegen"){Checked=true,CheckOnClick=true};flyItem=fly;fly.CheckedChanged+=(s,e)=>{wandering=fly.Checked;SaveDesktop();};figure.DropDownItems.Add(fly);
    var motion=new ToolStripMenuItem("Animation"){Checked=true,CheckOnClick=true};motionItem=motion;motion.CheckedChanged+=(s,e)=>{animate=motion.Checked;Render();SaveDesktop();};figure.DropDownItems.Add(motion);
    var top=new ToolStripMenuItem("Im Vordergrund"){Checked=true,CheckOnClick=true};topItem=top;top.CheckedChanged+=(s,e)=>{foreground=top.Checked;TopMost=OnTop();SaveDesktop();};figure.DropDownItems.Add(top);
    figure.DropDownItems.Add(new ToolStripSeparator());
    highItem=new ToolStripMenuItem("3D-Modell · High process"){Checked=true,Tag="toggle"};highItem.Click+=(s,e)=>SetQuality(true);figure.DropDownItems.Add(highItem);
    lowItem=new ToolStripMenuItem("Bilder · Low process"){Tag="toggle"};lowItem.Click+=(s,e)=>SetQuality(false);figure.DropDownItems.Add(lowItem);
    figure.DropDownItems.Add(new ToolStripSeparator());
    autostartItem=new ToolStripMenuItem("Mit Windows starten"){CheckOnClick=true};autostartItem.CheckedChanged+=(s,e)=>{if(applying)return;autostart=autostartItem.Checked;ApplyAutostart();SaveDesktop();};figure.DropDownItems.Add(autostartItem);
    figure.DropDownItems.Add(new ToolStripSeparator());figure.DropDownItems.Add("Figur ausblenden",null,(s,e)=>Hide());menu.Items.Add(figure);
    var more=new ToolStripMenuItem("Mehr");more.DropDownItems.Add("Studio im Browser öffnen",null,(s,e)=>Process.Start(new ProcessStartInfo("http://127.0.0.1:31977"){UseShellExecute=true}));
    var webview=new ToolStripMenuItem("WebView2 von Microsoft installieren",null,(s,e)=>DesktopPanel.OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/"));more.DropDownItems.Add(webview);menu.Items.Add(more);
    menu.Opening+=(s,e)=>webview.Visible=!DesktopPanel.WebViewInstalled();
    menu.Items.Add(new ToolStripSeparator());menu.Items.Add(new ToolStripMenuItem("Companion beenden",null,async(s,e)=>await Quit()){Tag="danger"});fullMenu=menu;
    /* Schalter in Untermenüs bleiben nach dem Klick offen. */
    TecMonMenu.KeepOpenOnCheck(figure);TecMonMenu.KeepOpenOnCheck(tipsItem);
    /* Rechtsklick auf die Figur: Schnellmenü. Das vollständige Menü bleibt unter „Alle Optionen“ und am Tray-Symbol. */
    MouseUp+=(s,e)=>{if(e.Button==MouseButtons.Right)OpenQuick(Cursor.Position);};
    /* Gleicher Look für alle Untermenüs. */
    TecMonMenu.Apply(menu);StyleSubmenus(menu.Items);tipsItem.DropDownOpening+=(s,e)=>TecMonMenu.Apply(tipsItem.DropDown);
    if(!preview){tray=new NotifyIcon{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath),Text="TecMon Companion · Klick für Einstellungen",Visible=true,ContextMenuStrip=menu};tray.MouseClick+=(s,e)=>{if(e.Button==MouseButtons.Left){Show();Toggle();}};}
    MouseEnter+=(s,e)=>hover=true;MouseLeave+=(s,e)=>hover=false;
    MouseDown+=(s,e)=>{if(e.Button!=MouseButtons.Left)return;dragging=true;moved=false;dragStart=Cursor.Position;start=Location;Capture=true;};
    MouseMove+=(s,e)=>{if(!dragging)return;var delta=new Size(Cursor.Position.X-dragStart.X,Cursor.Position.Y-dragStart.Y);if(Math.Abs(delta.Width)+Math.Abs(delta.Height)>5)moved=true;if(moved){var bounds=Screen.FromPoint(Cursor.Position).WorkingArea;Location=Fit(new Point(start.X+delta.Width,start.Y+delta.Height),bounds,Size);x=Left;y=Top;if(panel!=null&&panel.Visible)AnchorPanel();}};
    MouseUp+=(s,e)=>{if(e.Button!=MouseButtons.Left||!dragging)return;dragging=false;Capture=false;if(!moved)Toggle();};
    KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape&&panel!=null)panel.Hide();else if(e.KeyCode==Keys.Enter||e.KeyCode==Keys.Space)Toggle();};
    /* Etwa 60 Bilder pro Sekunde; Bewegung nach vergangener Zeit statt pro Takt, damit sie gleichmäßig bleibt. */
    animation.Interval=15;animation.Tick+=(s,e)=>Tick();
    poll.Interval=1500;poll.Tick+=async(s,e)=>{if(openSignal!=null&&openSignal.WaitOne(0)){Show();Toggle();}if(polling)return;polling=true;try{var state=await State();failures=0;busy=Convert.ToBoolean(state["active"]);bool onTop=OnTop();if(TopMost!=onTop)TopMost=onTop;if(busy!=wasBusy){/* Waehrend Aufnahme/Download sichtbar bleiben; hinter CS2 nur, solange CS2 vorn liegt. */if(busy&&panel!=null)panel.Hide();if(tray!=null)tray.Text=busy?"TecMon Companion · Aufnahme läuft …":"TecMon Companion · Klick für Einstellungen";Render();}wasBusy=busy;ShowStatus(state);ShowWork(state);ShowTip(state);ShowPet(state);ShowGames(state);ShowClips(state);ShowScoreboard(state);ShowAuto(state);ShowBacklog(state);ShowOverlay(state);ShowChat(state);ShowChatBubble(state);ShowDesktop(state);IdleChat();if(!updateChecked&&!busy){updateChecked=true;var ignored=CheckUpdate(true);}}catch(Exception error){if(statusItem!=null)statusItem.Text="○ Lokaler Dienst antwortet nicht";/* Nur beenden, wenn der lokale Dienst wirklich weg ist; ein langsamer Dienst waehrend der CS2-Aufnahme zaehlt nicht. */var web=error as System.Net.WebException;bool gone=web!=null&&web.Status==System.Net.WebExceptionStatus.ConnectFailure;if(gone?++failures>=3:++failures>=200)Close();}finally{polling=false;}};
    Shown+=(s,e)=>{if(!preview&&!owns){openSignal.Set();BeginInvoke(new Action(Close));return;}if(startSettings!=null)ApplyDesktop(startSettings);else if(!preview)LoadFigure();Render();animation.Start();if(!preview)poll.Start();
      /* Erster Start nach dem Setup (desktop.json tutorial = 0): Fenster öffnen, dort startet der Rundgang. */
      object seen;bool firstTour=!preview&&startSettings!=null&&startSettings.TryGetValue("tutorial",out seen)&&seen is int&&(int)seen==0;
      if(openOnStart||firstTour)Toggle();};
    FormClosed+=(s,e)=>{animation.Stop();poll.Stop();if(panel!=null)panel.Dispose();if(tip!=null)tip.Dispose();if(overlay!=null)overlay.Dispose();if(chatOverlay!=null)chatOverlay.Dispose();if(chatTip!=null)chatTip.Dispose();if(tray!=null)tray.Dispose();if(sheet!=null)sheet.Dispose();if(model!=null)model.Dispose();if(cells!=null)foreach(var cell in cells)cell.Dispose();if(canvas!=null)canvas.Dispose();if(figure!=null)figure.Dispose();if(figureFrame!=null)figureFrame.Dispose();if(owns)singleton.ReleaseMutex();if(singleton!=null)singleton.Dispose();if(openSignal!=null)openSignal.Dispose();animation.Dispose();poll.Dispose();};
  }
  Bitmap model,canvas;Bitmap[] cells;double yaw,yawVel,clockLast,talkUntil,happyUntil,blinkAt=3,blinkUntil,pendingSince,frontSince=-1,moodAt=10,moodUntil,activeAt;int mood=-1,afterTalk=-1,forced=-1;double busyFrame;bool watching;Action pendingTip;
  readonly Stopwatch clock=Stopwatch.StartNew();readonly Random random=new Random();/* Bogen: 72 Drehwinkel in 5°-Schritten, danach die LED-Ausdrücke (Reihenfolge wie FACES in scripts/figure-3d/faces.py). */
  const int CellW=200,CellH=130,Cols=8,Turns=72,Blink=72,Happy=73,TalkA=74,TalkB=75,FocusFace=76,Busy=77,Wink=78,Surprised=79,Dizzy=80,Laugh=81,Love=82,Kiss=83,Angry=84,Sleepy=85,Tongue=86,Sad=87,Cool=88,Star=89,Confused=90,Busy2=91,Busy3=92,Busy4=93,LookL=94,LookR=95,Faces=96;
  const double Step=360.0/Turns,SleepAfter=180;
  static readonly int[] Moods={Wink,Love,Star,Tongue,Cool,Laugh,Kiss,Happy,Confused};
  void Tick(){
    double now=clock.Elapsed.TotalSeconds,dt=Math.Min(0.1,Math.Max(0,now-clockLast));clockLast=now;
    if(!Visible)return;
    /* Während der Aufnahme sichtbar bleiben und sanft schweben, aber sparsam: etwa 20 Bilder pro Sekunde, kein Umherfliegen. */
    if(busy){if(now-busyFrame<0.05)return;busyFrame=now;yaw=0;yawVel=0;Render();return;}
    if(animate)phase+=dt*1.875;
    /* Erst zum Nutzer umdrehen, dann sprechen. */
    /* Vorn angekommen: kurz staunen, dann sprechen. */
    bool facing=Math.Abs(Turn(0))<4;if(pendingTip==null||!facing)frontSince=-1;else if(frontSince<0)frontSince=now;
    if(pendingTip!=null&&(model==null||!animate||(frontSince>=0&&now-frontSince>0.45)||now-pendingSince>1.2)){var show=pendingTip;pendingTip=null;frontSince=-1;show();}
    if(hover||dragging||(panel!=null&&panel.Visible)||MenuOpen()||Talking(now)||pendingTip!=null||watching)activeAt=now;
    /* Ab und zu ein anderer Ausdruck, wenn TecMon gerade nichts zu tun hat. */
    if(now>moodAt){moodAt=now+9+random.NextDouble()*9;if(facing&&!Talking(now)&&now>happyUntil&&pendingTip==null&&!watching&&now-activeAt<SleepAfter){mood=Moods[random.Next(Moods.Length)];moodUntil=now+1.7;}}
    if(wandering&&animate&&!dragging&&!hover&&(panel==null||!panel.Visible)&&!MenuOpen()&&!Talking(now)&&pendingTip==null){var bounds=Screen.FromRectangle(Bounds).WorkingArea;x+=vx*dt*25;y+=vy*dt*25;if(x<bounds.Left||x+Width>bounds.Right)vx=-vx;if(y<bounds.Top||y+Height>bounds.Bottom)vy=-vy;var next=Fit(new Point((int)Math.Round(x),(int)Math.Round(y)),bounds,Size);if(next!=Location)Location=next;x=Math.Max(bounds.Left,Math.Min(bounds.Right-Width,x));y=Math.Max(bounds.Top,Math.Min(bounds.Bottom-Height,y));}
    if(model!=null&&animate){
      /* Gedämpfte Feder: weiches Anlaufen und Abbremsen beim Drehen. */
      /* Trick: eine schnelle ganze Drehung, danach federt die Figur wieder nach vorn. */
      if(spinLeft>0){double step=Math.Min(spinLeft,600*dt);spinLeft-=step;yaw=(yaw+step)%360;yawVel=0;}
      else{double diff=Turn(Target(now));yawVel+=(diff*70-yawVel*16.7)*dt;yaw=((yaw+yawVel*dt)%360+360)%360;}
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
    if(dragging||hover||(panel!=null&&panel.Visible)||MenuOpen()||!wandering)return 0;
    return Math.Sin(now*0.31)>0.45?0:(vx>0?32:-32);
  }
  /* Welcher LED-Ausdruck gerade gilt; -1 = normales Drehbild. */
  int FaceIndex(double now){
    if(forced>=0)return forced;
    /* Beim Video: Lade-Ring in 4 Phasen (Einzelbilder statt GIF). */
    if(busy){int k=(int)(now*4)%4;return k==0?Busy:k==1?Busy2:k==2?Busy3:Busy4;}
    if(Math.Abs(Turn(0))>=4)return -1;
    if(pendingTip!=null)return Surprised;
    if(Talking(now)){int m=(int)(now*9)%4;return m==1?TalkB:m==3?-1:TalkA;}
    if(now<happyUntil)return afterTalk>=0?afterTalk:Happy;
    if(petAsleep||(!watching&&now-activeAt>SleepAfter))return Sleepy;
    if(now<blinkUntil)return Blink;
    if(now<moodUntil&&mood>=0)return mood;
    /* Ab und zu ruhig nach links und rechts schauen. */
    double glance=now%13;if(glance<0.8)return LookL;if(glance>6.5&&glance<7.3)return LookR;
    return -1;
  }
  /* Zeichnet die Figur im jeweils nächsten der 72 Blickwinkel. */
  void Draw3D(Graphics g){
    g.Clear(Color.Transparent);g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.Bilinear;g.PixelOffsetMode=System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
    double now=clock.Elapsed.TotalSeconds;bool live=animate;
    int face=FaceIndex(now);
    /* Schweben, leichtes Wiegen und Neigen in die Drehung; Teilpixel, damit nichts ruckelt. */
    float bob=live?(float)(Math.Sin(now*2.1)*5):0,roll=live?(float)(Math.Sin(now*1.4)*2.5+Math.Max(-7,Math.Min(7,yawVel*0.02))+Math.Max(-3,Math.Min(3,vx*4))):0;
    if(live&&Talking(now))bob-=(float)Math.Abs(Math.Sin(now*9))*1.6f;
    g.TranslateTransform(Width/2f,Height/2f+bob);g.RotateTransform(roll);
    var target=new Rectangle(-CellW/2,-CellH/2,CellW,CellH);
    /* High process: das Modell selbst, stufenlos gedreht; nur neu zeichnen, wenn sich Winkel oder Gesicht ändern. */
    if(highQuality&&figure!=null){
      string name=face>=Turns&&face-Turns<FaceList.Length?FaceList[face-Turns]:"idle";
      double angle=face>=0&&forced>=0?0:yaw;string key=name+"|"+Math.Round(angle*20);
      if(figureFrame==null||key!=frameKey){figure.SetFace(name);var next=figure.Render(angle,0);if(figureFrame!=null)figureFrame.Dispose();figureFrame=next;frameKey=key;}
      g.DrawImage(figureFrame,target);var extra=figure.Extra(name);if(extra!=null)g.DrawImage(extra,target);return;
    }
    if(face>=0){g.DrawImage(cells[face],target);return;}
    /* Nächster Blickwinkel ohne Überblendung: halbdurchsichtige Mischbilder zogen einen Schleier nach. */
    int turn=((int)Math.Round(yaw/Step)%Turns+Turns)%Turns;
    g.DrawImage(cells[turn],target);
  }
  Bitmap Frame3D(){var bitmap=new Bitmap(Width,Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(bitmap))Draw3D(g);return bitmap;}
  /* Vorschau ohne Fenster: Drehwinkel in Grad, Ausdruck als Bildnummer (-1 = automatisch). */
  public Bitmap Preview(double degrees,int face){activeAt=clock.Elapsed.TotalSeconds;yaw=face>=0?0:degrees;forced=face;var bitmap=Frame3D();forced=-1;return bitmap;}
  public bool HasModel{get{return model!=null;}}
  /* Ausdrücke ab Bild 72 in der Reihenfolge von render.cjs/faces.py (ohne idle). */
  static readonly string[] FaceList={"blink","happy","talkA","talkB","focus","busy","wink","surprised","dizzy","laugh","love","kiss","angry","sleepy","tongue","sad","cool","star","confused","busy2","busy3","busy4","lookL","lookR"};
  FigureModel figure;Bitmap figureFrame;string frameKey="";bool simpleUi,highQuality=true,figureLoading,figureFailed,applying,autostart,desktopKnown;Dictionary<string,object> startSettings;ToolStripMenuItem motionItem,highItem,lowItem,autostartItem;string desktopSignature="";
  /* Modell aus der Ressource im Hintergrund laden; fehlt es oder ist es kaputt, bleibt die Bild-Figur. */
  void LoadFigure(){
    if(!highQuality||figure!=null||figureLoading||figureFailed||cells==null)return;figureLoading=true;
    Task.Run(()=>{using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonModel")){if(stream==null)return (FigureModel)null;return FigureModel.Load(stream);}}).ContinueWith(t=>{
      figureLoading=false;if(t.IsFaulted||t.Result==null){figureFailed=true;return;}
      if(IsDisposed){t.Result.Dispose();return;}figure=t.Result;frameKey="";Render();
    },TaskScheduler.FromCurrentSynchronizationContext());
  }
  /* Für Vorschau und Tests: Modell sofort laden. */
  public bool LoadFigureNow(){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("TecMonModel")){if(stream==null)return false;figure=FigureModel.Load(stream);highQuality=true;return true;}}
  void SetQuality(bool high){highQuality=high;SyncDesktopMenu();if(high)LoadFigure();frameKey="";Render();SaveDesktop();}
  void SyncDesktopMenu(){
    applying=true;
    try{if(flyItem!=null)flyItem.Checked=wandering;if(motionItem!=null)motionItem.Checked=animate;if(topItem!=null)topItem.Checked=foreground;if(highItem!=null)highItem.Checked=highQuality;if(lowItem!=null)lowItem.Checked=!highQuality;if(autostartItem!=null)autostartItem.Checked=autostart;}
    finally{applying=false;}
  }
  static bool Flag(Dictionary<string,object> d,string key,bool fallback){object v;return d.TryGetValue(key,out v)&&v is bool?(bool)v:fallback;}
  void ApplyDesktop(Dictionary<string,object> d){
    desktopKnown=true;
    wandering=Flag(d,"wander",true);animate=Flag(d,"animate",true);foreground=Flag(d,"foreground",true);autostart=Flag(d,"autostart",false);
    object q;highQuality=!(d.TryGetValue("quality",out q)&&Convert.ToString(q)=="low");
    object ui;simpleUi=d.TryGetValue("ui",out ui)&&Convert.ToString(ui)=="simple";
    object pos;var place=d.TryGetValue("chatPos",out pos)?pos as Dictionary<string,object>:null;
    chatAnchor=place!=null&&place.ContainsKey("x")&&place.ContainsKey("y")?(Point?)new Point(Convert.ToInt32(place["x"]),Convert.ToInt32(place["y"])):null;
    if(chatOverlay!=null&&!chatOverlay.Moving)chatOverlay.SetAnchor(chatAnchor);
    TopMost=OnTop();SyncDesktopMenu();ApplyAutostart();if(highQuality)LoadFigure();frameKey="";
  }
  /* Einstellungen aus dem Companion (auch aus dem Fenster geändert) übernehmen. */
  void ShowDesktop(Dictionary<string,object> state){
    object raw;var d=state.TryGetValue("desktop",out raw)?raw as Dictionary<string,object>:null;if(d==null)return;
    var signature=TecMon.Json.Serialize(d);if(signature==desktopSignature)return;desktopSignature=signature;ApplyDesktop(d);Render();
  }
  bool autostartApplied,autostartState;
  void ApplyAutostart(){
    if(preview||(autostartApplied&&autostartState==autostart))return;
    try{if(TecMon.AutostartOn()!=autostart)TecMon.SetAutostart(autostart);autostartApplied=true;autostartState=autostart;}
    catch(Exception error){if(tray!=null)tray.ShowBalloonTip(5000,"TecMon","Autostart konnte nicht geändert werden: "+error.Message,ToolTipIcon.Warning);}
  }
  async void SaveDesktop(){
    if(applying||preview)return;
    string body=TecMon.Json.Serialize(new Dictionary<string,object>{{"quality",highQuality?"high":"low"},{"wander",wandering},{"animate",animate},{"foreground",foreground},{"autostart",autostart},{"chatPos",chatAnchor.HasValue?(object)new Dictionary<string,object>{{"x",chatAnchor.Value.X},{"y",chatAnchor.Value.Y}}:null}});
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/desktop/settings",true,body));object d;if(result.TryGetValue("desktop",out d))desktopSignature=TecMon.Json.Serialize(d);}
    catch(Exception error){if(tray!=null)tray.ShowBalloonTip(4000,"TecMon","Einstellung nicht gespeichert: "+error.Message,ToolTipIcon.Warning);}
  }
  bool wasBusy,updateChecked,tipsEnabled;ToolStripMenuItem statusItem,updateItem,tipsItem,tipsOn;string featureSignature="",liveKey="";bool liveShowing;double tipShownAt=-100;string offeredUpdate="";TipBubble tip;long lastTip=-1;
  static string TipTitle(string category){switch(category){case "economy":return "Wirtschaft";case "buy":return "Kauf-Check";case "death":return "Nach dem Tod";case "bomb":return "Bombe";case "habit":return "Gewohnheit";case "mindset":return "Kopf frei";case "summary":return "Zusammenfassung";case "weapon":return "Waffe";case "map":return "Map";case "warmup":return "Aufwärmen";case "praise":return "Stark";case "history":return "Deine Matches";case "team":return "Team";case "farm":return "Farm";case "buyback":return "Buyback";case "actives":return "Items";case "gold":return "Gold";default:return "Rundentipp";}}
  /* Neue Tipps aus der CS2 Game State Integration neben der Figur zeigen, nie während einer Demo-Aufnahme. */
  /* Sprechblase mit dem aktuellen Schritt beim Video (Download, Aufnahme, Branding, fertig). Bleibt stehen, bis der nächste Schritt kommt; Klick blendet sie aus. */
  string workKey="",workSeen="";
  void ShowWork(Dictionary<string,object> state){
    object raw;var work=state.TryGetValue("work",out raw)?raw as Dictionary<string,object>:null;if(work==null)return;
    string id=Convert.ToString(work["id"]),status=Convert.ToString(work["status"]),key=id+"|"+status;if(key==workKey)return;workKey=key;
    bool finished=status=="done"||status=="error";
    /* "Fertig" nur für einen Auftrag, den die Figur selbst laufen gesehen hat. */
    if(finished&&workSeen!=id)return;if(!finished)workSeen=id;
    long step=Convert.ToInt64(work["step"]),steps=Convert.ToInt64(work["steps"]);
    string heading=status=="error"?"Video":status=="done"?"Video fertig":steps>1&&step>0?"Video · Schritt "+step+" von "+steps:"Video";
    string text=Convert.ToString(work["text"])??"";
    if(tip==null||tip.IsDisposed)tip=new TipBubble();var area=Screen.PrimaryScreen.WorkingArea;
    tip.Compact=false;liveShowing=false;liveKey="";tip.Present(heading,text,Visible?Bounds:new Rectangle(area.Right-180,area.Bottom-205,144,164),null,-1,false,!finished);
    if(finished){double now=clock.Elapsed.TotalSeconds;happyUntil=now+4;afterTalk=status=="done"?Star:Sad;}
  }
  void ShowTip(Dictionary<string,object> state){
    object raw;var gsi=state.TryGetValue("gsi",out raw)?raw as Dictionary<string,object>:null;if(gsi==null)return;
    tipsEnabled=gsi.ContainsKey("enabled")&&Convert.ToBoolean(gsi["enabled"]);if(tipsOn!=null)tipsOn.Checked=tipsEnabled;
    SyncFeatures(gsi);
    /* Dota-2-Tipps: eigener Schalter im Companion; die Figur zeigt sie, wenn Dota zuletzt Daten geschickt hat. */
    if(gsi.ContainsKey("dotaActive")&&Convert.ToBoolean(gsi["dotaActive"]))tipsEnabled=true;
    watching=tipsEnabled&&gsi.ContainsKey("quiet")&&Convert.ToBoolean(gsi["quiet"]);
    if(watching)pendingTip=null;
    object liveRaw;var live=gsi.TryGetValue("live",out liveRaw)?liveRaw as Dictionary<string,object>:null;
    /* Neue Tipps haben Vorrang. Ein Tipp, der erst nach Rundenstart ankommt (quiet), verfällt statt verspätet zu erscheinen. */
    object tipRaw;var current=gsi.TryGetValue("tip",out tipRaw)?tipRaw as Dictionary<string,object>:null;
    if(current!=null){
      long id=Convert.ToInt64(current["id"]);
      if(id!=lastTip){
        lastTip=id;
        if(!busy&&tipsEnabled&&!watching&&Convert.ToInt64(current["age"])<=20000){ShowRealTip(gsi,current);return;}
      }
    }
    /* Live-Anzeigen je Phase: dieselbe stehende Sprechblase, nur der Wert ändert sich, keine neue Blase. Sie wartet, bis ein Tipp gelesen ist (8 s). */
    if(live!=null&&tipsEnabled&&!busy){
      bool free=tip==null||tip.IsDisposed||!tip.Visible||liveShowing||clock.Elapsed.TotalSeconds-tipShownAt>8;
      if(free&&pendingTip==null){
        string liveHeading=Convert.ToString(live["heading"])??"TecMon",liveText=Convert.ToString(live["text"])??"",liveId=liveHeading+"|"+liveText;
        if(liveId!=liveKey||!liveShowing||tip==null||tip.IsDisposed||!tip.Visible){
          liveKey=liveId;liveShowing=true;if(tip==null||tip.IsDisposed)tip=new TipBubble();tip.Compact=true;
          tip.Present(liveHeading,liveText,TipAnchor(),null,-2,false,true);
        }
      }
      return;
    }
    if(liveShowing){liveShowing=false;liveKey="";if(tip!=null&&!tip.IsDisposed)tip.Quiet();}
    if(watching){pendingTip=null;if(tip!=null&&!tip.IsDisposed)tip.Quiet();}
  }
  void ShowRealTip(Dictionary<string,object> gsi,Dictionary<string,object> current){
    object picture;current.TryGetValue("visual",out picture);
    long round=current.ContainsKey("round")?Convert.ToInt64(current["round"]):-1;
    string category=current.ContainsKey("category")?Convert.ToString(current["category"]):"";int after=category=="death"?Sad:category=="praise"?Star:category=="mindset"?Love:Happy;string title=TipTitle(category),text=Convert.ToString(current["text"])??"";var visualData=picture as Dictionary<string,object>;bool stack=FeatureOn(gsi,"stack");
    Action show=()=>{
      if(tip==null||tip.IsDisposed)tip=new TipBubble();
      liveShowing=false;liveKey="";tipShownAt=clock.Elapsed.TotalSeconds;tip.Compact=false;
      tip.Present(title,text,TipAnchor(),visualData,round,stack);
      /* Mund bewegt sich ungefähr so lange, wie man zum Lesen braucht (höchstens 6 s), danach kurz ein Lächeln. */
      double now=clock.Elapsed.TotalSeconds;talkUntil=now+Math.Min(6,1.2+text.Length*0.045);happyUntil=talkUntil+1.1;afterTalk=after;
    };
    if(model==null||!animate||!Visible){show();return;}
    pendingTip=show;pendingSince=clock.Elapsed.TotalSeconds;
  }
  /* TecMon-Werte und Sprüche aus dem Companion (personality.mjs). */
  ToolStripMenuItem personality;bool petAsleep;long lastPetEvent=-1;double spinLeft;
  static readonly Dictionary<string,int> FaceNames=new Dictionary<string,int>{{"happy",Happy},{"laugh",Laugh},{"love",Love},{"star",Star},{"sleepy",Sleepy},{"surprised",Surprised},{"wink",Wink},{"sad",Sad},{"cool",Cool},{"angry",Angry},{"confused",Confused},{"tongue",Tongue},{"kiss",Kiss},{"dizzy",Dizzy}};
  static void StyleSubmenus(ToolStripItemCollection items){foreach(ToolStripItem item in items){var sub=item as ToolStripMenuItem;if(sub!=null&&sub.HasDropDownItems){TecMonMenu.Apply(sub.DropDown);StyleSubmenus(sub.DropDownItems);}}}
  ContextMenuStrip fullMenu;QuickMenu quick;ToolStripMenuItem flyItem,topItem;string petMode="normal";
  /* HUAN ist ab 18: vor dem Einschalten einmal bestätigen lassen. */
  bool ConfirmHuan(){
    if(petMode=="huan")return true;
    return MessageBox.Show(this,"HUAN-Modus (ab 18) einschalten?\n\nTecMon wird derb: Flüche und harter Trashtalk über dein Aim, deine Waffenwahl, dein Quiz-Wissen und deine Spielweise. Keine Beleidigungen von Menschen.","TecMon · HUAN-Modus (18+)",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)==DialogResult.Yes;
  }
  bool MenuOpen(){return (fullMenu!=null&&fullMenu.Visible)||(quick!=null&&!quick.IsDisposed&&quick.Visible);}
  void OpenQuick(Point at){
    if(quick!=null&&!quick.IsDisposed)quick.Close();
    quick=BuildQuick(at);quick.Open(at);
  }
  /* Schnellmenü (Rechtsklick). In der Ansicht „Einfach“ nur das Nötigste; „Alle Optionen …“ bleibt immer da. */
  public QuickMenu BuildQuick(Point at){
    var q=new QuickMenu();q.Status=statusItem!=null?statusItem.Text:"";
    q.Heading("SCHNELLZUGRIFF");
    q.Tile("Einstellungen","Ansicht, Figur & mehr",()=>OpenPanel("figur",""));
    if(simpleUi){
      q.Tile("Highlights","Aufnehmen auf TecMon",()=>OpenPanel("games",""));
      q.Tile("Letzte Videos","Fertige Aufnahmen",()=>OpenPanel("videos",""));
      q.Tile("TecMon.online","Im Browser öffnen",()=>DesktopPanel.OpenExternal("https://tecmon.online"));
      q.Tile("Mit TecMon spielen","Minispiele & Werte",()=>OpenPanel("tecmon",""));
      q.Tile("Rundgang","Zeigt dir alles",()=>OpenPanel("tutorial",""));
    } else {
      q.Tile("Fadenkreuz","Overlay fuer alle Spiele",()=>OpenPanel("fadenkreuz",""));
      q.Tile("Highlights","Aufnehmen auf TecMon",()=>OpenPanel("games",""));
      q.Tile("Clip speichern","Strg+Alt+T",async()=>await SaveClip());
      q.Tile("Letzte Videos","Fertige Aufnahmen",()=>OpenPanel("videos",""));
      q.Tile("Mit TecMon spielen","Minispiele & Werte",()=>OpenPanel("tecmon",""));
      q.Tile("TecMon.online","Im Browser öffnen",()=>DesktopPanel.OpenExternal("https://tecmon.online"));
    }
    q.EndTiles();
    q.Heading("SCHALTER");
    q.Toggle("Highlight-Video nach dem Match",()=>autoEnabled,async()=>await ToggleAuto());
    q.Toggle("Stats hochladen beim Schließen",()=>backlogAsk,async()=>await ToggleBacklog());
    q.Toggle("CS2-Rundentipps",()=>tipsEnabled,async()=>await ToggleTips());
    if(!simpleUi){
      q.Toggle("Clip-Puffer",()=>clipsEnabled,async()=>await ToggleClips());
      q.Toggle("Figur fliegt umher",()=>wandering,()=>{if(flyItem!=null)flyItem.Checked=!flyItem.Checked;});
      q.Toggle("Figur im Vordergrund",()=>foreground,()=>{if(topItem!=null)topItem.Checked=!topItem.Checked;});
      q.Toggle("3D-Modell (High process)",()=>highQuality,()=>SetQuality(!highQuality));
    }
    q.Toggle("Mit Windows starten",()=>autostart,()=>{if(autostartItem!=null)autostartItem.Checked=!autostartItem.Checked;});
    q.Heading("PERSÖNLICHKEIT");
    q.Chips(new[]{"Nett","Normal","Nerdy","HUAN"},new[]{"nett","normal","nerdy","huan"},()=>petMode,async mode=>{if(mode=="huan"&&!ConfirmHuan())return;petMode=mode;await PetRequest("/api/pet/mode","{\"mode\":\""+mode+"\"}");});
    q.Heading("ANSICHT");
    q.Chips(new[]{"Einfach","Erweitert"},new[]{"simple","advanced"},()=>simpleUi?"simple":"advanced",async mode=>{simpleUi=mode=="simple";await PetRequest("/api/desktop/settings","{\"ui\":\""+mode+"\"}");});
    if(offeredUpdate!="")q.Footer("Update "+offeredUpdate+" installieren",async()=>await CheckUpdate(false),false);
    q.Footer("Alle Optionen …",()=>fullMenu.Show(at),false);
    q.Footer("Companion beenden",async()=>await Quit(),true);
    return q;
  }
  void OpenPanel(string id,string game){Show();if(panel==null||panel.IsDisposed||!panel.Visible)Toggle();if(panel!=null)panel.Jump(id,game);}
  /* Leerlauf-Sprüche: nur ohne Aufnahme, wach und ohne Spiel im Vordergrund; alle 4–7 Minuten, Fehler still. */
  double nextIdleChat=180;
  async void IdleChat(){
    if(busy||petAsleep||MenuOpen()||clock.Elapsed.TotalSeconds<nextIdleChat)return;
    nextIdleChat=clock.Elapsed.TotalSeconds+240+random.Next(180);
    if(GameInFront()||ForegroundIs("dota2"))return;
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/pet/interact",true,"{\"action\":\"idle\"}"));var wrap=new Dictionary<string,object>();wrap["pet"]=result.ContainsKey("pet")?result["pet"]:null;ShowPet(wrap);}catch(Exception){}
  }
  static bool ForegroundIs(string name){try{int id;GetWindowThreadProcessId(GetForegroundWindow(),out id);if(id==0)return false;using(var process=Process.GetProcessById(id))return process.ProcessName.Equals(name,StringComparison.OrdinalIgnoreCase);}catch(Exception){return false;}}
  async Task PetAction(string action){await PetRequest("/api/pet/interact","{\"action\":\""+action+"\"}");}
  async Task PetRequest(string route,string body){
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request(route,true,body));var wrap=new Dictionary<string,object>();wrap["pet"]=result.ContainsKey("pet")?result["pet"]:null;ShowPet(wrap);if(result.ContainsKey("games"))ShowGames(result);}
    catch(Exception error){if(tray!=null)tray.ShowBalloonTip(4000,"TecMon",error.Message,ToolTipIcon.Warning);}
  }
  /* Clips: Strg+Alt+T ueber RegisterHotKey. Das ist eine einzelne systemweite Taste, kein Mitlesen der Tastatur, und nimmt dem Spiel nicht den Fokus. */
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr window,int id,uint modifiers,uint key);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr window,int id);
  const int ClipHotkey=0x7C1;bool clipsEnabled,clipHotkey,savingClip;ToolStripMenuItem clipsOn;
  protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);if(!preview)clipHotkey=RegisterHotKey(Handle,ClipHotkey,0x0001|0x0002|0x4000,(uint)Keys.T);}
  protected override void OnHandleDestroyed(EventArgs e){if(clipHotkey)UnregisterHotKey(Handle,ClipHotkey);clipHotkey=false;if(scoreHotkey)UnregisterHotKey(Handle,ScoreHotkey);scoreHotkey=false;base.OnHandleDestroyed(e);}
  string lastOverlayRuntime="";double lastOverlayRuntimeAt=-100;CrosshairOverlay overlay;ChatOverlay chatOverlay;Point? chatAnchor;long lastChatMove=-1;
  void EnsureChatOverlay(){
    if(chatOverlay!=null)return;
    chatOverlay=new ChatOverlay();chatOverlay.CreateControl();var ignored=chatOverlay.Handle;chatOverlay.Anchor=chatAnchor;
    chatOverlay.Moved=p=>{chatAnchor=p;SaveDesktop();if(tray!=null)tray.ShowBalloonTip(3000,"TecMon","Position des Chat-Overlays gespeichert.",ToolTipIcon.Info);};
  }
  void MoveChatOverlay(){EnsureChatOverlay();if(chatOverlay.Moving)chatOverlay.StopMove(true);else chatOverlay.StartMove();}
  void ResetChatOverlay(){chatAnchor=null;if(chatOverlay!=null)chatOverlay.ResetPosition();SaveDesktop();}
  void ShowChat(Dictionary<string,object> state){
    object raw;var c=state.TryGetValue("chat",out raw)?raw as Dictionary<string,object>:null;
    bool on=c!=null&&c.ContainsKey("enabled")&&Convert.ToBoolean(c["enabled"]);
    long move=c!=null&&c.ContainsKey("move")?Convert.ToInt64(c["move"]):0;
    /* Knopf „Overlay verschieben“ auf der Companion-Seite: der Zähler steigt, die Figur startet das Verschieben. */
    bool moveNow=lastChatMove>=0&&move>lastChatMove;lastChatMove=move;
    if(!on&&chatOverlay==null&&!moveNow)return;
    EnsureChatOverlay();
    if(moveNow)chatOverlay.StartMove();
    if(c!=null&&c.ContainsKey("look"))chatOverlay.SetLook(c["look"] as Dictionary<string,object>);
    chatOverlay.Apply(on,c!=null&&c.ContainsKey("lines")?c["lines"] as System.Collections.IList:null,c!=null&&c.ContainsKey("header")?Convert.ToString(c["header"]):"",c!=null&&c.ContainsKey("warn")&&Convert.ToBoolean(c["warn"]),c!=null&&c.ContainsKey("window")&&Convert.ToBoolean(c["window"]));
  }
  /* Chat in der Sprechblase (Nutzerwunsch 22.11.2026): eigene Blase neben der Figur, unabhängig von den Rundentipps und ihrem quiet,
     nimmt CS2 nie den Fokus (wie TipBubble). Nur fertig übersetzte Zeilen; jede Zeile nur einmal, mehrere stapeln sich. */
  TipBubble chatTip;long lastChatBubble=-1;ToolStripMenuItem chatBubbleItem;readonly List<string> chatBubbleLines=new List<string>();
  void ShowChatBubble(Dictionary<string,object> state){
    object raw;var c=state.TryGetValue("chatBubble",out raw)?raw as Dictionary<string,object>:null;
    bool on=c!=null&&c.ContainsKey("enabled")&&Convert.ToBoolean(c["enabled"]);if(chatBubbleItem!=null)chatBubbleItem.Checked=on;
    if(!on){if(chatTip!=null&&!chatTip.IsDisposed)chatTip.Quiet();return;}
    if(busy)return;
    var lines=c.ContainsKey("lines")?c["lines"] as System.Collections.IList:null;if(lines==null)return;
    /* Eine Zeile je Nachricht (Nutzerwunsch 22.11.2026): „Name [CT]: Nachricht“, höchstens 4 Zeilen in einer Blase. */
    int added=0,letters=0;
    foreach(var item in lines){
      var line=item as Dictionary<string,object>;if(line==null)continue;
      long id=Convert.ToInt64(line["id"]);if(id<=lastChatBubble)continue;lastChatBubble=id;
      string name=Convert.ToString(line["name"])??"",text=Convert.ToString(line["text"])??"";if(text=="")continue;
      string channel=line.ContainsKey("channel")?Convert.ToString(line["channel"]):"",team=line.ContainsKey("team")?Convert.ToString(line["team"]):"";
      string tag=channel=="team"?(team=="ct"?"CT":team=="t"?"T":"Team"):channel=="spec"?"Zuschauer":"Alle";
      chatBubbleLines.Add(name+" ["+tag+"]"+(line.ContainsKey("dead")&&Convert.ToBoolean(line["dead"])?" †":"")+": "+text);
      added++;letters+=text.Length;
    }
    if(added==0)return;
    /* Ist die Blase schon verschwunden, beginnt sie neu nur mit den neuen Zeilen. */
    if(chatTip==null||chatTip.IsDisposed||!chatTip.Visible)chatBubbleLines.RemoveRange(0,chatBubbleLines.Count-added);
    while(chatBubbleLines.Count>4)chatBubbleLines.RemoveAt(0);
    if(chatTip==null||chatTip.IsDisposed)chatTip=new TipBubble();chatTip.Compact=true;
    var area=Screen.PrimaryScreen.WorkingArea;Rectangle anchor=Visible?Bounds:new Rectangle(area.Right-180,area.Bottom-205,144,164);
    /* Steht gerade ein Tipp, kommt der Chat darüber, damit sich beide nicht verdecken. */
    if(tip!=null&&!tip.IsDisposed&&tip.Visible)anchor=new Rectangle(anchor.Left,tip.Top-anchor.Height/2-90,anchor.Width,anchor.Height);
    chatTip.Present("TecMon Chat",string.Join("\n",chatBubbleLines.ToArray()),anchor,null,-5,false);
    double now=clock.Elapsed.TotalSeconds;talkUntil=Math.Max(talkUntil,now+Math.Min(4,1+letters*0.04));
  }
  void ShowOverlay(Dictionary<string,object> state){
    object raw;var o=state.TryGetValue("overlay",out raw)?raw as Dictionary<string,object>:null;
    bool on=o!=null&&o.ContainsKey("enabled")&&Convert.ToBoolean(o["enabled"]);
    if(!on&&overlay==null)return;
    if(overlay==null){overlay=new CrosshairOverlay();overlay.CreateControl();var ignored=overlay.Handle;}
    overlay.Runtime=async(paused,hotkey)=>{string next=(paused?"1":"0")+(hotkey?"1":"0");if(next==lastOverlayRuntime&&clock.Elapsed.TotalSeconds-lastOverlayRuntimeAt<4)return;try{await Request("/api/crosshair/runtime",true,"{\"paused\":"+(paused?"true":"false")+",\"hotkey\":"+(hotkey?"true":"false")+"}");lastOverlayRuntime=next;lastOverlayRuntimeAt=clock.Elapsed.TotalSeconds;}catch{}};
    overlay.Apply(on,o!=null&&o.ContainsKey("crosshair")?o["crosshair"] as Dictionary<string,object>:null,o);
  }
  /* Wardogs: Strg+Alt+S nur angemeldet, solange das Scoreboard-Foto eingeschaltet ist; sonst bleibt die Taste frei. */
  const int ScoreHotkey=0x7C2;bool scoreHotkey,capturingScore;
  void ShowScoreboard(Dictionary<string,object> state){
    object raw;var sb=state.TryGetValue("scoreboard",out raw)?raw as Dictionary<string,object>:null;
    bool on=sb!=null&&sb.ContainsKey("enabled")&&Convert.ToBoolean(sb["enabled"]);
    if(preview||!IsHandleCreated)return;
    if(on&&!scoreHotkey)scoreHotkey=RegisterHotKey(Handle,ScoreHotkey,0x0001|0x0002|0x4000,(uint)Keys.S);
    else if(!on&&scoreHotkey){UnregisterHotKey(Handle,ScoreHotkey);scoreHotkey=false;}
  }
  /* Rueckmeldung nur als Windows-Hinweis, kein Fokuswechsel. Waehrend der Fotos haelt der Spieler Tab. */
  async Task CaptureScoreboard(){
    if(capturingScore)return;capturingScore=true;
    try{
      if(tray!=null)tray.ShowBalloonTip(2500,"TecMon Wardogs","Scoreboard-Foto: jetzt Tab halten (4 Sekunden).",ToolTipIcon.Info);
      var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/wardogs/capture",true));
      if(tray!=null)tray.ShowBalloonTip(5000,"TecMon Wardogs",Convert.ToString(result["message"]),ToolTipIcon.Info);
    }
    catch(Exception error){if(tray!=null)tray.ShowBalloonTip(6000,"TecMon Wardogs",error.Message,ToolTipIcon.Warning);}
    finally{capturingScore=false;}
  }
  void ShowClips(Dictionary<string,object> state){object raw;var clips=state.TryGetValue("clips",out raw)?raw as Dictionary<string,object>:null;if(clips==null)return;clipsEnabled=clips.ContainsKey("recording")&&Convert.ToBoolean(clips["recording"]);if(clipsOn!=null)clipsOn.Checked=clipsEnabled;}
  /* Highlight-Video nach dem Match: Frage erst, wenn CS2 geschlossen ist (der Companion prueft das), daher darf ein Dialog erscheinen. */
  bool autoEnabled,autoAsking;string autoOffer="",autoRun="",autoStatus="";ToolStripMenuItem autoOn;
  void ShowAuto(Dictionary<string,object> state){
    object raw;var auto=state.TryGetValue("auto",out raw)?raw as Dictionary<string,object>:null;if(auto==null)return;
    autoEnabled=auto.ContainsKey("enabled")&&Convert.ToBoolean(auto["enabled"]);if(autoOn!=null)autoOn.Checked=autoEnabled;
    var offer=auto.ContainsKey("offer")?auto["offer"] as Dictionary<string,object>:null;
    if(offer!=null&&!autoAsking&&Convert.ToString(offer["id"])!=autoOffer){autoOffer=Convert.ToString(offer["id"]);string id=autoOffer,map=Convert.ToString(offer["map"]);BeginInvoke(new Action(async()=>await AskAuto(id,map)));}
    var run=auto.ContainsKey("run")?auto["run"] as Dictionary<string,object>:null;if(run==null||tray==null)return;
    string runId=Convert.ToString(run["id"]),status=Convert.ToString(run["status"]);if(runId==autoRun&&status==autoStatus)return;autoRun=runId;autoStatus=status;
    if(status=="ready")tray.ShowBalloonTip(6000,"TecMon Highlights","Demo geladen. Die TecMon-Seite öffnet sich und erstellt das Video.",ToolTipIcon.Info);
    else if(status=="error")tray.ShowBalloonTip(8000,"TecMon Highlights",Convert.ToString(run["error"]),ToolTipIcon.Warning);
  }
  /* Eigenes TecMon-Fenster statt Windows-Dialog: nimmt CS2 keinen Fokus. */
  AutoPrompt autoPrompt;
  Task AskAuto(string id,string map){
    if(autoPrompt!=null&&!autoPrompt.IsDisposed)autoPrompt.Close();
    autoAsking=true;autoPrompt=new AutoPrompt(map);
    autoPrompt.Answered=async yes=>{
      try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/auto/answer",true,"{\"id\":\""+id+"\",\"yes\":"+(yes?"true":"false")+"}"));if(tray!=null)tray.ShowBalloonTip(5000,"TecMon Highlights",Convert.ToString(result["message"]),ToolTipIcon.Info);}
      catch(Exception error){if(tray!=null)tray.ShowBalloonTip(6000,"TecMon Highlights",error.Message,ToolTipIcon.Warning);}
    };
    autoPrompt.FormClosed+=(s,e)=>{autoAsking=false;};
    autoPrompt.Show();
    return Task.FromResult(0);
  }
  async Task ToggleAuto(){
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/auto/settings",true,autoEnabled?"{\"enabled\":false}":"{\"enabled\":true}"));autoEnabled=!autoEnabled;if(autoOn!=null)autoOn.Checked=autoEnabled;if(tray!=null)tray.ShowBalloonTip(6000,"TecMon Highlights",Convert.ToString(result["message"]),ToolTipIcon.Info);}
    catch(Exception error){MessageBox.Show("Automatisches Highlight-Video konnte nicht umgeschaltet werden.\n\n"+error.Message,"TecMon");}
  }
  /* „Stats hochladen?“ beim Schließen von CS2 (recent-matches-v1): der Companion fragt erst, wenn CS2 zu ist. */
  bool backlogAsk=true,backlogAsking;string backlogOffer="";ToolStripMenuItem backlogOn;AutoPrompt backlogPrompt;
  void ShowBacklog(Dictionary<string,object> state){
    object raw;var backlog=state.TryGetValue("backlog",out raw)?raw as Dictionary<string,object>:null;if(backlog==null)return;
    backlogAsk=backlog.ContainsKey("ask")&&Convert.ToBoolean(backlog["ask"]);if(backlogOn!=null)backlogOn.Checked=backlogAsk;
    var offer=backlog.ContainsKey("offer")?backlog["offer"] as Dictionary<string,object>:null;
    if(offer==null||backlogAsking||autoAsking||Convert.ToString(offer["id"])==backlogOffer)return;
    backlogOffer=Convert.ToString(offer["id"]);string id=backlogOffer;int count=Convert.ToInt32(offer["count"]);
    BeginInvoke(new Action(()=>AskBacklog(id,count)));
  }
  void AskBacklog(string id,int count){
    if(backlogPrompt!=null&&!backlogPrompt.IsDisposed)backlogPrompt.Close();
    string what=count==1?"1 Match ist":count+" Matches sind";
    backlogAsking=true;backlogPrompt=new AutoPrompt("","TECMON · STATS","Stats hochladen?",what+" noch nicht ausgewertet. TecMon öffnet tecmon.online, wertet sie im Browser aus und lädt nur die Zahlen hoch.","Ja, hochladen");
    backlogPrompt.Answered=async yes=>{
      try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/backlog/answer",true,"{\"id\":\""+id+"\",\"yes\":"+(yes?"true":"false")+"}"));if(tray!=null)tray.ShowBalloonTip(5000,"TecMon Stats",Convert.ToString(result["message"]),ToolTipIcon.Info);}
      catch(Exception error){if(tray!=null)tray.ShowBalloonTip(6000,"TecMon Stats",error.Message,ToolTipIcon.Warning);}
    };
    backlogPrompt.FormClosed+=(s,e)=>{backlogAsking=false;};
    backlogPrompt.Show();
  }
  async Task OpenBacklog(){
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/backlog/open",true,"{}"));if(tray!=null)tray.ShowBalloonTip(5000,"TecMon Stats",Convert.ToString(result["message"]),ToolTipIcon.Info);}
    catch(Exception error){if(tray!=null)tray.ShowBalloonTip(6000,"TecMon Stats",error.Message,ToolTipIcon.Warning);}
  }
  async Task ToggleBacklog(){
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/backlog/settings",true,backlogAsk?"{\"ask\":false}":"{\"ask\":true}"));backlogAsk=!backlogAsk;if(backlogOn!=null)backlogOn.Checked=backlogAsk;if(tray!=null)tray.ShowBalloonTip(6000,"TecMon Stats",Convert.ToString(result["message"]),ToolTipIcon.Info);}
    catch(Exception error){if(tray!=null)tray.ShowBalloonTip(6000,"TecMon Stats",error.Message,ToolTipIcon.Warning);}
  }
  async Task ToggleClips(){
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/clips/settings",true,clipsEnabled?"{\"enabled\":false}":"{\"enabled\":true}"));clipsEnabled=!clipsEnabled;if(clipsOn!=null)clipsOn.Checked=clipsEnabled;if(tray!=null)tray.ShowBalloonTip(5000,"TecMon Clips",Convert.ToString(result["message"]),ToolTipIcon.Info);}
    catch(Exception error){MessageBox.Show("Clip-Puffer konnte nicht umgeschaltet werden.\n\n"+error.Message,"TecMon");}
  }
  /* Rueckmeldung nur als Windows-Hinweis: kein Fenster, kein Fokuswechsel im Spiel. */
  async Task SaveClip(){
    if(savingClip)return;savingClip=true;
    try{var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/clips/save",true));if(tray!=null)tray.ShowBalloonTip(3000,"TecMon Clips",Convert.ToString(result["message"]),ToolTipIcon.Info);}
    catch(Exception error){if(tray!=null)tray.ShowBalloonTip(4000,"TecMon Clips",error.Message,ToolTipIcon.Warning);}
    finally{savingClip=false;}
  }
  bool cs2Installed=true;ToolStripMenuItem cs2Item,cs2Install;
  /* Spiel-Pakete: entfernte Spiele verschwinden aus dem Menü. */
  void ShowGames(Dictionary<string,object> state){
    object raw;var list=state.TryGetValue("games",out raw)?raw as System.Collections.IList:null;if(list==null)return;
    foreach(object entry in list){var game=entry as Dictionary<string,object>;if(game!=null&&Convert.ToString(game["id"])=="cs2")cs2Installed=game.ContainsKey("installed")&&Convert.ToBoolean(game["installed"]);}
  }
  void ShowPet(Dictionary<string,object> state){
    object raw;var pet=state.TryGetValue("pet",out raw)?raw as Dictionary<string,object>:null;if(pet==null)return;
    petAsleep=pet.ContainsKey("asleep")&&Convert.ToBoolean(pet["asleep"]);
    string mode=pet.ContainsKey("mode")?Convert.ToString(pet["mode"]):"normal",label="TecMon";petMode=mode;
    if(personality!=null)foreach(ToolStripItem item in personality.DropDownItems){var entry=item as ToolStripMenuItem;if(entry==null)continue;entry.Checked=Convert.ToString(entry.Tag)==mode;if(entry.Checked)label="TecMon · "+entry.Text;}
    var ev=pet.ContainsKey("event")?pet["event"] as Dictionary<string,object>:null;if(ev==null)return;
    long id=Convert.ToInt64(ev["id"]);if(id==lastPetEvent)return;bool first=lastPetEvent<0;lastPetEvent=id;
    /* Beim Start keinen alten Spruch wiederholen; während einer Live-Runde schweigt TecMon. */
    if(first&&clock.Elapsed.TotalSeconds>5)first=false;if(first||watching||busy)return;
    string text=Convert.ToString(ev["text"]);if(string.IsNullOrEmpty(text))return;
    int face;afterTalk=FaceNames.TryGetValue(Convert.ToString(ev.ContainsKey("face")?ev["face"]:""),out face)?face:Happy;
    if(ev.ContainsKey("spin")&&Convert.ToBoolean(ev["spin"]))spinLeft=360;
    activeAt=clock.Elapsed.TotalSeconds;mood=-1;
    /* Ist das Fenster offen, steht der Spruch dort; die Figur spricht dann nur mit Gesicht und Mund. */
    if(panel==null||panel.IsDisposed||!panel.Visible){if(tip==null||tip.IsDisposed)tip=new TipBubble();var area=Screen.PrimaryScreen.WorkingArea;tip.Compact=false;liveShowing=false;liveKey="";tip.Present(label,text,Visible?Bounds:new Rectangle(area.Right-180,area.Bottom-205,144,164),null,-1,false);}
    double now=clock.Elapsed.TotalSeconds;talkUntil=now+Math.Min(4,1+text.Length*0.04);happyUntil=talkUntil+1.6;
  }
  /* Nicht gelieferte Funktionen gelten als an, wie im Companion. */
  static bool FeatureOn(Dictionary<string,object> gsi,string id){object raw;var list=gsi.TryGetValue("features",out raw)?raw as System.Collections.IList:null;if(list==null)return true;foreach(var entry in list){var feature=entry as Dictionary<string,object>;if(feature!=null&&Convert.ToString(feature["id"])==id)return Convert.ToBoolean(feature["enabled"]);}return true;}
  /* Optionen: jede Tipp-Art einzeln im Rechtsklick-Menü der Figur. */
  void SyncFeatures(Dictionary<string,object> gsi){
    object raw;var list=gsi.TryGetValue("features",out raw)?raw as System.Collections.IList:null;if(list==null||tipsItem==null)return;
    var signature=TecMon.Json.Serialize(list);if(signature==featureSignature)return;featureSignature=signature;
    while(tipsItem.DropDownItems.Count>2)tipsItem.DropDownItems.RemoveAt(2);
    foreach(var entry in list){var feature=entry as Dictionary<string,object>;if(feature==null)continue;string id=Convert.ToString(feature["id"]);bool on=Convert.ToBoolean(feature["enabled"]);
      var item=new ToolStripMenuItem(Convert.ToString(feature["label"])){Checked=on,Tag="toggle"};
      string featureNotice=feature.ContainsKey("notice")?Convert.ToString(feature["notice"]):"";
      item.Click+=async(s,e)=>{try{await Request("/api/gsi/features",true,"{\"features\":{\""+id+"\":"+(on?"false":"true")+"}}");
        /* Hinweis (z. B. FACEIT bei der Bomben-Anzeige) als Sprechblase, kein Windows-Dialog. */
        if(!on&&featureNotice!=""){if(tip==null||tip.IsDisposed)tip=new TipBubble();var area=Screen.PrimaryScreen.WorkingArea;tip.Compact=false;liveShowing=false;liveKey="";tip.Present("Hinweis",featureNotice,Visible?Bounds:new Rectangle(area.Right-180,area.Bottom-205,144,164),null,-3,false);}
      }catch(Exception error){MessageBox.Show(error.Message,"TecMon");}};
      tipsItem.DropDownItems.Add(item);}
  }
  async Task ToggleTips(){
    try{
      var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request(tipsEnabled?"/api/gsi/disable":"/api/gsi/enable",true,tipsEnabled?"{}":"{\"confirm\":true}"));
      tipsEnabled=!tipsEnabled;tipsOn.Checked=tipsEnabled;
      if(tray!=null)tray.ShowBalloonTip(5000,"TecMon Companion",Convert.ToString(result["message"]),ToolTipIcon.Info);
    }catch(Exception error){MessageBox.Show("Rundentipps konnten nicht umgeschaltet werden. Wird CS2 auf diesem PC gefunden?\n\n"+error.Message,"TecMon");}
  }
  protected override void WndProc(ref Message message){if(message.Msg==0x8001){Show();Toggle();return;}if(message.Msg==0x0312&&message.WParam.ToInt32()==ClipHotkey){var ignored=SaveClip();return;}if(message.Msg==0x0312&&message.WParam.ToInt32()==ScoreHotkey){var ignoredScore=CaptureScoreboard();return;}base.WndProc(ref message);}
  public static Point Fit(Point point,Rectangle area,Size size){return new Point(Math.Max(area.Left,Math.Min(area.Right-size.Width,point.X)),Math.Max(area.Top,Math.Min(area.Bottom-size.Height,point.Y)));}
  /* Fenster neben die Figur setzen; die Spitze zeigt auf ihre Mitte, auch wenn das Fenster am Bildschirmrand verschoben wird. */
  Point PanelSpot(){var area=Screen.FromRectangle(Bounds).WorkingArea;var preferred=new Point(Left-panel.Width+2,Top+Height/2-panel.Height+77);bool onRight=preferred.X<area.Left;if(onRight)preferred.X=Right-2;panel.TailLeft=onRight;var spot=Fit(preferred,area,panel.Size);panel.TailY=Top+Height/2-spot.Y;return spot;}
  void AnchorPanel(){if(popping)return;panel.Location=PanelSpot();}
  /* Kurz aus der Figur herausgleiten lassen statt hart aufzutauchen. */
  bool popping;
  void PopPanel(){
    var target=PanelSpot();int from=panel.TailLeft?-36:36;panel.Location=new Point(target.X+from,target.Y+14);popping=true;
    var watch=Stopwatch.StartNew();var timer=new System.Windows.Forms.Timer{Interval=15};
    timer.Tick+=(s,e)=>{double k=Math.Min(1,watch.Elapsed.TotalSeconds/0.18),ease=1-Math.Pow(1-k,3);var goal=PanelSpot();if(panel.IsDisposed){timer.Dispose();popping=false;return;}panel.Location=new Point(goal.X+(int)Math.Round(from*(1-ease)),goal.Y+(int)Math.Round(14*(1-ease)));if(k>=1){timer.Stop();timer.Dispose();popping=false;}};
    timer.Start();
  }
  public void Toggle(){
    if(panel==null||panel.IsDisposed){panel=new DesktopPanel();panel.Dragged=(dx,dy)=>{var area=Screen.FromRectangle(panel.Bounds).WorkingArea;var next=Fit(new Point(Left+dx,Top+dy),area,Size);Location=next;x=Left;y=Top;Render();panel.TailY=Top+Height/2-panel.Top;};}
    if(panel.Visible){panel.Hide();return;}
    panel.TopMost=OnTop();PopPanel();panel.Show(this);panel.Activate();
  }
  public Bitmap Frame(){if(model!=null)return Frame3D();var bitmap=new Bitmap(Width,Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.Transparent);g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;int emotion=busy?3:new[]{0,1,2,0,6,9}[(int)(phase/12)%6];int row=emotion/3;var heights=new[]{390,340,324,411};var tops=new[]{0,390,730,1040};var target=new Rectangle(5,8+(animate?(int)(Math.Sin(phase)*5):0),134,145);if(sheet!=null)g.DrawImage(sheet,target,new Rectangle((emotion%3)*361,tops[row],361,heights[row]),GraphicsUnit.Pixel);}return bitmap;}
  void Render(){
    if(!IsHandleCreated||!Visible)return;
    /* 3D-Figur: ein wiederverwendetes Bild statt etwa 60 neuer Bitmaps pro Sekunde. */
    if(cells!=null){if(canvas==null||canvas.Size!=Size){if(canvas!=null)canvas.Dispose();canvas=new Bitmap(Width,Height,System.Drawing.Imaging.PixelFormat.Format32bppArgb);}using(var g=Graphics.FromImage(canvas))Draw3D(g);Layered.Push(this,canvas,Location);return;}
    using(var bitmap=Frame())Layered.Push(this,bitmap,Location);
  }
  async Task FetchToken(){string html=await RawRequest("/",false,"{}");token=System.Text.RegularExpressions.Regex.Match(html,"name=\"tecmon-token\" content=\"([^\"]+)\"").Groups[1].Value;if(token=="")throw new Exception("Lokale Sitzung fehlt.");}
  async Task<Dictionary<string,object>> State(){if(token=="")await FetchToken();return TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/state",false));}
  /* Startet der lokale Dienst neu (z. B. nach einem Update), gilt ein neuer Sitzungsschluessel: einmal neu holen und wiederholen. */
  async Task<string> Request(string route,bool post,string body="{}"){
    bool stale=false;
    try{return await RawRequest(route,post,body);}
    catch(System.Net.WebException error){var response=error.Response as System.Net.HttpWebResponse;if(route!="/"&&response!=null&&response.StatusCode==System.Net.HttpStatusCode.Unauthorized)stale=true;else throw ServerError(error);}
    if(!stale)throw new InvalidOperationException();
    token="";
    try{await FetchToken();return await RawRequest(route,post,body);}
    catch(System.Net.WebException error){throw ServerError(error);}
  }
  /* Der lokale Dienst schickt bei Fehlern {"error":"…"}; diesen Text zeigen statt „(400) Ungültige Anforderung“.
     Ohne Antwort (Dienst nicht erreichbar) bleibt die WebException erhalten, die Abfrage-Schleife prüft darauf. */
  static Exception ServerError(System.Net.WebException error){
    var response=error.Response as System.Net.HttpWebResponse;
    if(response==null)return error;
    try{
      using(var reader=new StreamReader(response.GetResponseStream())){
        var data=TecMon.Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
        object message;
        if(data!=null&&data.TryGetValue("error",out message)&&Convert.ToString(message).Trim()!="")return new Exception(Convert.ToString(message),error);
      }
    }catch{}
    return error;
  }
  async Task<string> RawRequest(string route,bool post,string body){var request=(System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://127.0.0.1:31977"+route);request.Proxy=null;int timeout=route=="/api/update/install"?240000:route=="/api/update/check"||route.StartsWith("/api/clips/")?45000:route=="/api/wardogs/capture"?90000:8000;request.Timeout=timeout;request.ReadWriteTimeout=timeout;if(token!="")request.Headers["x-tecmon-token"]=token;if(post){request.Method="POST";request.ContentType="application/json";byte[] bytes=Encoding.UTF8.GetBytes(body);using(var stream=await request.GetRequestStreamAsync())await stream.WriteAsync(bytes,0,bytes.Length);}var pending=request.GetResponseAsync();if(await Task.WhenAny(pending,Task.Delay(timeout))!=pending){request.Abort();throw new TimeoutException("Lokaler Dienst antwortet nicht.");}using(var response=await pending)using(var reader=new StreamReader(response.GetResponseStream()))return await reader.ReadToEndAsync();}
  static int Count(Dictionary<string,object> parent,string key){object value;return parent!=null&&parent.TryGetValue(key,out value)&&value is System.Collections.ICollection?((System.Collections.ICollection)value).Count:0;}
  void ShowStatus(Dictionary<string,object> state){if(statusItem==null)return;object raw;var bridge=state.TryGetValue("bridge",out raw)?raw as Dictionary<string,object>:null;statusItem.Text=busy?"● Aufnahme läuft …":Count(bridge,"pending")>0?"● Verbindung bestätigen":Count(bridge,"devices")>0?"● Mit TecMon verbunden":"○ Noch nicht mit TecMon verbunden";}
  async Task CheckUpdate(bool silent){
    try{
      if(offeredUpdate!=""){
        if(MessageBox.Show(this,"TecMon Companion auf "+offeredUpdate+" aktualisieren?\n\nNur Programmdateien werden ersetzt. Demos, Videos und Einstellungen bleiben erhalten.","TecMon Update",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        /* Rueckmeldung statt Stille: Laden kann je nach Leitung eine Weile dauern. */
        if(tray!=null)tray.ShowBalloonTip(8000,"TecMon Update","Update "+offeredUpdate+" wird geladen und geprüft … Der Companion startet danach neu.",ToolTipIcon.Info);
        updateItem.Enabled=false;updateItem.Text="Update "+offeredUpdate+" wird geladen …";
        try{
          var installed=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/update/install",true,"{\"confirm\":true}"));
          object message;if(tray!=null&&installed.TryGetValue("message",out message))tray.ShowBalloonTip(8000,"TecMon Update",Convert.ToString(message),ToolTipIcon.Info);
        }catch(Exception error){updateItem.Enabled=true;updateItem.Text="Update "+offeredUpdate+" installieren";MessageBox.Show(this,"Update fehlgeschlagen: "+error.Message+"\n\nAlternativ die Update-Datei von der Release-Seite starten.","TecMon Update",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        return;
      }
      var result=TecMon.Json.Deserialize<Dictionary<string,object>>(await Request("/api/update/check",true));
      if(Convert.ToBoolean(result["available"])){offeredUpdate=Convert.ToString(result["latest"]);updateItem.Text="Update "+offeredUpdate+" installieren";if(tray!=null&&silent)tray.ShowBalloonTip(6000,"TecMon Companion","Update "+offeredUpdate+" verfügbar. Rechtsklick auf die Figur → Update installieren.",ToolTipIcon.Info);if(!silent)await CheckUpdate(false);}
      else if(!silent)MessageBox.Show("Der Companion ist aktuell ("+Convert.ToString(result["current"])+").","TecMon");
    }catch(Exception error){if(!silent)MessageBox.Show(error.Message,"TecMon");}
  }
  async Task Quit(){try{var state=await State();if(Convert.ToBoolean(state["active"])){MessageBox.Show("Ein lokaler Auftrag läuft noch. Warte bis Download oder Aufnahme abgeschlossen ist.","TecMon");return;}await Request("/api/shutdown",true);Close();}catch(Exception error){MessageBox.Show(error.Message,"TecMon");}}
}
