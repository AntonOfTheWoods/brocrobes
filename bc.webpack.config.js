const BrowserExtensionPlugin = require("extension-build-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const path = require('path');

module.exports = {
  entry: {
    localdata: ['./src/js/lib.mjs'],
    popup: ['./src/js/popup.mjs'],
  },
  output: {
    filename: '[name]-bundle.js',  // output bundle file name
    path: path.resolve(__dirname, './brocrobes-build/'),
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jp?g|svg|gif)$/,
        use: [{
          loader: "file-loader",
          options: { name: '[name].[ext]', outputPath: '/brocrobes-build/img/', publicPath: '/static/img/' }
        }]
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/img", to: "img" },
        { from: "src/manifest.json", to: "manifest.json" },
        { from: "src/options.html", to: "options.html" },
      ],
    }),
    new BrowserExtensionPlugin({
      devMode: false,
      name: "brocrobes.zip",
      directory: "brocrobes-build",
      updateType: "minor"
    }),
  ]
};
