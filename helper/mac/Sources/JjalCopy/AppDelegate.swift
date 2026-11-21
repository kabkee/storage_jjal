import AppKit
import ServiceManagement

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let bridge = LocalBridge()
    private var running = false
    private var flashTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        setIcon()
        Copier.purgeOld()

        bridge.onCopy = { [weak self] make in
            guard let self else { return try await make().lastPathComponent }
            return try await self.copy(make)
        }
        bridge.start { [weak self] ok in
            guard let self else { return }
            self.running = ok
            self.rebuildMenu()
            if !ok {
                self.alert("짤 복사 도우미를 시작하지 못했어요",
                           "포트 \(Config.port) 를 다른 프로그램이 쓰고 있어요.\n예전 WebPCap(jjal 연결 기능이 있던 버전)이 켜져 있으면 끄고 다시 열어 주세요.")
            }
        }
        rebuildMenu()
        firstRunSetup()
    }

    // MARK: - 처음 실행

    private func firstRunSetup() {
        let d = UserDefaults.standard
        guard !d.bool(forKey: "didFirstRun") else { return }
        d.set(true, forKey: "didFirstRun")
        try? SMAppService.mainApp.register()   // 로그인할 때 자동으로 켜기 (메뉴에서 끌 수 있음)
        rebuildMenu()
        alert("짤 복사 도우미가 켜졌어요 🐾",
              "화면 위 메뉴 막대에 아이콘이 생겼어요.\n\njjal 사이트에서 움짤을 누르면 원본이 복사돼요 → 카톡·Slack 에서 ⌘V.\n(사이트 탭으로 돌아가면 자동으로 알아채요)\n\n끄기·자동 실행 설정은 메뉴 막대 아이콘을 누르세요.")
    }

    // MARK: - 복사

    @MainActor
    private func copy(_ make: @escaping () async throws -> URL) async throws -> String {
        showStatus(" 받는 중…")
        do {
            let file = try await make()
            Copier.putOnPasteboard(file)
            NSSound(named: "Pop")?.play()
            flash(" 복사됨")
            return file.lastPathComponent
        } catch {
            showStatus("")
            NSSound(named: "Basso")?.play()
            throw error
        }
    }

    // MARK: - 메뉴 막대

    private func setIcon() {
        let img = NSImage(systemSymbolName: "photo.on.rectangle.angled", accessibilityDescription: "짤 복사 도우미")
        img?.isTemplate = true
        statusItem.button?.image = img
        statusItem.button?.imagePosition = .imageLeading
    }

    private func showStatus(_ text: String) {
        flashTimer?.invalidate()
        statusItem.button?.title = text
    }

    private func flash(_ text: String) {
        showStatus(text)
        flashTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
            self?.statusItem.button?.title = ""
        }
    }

    private func rebuildMenu() {
        let m = NSMenu()
        let title = NSMenuItem(title: "짤 복사 도우미 \(Config.version)", action: nil, keyEquivalent: "")
        title.isEnabled = false
        m.addItem(title)
        let state = NSMenuItem(title: running ? "✅ 켜짐 — 사이트에서 움짤을 누르면 복사돼요" : "⚠️ 연결 대기 실패 (포트 \(Config.port))",
                               action: nil, keyEquivalent: "")
        state.isEnabled = false
        m.addItem(state)
        m.addItem(.separator())
        m.addItem(item("jjal 사이트 열기", #selector(openSite)))
        let login = item("로그인할 때 자동 실행", #selector(toggleLogin))
        login.state = SMAppService.mainApp.status == .enabled ? .on : .off
        m.addItem(login)
        m.addItem(item("복사해 둔 임시 파일 지우기", #selector(clearCache)))
        m.addItem(.separator())
        m.addItem(item("종료", #selector(quit), key: "q"))
        statusItem.menu = m
    }

    private func item(_ title: String, _ sel: Selector, key: String = "") -> NSMenuItem {
        let i = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        i.target = self
        return i
    }

    @objc private func openSite() { NSWorkspace.shared.open(Config.siteURL) }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
        } catch {
            alert("자동 실행 설정을 바꾸지 못했어요", "\(error.localizedDescription)\n\n앱을 「응용 프로그램」 폴더로 옮긴 뒤 다시 해 보세요.")
        }
        rebuildMenu()
    }

    @objc private func clearCache() {
        try? FileManager.default.removeItem(at: Config.cacheDir)
        flash(" 정리됨")
    }

    @objc private func quit() { NSApp.terminate(nil) }

    private func alert(_ title: String, _ text: String) {
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        a.runModal()
    }
}
