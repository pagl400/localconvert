// swift-tools-version:5.9
import PackageDescription

// Swift Package wrapper around the pure helper functions in
// ios/PureLogic.swift. The iOS Pod (ExpoMediaConvert.podspec) also compiles
// this file via its `**/*.swift` glob, so we have a single source of truth.
// `swift test` runs the XCTest target under Tests/MediaConvertCoreTests/.

let package = Package(
  name: "MediaConvertCore",
  platforms: [
    .iOS(.v14),
    .macOS(.v11),
  ],
  products: [
    .library(name: "MediaConvertCore", targets: ["MediaConvertCore"]),
  ],
  targets: [
    .target(
      name: "MediaConvertCore",
      path: "ios",
      sources: ["PureLogic.swift"]
    ),
    .testTarget(
      name: "MediaConvertCoreTests",
      dependencies: ["MediaConvertCore"],
      path: "Tests/MediaConvertCoreTests"
    ),
  ]
)
