#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Thin ObjC façade over libmp3lame. We bridge through ObjC because the Pod's
// final binary can't safely depend on a clang module map from the vendored
// xcframework. Release builds reject the per-slice modulemap as a redefinition.
// Wrapping LAME here keeps <lame/lame.h> visible only inside LameBridge.m.
@interface LameEncoder : NSObject

// Returns nil if libmp3lame couldn't be initialised with the requested params.
- (nullable instancetype)initWithSampleRate:(int)sampleRate
                                    channels:(int)channels
                                 bitrateKbps:(int)bitrateKbps
                                     quality:(int)quality;

// Encode an interleaved 16-bit PCM chunk. `frames` is the number of PCM frames
// (per channel). Returns the number of bytes written to `outMp3` or a negative
// LAME error code.
- (int)encodeFrames:(int)frames
            pcmData:(const int16_t *)pcm
             outMp3:(uint8_t *)outMp3
        outCapacity:(int)outCapacity;

// Flush LAME's internal bit reservoir at end-of-stream. Returns bytes written.
- (int)flushOutMp3:(uint8_t *)outMp3 outCapacity:(int)outCapacity;

@end

NS_ASSUME_NONNULL_END
