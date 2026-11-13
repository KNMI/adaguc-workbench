/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const webpack = require('webpack');
const HtmlWebPackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/application/index.tsx',
  cache: { type: 'memory' },
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'adaguc-workbench.js',
    hashFunction: 'sha256',
  },
  devtool: 'eval-cheap-module-source-map',
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    fallback: {
      fs: false,
      net: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      // The bundled fonts (see src/application/index.tsx).
      {
        test: /\.(woff2?|ttf|eot)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /(node_modules|dist)/,
        use: ['babel-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebPackPlugin({
      template: './src/application/index.html',
      filename: './index.html',
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: 'static' }],
    }),
    // Stamped in at build time (not read at runtime), so it reflects
    // whenever this bundle was actually built, shown in the about dialog.
    new webpack.DefinePlugin({
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    }),
  ],
  devServer: {
    hot: true,
  },
  watchOptions: {
    ignored: /node_modules/,
  },
};
