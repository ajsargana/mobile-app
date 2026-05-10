export { default as AttestationService } from './AttestationService';
export { default as DeviceAttestationModule, IS_NATIVE_MODULE_AVAILABLE } from './DeviceAttestationModule';
export type {
  AttestationAction,
  AttestationPayload,
  AndroidAttestationPayload,
  IosAttestationPayload,
  AttestationStatus,
  BindResult,
  ServerNonce,
} from './types';
