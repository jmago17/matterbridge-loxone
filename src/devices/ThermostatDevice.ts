import { thermostatDevice, bridgedNode, MatterbridgeEndpoint, powerSource } from 'matterbridge';
import { TemperatureMeasurement, Thermostat } from 'matterbridge/matter/clusters';
import { LoxonePlatform } from '../platform.js';
import { LoxoneDevice, RegisterLoxoneDevice } from './LoxoneDevice.js';
import * as Converters from '../utils/Converters.js';
import LoxoneValueEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneValueEvent.js';
import LoxoneTextEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneTextEvent.js';
import Control from 'loxone-ts-api/dist/Structure/Control.js';

const StateNames = {
  tempActual: 'tempActual',
  tempTarget: 'tempTarget',
  comfortTemperature: 'comfortTemperature',
  comfortTemperatureCool: 'comfortTemperatureCool',
  activeMode: 'activeMode',
  operatingMode: 'operatingMode',
} as const;
type StateNameType = (typeof StateNames)[keyof typeof StateNames];
const StateNameKeys = Object.values(StateNames) as StateNameType[];

class ThermostatDevice extends LoxoneDevice<StateNameType> {
  public Endpoint: MatterbridgeEndpoint;
  private isInitializing: boolean = true;
  private isUpdatingFromLoxone: boolean = false;

  constructor(control: Control, platform: LoxonePlatform) {
    super(
      control,
      platform,
      [thermostatDevice, bridgedNode, powerSource],
      StateNameKeys,
      'thermostat',
      `${ThermostatDevice.name}_${control.structureSection.uuidAction.replace(/-/g, '_')}`,
    );

    const latestCurrentTemperatureValueEvent = this.getLatestValueEvent(StateNames.tempActual);
    const latestTargetTemperatureValueEvent = this.getLatestValueEvent(StateNames.tempTarget);
    const latestHeatingSetpointValueEvent = this.getLatestValueEvent(StateNames.comfortTemperature);
    const latestCoolingSetpointValueEvent = this.getLatestValueEvent(StateNames.comfortTemperatureCool);
    const currentTemperature = Converters.numberValueConverter(latestCurrentTemperatureValueEvent);

    this.Endpoint = this.createDefaultEndpoint()
      .createDefaultGroupsClusterServer()
      .createDefaultThermostatClusterServer(latestCurrentTemperatureValueEvent.value, latestHeatingSetpointValueEvent.value, latestCoolingSetpointValueEvent.value)
      .createDefaultThermostatUserInterfaceConfigurationClusterServer()
      .createDefaultTemperatureMeasurementClusterServer(currentTemperature);

    this.addLoxoneAttributeSubscription(Thermostat.Cluster.id, 'occupiedCoolingSetpoint', (newValue: number, oldValue: number) => {
      // Prevent feedback loop: don't send commands during initialization, Loxone updates, or if value hasn't changed
      if (this.isInitializing || this.isUpdatingFromLoxone || newValue === oldValue) return undefined;

      const temperature = Math.round(newValue / 100);
      const loxoneCommand = `setComfortTemperatureCool/${temperature}`;
      platform.log.info(`Setting cooling setpoint to ${temperature}°C, command: ${loxoneCommand}`);
      return loxoneCommand;
    });
    this.addLoxoneAttributeSubscription(Thermostat.Cluster.id, 'occupiedHeatingSetpoint', (newValue: number, oldValue: number) => {
      // Prevent feedback loop: don't send commands during initialization, Loxone updates, or if value hasn't changed
      if (this.isInitializing || this.isUpdatingFromLoxone || newValue === oldValue) return undefined;

      const temperature = Math.round(newValue / 100);
      // Use timed override like Homebridge does - timer is seconds since 2009-01-01
      const date2009 = new Date('2009-01-01 00:00:00');
      const dateNow = new Date();
      const timer = Math.round((dateNow.getTime() - date2009.getTime()) / 1000 + 6000);
      const loxoneCommand = `override/3/${timer}/${temperature}`;
      platform.log.info(`Setting heating setpoint to ${temperature}°C, command: ${loxoneCommand}`);
      return loxoneCommand;
    });
    this.addLoxoneAttributeSubscription(Thermostat.Cluster.id, 'systemMode', (newValue: number, oldValue: number) => {
      // Prevent feedback loop: don't send commands during initialization, Loxone updates, or if value hasn't changed
      if (this.isInitializing || this.isUpdatingFromLoxone || newValue === oldValue) return undefined;

      // Matter systemMode: 0=Off, 1=Auto, 3=Cool, 4=Heat, 5=EmergencyHeat, 6=Precooling, 7=Fan only, 8=Dry, 9=Sleep
      const date2009 = new Date('2009-01-01 00:00:00');
      const dateNow = new Date();
      const dateTomorrow = new Date();
      dateTomorrow.setDate(dateNow.getDate() + 1);
      dateTomorrow.setHours(0, 0, 0, 0);
      const timer = Math.round((dateNow.getTime() - date2009.getTime()) / 1000 + 6000);
      const timerTomorrow = Math.round((dateTomorrow.getTime() - date2009.getTime()) / 1000);

      let loxoneCommand: string;
      switch (newValue) {
        case 0: // Off
          loxoneCommand = `override/2/${timerTomorrow}`;
          platform.log.info(`Setting mode to OFF, command: ${loxoneCommand}`);
          break;
        case 1: // Auto - stop override and return to automatic schedule
          loxoneCommand = 'stopOverride';
          platform.log.info(`Setting mode to AUTO, command: ${loxoneCommand}`);
          break;
        case 3: // Cool
        case 4: // Heat
          // For heat/cool mode, use timed override with current target temp
          const targetTemp = Math.round(latestTargetTemperatureValueEvent.value / 100);
          loxoneCommand = `override/3/${timer}/${targetTemp}`;
          platform.log.info(`Setting mode to ${newValue === 4 ? 'HEAT' : 'COOL'}, command: ${loxoneCommand}`);
          break;
        default:
          platform.log.warn(`Unsupported system mode: ${newValue}`);
          return undefined;
      }
      return loxoneCommand;
    });
  }

  static override typeNames(): string[] {
    return ['thermostat'];
  }

  override async handleLoxoneDeviceEvent(event: LoxoneValueEvent | LoxoneTextEvent) {
    if (!(event instanceof LoxoneValueEvent)) return;
    await this.updateAttributesFromLoxoneEvent(event);
  }

  override async populateInitialState() {
    for (const stateNameKey of StateNameKeys) {
      const latestValueEvent = this.getLatestValueEvent(stateNameKey);
      await this.updateAttributesFromLoxoneEvent(latestValueEvent);
    }
    // Mark initialization as complete after populating initial state
    this.isInitializing = false;
  }

  private async updateAttributesFromLoxoneEvent(event: LoxoneValueEvent) {
    // Set flag to prevent feedback loop - we're updating from Loxone, not from HomeKit/Matter
    this.isUpdatingFromLoxone = true;
    try {
      switch (event.state?.name) {
        case StateNames.tempTarget: {
          const targetTemperature = Converters.numberValueConverter(event);
          // Target temperature typically updates both heating and cooling setpoints in auto mode
          await this.Endpoint.updateAttribute(Thermostat.Cluster.id, 'occupiedCoolingSetpoint', targetTemperature, this.Endpoint.log);
          await this.Endpoint.updateAttribute(Thermostat.Cluster.id, 'occupiedHeatingSetpoint', targetTemperature, this.Endpoint.log);
          break;
        }
        case StateNames.tempActual: {
          const temperature = Converters.numberValueConverter(event);
          await this.Endpoint.updateAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue', temperature, this.Endpoint.log);
          await this.Endpoint.updateAttribute(Thermostat.Cluster.id, 'localTemperature', temperature, this.Endpoint.log);
          break;
        }
        case StateNames.comfortTemperature: {
          const heatingSetpoint = Converters.numberValueConverter(event);
          await this.Endpoint.updateAttribute(Thermostat.Cluster.id, 'occupiedHeatingSetpoint', heatingSetpoint, this.Endpoint.log);
          break;
        }
        case StateNames.comfortTemperatureCool: {
          const coolingSetpoint = Converters.numberValueConverter(event);
          await this.Endpoint.updateAttribute(Thermostat.Cluster.id, 'occupiedCoolingSetpoint', coolingSetpoint, this.Endpoint.log);
          break;
        }
        case StateNames.activeMode: {
          // Loxone activeMode: 0=Economy, 1=Comfort, 2=Off, 3=Manual heating, 4=Building protection/Manual cooling
          // Matter systemMode: 0=Off, 1=Auto, 3=Cool, 4=Heat
          const loxoneMode = event.value;
          let matterMode: number;
          switch (loxoneMode) {
            case 0: // Economy -> Auto
            case 1: // Comfort -> Auto
              matterMode = 1; // Auto
              break;
            case 2: // Off -> Off
            case 4: // Building protection/Manual cooling -> Off (or could be Cool mode)
              matterMode = 0; // Off
              break;
            case 3: // Manual heating -> Heat
              matterMode = 4; // Heat
              break;
            default:
              this.platform.log.warn(`IRC V2 unknown activeMode: ${loxoneMode}, defaulting to Auto`);
              matterMode = 1; // Default to Auto
          }
          this.platform.log.info(`IRC V2 activeMode changed to ${loxoneMode}, setting Matter systemMode to ${matterMode}`);
          await this.Endpoint.updateAttribute(Thermostat.Cluster.id, 'systemMode', matterMode, this.Endpoint.log);
          break;
        }
        case StateNames.operatingMode: {
          // Loxone operatingMode: 0=Idle, 1=Heating, 2=Cooling
          // Update the current heating/cooling state based on what's actually happening
          const operatingMode = event.value;
          this.platform.log.info(`IRC V2 operatingMode changed to ${operatingMode}`);
          // This could be used to update currentHeatingCoolingState if needed
          break;
        }
        default:
      }
    } finally {
      // Always reset the flag after processing, even if there was an error
      this.isUpdatingFromLoxone = false;
    }
  }
}

RegisterLoxoneDevice(ThermostatDevice);
export { ThermostatDevice };
