import { EventEmitter } from 'events';
import type { Server } from 'socket.io';

import { Game } from './class';
import { dummy } from './dummy';
import { Player } from './player';

export class GameWatcher extends EventEmitter {
    public static readonly instance = new GameWatcher();

    protected games: Map<string, Game>;
    protected io: Server;

    protected constructor() {
        super();

        this.games = new Map();

        this.on_game_loop_start = this.on_game_loop_start.bind(this);
        this.on_new_game = this.on_new_game.bind(this);
        this.on_player_hidden = this.on_player_hidden.bind(this);
        this.on_player_joined = this.on_player_joined.bind(this);
        this.on_player_ready = this.on_player_ready.bind(this);

        this.on('game_loop_start', this.on_game_loop_start);
        this.on('new_game', this.on_new_game);
        this.on('player_hidden', this.on_player_hidden);
        this.on('player_joined', this.on_player_joined);
        this.on('player_ready', this.on_player_ready);
    }

    public get(game_id: string) {
        return this.games.get(game_id) || dummy;
    }

    public use(io: Server) {
        this.io = io;
    }

    public reset() {
        this.games.clear();
    }

    public hidePlayer(playerId: string) {
        for (const game of this.games.values()) {
            if (game.has_player(playerId)) {
                game.hide_player(playerId);
            }
        }
    }

    public hasPlayer(playerId: string) {
        return [...this.games.values()].some((game) => game.has_player(playerId));
    }

    public gameIdForPlayer(playerId: string) {
        return [...this.games.values()].find((game) => game.has_player(playerId))?.id;
    }

    protected on_game_loop_start(game: Game) {
        this.io.to(game.id).emit('server:game#start', { gameId: game.id });
    }

    protected on_new_game(game: Game) {
        this.games.set(game.id, game);
        this.io.to(game.id).emit('server:game#start', { gameId: game.id });
    }

    protected on_player_hidden(game: Game, player: Player) {
        this.io.to(game.id).emit('server:game#hidden', player.public_id());
        if (game.is_abandoned()) {
            this.games.delete(game.id);
        }
    }

    protected on_player_joined(game: Game, player: Player) {
        this.io.to(game.id).emit('server:game#join', player.public_info());
    }

    protected on_player_ready(game: Game, player: Player) {
        this.io.to(game.id).emit('server:game#ready', player.public_id());
        if (game.can_start()) {
            game.start();
        }
    }
}
