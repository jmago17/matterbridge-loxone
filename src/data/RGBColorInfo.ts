import LoxoneTextEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneTextEvent.js';

class RGBColorInfo {
  loxoneHue = 0; // 0-360 degrees
  loxoneSaturation = 0; // 0-100%
  brightness = 0; // 0-100%

  matterHue = 0; // 0-254
  matterSaturation = 0; // 0-254

  constructor(event: LoxoneTextEvent | string | undefined) {
    this.parseLoxoneEvent(event);
  }

  static fromLoxoneEvent(event: LoxoneTextEvent | undefined) {
    return new RGBColorInfo(event);
  }

  static fromMatterHS(hue: number, saturation: number): RGBColorInfo {
    const info = new RGBColorInfo(undefined);
    info.matterHue = Math.min(Math.max(hue, 0), 254);
    info.matterSaturation = Math.min(Math.max(saturation, 0), 254);

    // Convert Matter values to Loxone
    info.loxoneHue = Math.round((info.matterHue / 254) * 360);
    info.loxoneSaturation = Math.round((info.matterSaturation / 254) * 100);

    return info;
  }

  private parseLoxoneEvent(event: LoxoneTextEvent | string | undefined) {
    if (event === undefined) return;

    const text = event instanceof LoxoneTextEvent ? event.text : event;

    // Parse hsv(hue,saturation,brightness) format from Loxone
    // Example: "hsv(120,75,80)" = 120° hue, 75% saturation, 80% brightness
    const hsvMatch = text.match(/hsv\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/);

    if (hsvMatch) {
      this.loxoneHue = parseFloat(hsvMatch[1]);
      this.loxoneSaturation = parseFloat(hsvMatch[2]);
      this.brightness = parseFloat(hsvMatch[3]);

      // Convert to Matter values
      this.matterHue = Math.round((this.loxoneHue / 360) * 254);
      this.matterSaturation = Math.round((this.loxoneSaturation / 100) * 254);
    }
  }

  toLoxoneCommand(brightness: number): string {
    // Format: hsv(hue,saturation,brightness)
    // hue: 0-360
    // saturation: 0-100
    // brightness: 0-100
    return `hsv(${this.loxoneHue},${this.loxoneSaturation},${brightness})`;
  }
}

export { RGBColorInfo };
