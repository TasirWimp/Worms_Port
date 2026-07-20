import Phaser from 'phaser';
import './style.css';

import { io } from 'socket.io-client';
import { protocolEvents } from '../../shared/protocol';

import JoinScene from './scenes/join';
import RoomScene from './scenes/room';
import GameScene from './scenes/game';
import CombatScene from './scenes/combat';
import PracticeScene from './scenes/practice';
import ResultScene from './scenes/result';
import { bootstrapSession } from './lib/session';
import { PRACTICE_CLIENT_REGISTRY_KEY, PracticeClient } from './practice/client';

function syncVisualViewport(): void {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.floor(viewport?.width ?? window.innerWidth));
    const height = Math.max(1, Math.floor(viewport?.height ?? window.innerHeight));
    document.documentElement.style.setProperty('--app-viewport-width', `${width}px`);
    document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
}

syncVisualViewport();
window.addEventListener('resize', syncVisualViewport);
window.visualViewport?.addEventListener('resize', syncVisualViewport);
window.visualViewport?.addEventListener('scroll', syncVisualViewport);

class BootScene extends Phaser.Scene {
    public constructor() {
        super({ key: 'boot' });
    }
}

class NimbleKnotsGame extends Phaser.Game
{
    constructor (combatPreview = false)
    {
        super({
            title: 'NIMble Knots: Cotton Clash',
            backgroundColor: 0x1F2348,
            parent: 'game',
            scale: {
                mode: Phaser.Scale.RESIZE,
                width: 800,
                height: 600
            },
            dom: {
                createContainer: true
            },
            scene: combatPreview
                ? [ CombatScene, JoinScene, RoomScene, GameScene ]
                : [ BootScene, PracticeScene, CombatScene, ResultScene, JoinScene, RoomScene, GameScene ]
        });
    }
}

window.onload = async () => {
    const combatPreview = new URLSearchParams(window.location.search).has('combat-preview');
    if (combatPreview) {
        new NimbleKnotsGame(true);
        return;
    }
    const socket = io({ transports: ['websocket'] });
    const initialSnapshots: unknown[] = [];
    const initialResults: unknown[] = [];
    const bufferSnapshot = (snapshot: unknown) => initialSnapshots.push(snapshot);
    const bufferResult = (result: unknown) => initialResults.push(result);
    socket.on(protocolEvents.snapshot, bufferSnapshot);
    socket.on(protocolEvents.result, bufferResult);
    const session = await bootstrapSession(socket);
    const client = new PracticeClient(socket, session, initialSnapshots, initialResults);
    socket.off(protocolEvents.snapshot, bufferSnapshot);
    socket.off(protocolEvents.result, bufferResult);
    const game = new NimbleKnotsGame();
    game.registry.set(PRACTICE_CLIENT_REGISTRY_KEY, client);
    game.scene.start('practice');
};
