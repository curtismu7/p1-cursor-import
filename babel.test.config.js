module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current',
      },
      useBuiltIns: 'usage',
      corejs: 3,
      modules: 'auto',
    }],
  ],
  plugins: [
    '@babel/plugin-transform-modules-commonjs',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-private-methods',
    '@babel/plugin-transform-runtime',
  ],
  ignore: ['node_modules'],
};
