import Phaser from 'phaser';
import './style.css';

import { io } from 'socket.io-client';

import JoinScene from './scenes/join';
import RoomScene from './scenes/room';
import GameScene from './scenes/game';
import { bootstrapSession } from './lib/session';

class NimbleKnotsGame extends Phaser.Game
{
    constructor ()
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
            scene: [ JoinScene, RoomScene, GameScene ]
        });
    }
}

window.onload = async () => {
    const socket = io({ transports: ['websocket'] });
    await bootstrapSession(socket);
    let game = new NimbleKnotsGame();
    game.scene.start('join', { socket });
};
