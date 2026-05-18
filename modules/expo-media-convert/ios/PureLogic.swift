import Foundation
import AVFoundation
import CoreGraphics

// Pure helper functions for ExpoMediaConvertModule. They have no dependency on
// ExpoModulesCore so they can be exercised by a Swift Package Manager test
// target (`swift test`). The iOS module re-uses them via the `MediaConvertCore`
// library that this file is part of.

public enum MediaConvertCore {

  // MARK: - Audio formats

  public static func audioFormatID(for format: String) -> AudioFormatID? {
    switch format.lowercased() {
    case "m4a", "aac": return kAudioFormatMPEG4AAC
    case "wav": return kAudioFormatLinearPCM
    case "aiff", "aif": return kAudioFormatLinearPCM
    case "caf": return kAudioFormatLinearPCM
    default: return nil
    }
  }

  public static func audioFileType(for format: String) -> AVFileType? {
    switch format.lowercased() {
    case "m4a", "aac": return .m4a
    case "wav": return .wav
    case "aiff", "aif": return .aiff
    case "caf": return .caf
    default: return nil
    }
  }

  public static func audioBitrate(for quality: String) -> Int {
    switch quality {
    case "fast": return 96_000
    case "max": return 256_000
    default: return 192_000
    }
  }

  // MARK: - Video formats

  public static func videoFileType(for format: String) -> AVFileType? {
    switch format.lowercased() {
    case "mp4": return .mp4
    case "mov", "qt": return .mov
    case "m4v": return .m4v
    default: return nil
    }
  }

  public static func videoPreset(for quality: String) -> String {
    switch quality {
    case "fast": return AVAssetExportPresetLowQuality
    case "max": return AVAssetExportPresetHighestQuality
    default: return AVAssetExportPresetMediumQuality
    }
  }

  /// Map our 5 "quality presets" (approximating FFmpeg's CRF 17/20/23/28/32) to
  /// a target bitrate in bits per second. Scaled by pixel count so a 4K clip at
  /// "high" gets more headroom than a 480p clip at the same setting.
  public static func videoBitrate(qualityPreset: String, width: Int, height: Int) -> Int {
    let referencePixels = 1920 * 1080
    let pixels = max(width * height, 320 * 180)
    let scale = Double(pixels) / Double(referencePixels)

    let referenceKbps: Int
    switch qualityPreset {
    case "maximum": referenceKbps = 25_000   // ~CRF 17
    case "high": referenceKbps = 12_000      // ~CRF 20
    case "standard": referenceKbps = 8_000   // ~CRF 23
    case "compressed": referenceKbps = 3_000 // ~CRF 28
    case "strong": referenceKbps = 1_000     // ~CRF 32
    default: referenceKbps = 8_000
    }

    let targetKbps = Double(referenceKbps) * scale
    // Floor at 200 kbps to avoid useless output on aggressive presets.
    return max(200_000, Int(targetKbps * 1_000))
  }

  // MARK: - Resolution / geometry

  /// Apply a transform to a size and return its rotated bounding box.
  public static func rotatedSize(_ size: CGSize, _ t: CGAffineTransform) -> CGSize {
    let rect = CGRect(origin: .zero, size: size).applying(t)
    return CGSize(width: abs(rect.width), height: abs(rect.height))
  }

  public struct ResolutionRequest {
    public var width: Int?
    public var height: Int?
    public var preserveAspectRatio: Bool

    public init(width: Int? = nil, height: Int? = nil, preserveAspectRatio: Bool = true) {
      self.width = width
      self.height = height
      self.preserveAspectRatio = preserveAspectRatio
    }
  }

  public static func computeTargetSize(
    sourceSize: CGSize,
    opts: ResolutionRequest
  ) -> CGSize {
    let srcW = sourceSize.width
    let srcH = sourceSize.height
    if srcW <= 0 || srcH <= 0 { return CGSize(width: 1920, height: 1080) }

    let requestedW = opts.width.map { CGFloat($0) }
    let requestedH = opts.height.map { CGFloat($0) }

    if requestedW == nil && requestedH == nil {
      return sourceSize
    }
    if opts.preserveAspectRatio {
      let aspect = srcW / srcH
      if let w = requestedW, requestedH == nil {
        return CGSize(width: w, height: (w / aspect).rounded())
      }
      if let h = requestedH, requestedW == nil {
        return CGSize(width: (h * aspect).rounded(), height: h)
      }
      if let w = requestedW, let h = requestedH {
        let scale = min(w / srcW, h / srcH)
        return CGSize(width: (srcW * scale).rounded(), height: (srcH * scale).rounded())
      }
    }
    return CGSize(width: requestedW ?? srcW, height: requestedH ?? srcH)
  }

  // MARK: - Page-range parser (used by PDF tools)

  /// Parse "1-5, 8, 12-20" into sorted unique 1-based indices, clamped to
  /// [1, total]. Reversed ranges ("5-3") are normalised.
  public static func parsePageRanges(_ input: String, total: Int) -> [Int] {
    var result = Set<Int>()
    for raw in input.split(separator: ",", omittingEmptySubsequences: false) {
      let part = raw.trimmingCharacters(in: .whitespaces)
      if part.isEmpty { continue }
      if let dash = part.firstIndex(of: "-") {
        let lhs = part[..<dash].trimmingCharacters(in: .whitespaces)
        let rhs = part[part.index(after: dash)...].trimmingCharacters(in: .whitespaces)
        guard let from = Int(lhs), let to = Int(rhs) else { continue }
        for i in min(from, to)...max(from, to) {
          if i >= 1 && i <= total { result.insert(i) }
        }
      } else if let n = Int(part), n >= 1 && n <= total {
        result.insert(n)
      }
    }
    return result.sorted()
  }
}
