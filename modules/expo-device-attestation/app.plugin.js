// Expo config plugin for expo-device-attestation.
//
// Adds:
//   - Android: <meta-data android:name="expo.modules.deviceattestation.CLOUD_PROJECT_NUMBER"
//     android:value="<YOUR_NUMBER>"/> inside <application>. The cloud project number
//     comes from Google Play Console → app → Settings → API Access → Linked Cloud project.
//   - iOS: the App Attest entitlement (com.apple.developer.devicecheck.appattest-environment)
//     defaulting to "production".
//
// Usage in app.json:
//   "plugins": [
//     ...,
//     ["expo-device-attestation", {
//       "androidCloudProjectNumber": "1234567890123",
//       "iosAppAttestEnvironment": "production"  // or "development"
//     }]
//   ]
const { withAndroidManifest, withEntitlementsPlist, AndroidConfig } = require('@expo/config-plugins');

function withAndroidCloudProjectNumber(config, props) {
  return withAndroidManifest(config, (cfg) => {
    if (!props?.androidCloudProjectNumber) {
      console.warn(
        '[expo-device-attestation] No androidCloudProjectNumber set — Play Integrity will not work. ' +
          'Provide it via the plugin options once you have a Google Play Console project linked.'
      );
      return cfg;
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application['meta-data'] = application['meta-data'] || [];
    application['meta-data'] = application['meta-data'].filter(
      (m) => m.$['android:name'] !== 'expo.modules.deviceattestation.CLOUD_PROJECT_NUMBER'
    );
    application['meta-data'].push({
      $: {
        'android:name': 'expo.modules.deviceattestation.CLOUD_PROJECT_NUMBER',
        'android:value': String(props.androidCloudProjectNumber),
      },
    });
    return cfg;
  });
}

function withIosAppAttestEntitlement(config, props) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.devicecheck.appattest-environment'] =
      props?.iosAppAttestEnvironment ?? 'production';
    return cfg;
  });
}

module.exports = function (config, props = {}) {
  config = withAndroidCloudProjectNumber(config, props);
  config = withIosAppAttestEntitlement(config, props);
  return config;
};
