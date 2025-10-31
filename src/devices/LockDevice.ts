import { doorLockDevice, bridgedNode, powerSource, MatterbridgeEndpoint } from 'matterbridge';
import { LoxonePlatform } from '../platform.js';
import { DoorLock } from 'matterbridge/matter/clusters';
import { LoxoneDevice, RegisterLoxoneDevice } from './LoxoneDevice.js';
import LoxoneValueEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneValueEvent.js';
import LoxoneTextEvent from 'loxone-ts-api/dist/LoxoneEvents/LoxoneTextEvent.js';
import Control from 'loxone-ts-api/dist/Structure/Control.js';
import { ActiveOnlyStateNameKeys, ActiveOnlyStateNames, ActiveOnlyStateNamesType } from './SingleDataPointSensor.js';

class LockDevice extends LoxoneDevice<ActiveOnlyStateNamesType> {
  public Endpoint: MatterbridgeEndpoint;

  constructor(control: Control, platform: LoxonePlatform) {
    super(
      control,
      platform,
      [doorLockDevice, bridgedNode, powerSource],
      ActiveOnlyStateNameKeys,
      'lock',
      `LockDevice_${control.structureSection.uuidAction.replace(/-/g, '_')}`,
    );

    const latestValueEvent = this.getLatestValueEvent(ActiveOnlyStateNames.active);
    // Convert Loxone on/off to Matter lock state: on=1=locked, off=0=unlocked
    const initialLockState = latestValueEvent ? (latestValueEvent.value === 1 ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked) : DoorLock.LockState.Unlocked;

    this.Endpoint = this.createDefaultEndpoint().createDefaultGroupsClusterServer().createDefaultDoorLockClusterServer();

    // Handle lock command from HomeKit
    this.Endpoint.addCommandHandler('lockDoor', async () => {
      this.platform.log.info(`Locking door: ${this.longname}`);
      await this.platform.loxoneClient.control(this.control.uuidAction, 'Off');
    });

    // Handle unlock command from HomeKit
    this.Endpoint.addCommandHandler('unlockDoor', async () => {
      this.platform.log.info(`Unlocking door: ${this.longname}`);
      await this.platform.loxoneClient.control(this.control.uuidAction, 'On');
    });
  }

  static override typeNames(): string[] {
    return ['lock', 'Lock'];
  }

  override async handleLoxoneDeviceEvent(event: LoxoneValueEvent | LoxoneTextEvent) {
    if (!(event instanceof LoxoneValueEvent)) return;

    await this.updateAttributesFromLoxoneEvent(event);
  }

  override async populateInitialState() {
    const latestValueEvent = this.getLatestValueEvent(ActiveOnlyStateNames.active);
    await this.updateAttributesFromLoxoneEvent(latestValueEvent);
  }

  private async updateAttributesFromLoxoneEvent(event: LoxoneValueEvent) {
    // Convert Loxone on/off to Matter lock state: on=1=unlocked, off=0=locked
    const lockState = event.value === 1 ? DoorLock.LockState.Unlocked : DoorLock.LockState.Locked;
    await this.Endpoint.updateAttribute(DoorLock.Cluster.id, 'lockState', lockState, this.Endpoint.log);
  }
}

RegisterLoxoneDevice(LockDevice);
export { LockDevice };
