import Foundation

enum Config {
    static let appName = "JjalCopy"
    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev" }
    static let port: UInt16 = 47321
    static let siteURL = URL(string: "https://jjal-kabkee.d271z96h7lorpb.amplifyapp.com/")!
    /// 요청을 받아 주는 사이트(Origin)와 원본을 받아 오는 곳. 윈도우 도우미와 같은 목록 + 개발 서버 https 주소.
    /// 추가: `defaults write com.kabkee.jjalcopy allowedHosts -array 호스트1 호스트2`
    static let defaultHosts = [
        "jjal-kabkee.d271z96h7lorpb.amplifyapp.com",
        "kabkee-main.tailfe017f.ts.net",
        "100.64.25.50", "localhost", "127.0.0.1",
    ]
    static var allowedHosts: [String] {
        defaultHosts + (UserDefaults.standard.stringArray(forKey: "allowedHosts") ?? []).map { $0.lowercased() }
    }
    static let maxBytes = 100 * 1024 * 1024

    /// 클립보드에 올린 파일을 두는 곳 (하루 지나면 앱 시작 때 정리)
    static var cacheDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("com.kabkee.jjalcopy/clipboard", isDirectory: true)
    }
}
