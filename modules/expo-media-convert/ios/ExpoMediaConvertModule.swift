import ExpoModulesCore
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

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
          bitrateKbps: nil,
          promise: promise
        )
      }
    }

    // Audio convert with explicit kbps bitrate. Used by the new UI which lets
    // the user pick 64/96/128/192/320 kbps directly.
    AsyncFunction("convertAudioWithBitrate") { (
      inputUri: String,
      outputUri: String,
      format: String,
      bitrateKbps: Int,
      promise: Promise
    ) in
      Task {
        await self.runAudioConvert(
          inputUri: inputUri,
          outputUri: outputUri,
          format: format,
          quality: "high",
          bitrateKbps: bitrateKbps,
          promise: promise
        )
      }
    }

    // Full audio transcode: bitrate / sample rate / channels / bit depth / trim.
    // Routes to runAudioTranscode which uses AVMutableComposition for trimming
    // and AVAssetWriter for everything else.
    AsyncFunction("transcodeAudio") { (
      inputUri: String,
      outputUri: String,
      format: String,
      options: [String: Any],
      promise: Promise
    ) in
      Task {
        await self.runAudioTranscode(
          inputUri: inputUri,
          outputUri: outputUri,
          format: format,
          options: options,
          promise: promise
        )
      }
    }

    // Returns duration / sampleRate / channels / bitrate for an audio file.
    AsyncFunction("audioInfo") { (inputUri: String, promise: Promise) in
      Task {
        await self.runAudioInfo(inputUri: inputUri, promise: promise)
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

    // New: full transcode with explicit resolution / bitrate / codec / fps /
    // audio / trim options. Falls back to AVAssetExportSession when no
    // non-default options were requested, which is the fastest path.
    AsyncFunction("transcodeVideo") { (
      inputUri: String,
      outputUri: String,
      format: String,
      options: [String: Any],
      promise: Promise
    ) in
      Task {
        await self.runVideoTranscode(
          inputUri: inputUri,
          outputUri: outputUri,
          format: format,
          options: options,
          promise: promise
        )
      }
    }

    AsyncFunction("videoToGif") { (
      inputUri: String,
      outputUri: String,
      options: [String: Any],
      promise: Promise
    ) in
      Task {
        await self.runGifExport(
          inputUri: inputUri,
          outputUri: outputUri,
          options: options,
          promise: promise
        )
      }
    }

    // Returns duration / width / height / fps / hasAudio / bitrate. The JS UI
    // uses this to draw a live "estimated output size" hint before the user
    // hits Convert.
    AsyncFunction("videoInfo") { (inputUri: String, promise: Promise) in
      Task {
        await self.runVideoInfo(inputUri: inputUri, promise: promise)
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
          bitrateKbps: nil,
          promise: promise
        )
      }
    }
  }

  // MARK: - URL / FS Helpers

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

  // MARK: - Format helpers
  //
  // Pure mapping functions live in Sources/MediaConvertCore/PureLogic.swift so
  // they can be unit-tested via `swift test`. The thin instance methods below
  // delegate to them.

  private func audioFormatID(for format: String) -> AudioFormatID? {
    MediaConvertCore.audioFormatID(for: format)
  }

  private func audioFileType(for format: String) -> AVFileType? {
    MediaConvertCore.audioFileType(for: format)
  }

  private func audioBitrate(for quality: String) -> Int {
    MediaConvertCore.audioBitrate(for: quality)
  }

  private func videoFileType(for format: String) -> AVFileType? {
    MediaConvertCore.videoFileType(for: format)
  }

  private func videoPreset(for quality: String) -> String {
    MediaConvertCore.videoPreset(for: quality)
  }

  private func videoBitrate(qualityPreset: String, width: Int, height: Int) -> Int {
    MediaConvertCore.videoBitrate(qualityPreset: qualityPreset, width: width, height: height)
  }

  // MARK: - Audio Convert

  private func runAudioConvert(
    inputUri: String,
    outputUri: String,
    format: String,
    quality: String,
    bitrateKbps: Int?,
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
      let chosen = bitrateKbps.map { $0 * 1000 } ?? audioBitrate(for: quality)
      settings[AVEncoderBitRateKey] = chosen
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

  // MARK: - Video Convert (preset-based, fast path)

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

  // MARK: - Video Transcode (full control via AVAssetReader+Writer)

  private struct TranscodeOptions {
    var width: Int?
    var height: Int?
    var preserveAspectRatio: Bool = true
    var videoBitrate: Int? // kbps
    var qualityPreset: String = "standard"
    var codec: String = "h264" // "h264" | "h265"
    var fps: Int? // 0 / nil = keep source
    var audioMode: String = "keep" // "keep" | "reencode" | "remove"
    var audioBitrate: Int? // kbps
    var trimStartSec: Double = 0
    var trimEndSec: Double? // nil = end of asset

    static func from(_ dict: [String: Any]) -> TranscodeOptions {
      var o = TranscodeOptions()
      o.width = dict["width"] as? Int
      o.height = dict["height"] as? Int
      o.preserveAspectRatio = dict["preserveAspectRatio"] as? Bool ?? true
      o.videoBitrate = dict["videoBitrate"] as? Int
      o.qualityPreset = dict["qualityPreset"] as? String ?? "standard"
      o.codec = dict["codec"] as? String ?? "h264"
      o.fps = dict["fps"] as? Int
      o.audioMode = dict["audioMode"] as? String ?? "keep"
      o.audioBitrate = dict["audioBitrate"] as? Int
      o.trimStartSec = dict["trimStartSec"] as? Double ?? 0
      o.trimEndSec = dict["trimEndSec"] as? Double
      return o
    }
  }

  // Apply a CGAffineTransform to a size and return the rotated bounding box.
  private func rotatedSize(_ size: CGSize, _ t: CGAffineTransform) -> CGSize {
    let rect = CGRect(origin: .zero, size: size).applying(t)
    return CGSize(width: abs(rect.width), height: abs(rect.height))
  }

  private func computeTargetSize(
    sourceSize: CGSize,
    opts: TranscodeOptions
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
        // Fit inside the requested box, preserving aspect.
        let scale = min(w / srcW, h / srcH)
        return CGSize(width: (srcW * scale).rounded(), height: (srcH * scale).rounded())
      }
    }
    return CGSize(width: requestedW ?? srcW, height: requestedH ?? srcH)
  }

  // Returns true if the request is "no-op": same dimensions, same fps, no
  // audio change, no trim, no specific codec or bitrate. We fall back to the
  // export-session fast path in that case.
  private func isNoOpTranscode(
    opts: TranscodeOptions,
    sourceFps: Float
  ) -> Bool {
    if opts.width != nil || opts.height != nil { return false }
    if opts.fps != nil && Float(opts.fps!) != sourceFps { return false }
    if opts.audioMode != "keep" { return false }
    if opts.trimStartSec > 0 { return false }
    if opts.trimEndSec != nil { return false }
    if opts.videoBitrate != nil { return false }
    if opts.codec == "h265" { return false }
    if opts.qualityPreset != "standard" { return false }
    return true
  }

  private func runVideoTranscode(
    inputUri: String,
    outputUri: String,
    format: String,
    options: [String: Any],
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

    let opts = TranscodeOptions.from(options)
    let sourceAsset = AVURLAsset(url: input)

    guard let videoTrack = try? await sourceAsset.loadTracks(withMediaType: .video).first else {
      promise.reject("MEDIA_ERROR", "Input has no video track.")
      return
    }
    let audioTracks = (try? await sourceAsset.loadTracks(withMediaType: .audio)) ?? []
    let firstAudioTrack = audioTracks.first

    let naturalSize: CGSize = (try? await videoTrack.load(.naturalSize)) ?? .zero
    let preferredTransform: CGAffineTransform =
      (try? await videoTrack.load(.preferredTransform)) ?? .identity
    let sourceFps: Float = (try? await videoTrack.load(.nominalFrameRate)) ?? 30
    let assetDuration: CMTime = (try? await sourceAsset.load(.duration)) ?? .zero
    let totalSeconds = CMTimeGetSeconds(assetDuration)

    let displaySize = rotatedSize(naturalSize, preferredTransform)
    let targetSize = computeTargetSize(sourceSize: displaySize, opts: opts)
    let targetWidth = Int(targetSize.width)
    let targetHeight = Int(targetSize.height)

    // Fast path: nothing to change beyond format → use export session.
    if isNoOpTranscode(opts: opts, sourceFps: sourceFps) {
      await runVideoConvert(
        inputUri: inputUri,
        outputUri: outputUri,
        format: format,
        quality: opts.qualityPreset == "standard" ? "high" : opts.qualityPreset,
        promise: promise
      )
      return
    }

    // Build trim range. Start/end clamped to asset duration.
    let trimStart = max(0, opts.trimStartSec)
    let trimEnd = min(totalSeconds, opts.trimEndSec ?? totalSeconds)
    if trimEnd <= trimStart {
      promise.reject("MEDIA_ERROR", "Trim range is empty.")
      return
    }
    let timescale: CMTimeScale = 600
    let startTime = CMTime(seconds: trimStart, preferredTimescale: timescale)
    let endTime = CMTime(seconds: trimEnd, preferredTimescale: timescale)
    let duration = CMTimeSubtract(endTime, startTime)
    let timeRange = CMTimeRange(start: startTime, duration: duration)

    // Build a composition that contains exactly the trimmed slice. This
    // normalises the timeline to start at zero, which makes the writer happy.
    let composition = AVMutableComposition()
    guard let compVideoTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      promise.reject("MEDIA_ERROR", "Could not create composition video track.")
      return
    }
    do {
      try compVideoTrack.insertTimeRange(timeRange, of: videoTrack, at: .zero)
    } catch {
      promise.reject("MEDIA_ERROR", "Failed to insert video range: \(error.localizedDescription)")
      return
    }
    compVideoTrack.preferredTransform = preferredTransform

    var compAudioTrack: AVMutableCompositionTrack? = nil
    if opts.audioMode != "remove", let audioTrack = firstAudioTrack {
      compAudioTrack = composition.addMutableTrack(
        withMediaType: .audio,
        preferredTrackID: kCMPersistentTrackID_Invalid
      )
      do {
        try compAudioTrack?.insertTimeRange(timeRange, of: audioTrack, at: .zero)
      } catch {
        // Audio is best-effort, if insert fails, drop the audio rather than aborting.
        compAudioTrack = nil
      }
    }

    // Video composition: handles resize + fps + transform.
    let targetFps = opts.fps ?? Int(sourceFps.rounded())
    let videoComposition = AVMutableVideoComposition()
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(1, targetFps)))
    videoComposition.renderSize = CGSize(width: targetWidth, height: targetHeight)

    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
    let transformForScale = transformFor(
      sourceSize: naturalSize,
      preferredTransform: preferredTransform,
      targetSize: CGSize(width: targetWidth, height: targetHeight)
    )
    layerInstruction.setTransform(transformForScale, at: .zero)

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
    instruction.layerInstructions = [layerInstruction]
    videoComposition.instructions = [instruction]

    // Reader
    guard let reader = try? AVAssetReader(asset: composition) else {
      promise.reject("MEDIA_ERROR", "Could not open composition for reading.")
      return
    }
    let videoOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: composition.tracks(withMediaType: .video),
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
    videoOutput.videoComposition = videoComposition
    reader.add(videoOutput)

    var audioOutput: AVAssetReaderTrackOutput? = nil
    if let track = compAudioTrack {
      audioOutput = AVAssetReaderTrackOutput(
        track: track,
        outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM]
      )
      if let ao = audioOutput, reader.canAdd(ao) { reader.add(ao) }
    }

    // Writer
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: output, fileType: fileType)
    } catch {
      promise.reject("MEDIA_ERROR", "Could not create writer: \(error.localizedDescription)")
      return
    }

    let videoBitrateBps = opts.videoBitrate.map { $0 * 1000 } ??
      videoBitrate(qualityPreset: opts.qualityPreset, width: targetWidth, height: targetHeight)
    let codec: AVVideoCodecType = (opts.codec == "h265" || opts.codec == "hevc") ? .hevc : .h264

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: codec,
      AVVideoWidthKey: targetWidth,
      AVVideoHeightKey: targetHeight,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: videoBitrateBps,
        AVVideoExpectedSourceFrameRateKey: targetFps,
        AVVideoMaxKeyFrameIntervalKey: max(1, targetFps * 2),
      ],
    ]
    let videoWriterInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    videoWriterInput.expectsMediaDataInRealTime = false
    if writer.canAdd(videoWriterInput) { writer.add(videoWriterInput) }

    var audioWriterInput: AVAssetWriterInput? = nil
    if audioOutput != nil {
      let audioKbps = opts.audioBitrate ?? 128
      let audioSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVNumberOfChannelsKey: 2,
        AVSampleRateKey: 44_100,
        AVEncoderBitRateKey: audioKbps * 1000,
      ]
      let ai = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
      ai.expectsMediaDataInRealTime = false
      if writer.canAdd(ai) {
        writer.add(ai)
        audioWriterInput = ai
      }
    }

    reader.startReading()
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    // Pump video + audio in parallel.
    let videoQueue = DispatchQueue(label: "expo.media.video")
    let audioQueue = DispatchQueue(label: "expo.media.audio")

    let videoDone = AsyncSemaphore()
    let audioDone = AsyncSemaphore()

    videoWriterInput.requestMediaDataWhenReady(on: videoQueue) {
      while videoWriterInput.isReadyForMoreMediaData {
        if let sample = videoOutput.copyNextSampleBuffer() {
          if !videoWriterInput.append(sample) {
            videoWriterInput.markAsFinished()
            videoDone.signal()
            return
          }
        } else {
          videoWriterInput.markAsFinished()
          videoDone.signal()
          return
        }
      }
    }

    if let audioWriterInput = audioWriterInput, let audioOutput = audioOutput {
      audioWriterInput.requestMediaDataWhenReady(on: audioQueue) {
        while audioWriterInput.isReadyForMoreMediaData {
          if let sample = audioOutput.copyNextSampleBuffer() {
            if !audioWriterInput.append(sample) {
              audioWriterInput.markAsFinished()
              audioDone.signal()
              return
            }
          } else {
            audioWriterInput.markAsFinished()
            audioDone.signal()
            return
          }
        }
      }
    } else {
      audioDone.signal()
    }

    await videoDone.wait()
    await audioDone.wait()

    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      writer.finishWriting { cont.resume() }
    }

    if writer.status == .completed {
      promise.resolve(["uri": output.absoluteString, "size": self.fileSize(output)])
    } else {
      let msg = writer.error?.localizedDescription ?? "Video transcode failed."
      promise.reject("MEDIA_ERROR", msg)
    }
  }

  // Compute the affine transform that takes a video track's natural-size frame
  // (with its preferred-transform rotation applied) and centres it inside the
  // target render size. We aspect-fit so vertical videos don't get distorted.
  private func transformFor(
    sourceSize: CGSize,
    preferredTransform: CGAffineTransform,
    targetSize: CGSize
  ) -> CGAffineTransform {
    let rotated = rotatedSize(sourceSize, preferredTransform)
    let scaleX = targetSize.width / rotated.width
    let scaleY = targetSize.height / rotated.height
    let scale = min(scaleX, scaleY)
    let scaledSize = CGSize(width: rotated.width * scale, height: rotated.height * scale)
    let dx = (targetSize.width - scaledSize.width) / 2
    let dy = (targetSize.height - scaledSize.height) / 2
    var t = preferredTransform
    t = t.concatenating(CGAffineTransform(scaleX: scale, y: scale))
    t = t.concatenating(CGAffineTransform(translationX: dx, y: dy))
    return t
  }

  // MARK: - GIF export

  private struct GifOptions {
    var width: Int = 360
    var fps: Int = 15
    var loop: Bool = true
    var colors: Int = 256
    var trimStartSec: Double = 0
    var trimEndSec: Double?

    static func from(_ dict: [String: Any]) -> GifOptions {
      var o = GifOptions()
      o.width = (dict["width"] as? Int) ?? 360
      o.fps = (dict["fps"] as? Int) ?? 15
      o.loop = (dict["loop"] as? Bool) ?? true
      o.colors = (dict["colors"] as? Int) ?? 256
      o.trimStartSec = (dict["trimStartSec"] as? Double) ?? 0
      o.trimEndSec = dict["trimEndSec"] as? Double
      return o
    }
  }

  private func runGifExport(
    inputUri: String,
    outputUri: String,
    options: [String: Any],
    promise: Promise
  ) async {
    guard let input = makeUrl(inputUri), let output = makeUrl(outputUri) else {
      promise.reject("MEDIA_ERROR", "Invalid input/output URI.")
      return
    }
    deleteIfExists(output)

    let opts = GifOptions.from(options)
    let asset = AVURLAsset(url: input)

    guard let videoTrack = try? await asset.loadTracks(withMediaType: .video).first else {
      promise.reject("MEDIA_ERROR", "Input has no video track.")
      return
    }
    let naturalSize: CGSize = (try? await videoTrack.load(.naturalSize)) ?? .zero
    let preferredTransform: CGAffineTransform =
      (try? await videoTrack.load(.preferredTransform)) ?? .identity
    let durationCM: CMTime = (try? await asset.load(.duration)) ?? .zero
    let totalSeconds = CMTimeGetSeconds(durationCM)

    let displaySize = rotatedSize(naturalSize, preferredTransform)
    let aspect = displaySize.height / displaySize.width
    let targetW = max(80, opts.width)
    let targetH = max(60, Int((CGFloat(targetW) * aspect).rounded()))

    let start = max(0, opts.trimStartSec)
    let end = min(totalSeconds, opts.trimEndSec ?? totalSeconds)
    if end <= start {
      promise.reject("MEDIA_ERROR", "Trim range is empty.")
      return
    }

    // GIF stores per-frame delay as centiseconds (1/100s steps). Picking
    // 15 fps yields 1/15 ≈ 0.0667s which rounds to 7cs → effective ~14.3 fps,
    // and many viewers clamp delays under 0.02s to 0.1s. We round to the
    // nearest centisecond ONCE and use it both for sampling-interval and the
    // stored delay so the GIF plays at the rate the user picked (within GIF
    // format precision).
    let requestedFps = max(1, min(50, opts.fps))
    let rawInterval = 1.0 / Double(requestedFps)
    let centiseconds = max(2, Int((rawInterval * 100).rounded()))
    let frameInterval = Double(centiseconds) / 100.0

    var times: [NSValue] = []
    var t = start
    while t < end {
      times.append(NSValue(time: CMTime(seconds: t, preferredTimescale: 600)))
      t += frameInterval
    }
    if times.isEmpty {
      promise.reject("MEDIA_ERROR", "No frames to capture for the requested trim/fps.")
      return
    }

    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    generator.maximumSize = CGSize(width: targetW, height: targetH)

    let gifUti: CFString
    if #available(iOS 14.0, *) {
      gifUti = UTType.gif.identifier as CFString
    } else {
      gifUti = "com.compuserve.gif" as CFString
    }

    guard let destination = CGImageDestinationCreateWithURL(
      output as CFURL,
      gifUti,
      times.count,
      nil
    ) else {
      promise.reject("MEDIA_ERROR", "Could not create GIF destination.")
      return
    }

    let loopCount = opts.loop ? 0 : 1
    let gifFileProperties: [CFString: Any] = [
      kCGImagePropertyGIFDictionary as CFString: [
        kCGImagePropertyGIFLoopCount as CFString: loopCount,
      ],
    ]
    CGImageDestinationSetProperties(destination, gifFileProperties as CFDictionary)

    let frameProperties: [CFString: Any] = [
      kCGImagePropertyGIFDictionary as CFString: [
        kCGImagePropertyGIFDelayTime as CFString: frameInterval,
        kCGImagePropertyGIFUnclampedDelayTime as CFString: frameInterval,
      ],
    ]
    let frameDict = frameProperties as CFDictionary

    // Generate frames sequentially to avoid blowing up memory on long clips.
    for value in times {
      var actual = CMTime.zero
      do {
        let cg = try generator.copyCGImage(at: value.timeValue, actualTime: &actual)
        CGImageDestinationAddImage(destination, cg, frameDict)
      } catch {
        // Skip frames the generator can't render rather than aborting.
        continue
      }
    }

    if !CGImageDestinationFinalize(destination) {
      promise.reject("MEDIA_ERROR", "Failed to finalise GIF.")
      return
    }

    promise.resolve(["uri": output.absoluteString, "size": self.fileSize(output)])
  }

  // MARK: - Video info

  private func runVideoInfo(inputUri: String, promise: Promise) async {
    guard let input = makeUrl(inputUri) else {
      promise.reject("MEDIA_ERROR", "Invalid input URI.")
      return
    }
    let asset = AVURLAsset(url: input)

    let duration: CMTime = (try? await asset.load(.duration)) ?? .zero
    let videoTracks = (try? await asset.loadTracks(withMediaType: .video)) ?? []
    let audioTracks = (try? await asset.loadTracks(withMediaType: .audio)) ?? []

    var info: [String: Any] = [
      "durationSec": CMTimeGetSeconds(duration),
      "hasAudio": !audioTracks.isEmpty,
    ]

    if let videoTrack = videoTracks.first {
      let size: CGSize = (try? await videoTrack.load(.naturalSize)) ?? .zero
      let transform: CGAffineTransform =
        (try? await videoTrack.load(.preferredTransform)) ?? .identity
      let fps: Float = (try? await videoTrack.load(.nominalFrameRate)) ?? 0
      let bitrate: Float = (try? await videoTrack.load(.estimatedDataRate)) ?? 0
      let rotated = rotatedSize(size, transform)
      info["width"] = Int(rotated.width)
      info["height"] = Int(rotated.height)
      info["fps"] = fps
      info["videoBitrateKbps"] = Int(bitrate / 1000)
    } else {
      info["width"] = 0
      info["height"] = 0
      info["fps"] = 0
      info["videoBitrateKbps"] = 0
    }
    promise.resolve(info)
  }

  // MARK: - Audio info

  private func runAudioInfo(inputUri: String, promise: Promise) async {
    guard let input = makeUrl(inputUri) else {
      promise.reject("MEDIA_ERROR", "Invalid input URI.")
      return
    }
    let asset = AVURLAsset(url: input)
    let duration: CMTime = (try? await asset.load(.duration)) ?? .zero
    let audioTracks = (try? await asset.loadTracks(withMediaType: .audio)) ?? []

    var info: [String: Any] = [
      "durationSec": CMTimeGetSeconds(duration),
    ]
    if let track = audioTracks.first {
      let bitrate: Float = (try? await track.load(.estimatedDataRate)) ?? 0
      info["bitrateKbps"] = Int(bitrate / 1000)
      let formatDescs: [CMFormatDescription] = (try? await track.load(.formatDescriptions)) ?? []
      if let desc = formatDescs.first,
         let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(desc)?.pointee {
        info["sampleRate"] = asbd.mSampleRate
        info["channels"] = Int(asbd.mChannelsPerFrame)
      } else {
        info["sampleRate"] = 44_100
        info["channels"] = 2
      }
    } else {
      info["bitrateKbps"] = 0
      info["sampleRate"] = 0
      info["channels"] = 0
    }
    promise.resolve(info)
  }

  // MARK: - Audio Transcode (full options: bitrate, sample rate, channels, bit depth, trim)

  private struct AudioTranscodeOptions {
    var bitrateKbps: Int?      // for AAC/M4A
    var sampleRate: Int?       // 16000 / 22050 / 32000 / 44100 / 48000
    var channels: Int?         // 1 or 2
    var bitDepth: Int?         // 16 / 24 / 32 (WAV / AIFF / CAF)
    var trimStartSec: Double = 0
    var trimEndSec: Double?

    static func from(_ dict: [String: Any]) -> AudioTranscodeOptions {
      var o = AudioTranscodeOptions()
      o.bitrateKbps = dict["bitrateKbps"] as? Int
      o.sampleRate = dict["sampleRate"] as? Int
      o.channels = dict["channels"] as? Int
      o.bitDepth = dict["bitDepth"] as? Int
      o.trimStartSec = dict["trimStartSec"] as? Double ?? 0
      o.trimEndSec = dict["trimEndSec"] as? Double
      return o
    }
  }

  private func runAudioTranscode(
    inputUri: String,
    outputUri: String,
    format: String,
    options: [String: Any],
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

    let opts = AudioTranscodeOptions.from(options)
    let asset = AVURLAsset(url: input)

    guard let audioTrack = try? await asset.loadTracks(withMediaType: .audio).first else {
      promise.reject("MEDIA_ERROR", "Input has no audio track.")
      return
    }
    let totalDur = CMTimeGetSeconds((try? await asset.load(.duration)) ?? .zero)

    // Build trim composition.
    let trimStart = max(0, opts.trimStartSec)
    let trimEnd = min(totalDur, opts.trimEndSec ?? totalDur)
    if trimEnd <= trimStart {
      promise.reject("MEDIA_ERROR", "Trim range is empty.")
      return
    }
    let scale: CMTimeScale = 44_100
    let startTime = CMTime(seconds: trimStart, preferredTimescale: scale)
    let endTime = CMTime(seconds: trimEnd, preferredTimescale: scale)
    let duration = CMTimeSubtract(endTime, startTime)
    let timeRange = CMTimeRange(start: startTime, duration: duration)

    let composition = AVMutableComposition()
    guard let compTrack = composition.addMutableTrack(
      withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      promise.reject("MEDIA_ERROR", "Could not create composition audio track.")
      return
    }
    do {
      try compTrack.insertTimeRange(timeRange, of: audioTrack, at: .zero)
    } catch {
      promise.reject("MEDIA_ERROR", "Failed to insert audio range: \(error.localizedDescription)")
      return
    }

    guard let reader = try? AVAssetReader(asset: composition) else {
      promise.reject("MEDIA_ERROR", "Could not open composition for reading.")
      return
    }
    let readerOutput = AVAssetReaderTrackOutput(
      track: compTrack,
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

    let channels = opts.channels ?? 2
    let sampleRate = opts.sampleRate ?? 44_100

    var settings: [String: Any] = [
      AVFormatIDKey: formatID,
      AVNumberOfChannelsKey: channels,
      AVSampleRateKey: sampleRate,
    ]
    if formatID == kAudioFormatMPEG4AAC {
      let kbps = opts.bitrateKbps ?? 192
      settings[AVEncoderBitRateKey] = kbps * 1000
    } else if formatID == kAudioFormatLinearPCM {
      let bitDepth = opts.bitDepth ?? 16
      settings[AVLinearPCMBitDepthKey] = bitDepth
      settings[AVLinearPCMIsFloatKey] = (bitDepth >= 32)
      settings[AVLinearPCMIsBigEndianKey] = (fileType == .aiff)
      settings[AVLinearPCMIsNonInterleaved] = false
    }

    let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
    writerInput.expectsMediaDataInRealTime = false
    writer.add(writerInput)

    reader.startReading()
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    let queue = DispatchQueue(label: "expo.media.audio.transcode")
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
      let msg = writer.error?.localizedDescription ?? "Audio transcode failed."
      promise.reject("MEDIA_ERROR", msg)
    }
  }
}

// MARK: - AsyncSemaphore

/// A small async-aware semaphore so we can wait for the video and audio
/// `requestMediaDataWhenReady` callbacks to drain before we call
/// `finishWriting`. Using two `DispatchGroup`s would also work, but the async
/// continuation pattern composes more cleanly with the surrounding
/// `await` flow.
final class AsyncSemaphore: @unchecked Sendable {
  private var continuation: CheckedContinuation<Void, Never>?
  private var signaled = false
  private let lock = NSLock()

  func signal() {
    lock.lock()
    defer { lock.unlock() }
    if let c = continuation {
      continuation = nil
      c.resume()
    } else {
      signaled = true
    }
  }

  func wait() async {
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      lock.lock()
      if signaled {
        signaled = false
        lock.unlock()
        cont.resume()
      } else {
        continuation = cont
        lock.unlock()
      }
    }
  }
}

