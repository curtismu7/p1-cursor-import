module.exports = {
  transform: [
    ["babelify", { 
      presets: ["@babel/preset-env"],
      global: true,
      // Ignore all node_modules except @babel/runtime-corejs3
      ignore: [
        function (file) {
          return (
            /\/node_modules\//.test(file) &&
            !/\/node_modules\/\@babel\/runtime-corejs3\//.test(file)
          );
        }
      ],
      extensions: ['.js', '.jsx', '.mjs'],
      sourceType: "module"
    }]
  ],
  plugin: [
    ["browserify-derequire"]
  ],
  browserField: false,
  builtins: false,
  commondir: false,
  insertGlobalVars: {
    process: undefined,
    global: undefined,
    'Buffer.isBuffer': undefined,
    Buffer: undefined
  }
};
