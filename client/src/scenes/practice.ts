import Phaser from 'phaser';

import type { RewardInfoData } from '../../../shared/protocol';
import type { PlayerCalling } from '../../../shared/simulation';
import {
    PRACTICE_CLIENT_REGISTRY_KEY,
    type PracticeClient
} from '../practice/client';
import {
    IDENTITY_SERVICES_REGISTRY_KEY,
    IdentityAcceptanceView,
    type IdentityAcceptanceServices
} from '../identity/view';
import { clearPeiReturnV0, readPeiReturnV0 } from '../pei/return';

export default class PracticeScene extends Phaser.Scene {
    private client: PracticeClient;
    private root: HTMLElement;
    private calling: PlayerCalling = 'wizard';
    private readonly unsubscribers: (() => void)[] = [];
    private identityView?: IdentityAcceptanceView;
    private identityBusy = false;
    private rewardBusy = false;
    private peiBusy = false;
    private rewardInfo?: RewardInfoData;
    private reconnecting = false;

    public constructor() {
        super({ key: 'practice' });
        this.shutdown = this.shutdown.bind(this);
    }

    public create(): void {
        this.client = this.registry.get(PRACTICE_CLIENT_REGISTRY_KEY) as PracticeClient;
        const host = document.getElementById('game');
        if (!host || !this.client) throw new Error('Practice scene requires the live client.');
        drawBackdrop(this);
        this.root = document.createElement('main');
        this.root.className = 'practice-shell';
        this.root.innerHTML = `
            <section class="practice-card" aria-labelledby="practice-title">
                <p class="practice-eyebrow">NIMble Knots · Cotton Clash</p>
                <h1 id="practice-title">Practice Clash</h1>
                <p class="practice-intro">Face the deterministic Loomkeeper instantly. No wallet, matchmaking, or reward pool.</p>
                <p class="practice-sideways-note practice-sideways-note-right">
                    <strong>Before playing:</strong> keep the phone upright, switch off Auto rotate,
                    then turn it so the phone's top points left.
                </p>
                <p class="practice-sideways-note practice-sideways-note-left">
                    <strong>Before playing:</strong> keep the phone upright, switch off Auto rotate,
                    then turn it so the phone's top points right.
                </p>
                <fieldset class="calling-picker">
                    <legend>Choose your Calling</legend>
                    <button type="button" data-calling="wizard">Wizard<small>Spoolcraft</small></button>
                    <button type="button" data-calling="thief">Thief<small>Threadwork</small></button>
                    <button type="button" data-calling="warrior">Warrior<small>Patchguard</small></button>
                </fieldset>
                <p class="calling-note">All Callings use the same practice rules and statistics.</p>
                <button type="button" class="practice-start">Start Practice</button>
                <p class="practice-message" aria-live="polite"></p>
            </section>
            <section class="daily-card" aria-labelledby="daily-title">
                <p class="practice-eyebrow">Optional sponsor reward</p>
                <h2 id="daily-title">Daily Grand Knot Challenge</h2>
                <p class="daily-summary">Practice needs no wallet. Check the optional sponsor-funded challenge only when you want it.</p>
                <dl class="daily-facts" hidden></dl>
                <div class="daily-identity"></div>
                <button type="button" class="daily-check">Check Daily Challenge</button>
                <button type="button" class="pei-start" hidden disabled>Complete PEI qualification</button>
                <button type="button" class="daily-start" hidden disabled>Start Daily Challenge</button>
                <p class="daily-message" aria-live="polite"></p>
            </section>
        `;
        host.appendChild(this.root);
        const identityServices = this.registry.get(
            IDENTITY_SERVICES_REGISTRY_KEY
        ) as IdentityAcceptanceServices | undefined;
        const identityPreview = new URLSearchParams(window.location.search)
            .get('identity-preview') === '1';
        if (identityPreview && identityServices) {
            this.mountIdentity(identityServices, false);
        }
        const current = this.client.currentCombatSnapshot();
        if (current) this.calling = current.calling;
        if (current?.status === 'active') {
            this.startButton().textContent = current.mode === 'reward'
                ? 'Resume Daily Challenge'
                : current.paused ? 'Resume Paused Clash' : 'Resume Practice';
        }
        this.refreshCalling();
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-calling]')) {
            button.addEventListener('click', () => {
                this.calling = button.dataset.calling as PlayerCalling;
                this.refreshCalling();
            });
        }
        this.startButton().addEventListener('click', () => void this.startPractice());
        this.root.querySelector<HTMLButtonElement>('.daily-check')!.addEventListener(
            'click',
            () => void this.loadRewardInfo(identityServices, identityPreview)
        );
        this.peiButton().addEventListener('click', () => void this.continuePei());
        this.dailyButton().addEventListener('click', () => void this.startDaily());
        this.unsubscribers.push(this.client.onConnection((state) => {
            this.reconnecting = state === 'reconnecting';
            this.refreshStartAvailability();
            this.setMessage(state === 'reconnecting' ? 'Reconnecting to the Practice server…' : '');
        }));
        this.unsubscribers.push(this.client.onUnavailable((message) => {
            this.startButton().textContent = 'Start Fresh Practice';
            this.startButton().disabled = false;
            this.setMessage(message);
        }));
        this.unsubscribers.push(this.client.onError((message) => this.setMessage(message)));
        this.unsubscribers.push(this.client.onCombatResult((result) => {
            const snapshot = this.client.currentCombatSnapshot();
            this.scene.start('result', {
                result,
                calling: this.calling,
                rewarded: snapshot?.challengeId === result.challengeId &&
                    snapshot.mode === 'reward'
            });
        }));
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
        if (readPeiReturnV0()) {
            queueMicrotask(() => void this.loadRewardInfo(identityServices, identityPreview));
        }
    }

    private async loadRewardInfo(
        identityServices: IdentityAcceptanceServices | undefined,
        identityPreview: boolean
    ): Promise<void> {
        const summary = this.root.querySelector<HTMLElement>('.daily-summary')!;
        const check = this.root.querySelector<HTMLButtonElement>('.daily-check')!;
        check.disabled = true;
        summary.textContent = "Checking today's availability...";
        try {
            const info = await this.client.rewardInfo();
            this.rewardInfo = info;
            summary.textContent = rewardAvailability(info);
            const facts = this.root.querySelector<HTMLElement>('.daily-facts')!;
            facts.hidden = false;
            facts.innerHTML = `
                <div><dt>Fixed reward</dt><dd>${formatNim(info.rewardLuna)} NIM</dd></div>
                <div><dt>Eligibility</dt><dd>${info.peiRequired
                    ? 'PEI plus one started attempt per wallet and UTC day'
                    : 'One started attempt per wallet and UTC day'}</dd></div>
                <div><dt>Turn limit</dt><dd>${info.turnLimit}</dd></div>
                <div><dt>Reservation</dt><dd>${info.reservationSeconds} seconds</dd></div>
            `;
            if (info.status === 'available' && identityServices && !identityPreview) {
                this.mountIdentity(identityServices, true);
            }
            this.dailyButton().hidden = info.status !== 'available';
            this.peiButton().hidden = info.status !== 'available' || !info.peiRequired ||
                this.client.hasPeiAdmissionCredential();
            if (this.client.currentIdentity()) {
                await this.recoverReward();
                if (this.scene.isActive()) await this.processPeiReturn();
            } else if (readPeiReturnV0()) {
                this.setDailyMessage('Authorize the same wallet to continue the returned PEI proof.');
            }
        } catch (error) {
            summary.textContent =
                'Rewards are temporarily unavailable. Unlimited Practice is ready.';
            this.setDailyMessage(error instanceof Error
                ? `Daily availability check failed: ${error.message}`
                : 'Daily availability check failed.');
        } finally {
            check.disabled = false;
            check.textContent = 'Refresh Daily availability';
        }
        this.refreshStartAvailability();
    }

    private mountIdentity(
        services: IdentityAcceptanceServices,
        production: boolean
    ): void {
        if (this.identityView) return;
        const parent = production
            ? this.root.querySelector<HTMLElement>('.daily-identity')!
            : this.root;
        this.identityView = new IdentityAcceptanceView(
            parent,
            services,
            (busy) => {
                this.identityBusy = busy;
                this.refreshStartAvailability();
            },
            {
                production,
                onAuthorized: (identity) => {
                    this.client.noteAuthorizedIdentity(identity);
                    this.refreshStartAvailability();
                    void this.recoverReward();
                    if (readPeiReturnV0()) void this.processPeiReturn();
                }
            }
        );
        if (production && this.client.currentIdentity()) {
            this.identityView.root.hidden = true;
        }
    }

    private async recoverReward(): Promise<void> {
        try {
            const update = await this.client.rewardStatus();
            this.scene.start('result', {
                calling: this.calling,
                rewarded: true,
                rewardUpdate: update
            });
        } catch {
            // No outstanding claim is the expected state for most authorizations.
        }
    }

    private async startDaily(): Promise<void> {
        const button = this.dailyButton();
        this.rewardBusy = true;
        this.refreshStartAvailability();
        this.setDailyMessage("Reserving today's fixed sponsor reward...");
        try {
            const snapshot = await this.client.startRewardCombat(this.calling);
            this.scene.start('combat', await this.client.combatArgs(snapshot));
        } catch (error) {
            this.setDailyMessage(
                error instanceof Error
                    ? `${error.message} Unlimited Practice remains available.`
                    : 'The Daily Challenge could not start. Unlimited Practice remains available.'
            );
        } finally {
            this.rewardBusy = false;
            if (this.scene.isActive()) this.refreshStartAvailability();
        }
    }

    private async continuePei(): Promise<void> {
        if (readPeiReturnV0()) {
            await this.processPeiReturn();
            return;
        }
        this.peiBusy = true;
        this.refreshStartAvailability();
        this.setDailyMessage('Preparing the first PEI transfer…');
        try {
            const launch = await this.client.beginPei();
            this.setDailyMessage('Opening the PEI helper…');
            window.location.assign(launch.launchUrl);
        } catch (error) {
            this.setDailyMessage(messageForPeiError(error));
        } finally {
            this.peiBusy = false;
            if (this.scene.isActive()) this.refreshStartAvailability();
        }
    }

    private async processPeiReturn(): Promise<void> {
        const returned = readPeiReturnV0();
        if (!returned || this.peiBusy) return;
        if (returned.kind === 'cancel') {
            clearPeiReturnV0();
            this.setDailyMessage('PEI qualification was cancelled. Practice remains available.');
            this.peiButton().textContent = 'Complete PEI qualification';
            return;
        }
        if (!this.client.currentIdentity()) {
            this.setDailyMessage('Authorize the same wallet to continue the returned PEI proof.');
            return;
        }
        this.peiBusy = true;
        this.refreshStartAvailability();
        this.peiButton().textContent = 'Verifying PEI…';
        this.setDailyMessage(returned.kind === 'earn'
            ? 'Verifying the received transfer…'
            : 'Verifying both PEI transfers…');
        try {
            const result = await this.client.returnPei(returned.kind, returned.carrier);
            clearPeiReturnV0();
            if (result.step === 'qualified') {
                this.peiButton().hidden = true;
                this.setDailyMessage(
                    'PEI complete: the wallet received and returned NIM. ' +
                    `Earn tx ${result.transactionHashes[0]}; spend tx ${result.transactionHashes[1]}. ` +
                    'Daily play is ready.'
                );
            } else {
                this.setDailyMessage('First transfer verified. Opening the return step…');
                window.location.assign(result.launchUrl);
            }
        } catch (error) {
            const retryable = !!error && typeof error === 'object' &&
                'retryable' in error && error.retryable === true;
            if (!retryable) clearPeiReturnV0();
            this.peiButton().textContent = retryable
                ? 'Retry PEI verification'
                : 'Restart PEI qualification';
            this.setDailyMessage(messageForPeiError(error));
        } finally {
            this.peiBusy = false;
            if (this.scene.isActive()) this.refreshStartAvailability();
        }
    }

    private async startPractice(): Promise<void> {
        const button = this.startButton();
        button.disabled = true;
        this.setMessage('Weaving the Patch…');
        try {
            const snapshot = await this.client.startCombat(this.calling);
            this.scene.start('combat', await this.client.combatArgs(snapshot));
        } catch (error) {
            this.refreshStartAvailability();
            this.setMessage(error instanceof Error ? error.message : 'Practice could not start.');
        }
    }

    private refreshCalling(): void {
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-calling]')) {
            const selected = button.dataset.calling === this.calling;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        }
    }

    private startButton(): HTMLButtonElement {
        return this.root.querySelector('.practice-start') as HTMLButtonElement;
    }

    private dailyButton(): HTMLButtonElement {
        return this.root.querySelector('.daily-start') as HTMLButtonElement;
    }

    private peiButton(): HTMLButtonElement {
        return this.root.querySelector('.pei-start') as HTMLButtonElement;
    }

    private setMessage(message: string): void {
        const field = this.root.querySelector('.practice-message') as HTMLElement;
        field.textContent = message;
        field.hidden = !message;
    }

    private setDailyMessage(message: string): void {
        const field = this.root.querySelector<HTMLElement>('.daily-message')!;
        field.textContent = message;
        field.hidden = !message;
    }

    private refreshStartAvailability(): void {
        this.startButton().disabled = this.reconnecting || this.identityBusy;
        this.dailyButton().disabled = this.reconnecting || this.identityBusy ||
            this.rewardBusy || this.rewardInfo?.status !== 'available' ||
            !this.client.currentIdentity() ||
            (this.rewardInfo?.peiRequired === true && !this.client.hasPeiAdmissionCredential());
        this.peiButton().disabled = this.reconnecting || this.identityBusy || this.rewardBusy ||
            this.peiBusy || this.rewardInfo?.status !== 'available' ||
            !this.client.currentIdentity();
    }

    private shutdown(): void {
        for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
        this.identityView?.destroy();
        this.identityView = undefined;
        this.root?.remove();
    }
}

function rewardAvailability(info: RewardInfoData): string {
    if (info.status === 'available') {
        return info.peiRequired
            ? 'Available today. Authorize the receiving wallet, then complete PEI.'
            : 'Available today. Authorize the receiving wallet before play.';
    }
    if (info.status === 'paused') return 'Sponsor rewards are paused. Unlimited Practice is ready.';
    if (info.status === 'exhausted') return "Today's reward pool is exhausted. Unlimited Practice is ready.";
    if (info.status === 'disabled') return 'Sponsor rewards are disabled. Unlimited Practice is ready.';
    return 'Rewards are temporarily unavailable. Unlimited Practice is ready.';
}

function messageForPeiError(error: unknown): string {
    return error instanceof Error
        ? `${error.message} Practice remains available.`
        : 'PEI qualification could not continue. Practice remains available.';
}

function formatNim(luna: string): string {
    const amount = BigInt(luna);
    const whole = amount / 100_000n;
    const fraction = (amount % 100_000n).toString().padStart(5, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}

function drawBackdrop(scene: Phaser.Scene): void {
    const { width, height } = scene.scale;
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xD9F2F3).fillRect(0, 0, width, height);
    graphics.fillStyle(0xFFFFFF, 0.9);
    graphics.fillCircle(width * 0.18, height * 0.16, Math.max(32, width * 0.12));
    graphics.fillCircle(width * 0.82, height * 0.13, Math.max(38, width * 0.14));
    graphics.fillStyle(0x5F4B8B).fillCircle(width * 0.1, height, width * 0.42);
    graphics.fillStyle(0x88B04B).fillCircle(width * 0.72, height, width * 0.52);
}
