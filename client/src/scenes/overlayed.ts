import Phaser from 'phaser';

export default abstract class OverlayedScene extends Phaser.Scene
{
    protected readonly overlay_url: string;
    protected overlay: Phaser.GameObjects.DOMElement;

    public constructor (
        config: Phaser.Types.Scenes.SettingsConfig,
        overlay_url: string
    ) {
        super(config);
        this.overlay_url = overlay_url;
    }

    /** Always call super. */
    public preload ()
    {
        this.load.html(`${this.scene.key}-overlay`, this.overlay_url);
    }

    /** Always call super. */
    public create ()
    {
        let { width, height } = this.game.canvas;

        this.draw_backdrop(width, height);

        this.overlay = this.add
                .dom(width / 2, height / 2)
                .createFromCache(`${this.scene.key}-overlay`);

        this.setup_overlay_fields();
        this.setup_overlay_behavior();
    }

    protected abstract setup_overlay_behavior () : void;

    protected abstract setup_overlay_fields () : void;

    protected draw_backdrop (width: number, height: number)
    {
        const backdrop = this.add.graphics().setDepth(-10);

        backdrop.fillStyle(0xD9F2F3);
        backdrop.fillRect(0, 0, width, height);

        backdrop.fillStyle(0xFFFFFF, 0.9);
        for (const [x, y, radius] of [
            [width * 0.12, height * 0.16, 28],
            [width * 0.18, height * 0.14, 38],
            [width * 0.25, height * 0.17, 25],
            [width * 0.74, height * 0.18, 30],
            [width * 0.81, height * 0.15, 42],
            [width * 0.89, height * 0.19, 27]
        ]) {
            backdrop.fillCircle(x, y, radius);
        }

        backdrop.fillStyle(0x5F4B8B);
        backdrop.fillCircle(width * 0.08, height * 0.92, width * 0.3);
        backdrop.fillCircle(width * 0.92, height * 0.94, width * 0.34);
        backdrop.fillStyle(0x88B04B);
        backdrop.fillCircle(width * 0.28, height, width * 0.32);
        backdrop.fillCircle(width * 0.72, height, width * 0.3);

        backdrop.lineStyle(4, 0xE9B213, 0.8);
        const stitch_y = height * 0.78;
        for (let x = 16; x < width; x += 34) {
            backdrop.lineBetween(x, stitch_y, x + 16, stitch_y + 7);
        }
    }
}
