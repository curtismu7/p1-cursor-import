const NodeEnvironment = require('jest-environment-jsdom').default;
const { TextEncoder, TextDecoder } = require('util');

module.exports = class CustomTestEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    
    if (typeof this.global.TextEncoder === 'undefined') {
      this.global.TextEncoder = TextEncoder;
    }
    
    if (typeof this.global.TextDecoder === 'undefined') {
      this.global.TextDecoder = TextDecoder;
    }
  }

  async teardown() {
    await super.teardown();
  }

  runScript(script) {
    return super.runScript(script);
  }
};
