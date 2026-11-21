import AppKit

// 헤드리스 점검: JjalCopy --selftest 20  → 메뉴 막대 없이 브리지만 N초 띄운다
if CommandLine.arguments.count >= 2, CommandLine.arguments[1] == "--selftest" {
    let secs = Double(CommandLine.arguments.dropFirst(2).first ?? "") ?? 20
    let bridge = LocalBridge()
    bridge.onCopy = { make in try await make().lastPathComponent }
    bridge.start { ok in print(ok ? "bridge listening on 127.0.0.1:\(Config.port)" : "bridge failed") }
    RunLoop.main.run(until: Date().addingTimeInterval(secs))
    exit(0)
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
