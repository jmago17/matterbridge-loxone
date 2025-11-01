import { bridgedNode, powerSource, colorTemperatureLight, MatterbridgeEndpoint } from 'matterbridge';
import { LoxonePlatform } from '../platform.js';
import { OnOff, LevelControl, ColorControl } from 'matterbridge/matter/clusters';
import { LoxoneDevice, RegisterLoxoneDevice } from './LoxoneDevice.js';
import { MatterLevelInfo } from '../data/MatterLevelInfo.js';
import { ColorTemperatureInfo } from '../data/ColorTemperatureInfo.js';
import LoxoneTextEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneTextEvent.js';
import LoxoneValueEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneValueEvent.js';
import Control from 'loxone-ts-api/dist/Structure/Control.js';

const StateNames = {
  color: 'color',
} as const;
type StateNameType = (typeof StateNames)[keyof typeof StateNames];
const StateNameKeys = Object.values(StateNames) as StateNameType[];

class ColorTemperatureLight extends LoxoneDevice<StateNameType> {
  public Endpoint: MatterbridgeEndpoint;
  private currentBrightness = 0;

  constructor(control: Control, platform: LoxonePlatform) {
    super(
      control,
      platform,
      [colorTemperatureLight, bridgedNode, powerSource],
      StateNameKeys,
      'color temperature light',
      `${ColorTemperatureLight.name}_${control.structureSection.uuidAction.replace(/-/g, '_')}`,
    );

    const latestColorEvent = this.getLatestTextEvent(StateNames.color);
    const colorValue = ColorTemperatureInfo.fromLoxoneEvent(latestColorEvent);

    // Extract brightness from color state
    this.currentBrightness = colorValue.brightness;
    const brightnessLevel = new MatterLevelInfo(Math.max(Math.round((colorValue.brightness / 100) * 254), 1));

    this.Endpoint = this.createDefaultEndpoint()
      .createDefaultGroupsClusterServer()
      .createDefaultOnOffClusterServer(colorValue.brightness > 0)
      .createDefaultLevelControlClusterServer(brightnessLevel.matterLevel)
      .createCtColorControlClusterServer();

    // Set initial color temperature
    this.Endpoint.setAttribute(
      ColorControl.Cluster.id,
      'colorTemperatureMireds',
      colorValue.matterMireds,
      this.Endpoint.log,
    );

    // Configure color mode to color temperature
    this.Endpoint.configureColorControlMode(ColorControl.ColorMode.ColorTemperatureMireds);

    // Add command handlers for on/off and brightness
    this.addLoxoneCommandHandler('on');
    this.addLoxoneCommandHandler('off');
    this.addLoxoneCommandHandler('moveToLevel', ({ request: { level } }) => {
      const value = MatterLevelInfo.fromMatterNumber(level);
      this.currentBrightness = value.loxoneLevel;
      return value.loxoneLevel.toString();
    });
    this.addLoxoneCommandHandler('moveToLevelWithOnOff', ({ request: { level } }) => {
      const value = MatterLevelInfo.fromMatterNumber(level);
      this.currentBrightness = value.loxoneLevel;
      return value.loxoneLevel.toString();
    });

    // Add command handler for color temperature
    this.addLoxoneCommandHandler('moveToColorTemperature', ({ request: { colorTemperatureMireds } }) => {
      const colorInfo = ColorTemperatureInfo.fromMatterMireds(colorTemperatureMireds);
      return colorInfo.toLoxoneCommand(this.currentBrightness);
    });
  }

  override async handleLoxoneDeviceEvent(event: LoxoneValueEvent | LoxoneTextEvent) {
    await this.updateAttributesFromLoxoneEvent(event);
  }

  override async populateInitialState() {
    const latestColorEvent = this.getLatestTextEvent(StateNames.color);
    await this.updateFromColorEvent(latestColorEvent);
  }

  private async updateAttributesFromLoxoneEvent(event: LoxoneValueEvent | LoxoneTextEvent) {
    const colorState = this.statesByName.get(StateNames.color);

    if (event instanceof LoxoneTextEvent && colorState && event.uuid.stringValue === colorState.uuid.stringValue) {
      await this.updateFromColorEvent(event);
    }
  }

  private async updateFromColorEvent(event: LoxoneTextEvent | undefined) {
    if (!event) return;

    const colorInfo = ColorTemperatureInfo.fromLoxoneEvent(event);

    // Update brightness
    this.currentBrightness = colorInfo.brightness;
    const brightnessLevel = new MatterLevelInfo(Math.max(Math.round((colorInfo.brightness / 100) * 254), 1));

    await this.Endpoint.updateAttribute(OnOff.Cluster.id, 'onOff', colorInfo.brightness > 0, this.Endpoint.log);
    await this.Endpoint.updateAttribute(LevelControl.Cluster.id, 'currentLevel', brightnessLevel.matterLevel, this.Endpoint.log);

    // Update color temperature
    await this.Endpoint.updateAttribute(
      ColorControl.Cluster.id,
      'colorTemperatureMireds',
      colorInfo.matterMireds,
      this.Endpoint.log,
    );
  }

  static override typeNames(): string[] {
    return ['lumitech', 'colortemperature', 'colortemp'];
  }
}

RegisterLoxoneDevice(ColorTemperatureLight);

export { ColorTemperatureLight };
