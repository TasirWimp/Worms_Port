import { deflateSync } from 'node:zlib';

import type { StrategicDecisionBriefV10R8, StrategicPathAtlasV10R8 } from './loomkeeper-strategy-v10-r8';

export const WP027_CANDIDATE_PATH_IMAGE_VERSION = 'v10-r8-candidate-path-r1' as const;

const WIDTH = 900;
const TOP = 20;
const ROW_HEIGHT = 48;
const AXIS_LEFT = 64;
const AXIS_WIDTH = 800;
const WORLD_WIDTH = 2048;
type Color = readonly [number, number, number];
const WHITE: Color = [255, 255, 255];
const PALE: Color = [246, 247, 249];
const GRID: Color = [221, 225, 230];
const INK: Color = [52, 61, 73];
const ROUTE: Color = [128, 49, 147];
const SHOT: Color = [221, 125, 33];
const IMPACT: Color = [199, 57, 50];
const PLAYER: Color = [28, 111, 181];
const COIN: Color = [217, 171, 27];
const CHEST: Color = [48, 143, 88];

const DIGITS: Readonly<Record<string, readonly string[]>> = Object.freeze({
    c: ['0111', '1000', '1000', '1000', '0111'],
    '0': ['0110', '1001', '1001', '1001', '0110'],
    '1': ['0010', '0110', '0010', '0010', '0111'],
    '2': ['1110', '0001', '0110', '1000', '1111'],
    '3': ['1110', '0001', '0110', '0001', '1110'],
    '4': ['1001', '1001', '1111', '0001', '0001'],
    '5': ['1111', '1000', '1110', '0001', '1110'],
    '6': ['0111', '1000', '1110', '1001', '0110'],
    '7': ['1111', '0001', '0010', '0100', '0100'],
    '8': ['0110', '1001', '0110', '1001', '0110'],
    '9': ['0110', '1001', '0111', '0001', '1110']
});

/** One sparse lane per selectable simulated turn; terrain pixels are never copied. */
export function renderCandidatePathImageV10R8(
    brief: StrategicDecisionBriefV10R8,
    atlas: StrategicPathAtlasV10R8
): Buffer {
    if (atlas.basisId !== brief.basisId || atlas.paths.length !== brief.legalCandidates.length ||
        atlas.paths.some((path, index) => path.candidateId !== brief.legalCandidates[index].candidateId)) {
        throw new Error('Candidate path image does not match the current strategic brief.');
    }
    const height = TOP + atlas.paths.length * ROW_HEIGHT + 4;
    const pixels = Buffer.alloc(height * (WIDTH * 4 + 1));
    rectangle(pixels, height, 0, 0, WIDTH, height, WHITE);
    atlas.paths.forEach((path, index) => {
        const top = TOP + index * ROW_HEIGHT;
        const anchorY = path.waypoints[0].y;
        if (index % 2) rectangle(pixels, height, 0, top, WIDTH, ROW_HEIGHT, PALE);
        for (let mark = 0; mark <= 8; mark += 1) {
            line(pixels, height, AXIS_LEFT + mark * AXIS_WIDTH / 8, top + 4,
                AXIS_LEFT + mark * AXIS_WIDTH / 8, top + ROW_HEIGHT - 6, GRID);
        }
        drawId(pixels, height, path.candidateId, 8, top + 16);
        for (const object of brief.battlefield.objects) {
            if (object.status !== 'active') continue;
            const x = imageX(object.x);
            const y = imageY(object.y, top, anchorY);
            if (object.kind === 'coin') circle(pixels, height, x, y, 3, COIN);
            else rectangle(pixels, height, x - 3, y - 3, 7, 7, CHEST);
        }
        const player = brief.battlefield.actors.find(actor => actor.id === 'player');
        if (player?.alive) circle(pixels, height, imageX(player.x), imageY(player.y, top, anchorY), 3, PLAYER);
        for (let point = 1; point < path.waypoints.length; point += 1) {
            const previous = path.waypoints[point - 1];
            const current = path.waypoints[point];
            line(pixels, height, imageX(previous.x), imageY(previous.y, top, anchorY),
                imageX(current.x), imageY(current.y, top, anchorY), ROUTE, 2);
        }
        const first = path.waypoints[0];
        const last = path.waypoints.at(-1)!;
        circle(pixels, height, imageX(first.x), imageY(first.y, top, anchorY), 4, INK);
        circle(pixels, height, imageX(last.x), imageY(last.y, top, anchorY), 4, ROUTE);
        if (path.shot) {
            line(pixels, height, imageX(path.shot.from.x), imageY(path.shot.from.y, top, anchorY),
                imageX(path.shot.impact.x), imageY(path.shot.impact.y, top, anchorY), SHOT);
            const x = imageX(path.shot.impact.x);
            const y = imageY(path.shot.impact.y, top, anchorY);
            line(pixels, height, x - 3, y - 3, x + 3, y + 3, IMPACT, 2);
            line(pixels, height, x - 3, y + 3, x + 3, y - 3, IMPACT, 2);
        }
        drawTerrainChanges(pixels, height, brief.legalCandidates[index].worldDelta.asciiRuns, top);
        line(pixels, height, 0, top + ROW_HEIGHT - 1, WIDTH - 1, top + ROW_HEIGHT - 1, GRID);
    });
    return png(WIDTH, height, pixels);
}

function drawTerrainChanges(pixels: Buffer, height: number, runs: readonly string[], top: number): void {
    for (const run of runs) {
        const match = /^(\d+):(\d+)-(\d+):([^>]*)>(.*)$/.exec(run);
        if (!match) continue;
        const first = Number(match[2]);
        const before = match[4];
        const after = match[5];
        for (let index = 0; index < before.length; index += 1) {
            if (!'#+'.includes(before[index]) || after[index] !== '.') continue;
            const x = AXIS_LEFT + Math.round((first + index + 0.5) * AXIS_WIDTH / 64);
            rectangle(pixels, height, x - 1, top + ROW_HEIGHT - 6, 3, 3, IMPACT);
        }
    }
}

function imageX(x: number): number {
    return AXIS_LEFT + Math.round(Math.max(0, Math.min(WORLD_WIDTH, x)) * AXIS_WIDTH / WORLD_WIDTH);
}

function imageY(y: number, top: number, anchorY: number): number {
    return top + ROW_HEIGHT / 2 + Math.round(Math.max(-18, Math.min(18, (y - anchorY) * 0.17)));
}

function drawId(pixels: Buffer, height: number, id: string, x: number, y: number): void {
    for (let character = 0; character < id.length; character += 1) {
        const glyph = DIGITS[id[character]];
        if (!glyph) throw new Error('Invalid candidate path label.');
        glyph.forEach((row, gy) => [...row].forEach((pixel, gx) => {
            if (pixel === '1') rectangle(pixels, height, x + character * 11 + gx * 2, y + gy * 2, 2, 2, INK);
        }));
    }
}

function circle(pixels: Buffer, height: number, centerX: number, centerY: number, radius: number, color: Color): void {
    for (let y = -radius; y <= radius; y += 1) {
        for (let x = -radius; x <= radius; x += 1) {
            if (x * x + y * y <= radius * radius) pixel(pixels, height, centerX + x, centerY + y, color);
        }
    }
}

function line(pixels: Buffer, height: number, x1: number, y1: number, x2: number, y2: number, color: Color, width = 1): void {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let step = 0; step <= steps; step += 1) {
        const x = Math.round(x1 + (x2 - x1) * step / steps);
        const y = Math.round(y1 + (y2 - y1) * step / steps);
        rectangle(pixels, height, x - Math.floor(width / 2), y - Math.floor(width / 2), width, width, color);
    }
}

function rectangle(pixels: Buffer, height: number, x: number, y: number, width: number, boxHeight: number, color: Color): void {
    for (let row = Math.max(0, y); row < Math.min(height, y + boxHeight); row += 1) {
        for (let column = Math.max(0, x); column < Math.min(WIDTH, x + width); column += 1) {
            pixel(pixels, height, column, row, color);
        }
    }
}

function pixel(pixels: Buffer, height: number, x: number, y: number, color: Color): void {
    if (x < 0 || x >= WIDTH || y < 0 || y >= height) return;
    const offset = y * (WIDTH * 4 + 1) + 1 + x * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
}

function png(width: number, height: number, pixels: Buffer): Buffer {
    const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([header, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
    const output = Buffer.alloc(12 + data.length);
    Buffer.from(type, 'ascii').copy(output, 4);
    output.writeUInt32BE(data.length, 0);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(output.subarray(4, 8 + data.length)), 8 + data.length);
    return output;
}

function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
