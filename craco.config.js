const path = require("path");
const webpack = require("webpack");

module.exports = {
  style: {
    postcss: {
      mode: "file"
    }
  },
  webpack: {
    configure: (config) => {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        buffer: require.resolve("buffer/")
      };
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        // Magenta's audio-playback code imports tone; we only use MusicRNN inference so
        // we stub it out to avoid the ESM/CJS incompatibility with Tone.js 14.
        tone: path.resolve(__dirname, "src/tone-stub.js")
      };
      config.plugins = [
        ...(config.plugins || []),
        new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] })
      ];
      return config;
    }
  }
};
