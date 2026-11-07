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
      key.SetValue("DisplayName", "TecMon Companion"); key.SetValue("DisplayVersion", "0.3.1"); key.SetValue("Publisher", "TecMon");
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
  public static void Launch() {
    var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TecMon", "Logs"); Directory.CreateDirectory(logDir);
    var configFile=Path.Combine(Root,"installation.json");
    if(!File.Exists(configFile)) throw new Exception("Bitte zuerst die Einrichtung im TecMon-Setup abschließen.");
    var config=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(configFile));
    var expectedId=Convert.ToString(config["installationId"]);
    if(!Probe(expectedId)) {
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
    var edge = new [] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe") }.FirstOrDefault(File.Exists);
    if(edge != null) Process.Start(Info(edge,"--app=http://127.0.0.1:31977","--new-window"));
    else Process.Start(new ProcessStartInfo("http://127.0.0.1:31977") { UseShellExecute = true });
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
  [STAThread] public static int Main(string[] args) {
    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
    try {
      if(args.Length > 0 && args[0] == "--private") { Private(args[1]); return 0; }
      if(args.Length > 0 && args[0] == "--extract-test") { Extract(args[1]); return 0; }
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
      if(Assembly.GetExecutingAssembly().GetManifestResourceNames().Contains("TecMonPayload")) { Application.Run(new SetupWindow()); return 0; }
      Launch(); return 0;
    } catch(Exception error) { MessageBox.Show(error.Message,"TecMon",MessageBoxButtons.OK,MessageBoxIcon.Error); return 1; }
  }
}

class SetupWindow : Form {
  TextBox app = new TextBox(), data = new TextBox(), demo = new TextBox(), game = new TextBox(), password = new TextBox(), confirm = new TextBox(), log = new TextBox();
  CheckBox accept = new CheckBox(); Button install = new Button(); ProgressBar progress = new ProgressBar(); bool busy=false, complete=false;
  public SetupWindow() {
    Text="TecMon Companion · Installation"; Size=new Size(850,780); MinimumSize=new Size(850,780); StartPosition=FormStartPosition.CenterScreen; BackColor=TecMon.Background; ForeColor=Color.White; Font=new Font("Segoe UI",10); AutoScaleMode=AutoScaleMode.Dpi;
    var title=new Label { Text="TECMON  /  COMPANION SETUP", Left=32, Top=24, Width=740, Height=42, ForeColor=TecMon.Gold, Font=new Font("Segoe UI",23,FontStyle.Bold) }; Controls.Add(title);
    Controls.Add(new Label { Text="Ein Installer. Dein lokales CS2-Aufnahme-Studio.", Left=34,Top=75,Width=740,Height=25,ForeColor=TecMon.Violet });
    Controls.Add(new Label { Text="Enthalten: Companion, PostgreSQL 18, CS Demo Manager, HLAE und FFmpeg.\nSteam und CS2 müssen auf deinem PC installiert sein. Die Einrichtung benötigt ca. 2 GB freien Speicher.", Left=34,Top=111,Width=750,Height=48 });
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
    if(complete) { TecMon.Root=app.Text; TecMon.Launch(); Close(); return; }
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
