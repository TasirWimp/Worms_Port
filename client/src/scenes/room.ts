import type { Socket } from 'socket.io-client';
import Toastify from 'toastify-js';

import { $, request, is_error, emitWithAck, parseRoomJoinAck } from '../lib/util';
import { setActiveGameId, whenSessionReady } from '../lib/session';

import OverlayedScene from './overlayed';

export default class RoomScene extends OverlayedScene
{
    /** 'Back' button. */
    protected b_back: HTMLButtonElement;
    /** 'Start' button. */
    protected b_start: HTMLButtonElement;
    /** Checkbox for state: ready/not ready. */
    protected inp_ready: HTMLInputElement;
    /** For copying room id. */
    protected inp_room_id: HTMLInputElement;
    /** List of players. */
    protected t_room: HTMLTableSectionElement;

    protected me: string;
    protected ready: boolean;
    protected room_id: string;
    protected socket: Socket;
    protected pending_events: (() => void)[];

    public constructor ()
    {
        super({ key: 'room' }, '/overlay/room.html');
    }

    public init (
        args: {
            room_id: string,
            socket: Socket
        }
    ) {
        this.ready = false;
        this.pending_events = [];
        this.room_id = args.room_id;
        if (!this.socket) {
            this.socket = args.socket;
            this.setup_socket();
        }
    }

    public create ()
    {
        super.create();
        this.validate()
            .then((joined) => joined ? this.show_members() : undefined)
            .then(() => this.finish_rehydrate());
    }

    public is_ready ()
    {
        return this.ready && this.scene.isActive();
    }

    protected display_socket (
        id: string,
        ready?: boolean,
        is_me?: boolean,
        first?: boolean
    ) {
        if ($(`socket-${id}`)) {
            return;
        }
        let row = this.t_room.insertRow();
        row.id = `socket-${id}`;
        row.innerHTML = `
            <td>${id}</td>
            <td id="ready-${id}">${ready_sign(ready)}</td>
            <td>${is_me_sign(is_me)}</td>
            <td id="first-${id}">${first_sign(first)}</td>
        `;
    }

    protected setup_overlay_fields ()
    {
        this.b_back = <HTMLButtonElement> $('b-back');
        this.b_start = <HTMLButtonElement> $('b-start');
        this.inp_ready = <HTMLInputElement> $('inp-ready');
        this.inp_room_id = <HTMLInputElement> $('inp-room-id');
        this.t_room = <HTMLTableSectionElement> $('t-room');
    }

    protected setup_overlay_behavior ()
    {
        this.b_back.onclick = () => {
            void emitWithAck(this.socket, 'client:room#leave', {}).catch(console.error);
            this.scene.start('join', { socket: this.socket });
        };

        this.b_start.onclick = () => {
            void emitWithAck(this.socket, 'client:room#start', {}).catch(console.error);
        };

        this.inp_ready.onclick = () => {
            void emitWithAck(
                this.socket,
                'client:room#ready',
                { ready: this.inp_ready.checked }
            ).catch(console.error);
        };

        this.inp_room_id.value = this.room_id;

        this.inp_room_id.addEventListener('click', () => {
            this.inp_room_id.select();
            document.execCommand('copy');
            this.inp_room_id.setSelectionRange(0, 0);
            Toastify({
                text: 'Copied to clipboard!',
                duration: 1000,
                position: 'center',
                gravity: 'bottom',
                selector: 'popups'
            }).showToast();
        });
    }

    protected setup_socket ()
    {
        this.socket
            .on('connect', () => {
                if (this.scene.isActive()) {
                    this.ready = false;
                    this.pending_events = [];
                    void whenSessionReady(this.socket)
                        .then(() => this.validate())
                        .then((joined) => joined ? this.show_members() : undefined)
                        .then(() => this.finish_rehydrate())
                        .catch(console.error);
                }
            })
            .on('server:room#join', (id: string) => {
                this.dispatch_room_event(() => {
                    this.display_socket(id, false, this.me == id);
                });
            })
            .on('server:room#ready', (id: string, ready: boolean) => {
                this.dispatch_room_event(() => {
                    const field = $(`ready-${id}`);
                    if (field) field.innerHTML = ready_sign(ready);
                });
            })
            .on('server:room#first', (id: string) => {
                this.dispatch_room_event(() => {
                    this.t_room.querySelectorAll<HTMLElement>('[id^="first-"]')
                        .forEach((field) => field.innerHTML = first_sign(false));
                    const field = $(`first-${id}`);
                    if (field) field.innerHTML = first_sign(true);
                });
            })
            .on('server:room#enable', (enabled: boolean) => {
                this.dispatch_room_event(() => {
                    this.b_start.disabled = !enabled;
                });
            })
            .on('server:room#leave', (id: string) => {
                this.dispatch_room_event(() => {
                    const row = $(`socket-${id}`);
                    if (row?.parentNode === this.t_room) this.t_room.removeChild(row);
                });
            })
            .on('server:game#start', ({ gameId }: { gameId: string }) => {
                this.dispatch_room_event(() => {
                    setActiveGameId(gameId);
                    this.scene.start('game', { gameId, socket: this.socket });
                });
            });
    }

    protected async validate ()
    {
        let join_result = parseRoomJoinAck(await emitWithAck(
            this.socket,
            'client:room#join',
            { roomId: this.room_id }
        ));

        if (is_error(join_result)) {
            this.scene.start('join', { error: join_result.error, socket: this.socket });
            return false;
        } else if ('activeGameId' in join_result) {
            setActiveGameId(join_result.activeGameId);
            this.scene.start('game', {
                gameId: join_result.activeGameId,
                socket: this.socket
            });
            return false;
        } else {
            this.me = join_result.me;
            return true;
        }
    }

    protected dispatch_room_event (callback: () => void)
    {
        if (!this.scene.isActive()) return;
        if (this.ready) callback();
        else this.pending_events.push(callback);
    }

    protected finish_rehydrate ()
    {
        if (!this.scene.isActive()) return;
        this.ready = true;
        const pending = this.pending_events.splice(0);
        for (const callback of pending) {
            if (!this.scene.isActive()) break;
            callback();
        }
    }

    protected async show_members ()
    {
        let members: PlayerState[] = await request(`/.room.get_players/id=${this.room_id}`, 'json');
        this.t_room.replaceChildren();
        for (let { id, ready } of members) {
            this.display_socket(id, ready, id == this.me, id == members[0].id);
        }
        const me = members.find(({ id }) => id === this.me);
        this.inp_ready.checked = me?.ready ?? false;
        this.b_start.disabled = members[0]?.id !== this.me ||
            !members.every(({ ready }) => ready);
    }
}

const ready_sign = (ready: boolean) =>
    ready ? 'Ready' : 'Waiting';

const is_me_sign = (is_me: boolean) =>
    is_me ? 'You' : '';

const first_sign = (first: boolean) =>
    first ? 'Host' : '';
