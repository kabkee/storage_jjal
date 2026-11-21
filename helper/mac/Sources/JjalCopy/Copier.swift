import AppKit

/// 원본을 「끝까지」 받아 파일로 저장한 뒤, Finder 에서 ⌘C 한 것과 같은 형태(파일 URL)로 클립보드에 올린다.
/// 맥 카톡·Slack 은 이 형태를 ⌘V 로 받아 움짤을 그대로 보낸다 (윈도우 카톡과 달리 끌어다 놓기 창이 필요 없음).
enum Copier {
    enum Failure: LocalizedError {
        case notAllowed(String), http(Int), notImage(String), tooLarge, empty
        var errorDescription: String? {
            switch self {
            case .notAllowed(let h): return "허용되지 않은 사이트예요: \(h)"
            case .http(let c): return "다운로드 실패 (HTTP \(c))"
            case .notImage(let t): return "이미지가 아니에요 (\(t))"
            case .tooLarge: return "파일이 너무 커요 (100MB 초과)"
            case .empty: return "빈 파일을 받았어요"
            }
        }
    }

    /// 파일명 정리: 경로 문자 제거, 확장자 보장, 길이 제한
    static func safeName(_ raw: String?, ext: String) -> String {
        var name = (raw ?? "").replacingOccurrences(of: "[/:\\\\\\x00-\\x1f]", with: "_", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty || name.hasPrefix(".") { name = "jjal" + name }
        if (name as NSString).pathExtension.isEmpty { name += ".\(ext)" }
        if name.count > 100 {
            let e = (name as NSString).pathExtension
            name = String(name.prefix(100 - e.count - 1)) + "." + e
        }
        return name
    }

    /// 복사마다 하위 폴더를 따로 만들어 파일명이 겹쳐도 「이름.webp」 그대로 유지
    private static func newDestination(_ name: String) throws -> URL {
        let dir = Config.cacheDir.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(name)
    }

    static func download(_ src: URL, name: String) async throws -> URL {
        guard let host = src.host?.lowercased(), Config.allowedHosts.contains(host) else {
            throw Failure.notAllowed(src.host ?? "?")
        }
        var req = URLRequest(url: src)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 60
        let (tmp, resp) = try await URLSession.shared.download(for: req)
        defer { try? FileManager.default.removeItem(at: tmp) }
        guard let http = resp as? HTTPURLResponse else { throw Failure.http(-1) }
        guard http.statusCode == 200 else { throw Failure.http(http.statusCode) }
        let type = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
        guard type.hasPrefix("image/") else { throw Failure.notImage(type.isEmpty ? "형식 없음" : type) }
        let size = (try FileManager.default.attributesOfItem(atPath: tmp.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size > 0 else { throw Failure.empty }
        guard size <= Config.maxBytes else { throw Failure.tooLarge }
        let dest = try newDestination(name)
        try FileManager.default.moveItem(at: tmp, to: dest)
        return dest
    }

    /// 사이트가 직접 보낸 바이트(GIF 모드에서 브라우저가 만든 GIF) 저장
    static func save(_ data: Data, name: String) throws -> URL {
        guard !data.isEmpty else { throw Failure.empty }
        guard data.count <= Config.maxBytes else { throw Failure.tooLarge }
        let dest = try newDestination(name)
        try data.write(to: dest)
        return dest
    }

    @MainActor
    static func putOnPasteboard(_ file: URL) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.writeObjects([file as NSURL])
    }

    /// 하루 지난 임시 파일 삭제
    static func purgeOld() {
        let fm = FileManager.default
        guard let dirs = try? fm.contentsOfDirectory(at: Config.cacheDir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let cutoff = Date().addingTimeInterval(-86_400)
        for d in dirs {
            let m = (try? d.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            if m < cutoff { try? fm.removeItem(at: d) }
        }
    }
}
