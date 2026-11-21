// swift-tools-version:5.9
// 짤 복사 도우미 (macOS) — jjal 사이트에서 움짤을 누르면 원본 파일을 클립보드에 올려 카톡 ⌘V 로 보내게 해 주는 메뉴 막대 앱
import PackageDescription

let package = Package(
    name: "JjalCopy",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "JjalCopy", path: "Sources/JjalCopy")
    ]
)
