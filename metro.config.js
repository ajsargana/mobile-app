const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add polyfills for Node.js modules in React Native
const nodeLibs = require('node-libs-expo');
config.resolver.extraNodeModules = {
  ...nodeLibs,
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer/'),
  process: require.resolve('process/browser'),
};

// Handle trailing-slash imports (e.g. "process/browser/" from readable-stream inside react-native-quick-crypto)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'process/browser/') {
    return { filePath: require.resolve('process/browser'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Add support for ESM file extensions
config.resolver.sourceExts = [
  ...(config.resolver.sourceExts || []),
  'cjs',
  'mjs',
];

// Support uppercase asset extensions (e.g. icon.PNG, favicon.PNG)
config.resolver.assetExts = [
  ...(config.resolver.assetExts || []),
  'PNG',
  'JPG',
  'JPEG',
  'GIF',
  'BMP',
  'WEBP',
];

// Configure main field resolution order for ESM/CJS compatibility
// Use 'browser' and 'main' for compiled packages to avoid TypeScript source issues
config.resolver.resolverMainFields = ['browser', 'main'];

// Enable experimental package exports support (helps with ESM packages)
config.resolver.unstable_enablePackageExports = true;

// Configure transformer for better compatibility
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  }),
};

module.exports = withNativeWind(config, { input: './global.css' });
