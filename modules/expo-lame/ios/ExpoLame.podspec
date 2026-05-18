require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoLame'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  # LAME itself is LGPL-2.1; our wrapper code is MIT. We ship both notices
  # inside lame.xcframework/ (LICENSE + COPYING).
  s.license        = 'LGPL-2.1'
  s.author         = 'LocalConvert'
  s.homepage       = 'https://github.com/pagl400/localconvert'
  s.platforms = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMedia'

  # libmp3lame compiled via scripts/build-lame.sh. Headers shipped inside the
  # xcframework so the Swift wrapper can pull <lame/lame.h>.
  s.vendored_frameworks = 'lame.xcframework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # Static-library xcframeworks (libmp3lame.a) don't auto-expose Headers/
    # to the include path, so we wire it in per-SDK. Doing it conditionally
    # (instead of both slices at once) avoids "redefinition of module 'lame'"
    # when the compiler indexes both modulemaps.
    'HEADER_SEARCH_PATHS[sdk=iphoneos*]'         => '$(inherited) $(PODS_TARGET_SRCROOT)/lame.xcframework/ios-arm64/Headers',
    'HEADER_SEARCH_PATHS[sdk=iphonesimulator*]'  => '$(inherited) $(PODS_TARGET_SRCROOT)/lame.xcframework/ios-arm64-simulator/Headers',
    # Linker needs the .a file's directory plus an explicit -lmp3lame entry.
    # CocoaPods auto-derives the link flag from the framework name, but for a
    # static xcframework it can't auto-resolve the slice path.
    'LIBRARY_SEARCH_PATHS[sdk=iphoneos*]'        => '$(inherited) $(PODS_TARGET_SRCROOT)/lame.xcframework/ios-arm64',
    'LIBRARY_SEARCH_PATHS[sdk=iphonesimulator*]' => '$(inherited) $(PODS_TARGET_SRCROOT)/lame.xcframework/ios-arm64-simulator',
    # We only ship arm64 simulator slices (Apple Silicon Macs). Tell xcodebuild
    # not to try x86_64, the resulting binary would be missing the .a anyway.
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]'       => 'x86_64',
  }

  # The LAME static lib (libmp3lame.a) sits inside the xcframework, the app
  # target's final link step needs the same paths. Use $(inherited) so we
  # extend rather than replace whatever CocoaPods has set up for other pods.
  s.user_target_xcconfig = {
    'LIBRARY_SEARCH_PATHS[sdk=iphoneos*]'        => '$(inherited) $(PODS_ROOT)/../../modules/expo-lame/ios/lame.xcframework/ios-arm64',
    'LIBRARY_SEARCH_PATHS[sdk=iphonesimulator*]' => '$(inherited) $(PODS_ROOT)/../../modules/expo-lame/ios/lame.xcframework/ios-arm64-simulator',
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]'       => 'x86_64',
  }

  s.source_files = '**/*.{h,m,swift}'
end
