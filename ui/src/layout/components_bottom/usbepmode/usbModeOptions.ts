export interface UsbModeOption {
  value: string;
  label: string;
  displayLabel: string;
}

export const USB_MODE_OPTIONS: UsbModeOption[] = [
  {
    value: 'uac',
    label: 'UAC（USB Audio Card）',
    displayLabel: 'UAC'
  },
  {
    value: 'mtp',
    label: 'MTP（Media Transfer Protocol）',
    displayLabel: 'MTP'
  },
  {
    value: 'disabled',
    label: 'Disabled',
    displayLabel: 'Disabled'
  }
];

export interface UsbDeviceConfig {
  keyboard: boolean;
  absolute_mouse: boolean;
  relative_mouse: boolean;
  mass_storage: boolean;
  mtp: boolean;
  audio: boolean;
}

export const defaultUsbDeviceConfig: UsbDeviceConfig = {
  keyboard: true,
  absolute_mouse: true,
  relative_mouse: true,
  mass_storage: true,
  mtp: false,
  audio: true,
};
