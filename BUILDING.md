# Windows-Build aus Quellcode

Cyberpunk-Grafiken ab 0.11: `npm ci` und `node scripts/build-cyber-branding.mjs dist` erzeugen `TecMon-Branding-v3.json` aus den eigenen SVGs und dem unveränderten, geprüften Logo-/Schriftpaket v1. Sharp 0.35.5 ist ausschließlich eine Build-Abhängigkeit. Das veröffentlichte v3-Paket (ab 0.13) hat SHA256 `874da002d77cbbdf09fb48c31b42feb8e175471b57fa84a3317ad6459642b2cf`. Die Runtime benötigt kein Sharp. Der Release-Workflow prüft das mitgelieferte Paket und rendert damit drei synthetische Szenen durch den nativen Dateisperren-Helfer: ein Spielerwechsel, eine wiederholte Perspektive ohne weiteren Stinger, unveränderte Dauer aller Szenen.

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

Ausgabe: `dist/TecMon-Companion-Setup-<Version>.exe` (Version aus `package.json`) und SHA256 im Build-Protokoll. Compiler-/ZIP-Metadaten können abweichen; bitidentische Reproduzierbarkeit wird nicht behauptet. Binaries ausschließlich nach zusätzlichen Installations-, Lizenz-, Secret- und Aufnahmetests veröffentlichen.

Nur den nativen Launcher zu prüfen erfordert keine Drittanbieter-Downloads: `.github/workflows/test.yml` dokumentiert die Compilerparameter und führt `--self-test` aus. Dieser Selbsttest prüft nicht die vollständige Installation.

## Release veröffentlichen

1. Version erhöhen: `node scripts/version.mjs set X.Y.Z`. Das setzt die Nummer in `package.json`, `package-lock.json`, Updater, Oberfläche, Installation und nativem Launcher. `node scripts/version.mjs check` (läuft auch in `npm test`) meldet abweichende Stellen.
2. Neue Funktionen im README unter „Neu in X.Y.Z“ beschreiben.
3. Änderung auf `main` mergen. Das veröffentlicht automatisch ein Release, das installierte Companions als Update angeboten bekommen; darum nur mit Freigabe mergen.

Der Workflow [Windows release installer](.github/workflows/release-installer.yml) startet bei jedem Push auf `main`. Gibt es zur Version aus `package.json` noch kein Tag, baut er auf einem frischen Windows-Runner Setup-EXE und Update-EXE, führt die Tests aus und prüft die Originalpakete, den unkonfigurierten Payload, eine isolierte Neuinstallation mit Sonderzeichen-Passwort, getrennte Datenbankkonten, die Reparatur einer unterbrochenen Einrichtung und die CSDM-Tabellenmigrationen. Danach legt er das Release `v<Version>` zunächst als Entwurf an, lädt Setup, Update-EXE, `TecMon-Companion-Update.json`, das Branding-v3-Paket und Prüfsummen hoch, dazu Kopien von Setup und Update mit festem Namen (`TecMon-Companion-Setup.exe`, `TecMon-Companion-Update.exe`) für die Links `releases/latest/download/…` auf tecmon.online/companion, und veröffentlicht es erst dann als „Latest“. Installierte Companions sehen das Update damit erst, wenn alle Dateien vorhanden sind. Gibt es das Tag schon, tut der Workflow nichts.

Manuell lässt sich der Workflow mit einem bestehenden Tag starten. Er baut dieses Tag neu und ersetzt die Dateien im Release. Der Workflow ersetzt keinen echten CS2-Aufnahmetest.

Für den öffentlichen Release den Build mit dem zusätzlichen Schalter -DownloadVideoTools und einem frischen BuildDirectory ausführen. Damit sind HLAE und FFmpeg nicht im Payload enthalten; das Setup lädt fehlende Pakete vom Originalanbieter und prüft deren SHA256. Für den eigenen Offline-Build den Schalter weglassen.

Kleine Updates bauen: scripts/build-companion-update.ps1 mit -ApplicationDirectory (enthält die erzeugte csdm-defaults.json), frischem -BuildDirectory und -OutputDirectory. Ausgabe: Update-EXE und TecMon-Companion-Update.json mit Größe und SHA256. Das Update enthält ausschließlich eigene Programmdateien, keine Runtime, Drittanbieterprogramme, Datenbank oder Nutzerkonfiguration. Die Versionsnummer in Quellen, Paket und Release muss gemeinsam erhöht werden.


Branding-Paket reproduzieren: `node scripts/build-branding-pack.mjs dist`. Die feste Google-Fonts-Revision und alle Quellprüfsummen stehen im Skript. Das Ergebnis muss SHA256 `aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155` haben. Das Paket wird separat als Release-Asset veröffentlicht; es gehört nicht in den kleinen Programm-Updater.

Desktop ab 0.8: `scripts/prepare-companion-desktop.ps1` lädt ausschließlich Microsoft.Web.WebView2 1.0.4314.35 aus NuGet, prüft SHA256 und entnimmt die drei originalen x64/NET462-DLLs sowie LICENSE/NOTICE. Die nativen Build-Skripte rufen dies automatisch auf. Die Desktop-PNGs stammen unverändert aus dem TecMon-Webseiten-Sprite; `--desktop-preview <png>` rendert den nativen Bot ohne Start von Datenbank, Desktopfigur oder Aufnahme. `--desktop-self-test` prüft die Begrenzung auf Monitor-Arbeitsbereiche einschließlich negativer Koordinaten. WebView2 Evergreen Runtime muss vorhanden sein; sie wird separat von Microsoft gepflegt und nicht gebündelt.
