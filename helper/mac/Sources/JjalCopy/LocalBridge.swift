import Foundation
import Network

/// 127.0.0.1 전용 최소 HTTP 서버. 허용 Origin 에만 CORS 로 응답한다. (윈도우 도우미와 같은 규약)
///   GET  /ping                         → {"app":"JjalCopy","version":"1.0.0","os":"mac","features":["copy-data"]}
///   POST /copy {"url","name"}          → 원본을 받아 파일로 클립보드에 → {"ok":true,"name":"이름.webp","hint":"paste"}
///   POST /copy-data?name=<이름.gif>    (본문 = 이미지 바이트, Content-Type: image/*) → 같은 응답
///        사이트의 「GIF 모드」가 브라우저에서 webp 움짤을 GIF 로 바꿔 보낸다
final class LocalBridge: @unchecked Sendable {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "jjalcopy.bridge")
    private static let maxJsonBody = 64 * 1024
    /// 클립보드에 올릴 파일을 만드는 작업을 받아 실행하고(메인 스레드) 파일명을 돌려준다
    var onCopy: ((@escaping () async throws -> URL) async throws -> String)?

    func start(_ ready: @escaping (Bool) -> Void) {
        do {
            let params = NWParameters.tcp
            params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Config.port)!)
            params.allowLocalEndpointReuse = true
            let l = try NWListener(using: params)
            l.newConnectionHandler = { [weak self] c in self?.handle(c) }
            l.stateUpdateHandler = { st in
                switch st {
                case .ready: DispatchQueue.main.async { ready(true) }
                case .failed(let e):
                    NSLog("JjalCopy bridge failed: \(e)")
                    DispatchQueue.main.async { ready(false) }
                default: break
                }
            }
            l.start(queue: queue)
            listener = l
        } catch {
            NSLog("JjalCopy bridge start error: \(error)")
            ready(false)
        }
    }

    // MARK: - HTTP

    private struct Head {
        let method: String, target: String, headers: [String: String], bodyStart: Int, length: Int
        var path: String { String(target.split(separator: "?", maxSplits: 1).first ?? "") }
        var query: [String: String] {
            guard let q = URLComponents(string: "http://x" + target)?.queryItems else { return [:] }
            return Dictionary(q.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        }
        init?(_ d: Data) {
            guard let sep = d.range(of: Data("\r\n\r\n".utf8)),
                  let text = String(data: d[..<sep.lowerBound], encoding: .utf8) else { return nil }
            var lines = text.components(separatedBy: "\r\n")
            let first = lines.removeFirst().split(separator: " ")
            guard first.count >= 2 else { return nil }
            var h: [String: String] = [:]
            for l in lines { if let i = l.firstIndex(of: ":") {
                h[l[..<i].lowercased()] = l[l.index(after: i)...].trimmingCharacters(in: .whitespaces) } }
            method = String(first[0]); target = String(first[1]); headers = h
            bodyStart = sep.upperBound
            length = Int(h["content-length"] ?? "0") ?? 0
        }
    }

    private func handle(_ c: NWConnection) {
        c.start(queue: queue)
        receive(c, buffer: Data())
    }

    private func receive(_ c: NWConnection, buffer: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, done, err in
            guard let self else { return }
            var buf = buffer
            if let data { buf.append(data) }
            if let head = Head(buf) {
                let limit = head.path == "/copy-data" ? Config.maxBytes : Self.maxJsonBody
                if head.length < 0 || head.length > limit { return self.send(c, 413, ["ok": false, "error": "too large"], origin: self.allowedOrigin(head)) }
                if buf.count - head.bodyStart >= head.length {
                    let body = buf.subdata(in: head.bodyStart ..< head.bodyStart + head.length)
                    return self.route(head, body, c)
                }
            } else if buf.count > 64 * 1024 {
                return c.cancel()   // 헤더가 너무 김
            }
            if done || err != nil { return c.cancel() }
            self.receive(c, buffer: buf)
        }
    }

    private func allowedOrigin(_ h: Head) -> String? {
        guard let o = h.headers["origin"], let host = URL(string: o)?.host?.lowercased(),
              Config.allowedHosts.contains(host) else { return nil }
        return o
    }

    private func route(_ h: Head, _ body: Data, _ c: NWConnection) {
        guard let origin = allowedOrigin(h) else {
            return send(c, 403, ["error": "origin not allowed"], origin: nil)
        }
        switch (h.method, h.path) {
        case ("OPTIONS", _):
            send(c, 204, nil, origin: origin)
        case ("GET", "/ping"):
            send(c, 200, ["app": Config.appName, "version": Config.version, "os": "mac", "features": ["copy-data"]], origin: origin)
        case ("POST", "/copy"):
            guard let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let raw = obj["url"] as? String, let src = URL(string: raw),
                  let scheme = src.scheme?.lowercased(), ["http", "https"].contains(scheme) else {
                return send(c, 400, ["ok": false, "error": "url 이 필요해요"], origin: origin)
            }
            let ext = src.pathExtension.isEmpty ? "webp" : src.pathExtension.lowercased()
            let name = Copier.safeName(obj["name"] as? String ?? src.lastPathComponent, ext: ext)
            run(c, origin) { try await Copier.download(src, name: name) }
        case ("POST", "/copy-data"):
            let type = (h.headers["content-type"] ?? "").split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
            guard type.hasPrefix("image/") else {
                return send(c, 415, ["ok": false, "error": "이미지가 아니에요 (\(type))"], origin: origin)
            }
            var ext = String(type.dropFirst(6)); if ext == "jpeg" { ext = "jpg" }
            let name = Copier.safeName(h.query["name"], ext: ext)
            run(c, origin) { try Copier.save(body, name: name) }
        default:
            send(c, 404, ["error": "not found"], origin: origin)
        }
    }

    private func run(_ c: NWConnection, _ origin: String, _ make: @escaping () async throws -> URL) {
        Task { @MainActor in
            do {
                let saved: String
                if let onCopy = self.onCopy { saved = try await onCopy(make) }
                else { saved = try await make().lastPathComponent }
                self.queue.async { self.send(c, 200, ["ok": true, "name": saved, "hint": "paste"], origin: origin) }
            } catch {
                self.queue.async { self.send(c, 502, ["ok": false, "error": error.localizedDescription], origin: origin) }
            }
        }
    }

    private func send(_ c: NWConnection, _ status: Int, _ json: [String: Any]?, origin: String?) {
        let body = json.flatMap { try? JSONSerialization.data(withJSONObject: $0) } ?? Data()
        var head = "HTTP/1.1 \(status) \(status < 300 ? "OK" : "ERR")\r\n"
        head += "Content-Type: application/json; charset=utf-8\r\nContent-Length: \(body.count)\r\nConnection: close\r\n"
        if let origin {
            head += "Access-Control-Allow-Origin: \(origin)\r\nVary: Origin\r\n"
            head += "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
            head += "Access-Control-Allow-Private-Network: true\r\nAccess-Control-Max-Age: 600\r\n"
        }
        head += "\r\n"
        c.send(content: Data(head.utf8) + body, completion: .contentProcessed { _ in c.cancel() })
    }
}
