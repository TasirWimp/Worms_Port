import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clientPointToGame,
    requestedSidewaysMode,
    resolveSidewaysMode
} from '../../client/src/lib/sideways';

test('sideways query supports a default and explicit rotation direction', () => {
    assert.equal(requestedSidewaysMode(''), null);
    assert.equal(requestedSidewaysMode('?sideways'), 'right');
    assert.equal(requestedSidewaysMode('?sideways=1'), 'right');
    assert.equal(requestedSidewaysMode('?sideways=right'), 'right');
    assert.equal(requestedSidewaysMode('?sideways=cw'), 'right');
    assert.equal(requestedSidewaysMode('?sideways=left'), 'left');
    assert.equal(requestedSidewaysMode('?sideways=ccw'), 'left');
    assert.equal(requestedSidewaysMode('?sideways=invalid'), null);
});

test('sideways mode activates only for a portrait browser viewport', () => {
    assert.equal(resolveSidewaysMode('right', 390, 844), 'right');
    assert.equal(resolveSidewaysMode('left', 390, 844), 'left');
    assert.equal(resolveSidewaysMode('right', 844, 390), null);
    assert.equal(resolveSidewaysMode(null, 390, 844), null);
});

test('clockwise sideways input maps screen axes into virtual landscape axes', () => {
    const bounds = { top: 10, right: 410, bottom: 854, left: 20 };
    assert.deepEqual(
        clientPointToGame({ x: 310, y: 610 }, bounds, 'right'),
        { x: 600, y: 100 }
    );
});

test('counter-clockwise sideways input maps screen axes into virtual landscape axes', () => {
    const bounds = { top: 10, right: 410, bottom: 854, left: 20 };
    assert.deepEqual(
        clientPointToGame({ x: 120, y: 254 }, bounds, 'left'),
        { x: 600, y: 100 }
    );
});

test('ordinary viewport input coordinates remain unchanged', () => {
    const point = { x: 120, y: 254 };
    assert.equal(
        clientPointToGame(point, { top: 0, right: 0, bottom: 0, left: 0 }, null),
        point
    );
});
