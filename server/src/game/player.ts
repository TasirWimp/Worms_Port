/// <reference path="../../../shared/types.d.ts"/>

import { beautify } from '../util/id-gen';
import { array_map } from '../util/other';

import { Relic } from './relic-types';

export class Player {
    public readonly first_id: string;

    public last_id: string;

    public online: boolean;
    public ready: boolean;

    protected relics: {
        amount: number,
        delay: number
    }[];

    protected knotkin: {
        stitching: number;
        name: string;
        position: any;
    }[];

    public constructor(id: string, index: number, scheme: PlayerScheme) {
        this.first_id = id;
        this.last_id = id;
        this.online = false;
        this.ready = false;
        this.relics = array_map(Relic.count, (index) => ({
            amount: scheme.relics[index].amount,
            delay: scheme.relics[index].delay
        }));
        this.knotkin = array_map(scheme.knotkin_count, (jndex) => ({
            stitching: scheme.knotkin_stitching,
            name: scheme.knotkin_names[index][jndex],
            position: {}
        }));
    }

    public join_with(last_id: string, game_context: any) {
        this.last_id = last_id;
        if (!this.ready) {
            // TODO in join_with [Player]
            // Initialize each Knotkin on valid Patch terrain.
            // 1. throw it in random coords
            // 2. make it fall
            // 3. if in water -- reroll
        }
        this.online = true;
    }

    public public_id() {
        return beautify(this.first_id);
    }

    public public_info(): PublicPlayerInfo {
        // TODO public_info [Player]
        return {};
    }
}

export enum PlayerIdType { FIRST, LAST }
