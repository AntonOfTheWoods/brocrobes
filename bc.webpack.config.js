const BrowserExtensionPlugin = require("extension-build-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const path = require('path');

module.exports = {
  entry: {
    background: [ './src/js/background.js', ],
    content: ['./src/js/content.js'],
    options: [ './src/js/options.js', ],
  },
  output: {
    filename: '[name]-bundle.js',  // output bundle file name
    path: path.resolve(__dirname, './brocrobes-build/'),
  },
  devtool: 'inline-source-map',
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
  ],
};
