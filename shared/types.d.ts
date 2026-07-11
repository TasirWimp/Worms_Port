declare type ErrType = {
    error: string;
}

declare type CheckResponse = {
    response: boolean;
}

declare type PlayerState = {
    id: string;
    ready: boolean;
}

declare type PublicPlayerInfo = {
    //
}

declare type Scheme = {
    player_limit: number;
    player_scheme: PlayerScheme;
}

declare type PlayerScheme = {
    relics: {
        name: string,
        amount: number,
        delay: number
    }[];
    knotkin_count: number;
    knotkin_stitching: number;
    knotkin_names: string[][];
}
