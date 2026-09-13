const assert = require('node:assert/strict');
const test = require('node:test');

const { inspectPeiProxyInputs } = require('../../scripts/check-identity-bundles');

test('PEI helper bundle stays outside game and reward authority', () => {
  const isolated = {
    outputs: {
      'pei-proxy-server.js': {
        inputs: {
          'server/src/pei-proxy-server.ts': {},
          'server/src/pei/runtime-contract.ts': {},
          'server/src/identity/crypto.ts': {},
          'shared/pei-v0.ts': {}
        }
      }
    }
  };
  assert.deepEqual(inspectPeiProxyInputs(isolated), []);

  isolated.outputs['pei-proxy-server.js'].inputs['server/src/reward/types.ts'] = {};
  assert.deepEqual(inspectPeiProxyInputs(isolated), ['server/src/reward/types.ts']);
});
