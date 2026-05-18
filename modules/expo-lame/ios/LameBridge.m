#import "LameBridge.h"

#include <lame/lame.h>

@implementation LameEncoder {
  lame_global_flags *_gfp;
}

- (nullable instancetype)initWithSampleRate:(int)sampleRate
                                    channels:(int)channels
                                 bitrateKbps:(int)bitrateKbps
                                     quality:(int)quality {
  self = [super init];
  if (!self) return nil;

  _gfp = lame_init();
  if (!_gfp) return nil;

  lame_set_in_samplerate(_gfp, sampleRate);
  lame_set_num_channels(_gfp, channels);
  lame_set_mode(_gfp, channels == 1 ? MONO : STEREO);
  lame_set_brate(_gfp, bitrateKbps);
  lame_set_quality(_gfp, quality);
  lame_set_VBR(_gfp, vbr_off);

  if (lame_init_params(_gfp) < 0) {
    lame_close(_gfp);
    _gfp = NULL;
    return nil;
  }
  return self;
}

- (int)encodeFrames:(int)frames
            pcmData:(const int16_t *)pcm
             outMp3:(uint8_t *)outMp3
        outCapacity:(int)outCapacity {
  if (!_gfp) return -1;
  return lame_encode_buffer_interleaved(
      _gfp,
      (short int *)pcm,
      frames,
      outMp3,
      outCapacity);
}

- (int)flushOutMp3:(uint8_t *)outMp3 outCapacity:(int)outCapacity {
  if (!_gfp) return -1;
  return lame_encode_flush(_gfp, outMp3, outCapacity);
}

- (void)dealloc {
  if (_gfp) {
    lame_close(_gfp);
    _gfp = NULL;
  }
}

@end
