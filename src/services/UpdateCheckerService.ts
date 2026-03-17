import Constants from 'expo-constants';

const SERVER_VERSION_URL = 'http://62.84.187.126:5005/api/version';

export interface UpdateInfo {
  hasUpdate: boolean;
  forceUpdate: boolean;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
}

/** Compare two semver strings. Returns negative if a < b, 0 if equal, positive if a > b. */
function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const UpdateCheckerService = {
  async check(): Promise<UpdateInfo> {
    const noUpdate: UpdateInfo = {
      hasUpdate: false,
      forceUpdate: false,
      latestVersion: '',
      downloadUrl: '',
      releaseNotes: '',
    };

    try {
      const installedVersion: string =
        Constants.expoConfig?.version ?? '1.0.0';

      const response = await fetch(
        `${SERVER_VERSION_URL}?v=${encodeURIComponent(installedVersion)}`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );

      if (!response.ok) return noUpdate;

      const data = await response.json();

      const latestVersion: string = data.latestVersion ?? '1.0.0';
      const minVersion: string = data.minVersion ?? '1.0.0';
      const downloadUrl: string = data.downloadUrl ?? '';
      const releaseNotes: string = data.releaseNotes ?? '';

      const isOutdated = semverCompare(installedVersion, latestVersion) < 0;

      if (!isOutdated) return noUpdate;

      // forceUpdate when installed version is below the minimum required version
      const forceUpdate = semverCompare(installedVersion, minVersion) < 0;

      return {
        hasUpdate: true,
        forceUpdate,
        latestVersion,
        downloadUrl,
        releaseNotes,
      };
    } catch (_) {
      // Never block the app on a network error
      return noUpdate;
    }
  },
};

export default UpdateCheckerService;
