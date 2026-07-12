import type { Socket } from 'socket.io-client';

import Cookie from '../lib/cookie';

import OverlayedScene from './overlayed';
import { ErrType, is_error } from '../lib/util';

export default class GameScene extends OverlayedScene
{
    protected me: PublicPlayerInfo;
    protected scheme: Scheme;
    protected socket: Socket;
    protected watcher: EventTarget;

    public constructor ()
    {
        super({ key: 'game' }, '/overlay/game.html');
        this.watcher = new EventTarget();
    }

    public init (
        args: {
            socket: Socket
        }
    ) {
        this.socket = args.socket;
        this.setup_socket();
        this.validate();
    }

    public create ()
    {
        super.create();
        this.draw_placeholder_patch();

        if (!this.me) {
            this.watcher.addEventListener('me-set', () => this.emit_ready());
        } else {
            this.emit_ready();
        }
    }

    protected setup_overlay_fields ()
    {
        // TODO: game overlay
    }

    protected setup_overlay_behavior ()
    {
        // TODO: game overlay behaviour
    }

    protected setup_socket ()
    {
        // TODO: socket events
    }

    protected draw_placeholder_patch ()
    {
        const { width, height } = this.game.canvas;
        const patch = this.add.graphics().setDepth(-3);

        patch.fillStyle(0x795548);
        patch.fillRoundedRect(width * 0.03, height * 0.68, width * 0.42, height * 0.25, 26);
        patch.fillRoundedRect(width * 0.55, height * 0.62, width * 0.42, height * 0.31, 26);
        patch.fillStyle(0x88B04B);
        patch.fillRoundedRect(width * 0.02, height * 0.65, width * 0.44, 55, 24);
        patch.fillRoundedRect(width * 0.54, height * 0.59, width * 0.44, 55, 24);

        this.draw_knotkin(width * 0.28, height * 0.63, 0x0582CA, 0xE9B213);
        this.draw_knotkin(width * 0.72, height * 0.57, 0x5F4B8B, 0xFA7268);
    }

    protected draw_knotkin (
        x: number,
        y: number,
        body_color: number,
        accent_color: number
    ) {
        const knotkin = this.add.graphics().setDepth(-2);

        knotkin.fillStyle(body_color);
        knotkin.fillRoundedRect(x - 76, y - 12, 30, 22, 8);
        knotkin.fillRoundedRect(x + 46, y - 12, 30, 22, 8);
        knotkin.fillPoints([
            new Phaser.Geom.Point(x - 42, y - 58),
            new Phaser.Geom.Point(x + 42, y - 58),
            new Phaser.Geom.Point(x + 60, y - 30),
            new Phaser.Geom.Point(x + 48, y + 22),
            new Phaser.Geom.Point(x + 20, y + 42),
            new Phaser.Geom.Point(x - 20, y + 42),
            new Phaser.Geom.Point(x - 48, y + 22),
            new Phaser.Geom.Point(x - 60, y - 30)
        ], true);
        knotkin.fillRoundedRect(x - 38, y + 34, 30, 28, 7);
        knotkin.fillRoundedRect(x + 8, y + 34, 30, 28, 7);

        knotkin.lineStyle(4, accent_color, 1);
        knotkin.strokePoints([
            new Phaser.Geom.Point(x - 42, y - 58),
            new Phaser.Geom.Point(x + 42, y - 58),
            new Phaser.Geom.Point(x + 60, y - 30),
            new Phaser.Geom.Point(x + 48, y + 22),
            new Phaser.Geom.Point(x + 20, y + 42),
            new Phaser.Geom.Point(x - 20, y + 42),
            new Phaser.Geom.Point(x - 48, y + 22),
            new Phaser.Geom.Point(x - 60, y - 30)
        ], true);

        knotkin.fillStyle(0x111111);
        knotkin.fillCircle(x - 20, y - 10, 13);
        knotkin.fillCircle(x + 20, y - 10, 13);
        knotkin.fillStyle(0xFFFFFF);
        knotkin.fillCircle(x - 16, y - 15, 4);
        knotkin.fillCircle(x + 24, y - 15, 4);

        knotkin.lineStyle(3, accent_color, 0.9);
        for (let offset = -30; offset <= 30; offset += 15) {
            knotkin.lineBetween(x + offset, y + 27, x + offset + 7, y + 31);
        }
    }

    protected emit_ready ()
    {
        this.socket.emit('client:game#ready');
    }

    protected async validate ()
    {
        let join_result = await new Promise((resolve, reject) => {
            this.socket.emit(
                'client:game#join',
                Cookie.get('room'), Cookie.get('id'),
                resolve
            );
            setTimeout(reject, 3000);
        }) as ErrType | { me: PublicPlayerInfo, scheme: Scheme };

        if (is_error(join_result)) {
            this.scene.start('join', { error: join_result.error, socket: this.socket });
        } else {
            this.me = join_result.me;
            this.scheme = join_result.scheme;
            this.watcher.dispatchEvent(new Event('me-set'));
            console.log('succ');
        }
    }
}
