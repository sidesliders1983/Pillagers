import { FjordsideWater } from './FjordsideWater';
import { fjordWaterConfig } from '../config/FjordWaterConfig';

/** Original scene water level and mooring; approved dense water surrounds the existing boat. */
export class Water extends FjordsideWater {
    constructor(quality: 'standard' | 'low' = 'standard') {
        super(fjordWaterConfig.level, { x: -8.2, z: -15 }, quality);
    }
}
