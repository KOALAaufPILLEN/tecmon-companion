# Windows-Build aus Quellcode

Voraussetzungen: Windows x64, PowerShell, Git, Node.js >=24 und der Windows-.NET-Framework-C#-Compiler unter `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`.

1. `npm ci` und `npm test` ausführen.
2. CS Demo Manager aus `https://github.com/akiver/cs-demo-manager.git` in einen separaten Ordner klonen und Tag `v3.20.1` auschecken. Der Build prüft den Commit gegen diesen Tag.
3. Das offizielle Node.js-Windows-x64-ZIP `v26.13.0` von `https://nodejs.org/dist/v26.13.0/` beziehen, gegen die offiziellen SHASUMS prüfen und entpacken. Der NodeFolder muss `node.exe` und `LICENSE` enthalten. npm wird im Runtime-Paket nicht benötigt.
4. Die offizielle 7-Zip-CLI aus `https://www.7-zip.org/` beziehen und vollständig unter `<Cache>\7zip\` bereitstellen (`7z.exe` mit den mitgelieferten Dateien).
5. Den Build aufrufen (Beispielpfade im Arbeitsverzeichnis):

```powershell
./scripts/build-companion-installer.ps1 `
  -DependenciesCache "$PWD/cache" `
  -CsDmSource "$PWD/vendor/cs-demo-manager" `
  -NodeFolder "$PWD/vendor/node-v26.13.0-win-x64" `
  -BuildDirectory "$PWD/build/windows" `
  -OutputDirectory "$PWD/dist"
```

Der Build lädt fehlende Pakete anhand von `tools/cs2-companion/windows/dependency-manifest.json`, prüft deren SHA256, extrahiert unveränderte Originalprogramme und kompiliert den nativen Launcher sowie den selbstentpackenden Installer. Die CSDM-Konfigurationsvorlage wird aus den MIT-lizenzierten Standardwerten des angegebenen Tags erzeugt.

Der BuildDirectory darf keine bereits eingerichtete Installation enthalten. Keine eigenen `installation.json`, `settings.json`, Datenbanken oder Kennwörter in den Build kopieren. Laufzeitkonfiguration entsteht erst nach dem Start des Installers beim Benutzer.

Ausgabe: `dist/TecMon-Companion-Setup-0.6.0.exe` und SHA256 im Build-Protokoll. Compiler-/ZIP-Metadaten können abweichen; bitidentische Reproduzierbarkeit wird nicht behauptet. Binaries ausschließlich nach zusätzlichen Installations-, Lizenz-, Secret- und Aufnahmetests veröffentlichen.

Nur den nativen Launcher zu prüfen erfordert keine Drittanbieter-Downloads: `.github/workflows/test.yml` dokumentiert die Compilerparameter und führt `--self-test` aus. Dieser Selbsttest prüft nicht die vollständige Installation.

Für den öffentlichen Release den Build mit dem zusätzlichen Schalter -DownloadVideoTools und einem frischen BuildDirectory ausführen. Damit sind HLAE und FFmpeg nicht im Payload enthalten; das Setup lädt fehlende Pakete vom Originalanbieter und prüft deren SHA256. Für den eigenen Offline-Build den Schalter weglassen.

Kleine Updates bauen: scripts/build-companion-update.ps1 mit -ApplicationDirectory (enthält die erzeugte csdm-defaults.json), frischem -BuildDirectory und -OutputDirectory. Ausgabe: Update-EXE und TecMon-Companion-Update.json mit Größe und SHA256. Das Update enthält ausschließlich eigene Programmdateien, keine Runtime, Drittanbieterprogramme, Datenbank oder Nutzerkonfiguration. Die Versionsnummer in Quellen, Paket und Release muss gemeinsam erhöht werden.


Branding-Paket reproduzieren: `node scripts/build-branding-pack.mjs dist`. Die feste Google-Fonts-Revision und alle Quellprüfsummen stehen im Skript. Das Ergebnis muss SHA256 `aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155` haben. Das Paket wird separat als Release-Asset veröffentlicht; es gehört nicht in den kleinen Programm-Updater.
