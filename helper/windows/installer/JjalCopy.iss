; 짤 복사 도우미 설치 프로그램 (Inno Setup 6)
; - 관리자 권한 없이 사용자 폴더(%LOCALAPPDATA%\Programs\JjalCopy)에 설치 — VS Code 사용자 설치와 같은 방식
; - 자동 실행(HKCU Run)은 설치 화면에서 고른다. 「앱 및 기능」에서 일반 프로그램처럼 제거된다
; - v1.2 까지의 자가 설치본(%LOCALAPPDATA%\JjalCopy)은 종료 신호를 보내 내린 뒤 지운다
; 빌드: GitHub Actions(.github/workflows/jjalcopy-release.yml)가 태그 jjalcopy-v* 에서 ISCC 로 만든다

#define AppExe "JjalCopy.exe"
#define AppVer GetVersionNumbersString(AddBackslash(SourcePath) + "..\dist\" + AppExe)

[Setup]
AppId={{8F3C2A51-5B7E-4C1D-9A0E-6D2B7F4E1A93}
AppName=짤 복사 도우미
AppVersion={#AppVer}
AppVerName=짤 복사 도우미 {#AppVer}
AppPublisher=kabkee
AppPublisherURL=https://jjal-kabkee.d271z96h7lorpb.amplifyapp.com/
AppSupportURL=https://github.com/kabkee/storage_jjal/releases
VersionInfoVersion={#AppVer}
VersionInfoDescription=짤 복사 도우미 설치
DefaultDirName={localappdata}\Programs\JjalCopy
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=JjalCopySetup
SetupIconFile=..\app.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName=짤 복사 도우미
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "autostart"; Description: "Windows 시작 시 자동 실행 (권장)"

[Files]
Source: "..\dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\짤 복사 도우미"; Filename: "{app}\{#AppExe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "JjalCopy"; ValueData: """{app}\{#AppExe}"""; Tasks: autostart; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "JjalCopy"; Flags: deletevalue; Tasks: not autostart
Root: HKCU; Subkey: "Software\JjalCopy"; Flags: uninsdeletekey

[InstallDelete]
; v1.2 까지의 자가 설치 폴더
Type: filesandordirs; Name: "{localappdata}\JjalCopy"

[UninstallDelete]
Type: filesandordirs; Name: "{%TEMP}\JjalCopy"

[Run]
Filename: "{app}\{#AppExe}"; Parameters: "--installed"; Description: "짤 복사 도우미 실행"; Flags: nowait postinstall

[Code]
// 실행 중인 도우미(옛 v1.x 포함)에게 「종료해 줘」 신호를 보낸다 — 앱이 Local\JjalCopy.Quit 이벤트를 기다리고 있다.
// 강제 종료(taskkill) 대신 앱이 스스로 내려가게 한다.
function OpenEvent(dwDesiredAccess: DWORD; bInheritHandle: BOOL; lpName: String): THandle;
  external 'OpenEventW@kernel32.dll stdcall';
function SetEvent(hEvent: THandle): BOOL;
  external 'SetEvent@kernel32.dll stdcall';
function CloseHandle(hObject: THandle): BOOL;
  external 'CloseHandle@kernel32.dll stdcall';

procedure AskRunningAppToQuit();
var
  h: THandle;
begin
  h := OpenEvent($0002 { EVENT_MODIFY_STATE }, False, 'Local\JjalCopy.Quit');
  if h <> 0 then
  begin
    SetEvent(h);
    CloseHandle(h);
    Sleep(1500);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  AskRunningAppToQuit();
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  AskRunningAppToQuit();
  Result := True;
end;
