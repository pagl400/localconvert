import XCTest
import AVFoundation
import CoreGraphics
@testable import MediaConvertCore

final class AudioFormatTests: XCTestCase {

  func testAudioFormatIDMapping() {
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "m4a"), kAudioFormatMPEG4AAC)
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "aac"), kAudioFormatMPEG4AAC)
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "wav"), kAudioFormatLinearPCM)
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "aiff"), kAudioFormatLinearPCM)
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "aif"), kAudioFormatLinearPCM)
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "caf"), kAudioFormatLinearPCM)
  }

  func testAudioFormatIDIsCaseInsensitive() {
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "M4A"), kAudioFormatMPEG4AAC)
    XCTAssertEqual(MediaConvertCore.audioFormatID(for: "WAV"), kAudioFormatLinearPCM)
  }

  func testAudioFormatIDRejectsUnsupported() {
    XCTAssertNil(MediaConvertCore.audioFormatID(for: "mp3"))
    XCTAssertNil(MediaConvertCore.audioFormatID(for: "flac"))
    XCTAssertNil(MediaConvertCore.audioFormatID(for: ""))
  }

  func testAudioFileTypeMapping() {
    XCTAssertEqual(MediaConvertCore.audioFileType(for: "m4a"), .m4a)
    XCTAssertEqual(MediaConvertCore.audioFileType(for: "wav"), .wav)
    XCTAssertEqual(MediaConvertCore.audioFileType(for: "aiff"), .aiff)
    XCTAssertEqual(MediaConvertCore.audioFileType(for: "caf"), .caf)
    XCTAssertNil(MediaConvertCore.audioFileType(for: "mp3"))
  }

  func testAudioBitrateForQuality() {
    XCTAssertEqual(MediaConvertCore.audioBitrate(for: "fast"), 96_000)
    XCTAssertEqual(MediaConvertCore.audioBitrate(for: "high"), 192_000)
    XCTAssertEqual(MediaConvertCore.audioBitrate(for: "max"), 256_000)
    // Unknown values fall back to 192 kbps.
    XCTAssertEqual(MediaConvertCore.audioBitrate(for: ""), 192_000)
    XCTAssertEqual(MediaConvertCore.audioBitrate(for: "foo"), 192_000)
  }
}

final class VideoFormatTests: XCTestCase {

  func testVideoFileTypeMapping() {
    XCTAssertEqual(MediaConvertCore.videoFileType(for: "mp4"), .mp4)
    XCTAssertEqual(MediaConvertCore.videoFileType(for: "mov"), .mov)
    XCTAssertEqual(MediaConvertCore.videoFileType(for: "qt"), .mov)
    XCTAssertEqual(MediaConvertCore.videoFileType(for: "m4v"), .m4v)
    XCTAssertNil(MediaConvertCore.videoFileType(for: "mkv"))
    XCTAssertNil(MediaConvertCore.videoFileType(for: "webm"))
  }

  func testVideoPresetForQuality() {
    XCTAssertEqual(MediaConvertCore.videoPreset(for: "fast"), AVAssetExportPresetLowQuality)
    XCTAssertEqual(MediaConvertCore.videoPreset(for: "high"), AVAssetExportPresetMediumQuality)
    XCTAssertEqual(MediaConvertCore.videoPreset(for: "max"), AVAssetExportPresetHighestQuality)
    // Default falls back to medium.
    XCTAssertEqual(MediaConvertCore.videoPreset(for: ""), AVAssetExportPresetMediumQuality)
  }

  func testVideoBitrateScalesByPixelCount() {
    // 1080p standard ≈ 8 Mbps reference, since pixels exactly equal the reference.
    let bitrate1080 = MediaConvertCore.videoBitrate(qualityPreset: "standard", width: 1920, height: 1080)
    XCTAssertEqual(bitrate1080, 8_000_000)

    // 4K should be ~4× the 1080p value (3840*2160 = 8294400 ≈ 4× 1920*1080).
    let bitrate4k = MediaConvertCore.videoBitrate(qualityPreset: "standard", width: 3840, height: 2160)
    XCTAssertEqual(bitrate4k, 8_000_000 * 4)

    // 720p ≈ 44% of 1080p pixels → ~3.5 Mbps.
    let bitrate720 = MediaConvertCore.videoBitrate(qualityPreset: "standard", width: 1280, height: 720)
    XCTAssertLessThan(bitrate720, bitrate1080)
    XCTAssertGreaterThan(bitrate720, 2_000_000)
  }

  func testVideoBitrateRespectsQualityRamp() {
    let dims = (w: 1920, h: 1080)
    let max     = MediaConvertCore.videoBitrate(qualityPreset: "maximum",    width: dims.w, height: dims.h)
    let high    = MediaConvertCore.videoBitrate(qualityPreset: "high",       width: dims.w, height: dims.h)
    let std     = MediaConvertCore.videoBitrate(qualityPreset: "standard",   width: dims.w, height: dims.h)
    let comp    = MediaConvertCore.videoBitrate(qualityPreset: "compressed", width: dims.w, height: dims.h)
    let strong  = MediaConvertCore.videoBitrate(qualityPreset: "strong",     width: dims.w, height: dims.h)
    XCTAssertGreaterThan(max, high)
    XCTAssertGreaterThan(high, std)
    XCTAssertGreaterThan(std, comp)
    XCTAssertGreaterThan(comp, strong)
  }

  func testVideoBitrateFloorsAt200kbps() {
    let tinyAtStrong = MediaConvertCore.videoBitrate(qualityPreset: "strong", width: 160, height: 90)
    XCTAssertGreaterThanOrEqual(tinyAtStrong, 200_000)
  }

  func testVideoBitrateUnknownPresetUsesStandard() {
    let unknown  = MediaConvertCore.videoBitrate(qualityPreset: "shake", width: 1920, height: 1080)
    let standard = MediaConvertCore.videoBitrate(qualityPreset: "standard", width: 1920, height: 1080)
    XCTAssertEqual(unknown, standard)
  }
}

final class ResolutionMathTests: XCTestCase {

  func testRotatedSizeIdentityIsUnchanged() {
    let size = CGSize(width: 1920, height: 1080)
    let rotated = MediaConvertCore.rotatedSize(size, .identity)
    XCTAssertEqual(rotated.width, 1920, accuracy: 0.001)
    XCTAssertEqual(rotated.height, 1080, accuracy: 0.001)
  }

  func testRotatedSize90DegreesSwapsAxes() {
    let size = CGSize(width: 1920, height: 1080)
    let t = CGAffineTransform(rotationAngle: .pi / 2)
    let rotated = MediaConvertCore.rotatedSize(size, t)
    XCTAssertEqual(rotated.width, 1080, accuracy: 0.001)
    XCTAssertEqual(rotated.height, 1920, accuracy: 0.001)
  }

  func testComputeTargetSizeReturnsSourceWhenNoChange() {
    let result = MediaConvertCore.computeTargetSize(
      sourceSize: CGSize(width: 1920, height: 1080),
      opts: MediaConvertCore.ResolutionRequest()
    )
    XCTAssertEqual(result.width, 1920)
    XCTAssertEqual(result.height, 1080)
  }

  func testComputeTargetSizeAspectFitsInsideBox() {
    // 1920×1080 (16:9) into 1280×1280 box → 1280×720 because we aspect-fit.
    let result = MediaConvertCore.computeTargetSize(
      sourceSize: CGSize(width: 1920, height: 1080),
      opts: MediaConvertCore.ResolutionRequest(width: 1280, height: 1280)
    )
    XCTAssertEqual(result.width, 1280)
    XCTAssertEqual(result.height, 720)
  }

  func testComputeTargetSizeWidthOnlyScalesProportionally() {
    let result = MediaConvertCore.computeTargetSize(
      sourceSize: CGSize(width: 1920, height: 1080),
      opts: MediaConvertCore.ResolutionRequest(width: 960)
    )
    XCTAssertEqual(result.width, 960)
    XCTAssertEqual(result.height, 540)
  }

  func testComputeTargetSizeHeightOnlyScalesProportionally() {
    let result = MediaConvertCore.computeTargetSize(
      sourceSize: CGSize(width: 1920, height: 1080),
      opts: MediaConvertCore.ResolutionRequest(height: 540)
    )
    XCTAssertEqual(result.width, 960)
    XCTAssertEqual(result.height, 540)
  }

  func testComputeTargetSizeIgnoresAspectWhenDisabled() {
    let result = MediaConvertCore.computeTargetSize(
      sourceSize: CGSize(width: 1920, height: 1080),
      opts: MediaConvertCore.ResolutionRequest(width: 1280, height: 1280, preserveAspectRatio: false)
    )
    XCTAssertEqual(result.width, 1280)
    XCTAssertEqual(result.height, 1280)
  }

  func testComputeTargetSizeHandlesZeroSource() {
    let result = MediaConvertCore.computeTargetSize(
      sourceSize: .zero,
      opts: MediaConvertCore.ResolutionRequest(width: 1280)
    )
    // Falls back to 1080p so the writer always has valid dimensions.
    XCTAssertEqual(result.width, 1920)
    XCTAssertEqual(result.height, 1080)
  }
}

final class PageRangeTests: XCTestCase {

  func testSingletonAndRangeMix() {
    XCTAssertEqual(MediaConvertCore.parsePageRanges("1-3, 5, 8-9", total: 10), [1, 2, 3, 5, 8, 9])
  }

  func testReversedRangeIsNormalised() {
    XCTAssertEqual(MediaConvertCore.parsePageRanges("5-3", total: 10), [3, 4, 5])
  }

  func testOverlappingRangesAreDeduplicated() {
    XCTAssertEqual(MediaConvertCore.parsePageRanges("1-3, 2-4", total: 10), [1, 2, 3, 4])
  }

  func testClampsToDocumentRange() {
    XCTAssertEqual(MediaConvertCore.parsePageRanges("1-20", total: 5), [1, 2, 3, 4, 5])
    XCTAssertEqual(MediaConvertCore.parsePageRanges("6", total: 5), [])
    XCTAssertEqual(MediaConvertCore.parsePageRanges("0, -1, 2", total: 10), [2])
  }

  func testIgnoresGarbageTokens() {
    XCTAssertEqual(MediaConvertCore.parsePageRanges("abc, 2, foo-bar", total: 10), [2])
  }

  func testEmptyInputProducesEmptyResult() {
    XCTAssertEqual(MediaConvertCore.parsePageRanges("", total: 10), [])
    XCTAssertEqual(MediaConvertCore.parsePageRanges("   ", total: 10), [])
  }

  func testWhitespaceToleratedAroundParts() {
    XCTAssertEqual(MediaConvertCore.parsePageRanges(" 1 - 3 , 5 ", total: 10), [1, 2, 3, 5])
  }
}
