module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
      // NativeWind (Tailwind for RN) — returns {plugins:[...]}, must be a preset
      'nativewind/babel',
    ],
    plugins: [
      // Enable module resolver for aliasing
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: [
            '.ios.ts',
            '.android.ts',
            '.ts',
            '.ios.tsx',
            '.android.tsx',
            '.tsx',
            '.jsx',
            '.js',
            '.json',
            '.mjs',
            '.cjs',
          ],
          alias: {
            '@': './src',
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',
            buffer: 'buffer',
            process: 'process/browser',
          },
        },
      ],
    ],
  };
};
