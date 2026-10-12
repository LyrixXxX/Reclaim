import { requireOptionalNativeModule } from 'expo';

export type ReclaimIntegrityNativeModule = {
  token(cloudProjectNumber: string, requestHash: string): Promise<string>;
};

export default requireOptionalNativeModule<ReclaimIntegrityNativeModule>('ReclaimIntegrity');
