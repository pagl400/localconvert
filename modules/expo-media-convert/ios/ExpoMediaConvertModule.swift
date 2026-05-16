import ExpoModulesCore
import AVFoundation

public class ExpoMediaConvertModule: Module {

  public func definition() -> ModuleDefinition {
    Name("ExpoMediaConvert")

    AsyncFunction("convertAudio") { (
      inputUri: String,
      outputUri: String,
      format: String,
      quality: String,
      promise: Promise
    ) in
      Task {
        await self.runAudioConvert(
          inputUri: inputUri,
          outputUri: outputUri,
          format: format,
          quality: quality,
          promise: promise
        )
      }
    }

    AsyncFunction("convertVideo") { (
      inputUri: String,
      outputUri: String,
      format: String,
      quality: String,
      promise: Promise
    ) in
      Task {
        await self.runVideoConvert(
          inputUri: inputUri,
          outputUri: outputUri,
          format: format,
          quality: quality,
          promise: promise
        )
      }
    }

    AsyncFunction("extractAudio") { (
      inputUri: String,
      outputUri: String,
      format: String,
      promise: Promise
    ) in
      Task {
        await self.runAudioConvert(
          inputUri: inputUri,
          outputUri: outputUri,
          format: format,
          quality: "high",
          promise: promise
        )
      }
    }
  }

  // MARK: - Helpers

  private func makeUrl(_ s: String) -> URL? {
    if s.hasPrefix("file://") {
      return URL(string: s)
    }
    return URL(fileURLWithPath: s)
  }

  private func deleteIfExists(_ url: URL) {
    if FileManager.default.fileExists(atPath: url.path) {
      try? FileManager.default.removeItem(at: url)
    }
  }

  private func fileSize(_ url: URL) -> Int {
    let attr = try? FileManager.default.attributesOfItem(atPath: url.path)
    return (attr?[.size] as? Int) ?? 0
  }

  private func audioFormatID(for format: String) -> AudioFormatID? {
    switch format.lowercased() {
    case "m4a", "aac": return kAudioFormatMPEG4AAC
    case "wav": return kAudioFormatLinearPCM
    case "aiff", "aif": return kAudioFormatLinearPCM
    case "caf": return kAudioFormatLinearPCM
    default: return nil
    }
  }

  private func audioFileType(for format: String) -> AVFileType? {
    switch format.lowercased() {
    case "m4a", "aac": return .m4a
    case "wav": return .wav
    case "aiff", "aif": return .aiff
    case "caf": return .caf
    default: return nil
    }
  }

  private func audioBitrate(for quality: String) -> Int {
    switch quality {
    case "fast": return 96_000
    case "max": return 256_000
    default: return 192_000
    }
  }

  private func videoFileType(for format: String) -> AVFileType? {
    switch format.lowercased() {
    case "mp4": return .mp4
    case "mov", "qt": return .mov
    case "m4v": return .m4v
    default: return nil
    }
  }

  private func videoPreset(for quality: String) -> String {
    switch quality {
    case "fast": return AVAssetExportPresetLowQuality
    case "max": return AVAssetExportPresetHighestQuality
    default: return AVAssetExportPresetMediumQuality
    }
  }

  // MARK: - Audio

  private func runAudioConvert(
    inputUri: String,
    outputUri: String,
    format: String,
    quality: String,
    promise: Promise
  ) async {
    guard let input = makeUrl(inputUri), let output = makeUrl(outputUri) else {
      promise.reject("MEDIA_ERROR", "Invalid input/output URI.")
      return
    }
    guard let formatID = audioFormatID(for: format),
          let fileType = audioFileType(for: format) else {
      promise.reject("MEDIA_ERROR", "Audio format \(format) is not supported in this build.")
      return
    }
    deleteIfExists(output)

    let asset = AVURLAsset(url: input)
    guard let reader = try? AVAssetReader(asset: asset) else {
      promise.reject("MEDIA_ERROR", "Could not open input asset.")
      return
    }
    let audioTracks = try? await asset.loadTracks(withMediaType: .audio)
    guard let audioTrack = audioTracks?.first else {
      promise.reject("MEDIA_ERROR", "Input has no audio track.")
      return
    }

    var settings: [String: Any] = [
      AVFormatIDKey: formatID,
      AVNumberOfChannelsKey: 2,
      AVSampleRateKey: 44_100,
    ]
    if formatID == kAudioFormatMPEG4AAC {
      settings[AVEncoderBitRateKey] = audioBitrate(for: quality)
    } else if formatID == kAudioFormatLinearPCM {
      settings[AVLinearPCMBitDepthKey] = 16
      settings[AVLinearPCMIsFloatKey] = false
      settings[AVLinearPCMIsBigEndianKey] = (fileType == .aiff)
      settings[AVLinearPCMIsNonInterleaved] = false
    }

    let readerOutput = AVAssetReaderTrackOutput(
      track: audioTrack,
      outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM]
    )
    reader.add(readerOutput)

    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: output, fileType: fileType)
    } catch {
      promise.reject("MEDIA_ERROR", "Could not create writer: \(error.localizedDescription)")
      return
    }
    let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
    writerInput.expectsMediaDataInRealTime = false
    writer.add(writerInput)

    reader.startReading()
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    let queue = DispatchQueue(label: "expo.media.audio")
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      writerInput.requestMediaDataWhenReady(on: queue) {
        while writerInput.isReadyForMoreMediaData {
          if let sample = readerOutput.copyNextSampleBuffer() {
            writerInput.append(sample)
          } else {
            writerInput.markAsFinished()
            writer.finishWriting { cont.resume() }
            return
          }
        }
      }
    }

    if writer.status == .completed {
      promise.resolve(["uri": output.absoluteString, "size": self.fileSize(output)])
    } else {
      let msg = writer.error?.localizedDescription ?? "Audio conversion failed."
      promise.reject("MEDIA_ERROR", msg)
    }
  }

  // MARK: - Video

  private func runVideoConvert(
    inputUri: String,
    outputUri: String,
    format: String,
    quality: String,
    promise: Promise
  ) async {
    guard let input = makeUrl(inputUri), let output = makeUrl(outputUri) else {
      promise.reject("MEDIA_ERROR", "Invalid input/output URI.")
      return
    }
    guard let fileType = videoFileType(for: format) else {
      promise.reject("MEDIA_ERROR", "Video format \(format) is not supported in this build.")
      return
    }
    deleteIfExists(output)

    let asset = AVURLAsset(url: input)
    let preset = videoPreset(for: quality)
    guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
      promise.reject("MEDIA_ERROR", "Could not create export session.")
      return
    }
    session.outputURL = output
    session.outputFileType = fileType
    session.shouldOptimizeForNetworkUse = true

    await session.export()

    if session.status == .completed {
      promise.resolve(["uri": output.absoluteString, "size": self.fileSize(output)])
    } else {
      let msg = session.error?.localizedDescription ?? "Video conversion failed."
      promise.reject("MEDIA_ERROR", msg)
    }
  }
}
