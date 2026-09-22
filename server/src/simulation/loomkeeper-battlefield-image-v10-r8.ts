import { deflateSync } from 'node:zlib';

import type { StrategicDecisionBriefV10R8 } from './loomkeeper-strategy-v10-r8';

export const WP027_BATTLEFIELD_IMAGE_VERSION = 'v10-r8-ascii-image-r1' as const;
export const WP027_BATTLEFIELD_IMAGE_CELL_PX = 16;

type Battlefield = StrategicDecisionBriefV10R8['battlefield'];
type Color = readonly [number, number, number];

const EMPTY: Color = [250, 249, 246];
const TERRAIN: Color = [48, 55, 65];
const PARTIAL: Color = [133, 112, 88];
const PLAYER: Color = [25, 115, 178];
const LOOMKEEPER: Color = [145, 57, 135];
const COIN: Color = [228, 181, 42];
const CHEST: Color = [43, 137, 90];
const OVERLAP: Color = [181, 57, 54];
const LIGHT: Color = [255, 255, 255];
const DARK: Color = [42, 43, 45];

const BACKGROUND: Readonly<Record<string, Color>> = Object.freeze({
    '.': EMPTY, '#': TERRAIN, '+': PARTIAL,
    P: PLAYER, L: LOOMKEEPER, o: COIN, C: CHEST, '*': OVERLAP
});
const GLYPHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
    '+': ['00100', '00100', '00100', '11111', '00100', '00100', '00100'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    o: ['00000', '01110', '10001', '10001', '10001', '01110', '00000'],
    C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000']
});

/** A presentation of the existing coarse ASCII projection, never a new world state. */
export function renderBattlefieldImageV10R8(battlefield: Battlefield): Buffer {
    const { width, height } = battlefield;
    if (width !== 64 || height !== 36) throw new Error('Unexpected strategic battlefield dimensions.');
    const rows = battlefield.ascii.split('\n');
    if (rows.length !== height || rows.some(row => row.length !== width ||
        [...row].some(cell => BACKGROUND[cell] === undefined))) {
        throw new Error('Invalid strategic battlefield ASCII projection.');
    }

    const imageWidth = width * WP027_BATTLEFIELD_IMAGE_CELL_PX;
    const imageHeight = height * WP027_BATTLEFIELD_IMAGE_CELL_PX;
    const rowBytes = imageWidth * 4;
    const pixels = Buffer.alloc(imageHeight * (rowBytes + 1));
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const cell = rows[y][x];
            fillCell(pixels, imageWidth, x, y, BACKGROUND[cell]);
            const glyph = GLYPHS[cell];
            if (glyph) drawGlyph(pixels, imageWidth, x, y, glyph,
                cell === 'o' ? DARK : LIGHT);
        }
    }
    return png(imageWidth, imageHeight, pixels);
}

function fillCell(pixels: Buffer, imageWidth: number, cellX: number, cellY: number, color: Color): void {
    const size = WP027_BATTLEFIELD_IMAGE_CELL_PX;
    for (let y = cellY * size; y < (cellY + 1) * size; y += 1) {
        for (let x = cellX * size; x < (cellX + 1) * size; x += 1) {
            setPixel(pixels, imageWidth, x, y, color);
        }
    }
}

function drawGlyph(
    pixels: Buffer, imageWidth: number, cellX: number, cellY: number,
    rows: readonly string[], color: Color
): void {
    const originX = cellX * WP027_BATTLEFIELD_IMAGE_CELL_PX + 3;
    const originY = cellY * WP027_BATTLEFIELD_IMAGE_CELL_PX + 1;
    for (let y = 0; y < rows.length; y += 1) {
        for (let x = 0; x < rows[y].length; x += 1) {
            if (rows[y][x] !== '1') continue;
            for (let dy = 0; dy < 2; dy += 1) {
                for (let dx = 0; dx < 2; dx += 1) {
                    setPixel(pixels, imageWidth, originX + x * 2 + dx, originY + y * 2 + dy, color);
                }
            }
        }
    }
}

function setPixel(pixels: Buffer, imageWidth: number, x: number, y: number, color: Color): void {
    const offset = y * (imageWidth * 4 + 1) + 1 + x * 4;
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
    ihdr[8] = 8; // RGBA, eight bits per channel.
    ihdr[9] = 6;
    return Buffer.concat([
        header,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(pixels, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function chunk(type: string, data: Buffer): Buffer {
    const name = Buffer.from(type, 'ascii');
    const output = Buffer.alloc(12 + data.length);
    output.writeUInt32BE(data.length, 0);
    name.copy(output, 4);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(output.subarray(4, 8 + data.length)), 8 + data.length);
    return output;
}

function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
