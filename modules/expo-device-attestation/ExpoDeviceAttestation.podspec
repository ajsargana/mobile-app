require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoDeviceAttestation'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'AURA50'
  s.homepage       = 'https://aura50.com'
  s.platform       = :ios, '14.0'  # DCAppAttestService requires iOS 14+
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift / Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE'         => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "ios/**/*.{h,m,swift}"
end
