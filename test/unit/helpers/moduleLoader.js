const Module = require('node:module');

function withPatchedModules(overrides, load) {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(overrides, request)) {
      return overrides[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return load();
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = { withPatchedModules };