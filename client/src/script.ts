import Phaser from 'phaser';
import './style.css';

import { io } from 'socket.io-client';

import JoinScene from './scenes/join';
import RoomScene from './scenes/room';
import GameScene from './scenes/game';
import CombatScene from './scenes/combat';
import PracticeScene from './scenes/practice';
import ResultScene from './scenes/result';
import type ObjectiveModeScene from './scenes/objective-mode';
import { bootstrapSession } from './lib/session';
import { requestedSidewaysMode, resolveSidewaysMode } from './lib/sideways';
import { PRACTICE_CLIENT_REGISTRY_KEY, PracticeClient } from './practice/client';
import { NimiqPayIdentityAdapter } from './identity/adapter';
import { IdentityProtocolClient } from './identity/client';
import { IDENTITY_SERVICES_REGISTRY_KEY } from './identity/view';
import { createResultPreview } from './result/fixture';
import { capturePeiReturnV0 } from './pei/return';
import { ApplicationLifecycle } from './lib/application-lifecycle';

capturePeiReturnV0();
const requestedSideways = requestedSidewaysMode(window.location.search);
let runningGame: Phaser.Game | undefined;
let applicationLifecycle: ApplicationLifecycle | undefined;

function syncVisualViewport(): void {
    if (document.hidden && runningGame) return;
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.floor(viewport?.width ?? window.innerWidth));
    const height = Math.max(1, Math.floor(viewport?.height ?? window.innerHeight));
    document.documentElement.style.setProperty('--app-viewport-width', `${width}px`);
    document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
    const sideways = resolveSidewaysMode(requestedSideways, width, height);
    if (sideways) document.documentElement.dataset.sideways = sideways;
    else document.documentElement.removeAttribute('data-sideways');
    const host = document.getElementById('game');
    if (host) {
        if (sideways) host.dataset.sideways = sideways;
        else host.removeAttribute('data-sideways');
    }
    const gameWidth = sideways ? height : width;
    const gameHeight = sideways ? width : height;
    if (runningGame &&
        (runningGame.scale.width !== gameWidth || runningGame.scale.height !== gameHeight)) {
        runningGame.scale.resize(gameWidth, gameHeight);
    }
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
    private lifecycleLoopStopped = false;
    private lifecycleLoopReadyListener = false;
    private lifecycleLoopCallback?: Phaser.Types.Core.TimeStepCallback;

    constructor (combatPreview = false, objectiveModeScene?: typeof ObjectiveModeScene)
    {
        const viewport = window.visualViewport;
        const viewportWidth = Math.max(1, Math.floor(viewport?.width ?? window.innerWidth));
        const viewportHeight = Math.max(1, Math.floor(viewport?.height ?? window.innerHeight));
        const sideways = resolveSidewaysMode(requestedSideways, viewportWidth, viewportHeight);
        const query = new URLSearchParams(window.location.search);
        const objectiveLobby = combatPreview && query.get('combat-preview') === 'v10r8' &&
            !query.has('objective-mode');
        super({
            title: 'NIMble Knots: Cotton Clash',
            backgroundColor: 0x1F2348,
            parent: 'game',
            scale: {
                mode: requestedSideways ? Phaser.Scale.NONE : Phaser.Scale.RESIZE,
                width: sideways ? viewportHeight : viewportWidth,
                height: sideways ? viewportWidth : viewportHeight
            },
            dom: {
                createContainer: true
            },
            scene: combatPreview
                ? objectiveLobby
                    ? [ objectiveModeScene!, CombatScene, JoinScene, RoomScene, GameScene ]
                    : objectiveModeScene
                        ? [ CombatScene, objectiveModeScene, JoinScene, RoomScene, GameScene ]
                        : [ CombatScene, JoinScene, RoomScene, GameScene ]
                : objectiveModeScene
                    ? [ BootScene, objectiveModeScene, PracticeScene, CombatScene, ResultScene, JoinScene, RoomScene, GameScene ]
                    : [ BootScene, PracticeScene, CombatScene, ResultScene, JoinScene, RoomScene, GameScene ]
        });
    }

    public stopLoop(): void {
        this.lifecycleLoopStopped = true;
        if (this.isRunning) {
            this.lifecycleLoopCallback = this.loop.callback;
            this.loop.stop();
            return;
        }
        if (this.lifecycleLoopReadyListener) return;
        this.lifecycleLoopReadyListener = true;
        this.events.once(Phaser.Core.Events.READY, () => {
            this.lifecycleLoopReadyListener = false;
            queueMicrotask(() => {
                if (this.lifecycleLoopStopped) this.stopLoop();
            });
        });
    }

    public startLoop(): void {
        this.lifecycleLoopStopped = false;
        if (!this.isRunning || this.loop.running) return;
        const callback = this.lifecycleLoopCallback ?? this.loop.callback;
        this.lifecycleLoopCallback = undefined;
        this.loop.start(callback);
    }
}

window.onload = async () => {
    const query = new URLSearchParams(window.location.search);
    const resultPreview = query.get('result-preview');
    if (resultPreview === 'practice' || resultPreview === 'reward') {
        const preview = createResultPreview(resultPreview);
        applicationLifecycle = new ApplicationLifecycle({ onResume: syncVisualViewport });
        const game = new NimbleKnotsGame();
        runningGame = game;
        applicationLifecycle.attachGame(game);
        syncVisualViewport();
        game.registry.set(PRACTICE_CLIENT_REGISTRY_KEY, preview.client);
        game.scene.start('result', preview.args);
        return;
    }
    if (query.get('combat-preview') === 'v10r8') {
        const objectiveModeScene = (await import('./scenes/objective-mode')).default;
        const socket = io({ transports: ['websocket'] });
        const session = await bootstrapSession(socket);
        const client = await PracticeClient.connect(socket, session);
        applicationLifecycle = new ApplicationLifecycle({ onResume: syncVisualViewport });
        applicationLifecycle.attachSocket(socket);
        const game = new NimbleKnotsGame(false, objectiveModeScene);
        runningGame = game;
        applicationLifecycle.attachGame(game);
        syncVisualViewport();
        game.registry.set(PRACTICE_CLIENT_REGISTRY_KEY, client);
        game.scene.start('objective-mode', {
            selectedMode: query.get('objective-mode') ?? undefined,
            autoStart: query.has('objective-mode')
        });
        return;
    }
    const combatPreview = query.has('combat-preview');
    if (combatPreview) {
        const objectiveModeScene = query.get('combat-preview') === 'v10r8'
            ? (await import('./scenes/objective-mode')).default
            : undefined;
        applicationLifecycle = new ApplicationLifecycle({ onResume: syncVisualViewport });
        const game = new NimbleKnotsGame(true, objectiveModeScene);
        runningGame = game;
        applicationLifecycle.attachGame(game);
        syncVisualViewport();
        return;
    }
    const socket = io({ transports: ['websocket'] });
    const session = await bootstrapSession(socket);
    const client = await PracticeClient.connect(socket, session);
    applicationLifecycle = new ApplicationLifecycle({ onResume: syncVisualViewport });
    applicationLifecycle.attachSocket(socket);
    const game = new NimbleKnotsGame();
    runningGame = game;
    applicationLifecycle.attachGame(game);
    syncVisualViewport();
    game.registry.set(PRACTICE_CLIENT_REGISTRY_KEY, client);
    game.registry.set(IDENTITY_SERVICES_REGISTRY_KEY, {
        adapter: new NimiqPayIdentityAdapter(),
        protocol: new IdentityProtocolClient(socket)
    });
    game.scene.start('practice');
};
