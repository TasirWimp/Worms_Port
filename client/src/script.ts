import Phaser from 'phaser';
import './style.css';

import { io } from 'socket.io-client';

import JoinScene from './scenes/join';
import RoomScene from './scenes/room';
import GameScene from './scenes/game';
import CombatScene from './scenes/combat';
import { bootstrapSession } from './lib/session';

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
                : [ JoinScene, RoomScene, GameScene, CombatScene ]
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
    await bootstrapSession(socket);
    const game = new NimbleKnotsGame();
    game.scene.start('join', { socket });
};
