import ExpoModulesCore
import AVFoundation
// LameEncoder is the ObjC façade declared in LameBridge.h. Wrapping libmp3lame
// in ObjC means we don't depend on a clang module-map from the vendored
// xcframework. Release builds reject per-slice modulemaps as redefinitions.
// The Pod's umbrella header picks up LameBridge.h automatically.

// MP3 encoder built on top of libmp3lame 3.100 (LGPL). The pipeline:
//
//   1. Open the source via AVURLAsset. Works for any media format
//      AVFoundation understands (mp4, mov, m4a, wav, caf, mkv via the
//      system demuxers, …).
//   2. AVAssetReader extracts the audio track and decodes it to interleaved
//      16-bit PCM at 44.1 kHz stereo (or whatever the user asked for).
//   3. We feed PCM frames in 1152-sample chunks (LAME's preferred granule
//      size, one MP3 frame) into `lame_encode_buffer_interleaved`, which
//      writes the encoded bytes to an in-memory buffer.
//   4. Flush + close, write the resulting bytes to the destination URL.

public class ExpoLameModule: Module {

  public func definition() -> ModuleDefinition {
    Name("ExpoLame")

    AsyncFunction("encodeMp3") { (
      inputUri: String,
      outputUri: String,
      options: [String: Any],
      promise: Promise
    ) in
      Task {
        await self.runEncode(
          inputUri: inputUri,
          outputUri: outputUri,
          options: options,
          promise: promise
        )
      }
    }
  }

  // MARK: - URL helpers (same pattern as ExpoMediaConvertModule)

  private func makeUrl(_ s: String) -> URL? {
    if s.hasPrefix("file://") { return URL(string: s) }
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

  // MARK: - Options

  private struct EncodeOptions {
    var bitrateKbps: Int = 192
    var sampleRate: Int = 44_100
    var channels: Int = 2          // 1 mono, 2 stereo
    var quality: Int = 2           // LAME 0 (slowest, best) … 9 (fastest)
    var trimStartSec: Double = 0
    var trimEndSec: Double?

    static func from(_ dict: [String: Any]) -> EncodeOptions {
      var o = EncodeOptions()
      if let v = dict["bitrateKbps"] as? Int { o.bitrateKbps = v }
      if let v = dict["sampleRate"] as? Int  { o.sampleRate = v }
      if let v = dict["channels"]   as? Int  { o.channels = v }
      if let v = dict["quality"]    as? Int  { o.quality = v }
      o.trimStartSec = dict["trimStartSec"] as? Double ?? 0
      o.trimEndSec   = dict["trimEndSec"]   as? Double
      return o
    }
  }

  // MARK: - Pipeline

  private func runEncode(
    inputUri: String,
    outputUri: String,
    options: [String: Any],
    promise: Promise
  ) async {
    guard let input = makeUrl(inputUri), let output = makeUrl(outputUri) else {
      promise.reject("LAME_ERROR", "Invalid input/output URI.")
      return
    }
    deleteIfExists(output)

    let opts = EncodeOptions.from(options)
    let asset = AVURLAsset(url: input)

    guard let audioTrack = try? await asset.loadTracks(withMediaType: .audio).first else {
      promise.reject("LAME_ERROR", "Input has no audio track.")
      return
    }

    let totalSec = CMTimeGetSeconds((try? await asset.load(.duration)) ?? .zero)
    let trimStart = max(0, opts.trimStartSec)
    let trimEnd = min(totalSec, opts.trimEndSec ?? totalSec)
    if trimEnd <= trimStart {
      promise.reject("LAME_ERROR", "Trim range is empty.")
      return
    }

    // Build a composition that contains just the trimmed slice. Lets us
    // normalise the timeline to zero, which the reader prefers.
    let timescale: CMTimeScale = 44_100
    let timeRange = CMTimeRange(
      start: CMTime(seconds: trimStart, preferredTimescale: timescale),
      duration: CMTime(seconds: trimEnd - trimStart, preferredTimescale: timescale)
    )
    let composition = AVMutableComposition()
    guard let compTrack = composition.addMutableTrack(
      withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      promise.reject("LAME_ERROR", "Failed to create composition track.")
      return
    }
    do {
      try compTrack.insertTimeRange(timeRange, of: audioTrack, at: .zero)
    } catch {
      promise.reject("LAME_ERROR", "Insert range failed: \(error.localizedDescription)")
      return
    }

    guard let reader = try? AVAssetReader(asset: composition) else {
      promise.reject("LAME_ERROR", "Could not open composition for reading.")
      return
    }

    // Ask AVFoundation for interleaved Int16 PCM at the requested rate +
    // channel count. AVFoundation handles the resampling for us.
    let readerSettings: [String: Any] = [
      AVFormatIDKey:           kAudioFormatLinearPCM,
      AVSampleRateKey:         opts.sampleRate,
      AVNumberOfChannelsKey:   opts.channels,
      AVLinearPCMBitDepthKey:  16,
      AVLinearPCMIsFloatKey:   false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let readerOutput = AVAssetReaderTrackOutput(track: compTrack, outputSettings: readerSettings)
    reader.add(readerOutput)
    if !reader.startReading() {
      let msg = reader.error?.localizedDescription ?? "Could not start reading."
      promise.reject("LAME_ERROR", msg)
      return
    }

    // MARK: LAME init (via ObjC bridge)
    guard let encoder = LameEncoder(
      sampleRate: Int32(opts.sampleRate),
      channels: Int32(opts.channels),
      bitrateKbps: Int32(opts.bitrateKbps),
      quality: Int32(opts.quality)
    ) else {
      promise.reject("LAME_ERROR", "Could not initialise LAME (incompatible parameters).")
      return
    }

    // Output buffer: 1.25 × PCM size + 7200 is LAME's documented safe size.
    let pcmFramesPerChunk = 1152
    let mp3BufferSize = (pcmFramesPerChunk * 5 / 4) + 7200
    var mp3Buffer = [UInt8](repeating: 0, count: mp3BufferSize)

    // Open destination file for streamed writes.
    FileManager.default.createFile(atPath: output.path, contents: nil)
    guard let fh = try? FileHandle(forWritingTo: output) else {
      promise.reject("LAME_ERROR", "Could not open output for writing.")
      return
    }
    defer { try? fh.close() }

    // Pump PCM → LAME → file. We collect the AVAssetReader's interleaved
    // Int16 samples into a rolling buffer and flush 1152-frame chunks until
    // we run dry.
    var pcmAccum = [Int16]()
    pcmAccum.reserveCapacity(pcmFramesPerChunk * opts.channels * 4)

    while reader.status == .reading {
      guard let sample = readerOutput.copyNextSampleBuffer() else { break }
      defer { CMSampleBufferInvalidate(sample) }
      guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
      var lengthAtOffset = 0
      var totalLength = 0
      var dataPtr: UnsafeMutablePointer<CChar>? = nil
      if CMBlockBufferGetDataPointer(
        block, atOffset: 0,
        lengthAtOffsetOut: &lengthAtOffset,
        totalLengthOut: &totalLength,
        dataPointerOut: &dataPtr
      ) != noErr || dataPtr == nil {
        continue
      }
      let frameCount = totalLength / MemoryLayout<Int16>.size
      let int16Ptr = UnsafeRawPointer(dataPtr!).bindMemory(to: Int16.self, capacity: frameCount)
      pcmAccum.append(contentsOf: UnsafeBufferPointer(start: int16Ptr, count: frameCount))

      // Drain in 1152-frame chunks.
      let framesPerWrite = pcmFramesPerChunk * opts.channels
      while pcmAccum.count >= framesPerWrite {
        let chunk = Array(pcmAccum[0..<framesPerWrite])
        pcmAccum.removeFirst(framesPerWrite)
        let written = chunk.withUnsafeBufferPointer { ptr -> Int32 in
          encoder.encodeFrames(
            Int32(pcmFramesPerChunk),
            pcmData: ptr.baseAddress!,
            outMp3: &mp3Buffer,
            outCapacity: Int32(mp3BufferSize)
          )
        }
        if written < 0 {
          promise.reject("LAME_ERROR", "lame_encode_buffer_interleaved failed: \(written)")
          return
        }
        if written > 0 {
          fh.write(Data(mp3Buffer.prefix(Int(written))))
        }
      }
    }

    // Encode the tail (frame count smaller than 1152) and then flush LAME's
    // internal MP3 bit reservoir so the file ends cleanly.
    if !pcmAccum.isEmpty {
      let leftoverFrames = pcmAccum.count / opts.channels
      let written = pcmAccum.withUnsafeBufferPointer { ptr -> Int32 in
        encoder.encodeFrames(
          Int32(leftoverFrames),
          pcmData: ptr.baseAddress!,
          outMp3: &mp3Buffer,
          outCapacity: Int32(mp3BufferSize)
        )
      }
      if written > 0 {
        fh.write(Data(mp3Buffer.prefix(Int(written))))
      }
    }
    let flushed = encoder.flushOutMp3(&mp3Buffer, outCapacity: Int32(mp3BufferSize))
    if flushed > 0 {
      fh.write(Data(mp3Buffer.prefix(Int(flushed))))
    }

    if reader.status == .failed {
      let msg = reader.error?.localizedDescription ?? "Reader failed."
      promise.reject("LAME_ERROR", msg)
      return
    }

    promise.resolve(["uri": output.absoluteString, "size": self.fileSize(output)])
  }
}
