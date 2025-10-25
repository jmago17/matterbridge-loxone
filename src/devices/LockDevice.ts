import { bridgedNode, MatterbridgeEndpoint, onOffSwitch } from 'matterbridge';
import { OnOff } from 'matterbridge/matter/clusters';
import { LoxoneDevice } from './LoxoneDevice.js';

/**
 * LockDevice – behaves like a binary switch but shown as a Lock.
 * "Locked" = ON / "Unlocked" = OFF
 */
export class LockDevice extends LoxoneDevice<string> {
  Endpoint: MatterbridgeEndpoint;

  static typeNames() {
    return ['Lock', 'LockDevice'];
  }

constructor(control: any, platform: any) {
  // El último argumento es el uniqueStorageKey
super(control, platform, [bridgedNode, onOffSwitch], [], 'LockDevice', control.uuidAction);

  // Crear endpoint con los clusters OnOff y bridgedNode
  this.Endpoint = new MatterbridgeEndpoint([bridgedNode, onOffSwitch], {
    uniqueStorageKey: this.uniqueStorageKey,
  });

  // Agregar servidores de cluster válidos
  this.Endpoint.addClusterServers([OnOff.Cluster.id]);

  // Estado inicial
  this.populateInitialState();
}

  async populateInitialState(): Promise<void> {
    await this.Endpoint.setAttribute(OnOff.Cluster.id, 'onOff', false);
  }

  async handleLoxoneDeviceEvent(event: any, _secondary?: any): Promise<void> {
    const value = event?.value ?? event?.text ?? 0;
    const locked = value === 1 || value === '1' || value === true;

    await this.Endpoint.setAttribute(OnOff.Cluster.id, 'onOff', locked);
    this.platform.log.debug(
      `[${this.control.name}] Lock state updated → ${locked ? 'locked' : 'unlocked'}`
    );
  }
}

// Registrar los tipos de dispositivo
(LoxoneDevice as any).register(LockDevice, 'LockDevice');