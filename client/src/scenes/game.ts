import type { Socket } from 'socket.io-client';

import Cookie from '../lib/cookie';

import OverlayedScene from './overlayed';
import { ErrType, is_error } from '../lib/util';

const POCKET_ROBOT_TEXTURE = 'pocket-robot';
const pocketRobotUrl = new URL(
    '../../../assets/sprites/pocket-robot.png',
    import.meta.url
).href;

export default class GameScene extends OverlayedScene
{
    protected me: PublicPlayerInfo;
    protected scheme: Scheme;
    protected socket: Socket;
    protected watcher: EventTarget;

    public constructor ()
    {
        super({ key: 'game' }, 'assets/overlay/game.html');
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

    public preload ()
    {
        super.preload();
        this.load.image(POCKET_ROBOT_TEXTURE, pocketRobotUrl);
    }

    public create ()
    {
        super.create();

        const { width, height } = this.game.canvas;
        const pocketRobot = this.add
                .image(width / 2, height / 2, POCKET_ROBOT_TEXTURE)
                .setDepth(-1);
        pocketRobot.setScale(Math.min(height * 0.6, 360) / pocketRobot.height);

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
