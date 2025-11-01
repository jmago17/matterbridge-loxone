import LoxoneTextEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneTextEvent.js';

class ColorTemperatureInfo {
  loxoneKelvin = 2700;
  matterMireds = 500;
  brightness = 0;

  constructor(event: LoxoneTextEvent | string | undefined) {
    this.parseLoxoneEvent(event);
  }

  static fromLoxoneEvent(event: LoxoneTextEvent | undefined) {
    return new ColorTemperatureInfo(event);
  }

  static fromMatterMireds(mireds: number): ColorTemperatureInfo {
    const info = new ColorTemperatureInfo(undefined);
    info.matterMireds = Math.min(Math.max(mireds, 147), 500);
    info.loxoneKelvin = info.miredsToKelvin(info.matterMireds);
    return info;
  }

  private parseLoxoneEvent(event: LoxoneTextEvent | string | undefined) {
    if (event === undefined) return;

    const text = event instanceof LoxoneTextEvent ? event.text : event;

    // Parse temp(brightness,kelvin) format from Loxone
    // Example: "temp(75,4000)" = 75% brightness at 4000K
    const tempMatch = text.match(/temp\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/);

    if (tempMatch) {
      this.brightness = parseFloat(tempMatch[1]);
      this.loxoneKelvin = parseFloat(tempMatch[2]);
      this.matterMireds = this.kelvinToMireds(this.loxoneKelvin);
    }
  }

  private kelvinToMireds(kelvin: number): number {
    // Loxone range: 2700K (warm) to 6500K (cold)
    // Matter range: 147 mireds (cold) to 500 mireds (warm)
    // Note: Inverted - higher Kelvin = lower mireds
    const minKelvin = 2700;
    const maxKelvin = 6500;
    const minMireds = 147;
    const maxMireds = 500;

    // Clamp kelvin to valid range
    const clampedKelvin = Math.min(Math.max(kelvin, minKelvin), maxKelvin);

    // Calculate percentage position in Kelvin range
    const percent = 1 - ((clampedKelvin - minKelvin) / (maxKelvin - minKelvin));

    // Map to mireds range (inverted)
    const mireds = Math.round(minMireds + ((maxMireds - minMireds) * percent));

    return mireds;
  }

  private miredsToKelvin(mireds: number): number {
    // Matter range: 147 mireds (cold) to 500 mireds (warm)
    // Loxone range: 2700K (warm) to 6500K (cold)
    const minKelvin = 2700;
    const maxKelvin = 6500;
    const minMireds = 147;
    const maxMireds = 500;

    // Clamp mireds to valid range
    const clampedMireds = Math.min(Math.max(mireds, minMireds), maxMireds);

    // Calculate percentage position in mireds range
    const percent = 1 - ((clampedMireds - minMireds) / (maxMireds - minMireds));

    // Map to Kelvin range (inverted)
    const kelvin = Math.round(minKelvin + ((maxKelvin - minKelvin) * percent));

    return kelvin;
  }

  toLoxoneCommand(brightness: number): string {
    // Format: temp(brightness,kelvin)
    // brightness: 0-100
    // kelvin: 2700-6500
    return `temp(${brightness},${this.loxoneKelvin})`;
  }
}

export { ColorTemperatureInfo };
